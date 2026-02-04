
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      throw new Error("URL is required");
    }

    // Fetch the URL
    const response = await fetch(url);
    const html = await response.text();
    const contentType = response.headers.get("content-type") || "";

    // Parse HTML (basic parsing)
    interface AuditItem {
      item: string;
      status: string;
      message: string;
      impact: string;
      fix?: string;
    }

    const seoAnalysis = {
      url,
      status: response.status,
      contentType,
      analysis: {
        technical: [] as AuditItem[],
        onPage: [] as AuditItem[],
        performance: [] as AuditItem[],
        mobile: [] as AuditItem[],
        content: [] as AuditItem[],
      },
      score: 0,
    };

    // Title Tag
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1];
      const length = title.length;
      if (length >= 30 && length <= 60) {
        seoAnalysis.analysis.technical.push({
          item: "Title Tag",
          status: "passed",
          message: `✓ Title tag length is optimal (${length} characters)`,
          impact: "high",
        });
      } else {
        seoAnalysis.analysis.technical.push({
          item: "Title Tag",
          status: "warning",
          message: `⚠ Title tag length (${length}) should be 30-60 characters`,
          impact: "high",
          fix: "Optimize title tag length for better search display",
        });
      }
    } else {
      seoAnalysis.analysis.technical.push({
        item: "Title Tag",
        status: "failed",
        message: "✗ Missing title tag",
        impact: "high",
        fix: "Add a descriptive title tag to the page",
      });
    }

    // Meta Description
    const metaDescMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    if (metaDescMatch) {
      const desc = metaDescMatch[1];
      const length = desc.length;
      if (length >= 120 && length <= 160) {
        seoAnalysis.analysis.technical.push({
          item: "Meta Description",
          status: "passed",
          message: `✓ Meta description length is optimal (${length} characters)`,
          impact: "high",
        });
      } else {
        seoAnalysis.analysis.technical.push({
          item: "Meta Description",
          status: "warning",
          message: `⚠ Meta description length (${length}) should be 120-160 characters`,
          impact: "medium",
          fix: "Optimize meta description for better click-through rates",
        });
      }
    } else {
      seoAnalysis.analysis.technical.push({
        item: "Meta Description",
        status: "failed",
        message: "✗ Missing meta description",
        impact: "high",
        fix: "Add a meta description to improve search snippets",
      });
    }

    // H1 Tags
    const h1Matches = html.match(/<h1[^>]*>.*?<\/h1>/gi);
    const h1Count = h1Matches ? h1Matches.length : 0;
    if (h1Count === 1) {
      seoAnalysis.analysis.onPage.push({
        item: "H1 Tag",
        status: "passed",
        message: "✓ Single H1 tag present",
        impact: "high",
      });
    } else if (h1Count === 0) {
      seoAnalysis.analysis.onPage.push({
        item: "H1 Tag",
        status: "failed",
        message: "✗ Missing H1 tag",
        impact: "high",
        fix: "Add a single, descriptive H1 tag",
      });
    } else {
      seoAnalysis.analysis.onPage.push({
        item: "H1 Tag",
        status: "warning",
        message: `⚠ Multiple H1 tags found (${h1Count})`,
        impact: "medium",
        fix: "Use only one H1 per page",
      });
    }

    // Images with Alt Text
    const imgMatches = html.match(/<img[^>]+>/gi);
    const imgCount = imgMatches ? imgMatches.length : 0;
    const imgWithAlt = imgMatches ? imgMatches.filter((img) => /alt=/i.test(img)).length : 0;
    
    if (imgCount > 0) {
      const altPercentage = (imgWithAlt / imgCount) * 100;
      if (altPercentage === 100) {
        seoAnalysis.analysis.onPage.push({
          item: "Image Alt Text",
          status: "passed",
          message: `✓ All ${imgCount} images have alt text`,
          impact: "medium",
        });
      } else if (altPercentage >= 80) {
        seoAnalysis.analysis.onPage.push({
          item: "Image Alt Text",
          status: "warning",
          message: `⚠ ${imgWithAlt}/${imgCount} images have alt text (${altPercentage.toFixed(0)}%)`,
          impact: "medium",
          fix: "Add alt text to all images",
        });
      } else {
        seoAnalysis.analysis.onPage.push({
          item: "Image Alt Text",
          status: "failed",
          message: `✗ Only ${imgWithAlt}/${imgCount} images have alt text (${altPercentage.toFixed(0)}%)`,
          impact: "high",
          fix: "Add descriptive alt text to improve accessibility and SEO",
        });
      }
    }

    // Open Graph Tags
    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
    const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i);
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i);

    if (ogTitleMatch && ogDescMatch && ogImageMatch) {
      seoAnalysis.analysis.onPage.push({
        item: "Open Graph",
        status: "passed",
        message: "✓ Complete Open Graph tags present",
        impact: "medium",
      });
    } else {
      const missing = [];
      if (!ogTitleMatch) missing.push("title");
      if (!ogDescMatch) missing.push("description");
      if (!ogImageMatch) missing.push("image");
      
      seoAnalysis.analysis.onPage.push({
        item: "Open Graph",
        status: "warning",
        message: `⚠ Missing Open Graph: ${missing.join(", ")}`,
        impact: "medium",
        fix: "Add complete Open Graph tags for social media sharing",
      });
    }

    // HTTPS
    if (url.startsWith("https://")) {
      seoAnalysis.analysis.technical.push({
        item: "HTTPS",
        status: "passed",
        message: "✓ Site uses HTTPS",
        impact: "high",
      });
    } else {
      seoAnalysis.analysis.technical.push({
        item: "HTTPS",
        status: "failed",
        message: "✗ Site not using HTTPS",
        impact: "high",
        fix: "Enable HTTPS for security and SEO",
      });
    }

    // Viewport Meta
    const viewportMatch = html.match(/<meta\s+name=["']viewport["']/i);
    if (viewportMatch) {
      seoAnalysis.analysis.mobile.push({
        item: "Viewport",
        status: "passed",
        message: "✓ Viewport meta tag present",
        impact: "high",
      });
    } else {
      seoAnalysis.analysis.mobile.push({
        item: "Viewport",
        status: "failed",
        message: "✗ Missing viewport meta tag",
        impact: "high",
        fix: "Add viewport meta for mobile compatibility",
      });
    }

    // Canonical URL
    const canonicalMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["'](.*?)["']/i);
    if (canonicalMatch) {
      seoAnalysis.analysis.technical.push({
        item: "Canonical URL",
        status: "passed",
        message: `✓ Canonical URL present`,
        impact: "high",
      });
    } else {
      seoAnalysis.analysis.technical.push({
        item: "Canonical URL",
        status: "warning",
        message: "⚠ Missing canonical URL",
        impact: "medium",
        fix: "Add canonical tag to prevent duplicate content issues",
      });
    }

    // Structured Data
    const structuredDataMatch = html.match(/<script\s+type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis);
    if (structuredDataMatch && structuredDataMatch.length > 0) {
      seoAnalysis.analysis.onPage.push({
        item: "Structured Data",
        status: "passed",
        message: `✓ ${structuredDataMatch.length} structured data schema(s) found`,
        impact: "high",
      });
    } else {
      seoAnalysis.analysis.onPage.push({
        item: "Structured Data",
        status: "warning",
        message: "⚠ No structured data found",
        impact: "high",
        fix: "Add JSON-LD structured data for rich search results",
      });
    }

    // Word Count
    const textContent = html.replace(/<script[^>]*>.*?<\/script>/gis, "")
                            .replace(/<style[^>]*>.*?<\/style>/gis, "")
                            .replace(/<[^>]+>/g, " ")
                            .replace(/\s+/g, " ");
    const wordCount = textContent.trim().split(/\s+/).length;

    if (wordCount >= 300) {
      seoAnalysis.analysis.content.push({
        item: "Word Count",
        status: "passed",
        message: `✓ Substantial content (${wordCount} words)`,
        impact: "high",
      });
    } else {
      seoAnalysis.analysis.content.push({
        item: "Word Count",
        status: "warning",
        message: `⚠ Thin content (${wordCount} words). Aim for 300+`,
        impact: "high",
        fix: "Add more valuable, comprehensive content",
      });
    }

    // Calculate overall score
    const allChecks = [
      ...seoAnalysis.analysis.technical,
      ...seoAnalysis.analysis.onPage,
      ...seoAnalysis.analysis.performance,
      ...seoAnalysis.analysis.mobile,
      ...seoAnalysis.analysis.content,
    ];

    const passed = allChecks.filter((c) => c.status === "passed").length;
    const warnings = allChecks.filter((c) => c.status === "warning").length;
    const failed = allChecks.filter((c) => c.status === "failed").length;

    seoAnalysis.score = Math.round(((passed + warnings * 0.5) / allChecks.length) * 100);

    return new Response(JSON.stringify(seoAnalysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in seo-audit function:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

