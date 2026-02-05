// =====================================================
// RUN SCHEDULED AUDIT - EDGE FUNCTION
// =====================================================
// Runs automated SEO audits on a schedule and compares
// results with previous audits to detect changes
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Comprehensive SEO audit checks
async function runSEOAudit(url: string) {
  const results = [];
  const startTime = Date.now();

  try {
    const response = await fetch(url);
    const html = await response.text();

    // 1. Title tag check
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";
    results.push({
      check: "Title Tag Present",
      status: title ? "passed" : "failed",
      message: title
        ? `Title found: "${title}"`
        : "No title tag found",
      priority: "high",
    });

    if (title) {
      results.push({
        check: "Title Length",
        status: title.length >= 30 && title.length <= 60 ? "passed" : "warning",
        message: `Title is ${title.length} characters (recommended: 30-60)`,
        priority: "medium",
      });
    }

    // 2. Meta description
    const metaDescMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i
    );
    const metaDesc = metaDescMatch ? metaDescMatch[1].trim() : "";
    results.push({
      check: "Meta Description Present",
      status: metaDesc ? "passed" : "failed",
      message: metaDesc
        ? `Meta description found (${metaDesc.length} chars)`
        : "No meta description found",
      priority: "high",
    });

    if (metaDesc) {
      results.push({
        check: "Meta Description Length",
        status:
          metaDesc.length >= 120 && metaDesc.length <= 160
            ? "passed"
            : "warning",
        message: `Description is ${metaDesc.length} characters (recommended: 120-160)`,
        priority: "medium",
      });
    }

    // 3. Headings structure
    const h1Matches = html.match(/<h1[^>]*>([^<]+)<\/h1>/gi);
    const h1Count = h1Matches ? h1Matches.length : 0;
    results.push({
      check: "H1 Tag Present",
      status: h1Count === 1 ? "passed" : h1Count === 0 ? "failed" : "warning",
      message:
        h1Count === 1
          ? "Exactly one H1 tag found"
          : h1Count === 0
          ? "No H1 tag found"
          : `${h1Count} H1 tags found (should be exactly 1)`,
      priority: "high",
    });

    // 4. Image alt attributes
    const imgTags = html.match(/<img[^>]*>/gi) || [];
    const imgsWithoutAlt = imgTags.filter((img) => !img.includes("alt=")).length;
    results.push({
      check: "Image Alt Attributes",
      status: imgsWithoutAlt === 0 ? "passed" : imgsWithoutAlt < 3 ? "warning" : "failed",
      message: `${imgsWithoutAlt} of ${imgTags.length} images missing alt text`,
      priority: "medium",
    });

    // 5. Canonical tag
    const canonicalMatch = html.match(
      /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i
    );
    results.push({
      check: "Canonical Tag",
      status: canonicalMatch ? "passed" : "warning",
      message: canonicalMatch
        ? `Canonical URL: ${canonicalMatch[1]}`
        : "No canonical tag found",
      priority: "medium",
    });

    // 6. Robots meta tag
    const robotsMatch = html.match(
      /<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i
    );
    const robotsContent = robotsMatch ? robotsMatch[1] : "index,follow";
    results.push({
      check: "Robots Meta Tag",
      status: "info",
      message: `Robots directive: ${robotsContent}`,
      priority: "low",
    });

    // 7. Open Graph tags
    const ogTitleMatch = html.match(
      /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i
    );
    const ogDescMatch = html.match(
      /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i
    );
    const ogImageMatch = html.match(
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i
    );

    const ogCount = [ogTitleMatch, ogDescMatch, ogImageMatch].filter(Boolean)
      .length;
    results.push({
      check: "Open Graph Tags",
      status: ogCount >= 2 ? "passed" : ogCount === 0 ? "warning" : "info",
      message: `${ogCount}/3 essential OG tags present (title, description, image)`,
      priority: "low",
    });

    // 8. Twitter Card tags
    const twitterCardMatch = html.match(
      /<meta[^>]*name=["']twitter:card["'][^>]*content=["']([^"']*)["']/i
    );
    results.push({
      check: "Twitter Card Tags",
      status: twitterCardMatch ? "passed" : "warning",
      message: twitterCardMatch
        ? `Twitter card type: ${twitterCardMatch[1]}`
        : "No Twitter Card tags found",
      priority: "low",
    });

    // 9. Structured data (JSON-LD)
    const jsonLdMatches = html.match(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([^<]*)<\/script>/gi
    );
    results.push({
      check: "Structured Data (JSON-LD)",
      status: jsonLdMatches && jsonLdMatches.length > 0 ? "passed" : "warning",
      message: jsonLdMatches
        ? `${jsonLdMatches.length} JSON-LD schema(s) found`
        : "No structured data found",
      priority: "medium",
    });

    // 10. Mobile viewport
    const viewportMatch = html.match(
      /<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']*)["']/i
    );
    results.push({
      check: "Mobile Viewport",
      status: viewportMatch ? "passed" : "failed",
      message: viewportMatch
        ? "Mobile viewport meta tag present"
        : "No viewport meta tag (not mobile-friendly)",
      priority: "high",
    });

    // 11. HTTPS check
    results.push({
      check: "HTTPS",
      status: url.startsWith("https://") ? "passed" : "failed",
      message: url.startsWith("https://")
        ? "Site using HTTPS"
        : "Site not using HTTPS (security risk)",
      priority: "high",
    });

    // 12. Favicon
    const faviconMatch = html.match(
      /<link[^>]*rel=["'][^"']*icon[^"']*["'][^>]*>/i
    );
    results.push({
      check: "Favicon",
      status: faviconMatch ? "passed" : "info",
      message: faviconMatch ? "Favicon found" : "No favicon detected",
      priority: "low",
    });

    // 13. Page speed check (basic)
    const responseTime = Date.now() - startTime;
    results.push({
      check: "Initial Response Time",
      status:
        responseTime < 1000
          ? "passed"
          : responseTime < 3000
          ? "warning"
          : "failed",
      message: `Page loaded in ${responseTime}ms`,
      priority: "medium",
    });

    // 14. Content length
    const textContent = html.replace(/<[^>]*>/g, " ").trim();
    const wordCount = textContent.split(/\s+/).length;
    results.push({
      check: "Content Length",
      status: wordCount > 300 ? "passed" : wordCount > 100 ? "warning" : "failed",
      message: `Page has ~${wordCount} words`,
      priority: "medium",
    });

    // 15. Internal links
    const internalLinks = (html.match(/<a[^>]*href=["'][^"']*["']/gi) || [])
      .filter((link) => {
        const hrefMatch = link.match(/href=["']([^"']*)["']/i);
        if (!hrefMatch) return false;
        const href = hrefMatch[1];
        return (
          href.startsWith("/") ||
          href.startsWith(url) ||
          (!href.startsWith("http") && !href.startsWith("//"))
        );
      }).length;

    results.push({
      check: "Internal Links",
      status: internalLinks > 3 ? "passed" : internalLinks > 0 ? "warning" : "info",
      message: `${internalLinks} internal links found`,
      priority: "low",
    });

  } catch (error: any) {
    results.push({
      check: "Page Accessibility",
      status: "failed",
      message: `Failed to fetch page: ${error.message}`,
      priority: "critical",
    });
  }

  // Calculate overall score
  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const warnings = results.filter((r) => r.status === "warning").length;
  const total = results.length;
  const score = Math.round((passed / total) * 100);

  return {
    results,
    score,
    passed,
    failed,
    warnings,
    total,
  };
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { scheduleId, userId, url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Running scheduled audit for: ${url}`);

    // Run the audit
    const auditStart = Date.now();
    const audit = await runSEOAudit(url);
    const executionTime = Date.now() - auditStart;

    // Get previous audit for comparison
    const { data: previousAudit } = await supabaseClient
      .from("seo_audit_history")
      .select("overall_score")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const previousScore = previousAudit?.overall_score || audit.score;
    const scoreChange = audit.score - previousScore;

    // Save audit to history
    const { data: auditHistory, error: auditError } = await supabaseClient
      .from("seo_audit_history")
      .insert({
        user_id: userId,
        overall_score: audit.score,
        passed_checks: audit.passed,
        failed_checks: audit.failed,
        warning_checks: audit.warnings,
        total_checks: audit.total,
        audit_results: audit.results,
      })
      .select()
      .single();

    if (auditError) {
      console.error("Error saving audit history:", auditError);
    }

    // Detect new and resolved issues
    const currentIssues = audit.results
      .filter((r) => r.status === "failed" || r.status === "warning")
      .map((r) => r.check);

    const { data: previousFullAudit } = await supabaseClient
      .from("seo_audit_history")
      .select("audit_results")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(2);

    let newIssuesCount = 0;
    let resolvedIssuesCount = 0;

    if (previousFullAudit && previousFullAudit.length > 1) {
      const prevIssues = (previousFullAudit[1].audit_results as any[])
        .filter((r) => r.status === "failed" || r.status === "warning")
        .map((r) => r.check);

      newIssuesCount = currentIssues.filter((i) => !prevIssues.includes(i))
        .length;
      resolvedIssuesCount = prevIssues.filter((i) => !currentIssues.includes(i))
        .length;
    }

    // Save schedule result
    const { error: resultError } = await supabaseClient
      .from("seo_audit_schedule_results")
      .insert({
        user_id: userId,
        schedule_id: scheduleId,
        audit_history_id: auditHistory?.id,
        execution_time_ms: executionTime,
        total_checks: audit.total,
        passed_checks: audit.passed,
        failed_checks: audit.failed,
        warning_checks: audit.warnings,
        overall_score: audit.score,
        score_change: scoreChange,
        new_issues_count: newIssuesCount,
        resolved_issues_count: resolvedIssuesCount,
        issues_summary: {
          new_issues: audit.results
            .filter((r) => r.status === "failed")
            .map((r) => ({ check: r.check, message: r.message })),
          warnings: audit.results
            .filter((r) => r.status === "warning")
            .map((r) => ({ check: r.check, message: r.message })),
        },
      });

    if (resultError) {
      console.error("Error saving schedule result:", resultError);
    }

    // Update schedule status
    if (scheduleId) {
      await supabaseClient
        .from("seo_monitoring_schedules")
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: "success",
          last_run_details: {
            score: audit.score,
            score_change: scoreChange,
            execution_time_ms: executionTime,
          },
          run_count: supabaseClient.rpc("increment", { row_id: scheduleId }),
          consecutive_failures: 0,
        })
        .eq("id", scheduleId);
    }

    // Check if we should create alerts based on the results
    // The database triggers will handle this automatically

    return new Response(
      JSON.stringify({
        success: true,
        audit: {
          score: audit.score,
          scoreChange,
          passed: audit.passed,
          failed: audit.failed,
          warnings: audit.warnings,
          total: audit.total,
          executionTime,
          newIssuesCount,
          resolvedIssuesCount,
        },
        auditHistoryId: auditHistory?.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in run-scheduled-audit:", error);

    // Update schedule with failure
    const body = await req.clone().json();
    if (body.scheduleId) {
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      await supabaseClient
        .from("seo_monitoring_schedules")
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: "failed",
          last_error: error.message,
          consecutive_failures: supabaseClient.rpc("increment", {
            row_id: body.scheduleId,
          }),
        })
        .eq("id", body.scheduleId);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
