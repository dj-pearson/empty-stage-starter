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
    const {
      keyword,
      domain,
      location = "United States",
      device = "desktop",
      searchEngine = "google",
      competitors = [],
    } = await req.json();

    if (!keyword) {
      throw new Error("Keyword is required");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Tracking SERP positions for "${keyword}" in ${location} (${device})...`);

    // Get SERP data from SERPApi or DataForSEO
    const serpApiKey = Deno.env.get("SERPAPI_KEY");
    const dataForSeoLogin = Deno.env.get("DATAFORSEO_LOGIN");
    const dataForSeoPassword = Deno.env.get("DATAFORSEO_PASSWORD");

    let serpResults: any[] = [];
    let featuredSnippet = null;
    let serpFeatures: any[] = [];
    let totalResults = 0;

    if (serpApiKey) {
      // Use SERPApi
      console.log("Using SERPApi...");

      const serpApiUrl = `https://serpapi.com/search.json?engine=${searchEngine}&q=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&device=${device}&api_key=${serpApiKey}`;

      const response = await fetch(serpApiUrl);

      if (!response.ok) {
        throw new Error(`SERPApi error: ${response.status}`);
      }

      const data = await response.json();

      // Extract organic results
      serpResults = (data.organic_results || []).map((result: any, index: number) => ({
        position: index + 1,
        url: result.link,
        title: result.title,
        description: result.snippet,
        domain: new URL(result.link).hostname,
      }));

      // Extract featured snippet
      if (data.answer_box || data.featured_snippet) {
        const snippet = data.answer_box || data.featured_snippet;
        featuredSnippet = {
          domain: snippet.link ? new URL(snippet.link).hostname : null,
          title: snippet.title,
          snippet: snippet.snippet || snippet.answer,
        };
      }

      // Extract SERP features
      if (data.knowledge_graph) serpFeatures.push({ type: "knowledge_panel", present: true });
      if (data.local_results) serpFeatures.push({ type: "local_pack", present: true });
      if (data.top_stories) serpFeatures.push({ type: "top_stories", present: true });
      if (data.images) serpFeatures.push({ type: "image_pack", present: true });
      if (data.videos) serpFeatures.push({ type: "video_carousel", present: true });
      if (data.related_questions) serpFeatures.push({ type: "people_also_ask", present: true });

      totalResults = parseInt(data.search_information?.total_results || "0");
    } else if (dataForSeoLogin && dataForSeoPassword) {
      // Use DataForSEO
      console.log("Using DataForSEO...");

      const auth = btoa(`${dataForSeoLogin}:${dataForSeoPassword}`);
      const dataForSeoUrl = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";

      const response = await fetch(dataForSeoUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            keyword,
            location_name: location,
            language_code: "en",
            device,
            depth: 100,
          },
        ]),
      });

      if (!response.ok) {
        throw new Error(`DataForSEO error: ${response.status}`);
      }

      const data = await response.json();

      if (data.tasks && data.tasks[0]?.result && data.tasks[0].result[0]?.items) {
        const items = data.tasks[0].result[0].items;

        serpResults = items
          .filter((item: any) => item.type === "organic")
          .map((item: any) => ({
            position: item.rank_absolute,
            url: item.url,
            title: item.title,
            description: item.description,
            domain: item.domain,
          }));

        // Check for featured snippet
        const featuredSnippetItem = items.find((item: any) => item.type === "featured_snippet");
        if (featuredSnippetItem) {
          featuredSnippet = {
            domain: featuredSnippetItem.domain,
            title: featuredSnippetItem.title,
            snippet: featuredSnippetItem.description,
          };
        }

        // Extract SERP features
        const featureTypes = items.map((item: any) => item.type).filter((type: string) => type !== "organic");
        serpFeatures = Array.from(new Set(featureTypes)).map((type) => ({
          type,
          present: true,
        }));

        totalResults = data.tasks[0].result[0].items_count || 0;
      }
    } else {
      throw new Error("No SERP API configured. Please set SERPAPI_KEY or DATAFORSEO credentials");
    }

    console.log(`Found ${serpResults.length} SERP results`);

    // Find your position
    let yourPosition = null;
    let yourUrl = null;

    if (domain) {
      const yourResult = serpResults.find((result) => result.domain.includes(domain) || domain.includes(result.domain));

      if (yourResult) {
        yourPosition = yourResult.position;
        yourUrl = yourResult.url;
      }
    }

    // Find competitor positions
    const competitorPositions = competitors.map((competitorDomain: string) => {
      const result = serpResults.find((r) => r.domain.includes(competitorDomain) || competitorDomain.includes(r.domain));

      return {
        domain: competitorDomain,
        position: result ? result.position : null,
        url: result ? result.url : null,
        title: result ? result.title : null,
        description: result ? result.description : null,
      };
    });

    // Get previous position for trend analysis
    const { data: previousTracking } = await supabase
      .from("seo_serp_tracking")
      .select("your_position")
      .eq("keyword", keyword)
      .eq("search_engine", searchEngine)
      .eq("location", location)
      .eq("device", device)
      .order("checked_at", { ascending: false })
      .limit(1)
      .single();

    let positionChange = 0;
    let positionTrend = "new";

    if (previousTracking && previousTracking.your_position && yourPosition) {
      positionChange = previousTracking.your_position - yourPosition; // Positive = improved
      if (positionChange > 0) {
        positionTrend = "up";
      } else if (positionChange < 0) {
        positionTrend = "down";
      } else {
        positionTrend = "stable";
      }
    } else if (previousTracking && !yourPosition) {
      positionTrend = "lost";
    }

    // Calculate SERP metrics
    const avgTitleLength = Math.round(
      serpResults.reduce((sum, r) => sum + (r.title?.length || 0), 0) / serpResults.length
    );
    const avgDescriptionLength = Math.round(
      serpResults.reduce((sum, r) => sum + (r.description?.length || 0), 0) / serpResults.length
    );

    // Prepare data for database
    const trackingData = {
      keyword,
      search_engine: searchEngine,
      location,
      device,
      your_position: yourPosition,
      your_url: yourUrl,
      competitors: JSON.stringify(competitorPositions),
      has_featured_snippet: !!featuredSnippet,
      featured_snippet_owner: featuredSnippet?.domain,
      has_people_also_ask: serpFeatures.some((f) => f.type === "people_also_ask" || f.type === "related_questions"),
      has_knowledge_panel: serpFeatures.some((f) => f.type === "knowledge_panel" || f.type === "knowledge_graph"),
      has_local_pack: serpFeatures.some((f) => f.type === "local_pack" || f.type === "local_results"),
      has_image_pack: serpFeatures.some((f) => f.type === "image_pack" || f.type === "images"),
      has_video_carousel: serpFeatures.some((f) => f.type === "video_carousel" || f.type === "videos"),
      serp_features: JSON.stringify(serpFeatures),
      total_results: totalResults,
      page_results: serpResults.length,
      avg_title_length: avgTitleLength,
      avg_description_length: avgDescriptionLength,
      position_change: positionChange,
      position_trend: positionTrend,
      data_source: serpApiKey ? "serpapi" : "dataforseo",
      checked_at: new Date().toISOString(),
    };

    // Insert into database
    const { data: insertedData, error: insertError } = await supabase
      .from("seo_serp_tracking")
      .insert(trackingData)
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error(`Failed to save SERP tracking data: ${insertError.message}`);
    }

    // Update keyword position if tracking this keyword
    if (domain && yourPosition) {
      await supabase
        .from("seo_keywords")
        .update({
          current_position: yourPosition,
          last_checked: new Date().toISOString(),
        })
        .eq("keyword", keyword);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          keyword,
          yourPosition,
          positionChange,
          positionTrend,
          featuredSnippet,
          competitors: competitorPositions,
          serpFeatures: serpFeatures.map((f) => f.type),
          totalResults,
          id: insertedData.id,
        },
        message: "SERP positions tracked successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in track-serp-positions:", error);
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
