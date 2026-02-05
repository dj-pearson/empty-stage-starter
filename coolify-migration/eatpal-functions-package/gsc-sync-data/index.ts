// =====================================================
// GOOGLE SEARCH CONSOLE SYNC DATA - EDGE FUNCTION
// =====================================================
// Fetches performance data from Google Search Console API
// - Keyword performance (queries)
// - Page performance (URLs)
// - Updates database with real GSC data
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";

export default async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { userId, propertyUrl, syncType = "all", startDate, endDate } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get OAuth credentials
    const { data: credentials, error: credError } = await supabaseClient
      .from("gsc_oauth_credentials")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (credError || !credentials) {
      return new Response(
        JSON.stringify({ error: "No GSC credentials found. Please authenticate first." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token is expired
    if (new Date(credentials.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Access token expired. Please refresh." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get property to sync (use provided or primary)
    let targetProperty = propertyUrl;
    if (!targetProperty) {
      const { data: primaryProperty } = await supabaseClient
        .from("gsc_properties")
        .select("*")
        .eq("user_id", userId)
        .eq("is_primary", true)
        .single();

      if (primaryProperty) {
        targetProperty = primaryProperty.property_url;
      } else {
        return new Response(
          JSON.stringify({ error: "No property specified and no primary property found." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get property ID from database
    const { data: property, error: propError } = await supabaseClient
      .from("gsc_properties")
      .select("*")
      .eq("property_url", targetProperty)
      .eq("user_id", userId)
      .single();

    if (propError || !property) {
      return new Response(
        JSON.stringify({ error: "Property not found in database." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log sync start
    const { data: syncLog, error: logError } = await supabaseClient
      .from("gsc_sync_log")
      .insert({
        property_id: property.id,
        sync_type: syncType,
        sync_status: "started",
        start_date: startDate || getDefaultStartDate(),
        end_date: endDate || getDefaultEndDate(),
      })
      .select()
      .single();

    if (logError) {
      console.error("Failed to create sync log:", logError);
    }

    const syncStartTime = Date.now();
    let totalRecordsSynced = 0;

    try {
      // =====================================================
      // SYNC KEYWORD PERFORMANCE
      // =====================================================
      if (syncType === "all" || syncType === "keywords") {
        const keywordData = await fetchGSCKeywordPerformance(
          credentials.access_token,
          targetProperty,
          startDate || getDefaultStartDate(),
          endDate || getDefaultEndDate()
        );

        // Save keyword performance data
        for (const row of keywordData) {
          // Find or create keyword in seo_keywords
          let { data: keyword, error: kwError } = await supabaseClient
            .from("seo_keywords")
            .select("*")
            .eq("keyword", row.keys[0])
            .limit(1)
            .maybeSingle();

          if (kwError) {
            console.error("Error finding keyword:", kwError);
            continue;
          }

          if (!keyword) {
            // Create new keyword
            const { data: newKeyword, error: createError } = await supabaseClient
              .from("seo_keywords")
              .insert({
                keyword: row.keys[0],
                target_url: "/",
                data_source: "gsc",
                impressions: row.impressions,
                clicks: row.clicks,
                ctr: row.ctr,
                gsc_position: row.position,
                current_position: Math.round(row.position),
                gsc_last_updated: new Date().toISOString(),
              })
              .select()
              .single();

            if (createError) {
              console.error("Error creating keyword:", createError);
              continue;
            }

            keyword = newKeyword;
          } else {
            // Update existing keyword
            await supabaseClient
              .from("seo_keywords")
              .update({
                impressions: row.impressions,
                clicks: row.clicks,
                ctr: row.ctr,
                gsc_position: row.position,
                current_position: Math.round(row.position),
                data_source: "gsc",
                gsc_last_updated: new Date().toISOString(),
                last_checked_at: new Date().toISOString(),
              })
              .eq("id", keyword.id);
          }

          // Save historical data
          await supabaseClient
            .from("gsc_keyword_performance")
            .upsert({
              keyword_id: keyword.id,
              property_id: property.id,
              date: endDate || getDefaultEndDate(),
              impressions: row.impressions,
              clicks: row.clicks,
              ctr: row.ctr,
              position: row.position,
            }, {
              onConflict: "keyword_id,property_id,date"
            });

          totalRecordsSynced++;
        }
      }

      // =====================================================
      // SYNC PAGE PERFORMANCE
      // =====================================================
      if (syncType === "all" || syncType === "pages") {
        const pageData = await fetchGSCPagePerformance(
          credentials.access_token,
          targetProperty,
          startDate || getDefaultStartDate(),
          endDate || getDefaultEndDate()
        );

        // Save page performance data
        for (const row of pageData) {
          await supabaseClient
            .from("gsc_page_performance")
            .upsert({
              property_id: property.id,
              page_url: row.keys[0],
              date: endDate || getDefaultEndDate(),
              impressions: row.impressions,
              clicks: row.clicks,
              ctr: row.ctr,
              position: row.position,
            }, {
              onConflict: "property_id,page_url,date"
            });

          totalRecordsSynced++;
        }
      }

      // Update property last synced
      await supabaseClient
        .from("gsc_properties")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", property.id);

      // Log sync completion
      const syncDuration = Date.now() - syncStartTime;
      if (syncLog) {
        await supabaseClient
          .from("gsc_sync_log")
          .update({
            sync_status: "completed",
            records_synced: totalRecordsSynced,
            completed_at: new Date().toISOString(),
            duration_ms: syncDuration,
          })
          .eq("id", syncLog.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          recordsSynced: totalRecordsSynced,
          durationMs: syncDuration,
          property: targetProperty,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (error: any) {
      // Log sync failure
      if (syncLog) {
        await supabaseClient
          .from("gsc_sync_log")
          .update({
            sync_status: "failed",
            error_message: error.message,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - syncStartTime,
          })
          .eq("id", syncLog.id);
      }

      throw error;
    }

  } catch (error: any) {
    console.error("Error in gsc-sync-data:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function fetchGSCKeywordPerformance(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const encodedSiteUrl = encodeURIComponent(siteUrl);
  const url = `${GSC_API_BASE}/sites/${encodedSiteUrl}/searchAnalytics/query`;

  const requestBody = {
    startDate,
    endDate,
    dimensions: ["query"],
    rowLimit: 1000, // Max 25,000, but start with 1000
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("GSC API error:", errorText);
    throw new Error(`Failed to fetch keyword performance: ${response.status}`);
  }

  const data = await response.json();
  return data.rows || [];
}

async function fetchGSCPagePerformance(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const encodedSiteUrl = encodeURIComponent(siteUrl);
  const url = `${GSC_API_BASE}/sites/${encodedSiteUrl}/searchAnalytics/query`;

  const requestBody = {
    startDate,
    endDate,
    dimensions: ["page"],
    rowLimit: 1000,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("GSC API error:", errorText);
    throw new Error(`Failed to fetch page performance: ${response.status}`);
  }

  const data = await response.json();
  return data.rows || [];
}

function getDefaultStartDate(): string {
  // Default: 7 days ago
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().split("T")[0];
}

function getDefaultEndDate(): string {
  // Default: Yesterday (GSC data has 2-day delay)
  const date = new Date();
  date.setDate(date.getDate() - 2);
  return date.toISOString().split("T")[0];
}
