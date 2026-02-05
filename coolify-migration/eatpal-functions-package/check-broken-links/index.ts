import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Link {
  url: string;
  text: string;
  type: string;
  context?: string;
  position?: string;
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url, checkExternal = true, maxLinks = 100 } = await req.json();

    if (!url) {
      throw new Error("URL is required");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Checking broken links for ${url}...`);

    // Fetch the page
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }

    const html = await response.text();
    const baseUrl = new URL(url);
    const domain = baseUrl.origin;

    // Extract all links from HTML
    const links: Link[] = [];

    // Extract <a> tags
    const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    let match;

    while ((match = anchorRegex.exec(html)) !== null && links.length < maxLinks) {
      const href = match[1];
      const text = match[2].replace(/<[^>]*>/g, "").trim();

      // Resolve relative URLs
      let absoluteUrl = href;
      try {
        if (href.startsWith("http://") || href.startsWith("https://")) {
          absoluteUrl = href;
        } else if (href.startsWith("//")) {
          absoluteUrl = `${baseUrl.protocol}${href}`;
        } else if (href.startsWith("/")) {
          absoluteUrl = `${domain}${href}`;
        } else if (href.startsWith("#")) {
          // Skip anchor links
          continue;
        } else if (href.startsWith("mailto:") || href.startsWith("tel:")) {
          // Skip mailto and tel links
          continue;
        } else {
          absoluteUrl = new URL(href, url).href;
        }

        const linkUrl = new URL(absoluteUrl);
        const isInternal = linkUrl.origin === domain;

        links.push({
          url: absoluteUrl,
          text: text || href,
          type: isInternal ? "internal" : "external",
        });
      } catch (e) {
        console.warn(`Invalid URL: ${href}`, e);
      }
    }

    // Extract image links
    const imgRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'][^>]*)?>/gi;
    while ((match = imgRegex.exec(html)) !== null && links.length < maxLinks) {
      const src = match[1];
      const alt = match[2] || "";

      let absoluteUrl = src;
      try {
        if (src.startsWith("http://") || src.startsWith("https://")) {
          absoluteUrl = src;
        } else if (src.startsWith("//")) {
          absoluteUrl = `${baseUrl.protocol}${src}`;
        } else if (src.startsWith("/")) {
          absoluteUrl = `${domain}${src}`;
        } else if (src.startsWith("data:")) {
          // Skip data URLs
          continue;
        } else {
          absoluteUrl = new URL(src, url).href;
        }

        links.push({
          url: absoluteUrl,
          text: alt || src,
          type: "image",
        });
      } catch (e) {
        console.warn(`Invalid image URL: ${src}`, e);
      }
    }

    // Extract CSS links
    const cssRegex = /<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>/gi;
    while ((match = cssRegex.exec(html)) !== null && links.length < maxLinks) {
      const href = match[1];

      let absoluteUrl = href;
      try {
        if (href.startsWith("http://") || href.startsWith("https://")) {
          absoluteUrl = href;
        } else if (href.startsWith("//")) {
          absoluteUrl = `${baseUrl.protocol}${href}`;
        } else if (href.startsWith("/")) {
          absoluteUrl = `${domain}${href}`;
        } else {
          absoluteUrl = new URL(href, url).href;
        }

        links.push({
          url: absoluteUrl,
          text: href,
          type: "stylesheet",
        });
      } catch (e) {
        console.warn(`Invalid CSS URL: ${href}`, e);
      }
    }

    // Extract script links
    const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
    while ((match = scriptRegex.exec(html)) !== null && links.length < maxLinks) {
      const src = match[1];

      let absoluteUrl = src;
      try {
        if (src.startsWith("http://") || src.startsWith("https://")) {
          absoluteUrl = src;
        } else if (src.startsWith("//")) {
          absoluteUrl = `${baseUrl.protocol}${src}`;
        } else if (src.startsWith("/")) {
          absoluteUrl = `${domain}${src}`;
        } else {
          absoluteUrl = new URL(src, url).href;
        }

        links.push({
          url: absoluteUrl,
          text: src,
          type: "script",
        });
      } catch (e) {
        console.warn(`Invalid script URL: ${src}`, e);
      }
    }

    console.log(`Found ${links.length} links to check`);

    // Check each link
    const brokenLinks = [];
    const checkedUrls = new Set<string>();

    for (const link of links) {
      // Skip if already checked
      if (checkedUrls.has(link.url)) {
        continue;
      }

      // Skip external links if not checking them
      if (!checkExternal && link.type === "external") {
        continue;
      }

      checkedUrls.add(link.url);

      try {
        // HEAD request first (faster)
        const linkResponse = await fetch(link.url, {
          method: "HEAD",
          redirect: "follow",
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        const statusCode = linkResponse.status;

        // Consider 4xx and 5xx as broken, but allow redirects (3xx)
        if (statusCode >= 400) {
          // Calculate priority based on link type and status
          let priority = "medium";
          if (link.type === "internal") {
            priority = statusCode === 404 ? "high" : "medium";
          } else if (link.type === "image") {
            priority = "medium";
          } else if (link.type === "stylesheet" || link.type === "script") {
            priority = "critical";
          }

          const brokenLink = {
            source_page_url: url,
            broken_url: link.url,
            link_text: link.text,
            link_type: link.type,
            http_status_code: statusCode,
            error_message: `HTTP ${statusCode} error`,
            status: "active",
            priority,
            impact_score: priority === "critical" ? 90 : (priority === "high" ? 70 : 50),
            first_detected_at: new Date().toISOString(),
            last_checked_at: new Date().toISOString(),
          };

          brokenLinks.push(brokenLink);

          console.log(`Broken link found: ${link.url} (${statusCode})`);
        }
      } catch (error: any) {
        // Network error or timeout
        let priority = "medium";
        if (link.type === "internal") {
          priority = "high";
        } else if (link.type === "stylesheet" || link.type === "script") {
          priority = "critical";
        }

        const brokenLink = {
          source_page_url: url,
          broken_url: link.url,
          link_text: link.text,
          link_type: link.type,
          http_status_code: null,
          error_message: error.message || "Network error or timeout",
          status: "active",
          priority,
          impact_score: priority === "critical" ? 90 : (priority === "high" ? 70 : 50),
          first_detected_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
        };

        brokenLinks.push(brokenLink);

        console.log(`Broken link found: ${link.url} (${error.message})`);
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(`Found ${brokenLinks.length} broken links`);

    // Insert or update broken links in database
    let insertedCount = 0;
    let updatedCount = 0;

    for (const brokenLink of brokenLinks) {
      // Check if link already exists
      const { data: existing } = await supabase
        .from("seo_broken_links")
        .select("id, consecutive_failures")
        .eq("source_page_url", brokenLink.source_page_url)
        .eq("broken_url", brokenLink.broken_url)
        .single();

      if (existing) {
        // Update existing record
        await supabase
          .from("seo_broken_links")
          .update({
            last_checked_at: brokenLink.last_checked_at,
            http_status_code: brokenLink.http_status_code,
            error_message: brokenLink.error_message,
            consecutive_failures: (existing.consecutive_failures || 0) + 1,
          })
          .eq("id", existing.id);

        updatedCount++;
      } else {
        // Insert new record
        await supabase
          .from("seo_broken_links")
          .insert(brokenLink);

        insertedCount++;
      }
    }

    // Mark links as resolved if they're no longer broken
    const brokenUrls = brokenLinks.map((bl) => bl.broken_url);
    const allCheckedUrls = Array.from(checkedUrls);

    const { data: activeLinks } = await supabase
      .from("seo_broken_links")
      .select("id, broken_url")
      .eq("source_page_url", url)
      .eq("status", "active");

    if (activeLinks) {
      for (const activeLink of activeLinks) {
        // If the link was checked and is not in the broken list, mark as resolved
        if (allCheckedUrls.includes(activeLink.broken_url) && !brokenUrls.includes(activeLink.broken_url)) {
          await supabase
            .from("seo_broken_links")
            .update({
              status: "resolved",
              resolved_at: new Date().toISOString(),
              resolution_notes: "Link is now working",
            })
            .eq("id", activeLink.id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          url,
          totalLinksChecked: checkedUrls.size,
          brokenLinksFound: brokenLinks.length,
          newBrokenLinks: insertedCount,
          updatedBrokenLinks: updatedCount,
          brokenLinks: brokenLinks.slice(0, 10), // Return first 10 for display
        },
        message: `Checked ${checkedUrls.size} links, found ${brokenLinks.length} broken`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in check-broken-links:", error);
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
