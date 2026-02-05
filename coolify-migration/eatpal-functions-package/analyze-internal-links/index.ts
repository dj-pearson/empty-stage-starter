import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PageLinkData {
  url: string;
  internalLinks: string[];
  externalLinks: string[];
  inboundLinks: number;
  outboundLinks: number;
  linkScore: number; // PageRank-style score
  depth: number; // Distance from homepage
  isOrphaned: boolean;
  isHub: boolean; // Has many outbound links
  isAuthority: boolean; // Has many inbound links
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { crawlId, startUrl, maxPages = 100 } = await req.json();

    if (!crawlId && !startUrl) {
      throw new Error("Either crawlId or startUrl is required");
    }

    console.log(`Analyzing internal link structure...`);

    let linkGraph: Map<string, string[]>;
    let pages: string[];

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (crawlId) {
      // Load from existing crawl
      const { data: crawlData, error } = await supabase
        .from("seo_crawl_results")
        .select("link_graph, crawl_results")
        .eq("id", crawlId)
        .single();

      if (error || !crawlData) {
        throw new Error("Crawl not found");
      }

      const linkGraphData = JSON.parse(crawlData.link_graph || "{}");
      linkGraph = new Map(Object.entries(linkGraphData));
      pages = Array.from(linkGraph.keys());
    } else {
      // Perform quick crawl to build link graph
      const crawlResult = await quickCrawl(startUrl!, maxPages);
      linkGraph = crawlResult.linkGraph;
      pages = crawlResult.pages;
    }

    console.log(`Analyzing ${pages.length} pages...`);

    // Calculate link metrics
    const pageData: Map<string, PageLinkData> = new Map();

    // Initialize page data
    for (const url of pages) {
      const internalLinks = linkGraph.get(url) || [];
      pageData.set(url, {
        url,
        internalLinks,
        externalLinks: [],
        inboundLinks: 0,
        outboundLinks: internalLinks.length,
        linkScore: 1.0, // Initial PageRank score
        depth: url === startUrl ? 0 : Infinity,
        isOrphaned: false,
        isHub: false,
        isAuthority: false,
      });
    }

    // Calculate inbound links
    for (const [fromUrl, toUrls] of linkGraph.entries()) {
      for (const toUrl of toUrls) {
        const toPage = pageData.get(toUrl);
        if (toPage) {
          toPage.inboundLinks++;
        }
      }
    }

    // Calculate depth from homepage using BFS
    const queue: Array<{ url: string; depth: number }> = [{ url: startUrl || pages[0], depth: 0 }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { url, depth } = queue.shift()!;

      if (visited.has(url)) continue;
      visited.add(url);

      const page = pageData.get(url);
      if (page) {
        page.depth = Math.min(page.depth, depth);

        // Add linked pages to queue
        for (const linkedUrl of page.internalLinks) {
          if (!visited.has(linkedUrl)) {
            queue.push({ url: linkedUrl, depth: depth + 1 });
          }
        }
      }
    }

    // Calculate PageRank-style scores (simplified)
    const dampingFactor = 0.85;
    const iterations = 10;

    for (let i = 0; i < iterations; i++) {
      const newScores = new Map<string, number>();

      for (const url of pages) {
        let score = (1 - dampingFactor) / pages.length;

        // Add contribution from pages linking to this one
        for (const [fromUrl, toUrls] of linkGraph.entries()) {
          if (toUrls.includes(url)) {
            const fromPage = pageData.get(fromUrl);
            if (fromPage && fromPage.outboundLinks > 0) {
              score += dampingFactor * (fromPage.linkScore / fromPage.outboundLinks);
            }
          }
        }

        newScores.set(url, score);
      }

      // Update scores
      for (const [url, score] of newScores.entries()) {
        const page = pageData.get(url);
        if (page) {
          page.linkScore = score;
        }
      }
    }

    // Normalize scores to 0-100 scale
    const maxScore = Math.max(...Array.from(pageData.values()).map((p) => p.linkScore));
    const minScore = Math.min(...Array.from(pageData.values()).map((p) => p.linkScore));

    for (const page of pageData.values()) {
      page.linkScore = maxScore > minScore
        ? Math.round(((page.linkScore - minScore) / (maxScore - minScore)) * 100)
        : 50;
    }

    // Identify orphaned pages
    for (const page of pageData.values()) {
      if (page.inboundLinks === 0 && page.url !== (startUrl || pages[0])) {
        page.isOrphaned = true;
      }
    }

    // Identify hubs and authorities
    const avgOutbound = pages.reduce((sum, url) => sum + (pageData.get(url)?.outboundLinks || 0), 0) / pages.length;
    const avgInbound = pages.reduce((sum, url) => sum + (pageData.get(url)?.inboundLinks || 0), 0) / pages.length;

    for (const page of pageData.values()) {
      page.isHub = page.outboundLinks > avgOutbound * 2;
      page.isAuthority = page.inboundLinks > avgInbound * 2;
    }

    // Calculate summary
    const orphanedPages = Array.from(pageData.values()).filter((p) => p.isOrphaned);
    const hubs = Array.from(pageData.values()).filter((p) => p.isHub);
    const authorities = Array.from(pageData.values()).filter((p) => p.isAuthority);
    const topPages = Array.from(pageData.values())
      .sort((a, b) => b.linkScore - a.linkScore)
      .slice(0, 10);

    const summary = {
      totalPages: pages.length,
      totalLinks: Array.from(linkGraph.values()).reduce((sum, links) => sum + links.length, 0),
      orphanedPages: orphanedPages.length,
      hubPages: hubs.length,
      authorityPages: authorities.length,
      avgInboundLinks: Math.round(avgInbound * 10) / 10,
      avgOutboundLinks: Math.round(avgOutbound * 10) / 10,
      maxDepth: Math.max(...Array.from(pageData.values()).map((p) => p.depth === Infinity ? 0 : p.depth)),
      avgDepth: Math.round(
        (Array.from(pageData.values())
          .filter((p) => p.depth !== Infinity)
          .reduce((sum, p) => sum + p.depth, 0) / pages.length) * 10
      ) / 10,
    };

    // Save to database
    const { data: savedAnalysis, error: saveError } = await supabase
      .from("seo_link_analysis")
      .insert({
        start_url: startUrl || pages[0],
        total_pages: summary.totalPages,
        total_links: summary.totalLinks,
        orphaned_pages: summary.orphanedPages,
        hub_pages: summary.hubPages,
        authority_pages: summary.authorityPages,
        avg_inbound_links: summary.avgInboundLinks,
        avg_outbound_links: summary.avgOutboundLinks,
        max_depth: summary.maxDepth,
        avg_depth: summary.avgDepth,
        page_details: JSON.stringify(Array.from(pageData.values())),
        link_graph: JSON.stringify(Object.fromEntries(linkGraph)),
        analyzed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (saveError) {
      console.error("Failed to save link analysis:", saveError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          summary,
          orphanedPages: orphanedPages.map((p) => ({ url: p.url, depth: p.depth })),
          hubs: hubs.map((p) => ({ url: p.url, outboundLinks: p.outboundLinks, linkScore: p.linkScore })),
          authorities: authorities.map((p) => ({ url: p.url, inboundLinks: p.inboundLinks, linkScore: p.linkScore })),
          topPages: topPages.map((p) => ({ url: p.url, linkScore: p.linkScore, inboundLinks: p.inboundLinks })),
          analysisId: savedAnalysis?.id,
        },
        message: `Analyzed ${summary.totalPages} pages with ${summary.totalLinks} internal links`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in analyze-internal-links:", error);
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

async function quickCrawl(
  startUrl: string,
  maxPages: number
): Promise<{ linkGraph: Map<string, string[]>; pages: string[] }> {
  const baseUrl = new URL(startUrl);
  const domain = baseUrl.origin;
  const visited = new Set<string>();
  const toVisit: string[] = [startUrl];
  const linkGraph = new Map<string, string[]>();

  while (toVisit.length > 0 && visited.size < maxPages) {
    const currentUrl = toVisit.shift()!;

    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    try {
      const response = await fetch(currentUrl, {
        headers: { "User-Agent": "SEO-Link-Analyzer/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
        continue;
      }

      const html = await response.text();
      const internalLinks: string[] = [];

      // Extract links
      const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
      let match;

      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];

        try {
          let absoluteUrl: string;

          if (href.startsWith("http://") || href.startsWith("https://")) {
            absoluteUrl = href;
          } else if (href.startsWith("//")) {
            absoluteUrl = `${baseUrl.protocol}${href}`;
          } else if (href.startsWith("/")) {
            absoluteUrl = `${domain}${href}`;
          } else if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
            continue;
          } else {
            absoluteUrl = new URL(href, currentUrl).href;
          }

          const linkUrl = new URL(absoluteUrl);

          if (linkUrl.origin === domain) {
            // Normalize URL
            linkUrl.hash = "";
            const normalized = linkUrl.href;
            internalLinks.push(normalized);

            if (!visited.has(normalized) && !toVisit.includes(normalized)) {
              toVisit.push(normalized);
            }
          }
        } catch (e) {
          // Invalid URL
        }
      }

      linkGraph.set(currentUrl, internalLinks);
    } catch (e) {
      console.warn(`Failed to crawl ${currentUrl}:`, e.message);
    }

    // Small delay
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    linkGraph,
    pages: Array.from(visited),
  };
}
