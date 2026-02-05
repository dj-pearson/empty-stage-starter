import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RedirectHop {
  url: string;
  statusCode: number;
  location: string | null;
  time: number;
  protocol: string;
}

interface RedirectAnalysis {
  startUrl: string;
  finalUrl: string;
  redirectChain: RedirectHop[];
  chainLength: number;
  totalTime: number;
  hasLoop: boolean;
  loopUrls: string[];
  issues: Array<{ type: string; severity: string; message: string }>;
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { urls, maxRedirects = 10 } = await req.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      throw new Error("URLs array is required");
    }

    console.log(`Analyzing redirect chains for ${urls.length} URL(s)...`);

    const analyses: RedirectAnalysis[] = [];

    for (const startUrl of urls) {
      const analysis = await analyzeRedirectChain(startUrl, maxRedirects);
      analyses.push(analysis);
    }

    // Calculate summary
    const summary = {
      totalUrls: analyses.length,
      urlsWithRedirects: analyses.filter((a) => a.chainLength > 0).length,
      urlsWithChains: analyses.filter((a) => a.chainLength > 1).length,
      urlsWithLoops: analyses.filter((a) => a.hasLoop).length,
      avgChainLength: Math.round(
        analyses.reduce((sum, a) => sum + a.chainLength, 0) / analyses.length
      ),
      totalIssues: analyses.reduce((sum, a) => sum + a.issues.length, 0),
    };

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Save to database
    const { data: savedAnalysis, error: saveError } = await supabase
      .from("seo_redirect_analysis")
      .insert({
        analyzed_urls: urls,
        total_urls: summary.totalUrls,
        urls_with_redirects: summary.urlsWithRedirects,
        urls_with_chains: summary.urlsWithChains,
        urls_with_loops: summary.urlsWithLoops,
        avg_chain_length: summary.avgChainLength,
        total_issues: summary.totalIssues,
        redirect_details: JSON.stringify(analyses),
        analyzed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (saveError) {
      console.error("Failed to save redirect analysis:", saveError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          summary,
          analyses,
          analysisId: savedAnalysis?.id,
        },
        message: `Analyzed ${summary.totalUrls} URLs, found ${summary.urlsWithChains} with redirect chains`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in detect-redirect-chains:", error);
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

async function analyzeRedirectChain(
  startUrl: string,
  maxRedirects: number
): Promise<RedirectAnalysis> {
  const redirectChain: RedirectHop[] = [];
  const issues: Array<{ type: string; severity: string; message: string }> = [];
  const visitedUrls = new Set<string>();

  let currentUrl = startUrl;
  let hasLoop = false;
  const loopUrls: string[] = [];
  let totalTime = 0;

  console.log(`Following redirects for ${startUrl}...`);

  // Follow redirect chain
  for (let i = 0; i < maxRedirects; i++) {
    // Check for loops
    if (visitedUrls.has(currentUrl)) {
      hasLoop = true;
      loopUrls.push(currentUrl);
      issues.push({
        type: "redirect_loop",
        severity: "critical",
        message: `Redirect loop detected at: ${currentUrl}`,
      });
      break;
    }

    visitedUrls.add(currentUrl);

    const startTime = Date.now();

    try {
      const response = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual", // Don't follow redirects automatically
        signal: AbortSignal.timeout(10000),
      });

      const time = Date.now() - startTime;
      totalTime += time;

      const statusCode = response.status;
      const location = response.headers.get("location");
      const protocol = new URL(currentUrl).protocol;

      const hop: RedirectHop = {
        url: currentUrl,
        statusCode,
        location,
        time,
        protocol,
      };

      redirectChain.push(hop);

      // Check if this is a redirect
      if (statusCode >= 300 && statusCode < 400 && location) {
        // Check for protocol issues
        const currentProtocol = new URL(currentUrl).protocol;
        let nextUrl: string;

        try {
          // Handle relative redirects
          if (location.startsWith("//")) {
            nextUrl = `${currentProtocol}${location}`;
          } else if (location.startsWith("/")) {
            const currentUrlObj = new URL(currentUrl);
            nextUrl = `${currentUrlObj.origin}${location}`;
          } else if (location.startsWith("http")) {
            nextUrl = location;
          } else {
            nextUrl = new URL(location, currentUrl).href;
          }

          const nextProtocol = new URL(nextUrl).protocol;

          // Check for HTTPS -> HTTP downgrade
          if (currentProtocol === "https:" && nextProtocol === "http:") {
            issues.push({
              type: "protocol_downgrade",
              severity: "high",
              message: `HTTPS to HTTP downgrade: ${currentUrl} -> ${nextUrl}`,
            });
          }

          currentUrl = nextUrl;
        } catch (e) {
          issues.push({
            type: "invalid_redirect",
            severity: "high",
            message: `Invalid redirect location: ${location}`,
          });
          break;
        }
      } else if (statusCode >= 200 && statusCode < 300) {
        // Success - end of chain
        break;
      } else {
        // Error status
        issues.push({
          type: "error_status",
          severity: "high",
          message: `HTTP ${statusCode} at ${currentUrl}`,
        });
        break;
      }
    } catch (e) {
      issues.push({
        type: "fetch_error",
        severity: "high",
        message: `Failed to fetch ${currentUrl}: ${e.message}`,
      });
      break;
    }
  }

  const chainLength = redirectChain.length - 1; // Don't count final destination
  const finalUrl = currentUrl;

  // Check for redirect chain issues
  if (chainLength > 0) {
    if (chainLength === 1) {
      issues.push({
        type: "single_redirect",
        severity: "low",
        message: `Single redirect: ${startUrl} -> ${finalUrl}`,
      });
    } else if (chainLength >= 2 && chainLength <= 3) {
      issues.push({
        type: "redirect_chain",
        severity: "medium",
        message: `Redirect chain of ${chainLength} hops: ${startUrl} -> ... -> ${finalUrl}`,
      });
    } else if (chainLength > 3) {
      issues.push({
        type: "long_redirect_chain",
        severity: "high",
        message: `Long redirect chain of ${chainLength} hops: ${startUrl} -> ... -> ${finalUrl}`,
      });
    }
  }

  // Check for slow redirects
  if (totalTime > 1000) {
    issues.push({
      type: "slow_redirects",
      severity: totalTime > 3000 ? "high" : "medium",
      message: `Slow redirect chain: ${totalTime}ms total`,
    });
  }

  // Check for mixed 301/302
  const has301 = redirectChain.some((hop) => hop.statusCode === 301);
  const has302 = redirectChain.some((hop) => hop.statusCode === 302);
  if (has301 && has302) {
    issues.push({
      type: "mixed_redirect_types",
      severity: "low",
      message: "Mixed permanent (301) and temporary (302) redirects in chain",
    });
  }

  return {
    startUrl,
    finalUrl,
    redirectChain,
    chainLength,
    totalTime,
    hasLoop,
    loopUrls,
    issues,
  };
}
