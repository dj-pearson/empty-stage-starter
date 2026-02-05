import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    const { siteUrl } = await req.json();

    if (!siteUrl) {
      throw new Error("Site URL is required");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the user's access token from the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    console.log(`Fetching Core Web Vitals from GSC for ${siteUrl}...`);

    // Get OAuth credentials for this user
    const { data: credentials, error: credError } = await supabase
      .from("gsc_oauth_credentials")
      .select("access_token, refresh_token, expires_at")
      .eq("user_id", user.id)
      .single();

    if (credError || !credentials) {
      throw new Error("No Google Search Console credentials found. Please connect GSC first.");
    }

    let accessToken = credentials.access_token;

    // Check if token is expired and refresh if needed
    if (new Date(credentials.expires_at) <= new Date()) {
      console.log("Access token expired, refreshing...");

      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId!,
          client_secret: clientSecret!,
          refresh_token: credentials.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      if (!refreshResponse.ok) {
        throw new Error("Failed to refresh access token");
      }

      const refreshData = await refreshResponse.json();
      accessToken = refreshData.access_token;

      // Update stored credentials
      await supabase
        .from("gsc_oauth_credentials")
        .update({
          access_token: refreshData.access_token,
          expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
        })
        .eq("user_id", user.id);
    }

    // Fetch Core Web Vitals data from Search Console
    // Note: GSC provides aggregate CWV data, not real-time testing like PageSpeed Insights

    // Get the last 28 days of data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 28);

    const formatDate = (date: Date) => date.toISOString().split("T")[0];

    // Fetch mobile Core Web Vitals
    const mobileUrl = `https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`;

    // For aggregate CWV data, we use a different endpoint
    // Note: This requires the Search Console API and the URL to be in the property

    // Alternative: Use the URL Testing API to get page experience signals
    const urlTestingUrl = `https://searchconsole.googleapis.com/v1/urlTestingTools/mobileFriendlyTest:run`;

    const testResponse = await fetch(urlTestingUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: siteUrl,
        requestScreenshot: false,
      }),
    });

    if (!testResponse.ok) {
      console.error("Mobile-friendly test failed:", await testResponse.text());
    }

    // Fetch CWV metrics using Search Console's aggregate data
    // This is available in the "Experience" report

    // For now, let's use a hybrid approach:
    // 1. Check if PageSpeed API key is available
    // 2. If not, use GSC data (less detailed but still useful)

    const pageSpeedKey = Deno.env.get("PAGESPEED_INSIGHTS_API_KEY");

    let cwvData: any = {};

    if (pageSpeedKey) {
      // Use PageSpeed Insights (more detailed)
      console.log("Using PageSpeed Insights API for detailed metrics...");

      const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(siteUrl)}&strategy=mobile&category=performance&key=${pageSpeedKey}`;

      const psiResponse = await fetch(psiUrl);

      if (psiResponse.ok) {
        const psiData = await psiResponse.json();
        const audits = psiData.lighthouseResult.audits;
        const categories = psiData.lighthouseResult.categories;

        cwvData = {
          mobile_lcp: audits["largest-contentful-paint"]?.numericValue ?
            (audits["largest-contentful-paint"].numericValue / 1000).toFixed(2) : null,
          mobile_fid: audits["max-potential-fid"]?.numericValue ?
            audits["max-potential-fid"].numericValue.toFixed(2) : null,
          mobile_inp: audits["interaction-to-next-paint"]?.numericValue ?
            audits["interaction-to-next-paint"].numericValue.toFixed(2) : null,
          mobile_cls: audits["cumulative-layout-shift"]?.numericValue ?
            audits["cumulative-layout-shift"].numericValue.toFixed(4) : null,
          mobile_fcp: audits["first-contentful-paint"]?.numericValue ?
            (audits["first-contentful-paint"].numericValue / 1000).toFixed(2) : null,
          mobile_ttfb: audits["server-response-time"]?.numericValue ?
            (audits["server-response-time"].numericValue / 1000).toFixed(2) : null,
          mobile_speed_index: audits["speed-index"]?.numericValue ?
            (audits["speed-index"].numericValue / 1000).toFixed(2) : null,
          mobile_tbt: audits["total-blocking-time"]?.numericValue ?
            audits["total-blocking-time"].numericValue.toFixed(2) : null,
          mobile_performance_score: Math.round(categories.performance.score * 100),
          accessibility_score: Math.round(categories.accessibility.score * 100),
          best_practices_score: Math.round(categories["best-practices"].score * 100),
          seo_score: Math.round(categories.seo.score * 100),
          data_source: "pagespeed_via_gsc",
        };
      }
    } else {
      // Use GSC data only (less detailed but no extra API key needed)
      console.log("Using Google Search Console data (basic CWV metrics)...");

      // GSC doesn't provide real-time metrics via API in the same way
      // We can get field data from CrUX (Chrome User Experience Report) which is what GSC uses

      // Try to get CrUX data (this is what GSC Experience report uses)
      const cruxUrl = `https://chromeuxreport.googleapis.com/v1/records:queryRecord`;

      const cruxResponse = await fetch(cruxUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin: new URL(siteUrl).origin,
          formFactor: "PHONE",
        }),
      });

      if (cruxResponse.ok) {
        const cruxData = await cruxResponse.json();

        // CrUX provides histogram data for CWV metrics
        const metrics = cruxData.record?.metrics || {};

        // Extract percentile values (p75 is what GSC uses)
        const getLcp = () => {
          const lcp = metrics.largest_contentful_paint?.percentiles?.p75;
          return lcp ? (lcp / 1000).toFixed(2) : null; // Convert ms to seconds
        };

        const getFid = () => {
          const fid = metrics.first_input_delay?.percentiles?.p75;
          return fid ? fid.toFixed(2) : null; // Already in ms
        };

        const getCls = () => {
          const cls = metrics.cumulative_layout_shift?.percentiles?.p75;
          return cls ? (cls / 100).toFixed(4) : null; // CrUX gives it as integer
        };

        const getStatus = (metric: string, value: number | null): string => {
          if (value === null) return "unknown";

          switch (metric) {
            case "lcp":
              if (value <= 2.5) return "good";
              if (value <= 4.0) return "needs-improvement";
              return "poor";
            case "fid":
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

        const lcpValue = getLcp();
        const fidValue = getFid();
        const clsValue = getCls();

        cwvData = {
          mobile_lcp: lcpValue,
          mobile_fid: fidValue,
          mobile_cls: clsValue,
          lcp_status: getStatus("lcp", parseFloat(lcpValue || "0")),
          fid_status: getStatus("fid", parseFloat(fidValue || "0")),
          cls_status: getStatus("cls", parseFloat(clsValue || "0")),
          data_source: "crux_via_gsc",
        };

        // Estimate performance score based on CWV
        let perfScore = 100;
        if (cwvData.lcp_status === "poor") perfScore -= 30;
        else if (cwvData.lcp_status === "needs-improvement") perfScore -= 15;
        if (cwvData.fid_status === "poor") perfScore -= 20;
        else if (cwvData.fid_status === "needs-improvement") perfScore -= 10;
        if (cwvData.cls_status === "poor") perfScore -= 20;
        else if (cwvData.cls_status === "needs-improvement") perfScore -= 10;

        cwvData.mobile_performance_score = Math.max(0, perfScore);
      } else {
        console.error("CrUX API failed:", await cruxResponse.text());
        throw new Error("Unable to fetch Core Web Vitals data. Site may not have enough traffic for CrUX data.");
      }
    }

    // Save to database
    const dbData = {
      page_url: siteUrl,
      ...cwvData,
      measured_at: new Date().toISOString(),
    };

    const { data: insertedData, error: insertError } = await supabase
      .from("seo_core_web_vitals")
      .insert(dbData)
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error(`Failed to save Core Web Vitals data: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          url: siteUrl,
          metrics: cwvData,
          dataSource: cwvData.data_source,
          id: insertedData.id,
        },
        message: cwvData.data_source === "pagespeed_via_gsc"
          ? "Core Web Vitals fetched from PageSpeed Insights"
          : "Core Web Vitals fetched from Chrome User Experience Report (field data)",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in gsc-fetch-core-web-vitals:", error);
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
