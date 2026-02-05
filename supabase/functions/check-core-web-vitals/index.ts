import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PageSpeedData {
  lighthouseResult: {
    audits: {
      [key: string]: {
        numericValue?: number;
        score?: number;
        displayValue?: string;
      };
    };
    categories: {
      performance: { score: number };
      accessibility: { score: number };
      "best-practices": { score: number };
      seo: { score: number };
    };
  };
  loadingExperience?: {
    metrics: {
      [key: string]: {
        percentile: number;
        category: string;
      };
    };
  };
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url, strategy = "mobile" } = await req.json();

    if (!url) {
      throw new Error("URL is required");
    }

    // Get PageSpeed Insights API key from environment
    const PSI_API_KEY = Deno.env.get("PAGESPEED_INSIGHTS_API_KEY") || "";

    if (!PSI_API_KEY) {
      throw new Error("PageSpeed Insights API key not configured");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Checking Core Web Vitals for ${url} (${strategy})...`);

    // Fetch data from PageSpeed Insights API
    const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&category=accessibility&category=best-practices&category=seo&key=${PSI_API_KEY}`;

    const response = await fetch(psiUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("PageSpeed API Error:", errorText);
      throw new Error(`PageSpeed API error: ${response.status}`);
    }

    const data: PageSpeedData = await response.json();
    const audits = data.lighthouseResult.audits;
    const categories = data.lighthouseResult.categories;

    // Extract Core Web Vitals metrics
    const metrics = {
      // Core Web Vitals
      lcp: audits["largest-contentful-paint"]?.numericValue ?
        (audits["largest-contentful-paint"].numericValue / 1000).toFixed(2) : null, // Convert to seconds
      fid: audits["max-potential-fid"]?.numericValue ?
        audits["max-potential-fid"].numericValue.toFixed(2) : null, // milliseconds
      inp: audits["interaction-to-next-paint"]?.numericValue ?
        audits["interaction-to-next-paint"].numericValue.toFixed(2) : null, // milliseconds
      cls: audits["cumulative-layout-shift"]?.numericValue ?
        audits["cumulative-layout-shift"].numericValue.toFixed(4) : null,

      // Other important metrics
      fcp: audits["first-contentful-paint"]?.numericValue ?
        (audits["first-contentful-paint"].numericValue / 1000).toFixed(2) : null, // seconds
      ttfb: audits["server-response-time"]?.numericValue ?
        (audits["server-response-time"].numericValue / 1000).toFixed(2) : null, // seconds
      speedIndex: audits["speed-index"]?.numericValue ?
        (audits["speed-index"].numericValue / 1000).toFixed(2) : null, // seconds
      tbt: audits["total-blocking-time"]?.numericValue ?
        audits["total-blocking-time"].numericValue.toFixed(2) : null, // milliseconds

      // Performance scores
      performanceScore: Math.round(categories.performance.score * 100),
      accessibilityScore: Math.round(categories.accessibility.score * 100),
      bestPracticesScore: Math.round(categories["best-practices"].score * 100),
      seoScore: Math.round(categories.seo.score * 100),
    };

    // Determine status for each Core Web Vital
    const getStatus = (metric: string, value: number | null): string => {
      if (value === null) return "unknown";

      switch (metric) {
        case "lcp":
          if (value <= 2.5) return "good";
          if (value <= 4.0) return "needs-improvement";
          return "poor";
        case "fid":
        case "inp":
          if (value <= 100) return "good";
          if (value <= 300) return "needs-improvement";
          return "poor";
        case "cls":
          if (value <= 0.1) return "good";
          if (value <= 0.25) return "needs-improvement";
          return "poor";
        default:
          return "unknown";
      }
    };

    // Extract optimization opportunities
    const opportunities = [];
    for (const [key, audit] of Object.entries(audits)) {
      if (audit.score !== undefined && audit.score < 0.9 && key.includes("opportunities")) {
        opportunities.push({
          id: key,
          title: key.replace(/-/g, " "),
          description: audit.displayValue || "",
          impact: audit.score < 0.5 ? "high" : "medium",
        });
      }
    }

    // Extract diagnostics
    const diagnostics = [];
    const diagnosticAudits = [
      "mainthread-work-breakdown",
      "bootup-time",
      "uses-long-cache-ttl",
      "total-byte-weight",
      "dom-size",
    ];

    for (const auditKey of diagnosticAudits) {
      if (audits[auditKey]) {
        diagnostics.push({
          id: auditKey,
          title: auditKey.replace(/-/g, " "),
          value: audits[auditKey].displayValue || "",
          score: audits[auditKey].score || 0,
        });
      }
    }

    // Prepare data for database insertion
    const cwvData: any = {
      page_url: url,
      measured_at: new Date().toISOString(),
      opportunities: JSON.stringify(opportunities),
      diagnostics: JSON.stringify(diagnostics),
    };

    // Add strategy-specific metrics
    if (strategy === "mobile") {
      cwvData.mobile_lcp = metrics.lcp;
      cwvData.mobile_fid = metrics.fid;
      cwvData.mobile_inp = metrics.inp;
      cwvData.mobile_cls = metrics.cls;
      cwvData.mobile_fcp = metrics.fcp;
      cwvData.mobile_ttfb = metrics.ttfb;
      cwvData.mobile_speed_index = metrics.speedIndex;
      cwvData.mobile_tbt = metrics.tbt;
      cwvData.mobile_performance_score = metrics.performanceScore;
    } else {
      cwvData.desktop_lcp = metrics.lcp;
      cwvData.desktop_fid = metrics.fid;
      cwvData.desktop_inp = metrics.inp;
      cwvData.desktop_cls = metrics.cls;
      cwvData.desktop_fcp = metrics.fcp;
      cwvData.desktop_ttfb = metrics.ttfb;
      cwvData.desktop_speed_index = metrics.speedIndex;
      cwvData.desktop_tbt = metrics.tbt;
      cwvData.desktop_performance_score = metrics.performanceScore;
    }

    // Add scores (only on first insert or update separately)
    cwvData.accessibility_score = metrics.accessibilityScore;
    cwvData.best_practices_score = metrics.bestPracticesScore;
    cwvData.seo_score = metrics.seoScore;

    // Add status classifications
    cwvData.lcp_status = getStatus("lcp", parseFloat(metrics.lcp || "0"));
    cwvData.fid_status = getStatus("fid", parseFloat(metrics.fid || "0"));
    cwvData.inp_status = getStatus("inp", parseFloat(metrics.inp || "0"));
    cwvData.cls_status = getStatus("cls", parseFloat(metrics.cls || "0"));

    // Check if we need to run both mobile and desktop
    if (strategy === "mobile") {
      // Also fetch desktop data
      console.log("Fetching desktop metrics...");
      const desktopUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=desktop&category=performance&key=${PSI_API_KEY}`;
      const desktopResponse = await fetch(desktopUrl);

      if (desktopResponse.ok) {
        const desktopData: PageSpeedData = await desktopResponse.json();
        const desktopAudits = desktopData.lighthouseResult.audits;

        cwvData.desktop_lcp = desktopAudits["largest-contentful-paint"]?.numericValue ?
          (desktopAudits["largest-contentful-paint"].numericValue / 1000).toFixed(2) : null;
        cwvData.desktop_fid = desktopAudits["max-potential-fid"]?.numericValue ?
          desktopAudits["max-potential-fid"].numericValue.toFixed(2) : null;
        cwvData.desktop_inp = desktopAudits["interaction-to-next-paint"]?.numericValue ?
          desktopAudits["interaction-to-next-paint"].numericValue.toFixed(2) : null;
        cwvData.desktop_cls = desktopAudits["cumulative-layout-shift"]?.numericValue ?
          desktopAudits["cumulative-layout-shift"].numericValue.toFixed(4) : null;
        cwvData.desktop_fcp = desktopAudits["first-contentful-paint"]?.numericValue ?
          (desktopAudits["first-contentful-paint"].numericValue / 1000).toFixed(2) : null;
        cwvData.desktop_ttfb = desktopAudits["server-response-time"]?.numericValue ?
          (desktopAudits["server-response-time"].numericValue / 1000).toFixed(2) : null;
        cwvData.desktop_speed_index = desktopAudits["speed-index"]?.numericValue ?
          (desktopAudits["speed-index"].numericValue / 1000).toFixed(2) : null;
        cwvData.desktop_tbt = desktopAudits["total-blocking-time"]?.numericValue ?
          desktopAudits["total-blocking-time"].numericValue.toFixed(2) : null;
        cwvData.desktop_performance_score = Math.round(desktopData.lighthouseResult.categories.performance.score * 100);
      }
    }

    // Insert into database
    const { data: insertedData, error: insertError } = await supabase
      .from("seo_core_web_vitals")
      .insert(cwvData)
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error(`Failed to save Core Web Vitals data: ${insertError.message}`);
    }

    // Return results
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          url,
          metrics,
          opportunities: opportunities.slice(0, 5), // Top 5 opportunities
          diagnostics: diagnostics.slice(0, 5), // Top 5 diagnostics
          id: insertedData.id,
        },
        message: "Core Web Vitals checked successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in check-core-web-vitals:", error);
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
}
