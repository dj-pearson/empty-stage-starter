// =====================================================
// CHECK KEYWORD POSITIONS - EDGE FUNCTION
// =====================================================
// Checks keyword positions on schedule using GSC data
// or other position tracking methods
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";

// Check keyword positions via GSC API
async function checkGSCPositions(
  accessToken: string,
  propertyUrl: string,
  keywords: string[]
) {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3); // GSC has ~3 day delay
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 7); // Check last 7 days

  const url = `${GSC_API_BASE}/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`;

  const requestBody = {
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
    dimensions: ["query"],
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
    throw new Error(`GSC API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const rows = data.rows || [];

  // Map GSC data to our keywords
  const results = [];
  for (const keyword of keywords) {
    const row = rows.find((r: any) =>
      r.keys[0].toLowerCase() === keyword.toLowerCase()
    );

    if (row) {
      results.push({
        keyword,
        position: Math.round(row.position),
        impressions: row.impressions,
        clicks: row.clicks,
        ctr: row.ctr,
        dataSource: "gsc",
      });
    } else {
      // Keyword not found in GSC data (might not be ranking in top 1000)
      results.push({
        keyword,
        position: null,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        dataSource: "gsc",
      });
    }
  }

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { userId, scheduleId, keywordIds } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Checking keyword positions for user: ${userId}`);

    // Get keywords to check
    let keywordsToCheck;
    if (keywordIds && keywordIds.length > 0) {
      // Specific keywords provided
      const { data: keywords, error: keywordsError } = await supabaseClient
        .from("seo_keywords")
        .select("*")
        .eq("user_id", userId)
        .in("id", keywordIds);

      if (keywordsError) {
        throw new Error(`Failed to fetch keywords: ${keywordsError.message}`);
      }
      keywordsToCheck = keywords;
    } else {
      // Check all tracked keywords
      const { data: keywords, error: keywordsError } = await supabaseClient
        .from("seo_keywords")
        .select("*")
        .eq("user_id", userId);

      if (keywordsError) {
        throw new Error(`Failed to fetch keywords: ${keywordsError.message}`);
      }
      keywordsToCheck = keywords;
    }

    if (!keywordsToCheck || keywordsToCheck.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No keywords to check",
          checked: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Found ${keywordsToCheck.length} keywords to check`);

    let positionResults = [];

    // Try to use GSC if available
    const { data: gscCredentials } = await supabaseClient
      .from("gsc_oauth_credentials")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (gscCredentials) {
      // Check if token is expired
      const expiresAt = new Date(gscCredentials.expires_at);
      if (expiresAt < new Date()) {
        console.log("GSC token expired, attempting refresh...");

        // Refresh token
        const refreshResponse = await fetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
              client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
              refresh_token: gscCredentials.refresh_token,
              grant_type: "refresh_token",
            }),
          }
        );

        if (refreshResponse.ok) {
          const tokenData = await refreshResponse.json();
          const newExpiresAt = new Date(
            Date.now() + tokenData.expires_in * 1000
          );

          await supabaseClient
            .from("gsc_oauth_credentials")
            .update({
              access_token: tokenData.access_token,
              expires_at: newExpiresAt.toISOString(),
            })
            .eq("id", gscCredentials.id);

          gscCredentials.access_token = tokenData.access_token;
          console.log("Token refreshed successfully");
        } else {
          console.error("Failed to refresh token");
        }
      }

      // Get primary GSC property
      const { data: primaryProperty } = await supabaseClient
        .from("gsc_properties")
        .select("*")
        .eq("user_id", userId)
        .eq("is_primary", true)
        .single();

      if (primaryProperty) {
        console.log(`Using GSC property: ${primaryProperty.property_url}`);

        try {
          positionResults = await checkGSCPositions(
            gscCredentials.access_token,
            primaryProperty.property_url,
            keywordsToCheck.map((k: any) => k.keyword)
          );

          console.log(`Got ${positionResults.length} results from GSC`);
        } catch (error) {
          console.error("GSC position check error:", error);
          // Fall through to manual/estimated positions
        }
      }
    }

    // If GSC not available or failed, use existing position data
    if (positionResults.length === 0) {
      console.log("Using existing position data");
      positionResults = keywordsToCheck.map((k: any) => ({
        keyword: k.keyword,
        position: k.position || k.gsc_position,
        impressions: k.impressions || 0,
        clicks: k.clicks || 0,
        ctr: k.ctr || 0,
        dataSource: "manual",
      }));
    }

    // Save position history and update keywords
    let updatedCount = 0;
    let positionChanges = [];

    for (const keyword of keywordsToCheck) {
      const result = positionResults.find(
        (r: any) => r.keyword.toLowerCase() === keyword.keyword.toLowerCase()
      );

      if (result && result.position !== null) {
        const previousPosition = keyword.position || keyword.gsc_position;
        const positionChange = previousPosition
          ? previousPosition - result.position
          : 0;

        // Save to position history
        const { error: historyError } = await supabaseClient
          .from("seo_keyword_position_history")
          .insert({
            user_id: userId,
            keyword_id: keyword.id,
            position: result.position,
            previous_position: previousPosition,
            position_change: positionChange,
            data_source: result.dataSource,
            check_method: result.dataSource === "gsc" ? "gsc_api" : "manual",
            impressions: result.impressions,
            clicks: result.clicks,
            ctr: result.ctr,
          });

        if (historyError) {
          console.error(
            `Error saving position history for ${keyword.keyword}:`,
            historyError
          );
        }

        // Update keyword with latest position
        const { error: updateError } = await supabaseClient
          .from("seo_keywords")
          .update({
            position: result.position,
            gsc_position: result.dataSource === "gsc"
              ? result.position
              : keyword.gsc_position,
            impressions: result.impressions,
            clicks: result.clicks,
            ctr: result.ctr,
            data_source: result.dataSource,
            gsc_last_updated: result.dataSource === "gsc"
              ? new Date().toISOString()
              : keyword.gsc_last_updated,
          })
          .eq("id", keyword.id);

        if (updateError) {
          console.error(
            `Error updating keyword ${keyword.keyword}:`,
            updateError
          );
        } else {
          updatedCount++;

          if (Math.abs(positionChange) >= 3) {
            positionChanges.push({
              keyword: keyword.keyword,
              previousPosition,
              newPosition: result.position,
              change: positionChange,
            });
          }
        }
      }
    }

    // Update schedule if provided
    if (scheduleId) {
      await supabaseClient
        .from("seo_monitoring_schedules")
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: "success",
          last_run_details: {
            keywords_checked: keywordsToCheck.length,
            keywords_updated: updatedCount,
            significant_changes: positionChanges.length,
          },
          consecutive_failures: 0,
        })
        .eq("id", scheduleId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        keywordsChecked: keywordsToCheck.length,
        keywordsUpdated: updatedCount,
        significantChanges: positionChanges,
        dataSource: positionResults[0]?.dataSource || "none",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in check-keyword-positions:", error);

    // Update schedule with failure if provided
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
        })
        .eq("id", body.scheduleId);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
