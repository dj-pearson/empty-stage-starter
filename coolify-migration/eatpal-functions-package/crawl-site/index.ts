import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CrawlResult {
  url: string;
  statusCode: number;
  title: string;
  metaDescription: string;
  h1: string[];
  h2Count: number;
  h3Count: number;
  wordCount: number;
  internalLinks: string[];
  externalLinks: string[];
  images: number;
  imagesWithoutAlt: number;
  canonical: string | null;
  robotsMeta: string | null;
  hasViewport: boolean;
  loadTime: number;
  contentType: string;
  issues: Array<{ type: string; severity: string; message: string }>;
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { startUrl, maxPages = 50, followExternal = false } = await req.json();

    if (!startUrl) {
      throw new Error("Start URL is required");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Starting crawl from ${startUrl}...`);

    const baseUrl = new URL(startUrl);
    const domain = baseUrl.origin;

    const visited = new Set<string>();
    const toVisit: string[] = [startUrl];
    const results: CrawlResult[] = [];
    const linkGraph: Map<string, string[]> = new Map();

    // Helper function to normalize URLs
    const normalizeUrl = (url: string): string => {
      try {
        const parsed = new URL(url);
        // Remove fragments
        parsed.hash = "";
        // Remove trailing slash for consistency
        let path = parsed.pathname;
        if (path.endsWith("/") && path.length > 1) {
          path = path.slice(0, -1);
        }
        parsed.pathname = path;
        return parsed.href;
      } catch {
        return url;
      }
    };

    // Crawl pages
    while (toVisit.length > 0 && visited.size < maxPages) {
      const currentUrl = toVisit.shift()!;
      const normalizedUrl = normalizeUrl(currentUrl);

      if (visited.has(normalizedUrl)) {
        continue;
      }

      visited.add(normalizedUrl);
      console.log(`Crawling ${normalizedUrl} (${visited.size}/${maxPages})...`);

      const startTime = Date.now();

      try {
        const response = await fetch(normalizedUrl, {
          headers: {
            "User-Agent": "SEO-Crawler-Bot/1.0",
          },
          signal: AbortSignal.timeout(10000),
        });

        const loadTime = Date.now() - startTime;
        const statusCode = response.status;
        const contentType = response.headers.get("content-type") || "";

        // Only process HTML pages
        if (!contentType.includes("text/html")) {
          continue;
        }

        const html = await response.text();

        // Extract SEO data
        const issues: Array<{ type: string; severity: string; message: string }> = [];

        // Title
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
        const title = titleMatch ? titleMatch[1].trim() : "";

        if (!title) {
          issues.push({
            type: "title",
            severity: "high",
            message: "Missing title tag",
          });
        } else if (title.length < 30) {
          issues.push({
            type: "title",
            severity: "medium",
            message: `Title too short (${title.length} chars, recommend 30-60)`,
          });
        } else if (title.length > 60) {
          issues.push({
            type: "title",
            severity: "low",
            message: `Title too long (${title.length} chars, recommend 30-60)`,
          });
        }

        // Meta Description
        const metaDescMatch = html.match(
          /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i
        );
        const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : "";

        if (!metaDescription) {
          issues.push({
            type: "meta_description",
            severity: "medium",
            message: "Missing meta description",
          });
        } else if (metaDescription.length < 120) {
          issues.push({
            type: "meta_description",
            severity: "low",
            message: `Meta description too short (${metaDescription.length} chars)`,
          });
        }

        // H1 tags
        const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gis);
        const h1 = h1Matches
          ? h1Matches.map((h) => h.replace(/<[^>]+>/g, "").trim())
          : [];

        if (h1.length === 0) {
          issues.push({
            type: "h1",
            severity: "high",
            message: "Missing H1 tag",
          });
        } else if (h1.length > 1) {
          issues.push({
            type: "h1",
            severity: "medium",
            message: `Multiple H1 tags found (${h1.length})`,
          });
        }

        // H2 and H3 counts
        const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
        const h3Count = (html.match(/<h3[^>]*>/gi) || []).length;

        // Word count
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        const wordCount = text.split(/\s+/).length;

        if (wordCount < 300) {
          issues.push({
            type: "content",
            severity: "medium",
            message: `Thin content (${wordCount} words, recommend 300+)`,
          });
        }

        // Extract links
        const internalLinks: string[] = [];
        const externalLinks: string[] = [];

        const linkMatches = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi);
        if (linkMatches) {
          for (const linkMatch of linkMatches) {
            const hrefMatch = linkMatch.match(/href=["']([^"']+)["']/i);
            if (hrefMatch) {
              const href = hrefMatch[1];

              try {
                let absoluteUrl: string;
                if (href.startsWith("http://") || href.startsWith("https://")) {
                  absoluteUrl = href;
                } else if (href.startsWith("//")) {
                  absoluteUrl = `${baseUrl.protocol}${href}`;
                } else if (href.startsWith("/")) {
                  absoluteUrl = `${domain}${href}`;
                } else if (href.startsWith("#")) {
                  continue; // Skip anchors
                } else if (href.startsWith("mailto:") || href.startsWith("tel:")) {
                  continue; // Skip mailto/tel
                } else {
                  absoluteUrl = new URL(href, normalizedUrl).href;
                }

                const linkUrl = new URL(absoluteUrl);

                if (linkUrl.origin === domain) {
                  const normalizedLink = normalizeUrl(absoluteUrl);
                  internalLinks.push(normalizedLink);

                  // Add to crawl queue if not visited
                  if (!visited.has(normalizedLink) && !toVisit.includes(normalizedLink)) {
                    toVisit.push(normalizedLink);
                  }
                } else if (followExternal) {
                  externalLinks.push(absoluteUrl);
                }
              } catch (e) {
                console.warn(`Invalid URL: ${href}`);
              }
            }
          }
        }

        // Track link graph
        linkGraph.set(normalizedUrl, internalLinks);

        // Images
        const imgMatches = html.match(/<img[^>]+>/gi);
        const images = imgMatches ? imgMatches.length : 0;
        const imagesWithoutAlt = imgMatches
          ? imgMatches.filter((img) => !img.match(/alt=["'][^"']*["']/i)).length
          : 0;

        if (imagesWithoutAlt > 0) {
          issues.push({
            type: "images",
            severity: "medium",
            message: `${imagesWithoutAlt} images missing alt text`,
          });
        }

        // Canonical
        const canonicalMatch = html.match(
          /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
        );
        const canonical = canonicalMatch ? canonicalMatch[1] : null;

        // Robots meta
        const robotsMatch = html.match(
          /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i
        );
        const robotsMeta = robotsMatch ? robotsMatch[1] : null;

        if (robotsMeta && (robotsMeta.includes("noindex") || robotsMeta.includes("nofollow"))) {
          issues.push({
            type: "robots",
            severity: "high",
            message: `Page has restrictive robots meta: ${robotsMeta}`,
          });
        }

        // Viewport
        const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);

        if (!hasViewport) {
          issues.push({
            type: "mobile",
            severity: "high",
            message: "Missing viewport meta tag",
          });
        }

        // Load time
        if (loadTime > 3000) {
          issues.push({
            type: "performance",
            severity: loadTime > 5000 ? "high" : "medium",
            message: `Slow load time: ${loadTime}ms`,
          });
        }

        // Build result
        const result: CrawlResult = {
          url: normalizedUrl,
          statusCode,
          title,
          metaDescription,
          h1,
          h2Count,
          h3Count,
          wordCount,
          internalLinks,
          externalLinks,
          images,
          imagesWithoutAlt,
          canonical,
          robotsMeta,
          hasViewport,
          loadTime,
          contentType,
          issues,
        };

        results.push(result);
      } catch (error: any) {
        console.error(`Error crawling ${normalizedUrl}:`, error);
        results.push({
          url: normalizedUrl,
          statusCode: 0,
          title: "",
          metaDescription: "",
          h1: [],
          h2Count: 0,
          h3Count: 0,
          wordCount: 0,
          internalLinks: [],
          externalLinks: [],
          images: 0,
          imagesWithoutAlt: 0,
          canonical: null,
          robotsMeta: null,
          hasViewport: false,
          loadTime: 0,
          contentType: "",
          issues: [
            {
              type: "crawl",
              severity: "critical",
              message: `Failed to crawl: ${error.message}`,
            },
          ],
        });
      }

      // Small delay to be respectful
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Analyze link graph for orphaned pages
    const orphanedPages = results.filter((page) => {
      // Check if this page is linked to by any other page
      const isLinkedTo = results.some((otherPage) =>
        otherPage.internalLinks.includes(page.url)
      );
      return !isLinkedTo && page.url !== normalizeUrl(startUrl);
    });

    // Calculate summary statistics
    const summary = {
      totalPages: results.length,
      pagesWithIssues: results.filter((r) => r.issues.length > 0).length,
      avgWordCount: Math.round(
        results.reduce((sum, r) => sum + r.wordCount, 0) / results.length
      ),
      avgLoadTime: Math.round(
        results.reduce((sum, r) => sum + r.loadTime, 0) / results.length
      ),
      orphanedPages: orphanedPages.length,
      totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
      issueBreakdown: {
        critical: results.reduce(
          (sum, r) => sum + r.issues.filter((i) => i.severity === "critical").length,
          0
        ),
        high: results.reduce(
          (sum, r) => sum + r.issues.filter((i) => i.severity === "high").length,
          0
        ),
        medium: results.reduce(
          (sum, r) => sum + r.issues.filter((i) => i.severity === "medium").length,
          0
        ),
        low: results.reduce(
          (sum, r) => sum + r.issues.filter((i) => i.severity === "low").length,
          0
        ),
      },
    };

    // Save crawl results to database
    const crawlData = {
      start_url: startUrl,
      pages_crawled: results.length,
      total_issues: summary.totalIssues,
      critical_issues: summary.issueBreakdown.critical,
      high_issues: summary.issueBreakdown.high,
      medium_issues: summary.issueBreakdown.medium,
      low_issues: summary.issueBreakdown.low,
      orphaned_pages: orphanedPages.length,
      avg_word_count: summary.avgWordCount,
      avg_load_time: summary.avgLoadTime,
      crawl_results: JSON.stringify(results),
      link_graph: JSON.stringify(Object.fromEntries(linkGraph)),
      crawled_at: new Date().toISOString(),
    };

    const { data: savedCrawl, error: saveError } = await supabase
      .from("seo_crawl_results")
      .insert(crawlData)
      .select()
      .single();

    if (saveError) {
      console.error("Failed to save crawl results:", saveError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          summary,
          results: results.slice(0, 20), // Return first 20 for preview
          orphanedPages,
          crawlId: savedCrawl?.id,
        },
        message: `Crawled ${results.length} pages successfully`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in crawl-site:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
