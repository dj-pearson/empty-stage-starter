// =====================================================
// UNIFIED ANALYTICS DATA SYNC - EDGE FUNCTION
// =====================================================
// Syncs data from all connected analytics platforms:
// - Google Analytics 4
// - Google Search Console
// - Bing Webmaster Tools
// - Yandex Webmaster
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// OAuth Configuration
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID") || "";
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET") || "";
const YANDEX_CLIENT_ID = Deno.env.get("YANDEX_CLIENT_ID") || "";
const YANDEX_CLIENT_SECRET = Deno.env.get("YANDEX_CLIENT_SECRET") || "";

// =====================================================
// TOKEN REFRESH UTILITIES
// =====================================================

async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenResponse.ok) return null;
  const tokens = await tokenResponse.json();
  return tokens.access_token;
}

async function refreshMicrosoftToken(refreshToken: string): Promise<string | null> {
  const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenResponse.ok) return null;
  const tokens = await tokenResponse.json();
  return tokens.access_token;
}

// =====================================================
// GOOGLE ANALYTICS 4 SYNC
// =====================================================

async function syncGA4Data(
  supabase: any,
  connection: any,
  startDate: string,
  endDate: string
) {
  console.log(`Syncing GA4 data for property ${connection.platform_account_id}`);

  // Check token expiry
  let accessToken = connection.access_token;
  if (new Date(connection.token_expires_at) < new Date()) {
    accessToken = await refreshGoogleToken(connection.refresh_token);
    if (!accessToken) throw new Error("Failed to refresh GA4 token");

    await supabase
      .from("analytics_platform_connections")
      .update({
        access_token: accessToken,
        token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      })
      .eq("id", connection.id);
  }

  const propertyId = connection.platform_account_id;

  // GA4 Data API request
  const ga4Response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "newUsers" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
          { name: "screenPageViewsPerSession" },
          { name: "conversions" },
        ],
      }),
    }
  );

  if (!ga4Response.ok) {
    const errorText = await ga4Response.text();
    console.error("GA4 API Error:", errorText);
    throw new Error(`GA4 API failed: ${errorText}`);
  }

  const ga4Data = await ga4Response.json();

  // Transform and store data
  const trafficMetrics = ga4Data.rows?.map((row: any) => {
    const date = row.dimensionValues[0].value;
    const metrics = row.metricValues;

    return {
      connection_id: connection.id,
      date: date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
      sessions: parseInt(metrics[0].value) || 0,
      users: parseInt(metrics[1].value) || 0,
      new_users: parseInt(metrics[2].value) || 0,
      pageviews: parseInt(metrics[3].value) || 0,
      bounce_rate: parseFloat(metrics[4].value) || 0,
      avg_session_duration: parseFloat(metrics[5].value) || 0,
      pages_per_session: parseFloat(metrics[6].value) || 0,
      conversions: parseInt(metrics[7].value) || 0,
      raw_data: { source: "google_analytics", row },
    };
  }) || [];

  // Upsert traffic metrics
  if (trafficMetrics.length > 0) {
    const { error } = await supabase
      .from("unified_traffic_metrics")
      .upsert(trafficMetrics, { onConflict: "connection_id,date" });

    if (error) throw error;
  }

  // Sync traffic sources
  await syncGA4TrafficSources(supabase, connection, accessToken, propertyId, startDate, endDate);

  // Sync device data
  await syncGA4DeviceData(supabase, connection, accessToken, propertyId, startDate, endDate);

  // Sync geographic data
  await syncGA4GeographicData(supabase, connection, accessToken, propertyId, startDate, endDate);

  // Sync page performance
  await syncGA4PagePerformance(supabase, connection, accessToken, propertyId, startDate, endDate);

  console.log(`GA4 sync completed: ${trafficMetrics.length} records`);
  return trafficMetrics.length;
}

async function syncGA4TrafficSources(
  supabase: any,
  connection: any,
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string
) {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: "date" },
          { name: "sessionSource" },
          { name: "sessionMedium" },
          { name: "sessionCampaignName" },
        ],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "newUsers" },
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
        ],
      }),
    }
  );

  if (!response.ok) return;

  const data = await response.json();
  const trafficSources = data.rows?.map((row: any) => {
    const date = row.dimensionValues[0].value;
    const source = row.dimensionValues[1].value;
    const medium = row.dimensionValues[2].value;
    const campaign = row.dimensionValues[3].value;
    const metrics = row.metricValues;

    return {
      connection_id: connection.id,
      date: date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
      source_medium: `${source} / ${medium}`,
      source,
      medium,
      campaign: campaign !== "(not set)" ? campaign : null,
      sessions: parseInt(metrics[0].value) || 0,
      users: parseInt(metrics[1].value) || 0,
      new_users: parseInt(metrics[2].value) || 0,
      pageviews: parseInt(metrics[3].value) || 0,
      avg_session_duration: parseFloat(metrics[4].value) || 0,
      bounce_rate: parseFloat(metrics[5].value) || 0,
    };
  }) || [];

  if (trafficSources.length > 0) {
    await supabase
      .from("unified_traffic_sources")
      .upsert(trafficSources, { onConflict: "connection_id,date,source_medium" });
  }
}

async function syncGA4DeviceData(
  supabase: any,
  connection: any,
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string
) {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: "date" },
          { name: "deviceCategory" },
          { name: "browser" },
          { name: "operatingSystem" },
        ],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
        ],
      }),
    }
  );

  if (!response.ok) return;

  const data = await response.json();
  const deviceData = data.rows?.map((row: any) => {
    const date = row.dimensionValues[0].value;
    const deviceCategory = row.dimensionValues[1].value;
    const browser = row.dimensionValues[2].value;
    const os = row.dimensionValues[3].value;
    const metrics = row.metricValues;

    return {
      connection_id: connection.id,
      date: date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
      device_category: deviceCategory.toLowerCase(),
      browser,
      os,
      sessions: parseInt(metrics[0].value) || 0,
      users: parseInt(metrics[1].value) || 0,
      pageviews: parseInt(metrics[2].value) || 0,
      avg_session_duration: parseFloat(metrics[3].value) || 0,
      bounce_rate: parseFloat(metrics[4].value) || 0,
    };
  }) || [];

  if (deviceData.length > 0) {
    await supabase
      .from("unified_device_traffic")
      .upsert(deviceData, { onConflict: "connection_id,date,device_category,browser,os" });
  }
}

async function syncGA4GeographicData(
  supabase: any,
  connection: any,
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string
) {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: "date" },
          { name: "country" },
          { name: "region" },
          { name: "city" },
        ],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
        ],
      }),
    }
  );

  if (!response.ok) return;

  const data = await response.json();
  const geoData = data.rows?.map((row: any) => {
    const date = row.dimensionValues[0].value;
    const country = row.dimensionValues[1].value;
    const region = row.dimensionValues[2].value;
    const city = row.dimensionValues[3].value;
    const metrics = row.metricValues;

    return {
      connection_id: connection.id,
      date: date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
      country_code: country,
      country_name: country,
      region: region !== "(not set)" ? region : null,
      city: city !== "(not set)" ? city : null,
      sessions: parseInt(metrics[0].value) || 0,
      users: parseInt(metrics[1].value) || 0,
      pageviews: parseInt(metrics[2].value) || 0,
      avg_session_duration: parseFloat(metrics[3].value) || 0,
      bounce_rate: parseFloat(metrics[4].value) || 0,
    };
  }) || [];

  if (geoData.length > 0) {
    await supabase
      .from("unified_geographic_traffic")
      .upsert(geoData, { onConflict: "connection_id,date,country_code,region,city" });
  }
}

async function syncGA4PagePerformance(
  supabase: any,
  connection: any,
  accessToken: string,
  propertyId: string,
  startDate: string,
  endDate: string
) {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: "date" },
          { name: "pagePath" },
          { name: "pageTitle" },
        ],
        metrics: [
          { name: "screenPageViews" },
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "userEngagementDuration" },
          { name: "bounceRate" },
        ],
        limit: 100, // Top 100 pages
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      }),
    }
  );

  if (!response.ok) return;

  const data = await response.json();
  const pageData = data.rows?.map((row: any) => {
    const date = row.dimensionValues[0].value;
    const pagePath = row.dimensionValues[1].value;
    const pageTitle = row.dimensionValues[2].value;
    const metrics = row.metricValues;

    return {
      connection_id: connection.id,
      date: date.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
      page_path: pagePath,
      page_title: pageTitle !== "(not set)" ? pageTitle : null,
      pageviews: parseInt(metrics[0].value) || 0,
      unique_pageviews: parseInt(metrics[0].value) || 0,
      sessions: parseInt(metrics[1].value) || 0,
      users: parseInt(metrics[2].value) || 0,
      avg_time_on_page: parseFloat(metrics[3].value) || 0,
      bounce_rate: parseFloat(metrics[4].value) || 0,
    };
  }) || [];

  if (pageData.length > 0) {
    await supabase
      .from("unified_page_performance")
      .upsert(pageData, { onConflict: "connection_id,date,page_path" });
  }
}

// =====================================================
// GOOGLE SEARCH CONSOLE SYNC
// =====================================================

async function syncGSCData(
  supabase: any,
  connection: any,
  startDate: string,
  endDate: string
) {
  console.log(`Syncing GSC data for site ${connection.platform_account_id}`);

  // Check token expiry
  let accessToken = connection.access_token;
  if (new Date(connection.token_expires_at) < new Date()) {
    accessToken = await refreshGoogleToken(connection.refresh_token);
    if (!accessToken) throw new Error("Failed to refresh GSC token");

    await supabase
      .from("analytics_platform_connections")
      .update({
        access_token: accessToken,
        token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      })
      .eq("id", connection.id);
  }

  const siteUrl = connection.platform_account_id;

  // Fetch query performance data
  const gscResponse = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["date", "query", "page", "device", "country"],
        rowLimit: 25000,
      }),
    }
  );

  if (!gscResponse.ok) {
    const errorText = await gscResponse.text();
    console.error("GSC API Error:", errorText);
    throw new Error(`GSC API failed: ${errorText}`);
  }

  const gscData = await gscResponse.json();

  // Store query performance
  const queryData = gscData.rows?.map((row: any) => ({
    connection_id: connection.id,
    date: row.keys[0],
    query: row.keys[1],
    landing_page: row.keys[2],
    device_type: row.keys[3],
    country: row.keys[4],
    impressions: row.impressions || 0,
    clicks: row.clicks || 0,
    ctr: row.ctr ? row.ctr * 100 : 0,
    avg_position: row.position || 0,
  })) || [];

  if (queryData.length > 0) {
    // Batch insert in chunks of 1000
    for (let i = 0; i < queryData.length; i += 1000) {
      const chunk = queryData.slice(i, i + 1000);
      await supabase
        .from("unified_query_performance")
        .upsert(chunk, { onConflict: "connection_id,date,query,landing_page,device_type,country" });
    }
  }

  // Aggregate daily metrics for unified_traffic_metrics
  const dailyMetrics = new Map();
  gscData.rows?.forEach((row: any) => {
    const date = row.keys[0];
    if (!dailyMetrics.has(date)) {
      dailyMetrics.set(date, {
        connection_id: connection.id,
        date,
        impressions: 0,
        clicks: 0,
        positions: [],
      });
    }
    const dayData = dailyMetrics.get(date);
    dayData.impressions += row.impressions || 0;
    dayData.clicks += row.clicks || 0;
    dayData.positions.push(row.position || 0);
  });

  const trafficMetrics = Array.from(dailyMetrics.values()).map((day: any) => ({
    connection_id: day.connection_id,
    date: day.date,
    impressions: day.impressions,
    clicks: day.clicks,
    ctr: day.impressions > 0 ? (day.clicks / day.impressions) * 100 : 0,
    avg_position: day.positions.length > 0
      ? day.positions.reduce((a: number, b: number) => a + b, 0) / day.positions.length
      : 0,
    raw_data: { source: "google_search_console" },
  }));

  if (trafficMetrics.length > 0) {
    await supabase
      .from("unified_traffic_metrics")
      .upsert(trafficMetrics, { onConflict: "connection_id,date" });
  }

  console.log(`GSC sync completed: ${queryData.length} query records`);
  return queryData.length;
}

// =====================================================
// BING WEBMASTER TOOLS SYNC
// =====================================================

async function syncBingData(
  supabase: any,
  connection: any,
  startDate: string,
  endDate: string
) {
  console.log(`Syncing Bing data for site ${connection.platform_account_id}`);

  // Check token expiry
  let accessToken = connection.access_token;
  if (new Date(connection.token_expires_at) < new Date()) {
    accessToken = await refreshMicrosoftToken(connection.refresh_token);
    if (!accessToken) throw new Error("Failed to refresh Bing token");

    await supabase
      .from("analytics_platform_connections")
      .update({
        access_token: accessToken,
        token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      })
      .eq("id", connection.id);
  }

  const siteUrl = connection.platform_account_id;

  // Bing Webmaster API - Get Query Stats
  const bingResponse = await fetch(
    "https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        siteUrl,
        startDate,
        endDate,
      }),
    }
  );

  if (!bingResponse.ok) {
    const errorText = await bingResponse.text();
    console.error("Bing API Error:", errorText);
    throw new Error(`Bing API failed: ${errorText}`);
  }

  const bingData = await bingResponse.json();

  // Transform and store Bing data
  const queryData = bingData.d?.map((row: any) => ({
    connection_id: connection.id,
    date: row.Date,
    query: row.Query,
    impressions: row.Impressions || 0,
    clicks: row.Clicks || 0,
    ctr: row.Ctr ? row.Ctr * 100 : 0,
    avg_position: row.AvgImpressionPosition || 0,
  })) || [];

  if (queryData.length > 0) {
    for (let i = 0; i < queryData.length; i += 1000) {
      const chunk = queryData.slice(i, i + 1000);
      await supabase
        .from("unified_query_performance")
        .upsert(chunk, { onConflict: "connection_id,date,query" });
    }
  }

  console.log(`Bing sync completed: ${queryData.length} records`);
  return queryData.length;
}

// =====================================================
// YANDEX WEBMASTER SYNC
// =====================================================

async function syncYandexData(
  supabase: any,
  connection: any,
  startDate: string,
  endDate: string
) {
  console.log(`Syncing Yandex data for host ${connection.platform_account_id}`);

  const accessToken = connection.access_token;
  const hostId = connection.platform_account_id;

  // Yandex Search Queries API
  const yandexResponse = await fetch(
    `https://api.webmaster.yandex.net/v4/user/${hostId}/search-queries/popular`,
    {
      method: "POST",
      headers: {
        "Authorization": `OAuth ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date_from: startDate,
        date_to: endDate,
        query_indicator: ["TOTAL_SHOWS", "TOTAL_CLICKS", "AVG_CLICK_POSITION"],
      }),
    }
  );

  if (!yandexResponse.ok) {
    const errorText = await yandexResponse.text();
    console.error("Yandex API Error:", errorText);
    throw new Error(`Yandex API failed: ${errorText}`);
  }

  const yandexData = await yandexResponse.json();

  // Transform and store Yandex data
  const queryData = yandexData.queries?.map((row: any) => ({
    connection_id: connection.id,
    date: startDate, // Yandex doesn't provide daily breakdown in this endpoint
    query: row.query_text,
    impressions: row.indicators?.TOTAL_SHOWS || 0,
    clicks: row.indicators?.TOTAL_CLICKS || 0,
    ctr: row.indicators?.TOTAL_SHOWS > 0
      ? (row.indicators?.TOTAL_CLICKS / row.indicators?.TOTAL_SHOWS) * 100
      : 0,
    avg_position: row.indicators?.AVG_CLICK_POSITION || 0,
  })) || [];

  if (queryData.length > 0) {
    await supabase
      .from("unified_query_performance")
      .upsert(queryData, { onConflict: "connection_id,date,query" });
  }

  console.log(`Yandex sync completed: ${queryData.length} records`);
  return queryData.length;
}

// =====================================================
// MAIN HANDLER
// =====================================================

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { userId, platform, startDate, endDate, connectionId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default date range: last 30 days
    const defaultEndDate = new Date().toISOString().split("T")[0];
    const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const syncStartDate = startDate || defaultStartDate;
    const syncEndDate = endDate || defaultEndDate;

    // Get active connections
    let query = supabaseClient
      .from("analytics_platform_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (platform) {
      query = query.eq("platform", platform);
    }

    if (connectionId) {
      query = query.eq("id", connectionId);
    }

    const { data: connections, error: fetchError } = await query;

    if (fetchError) {
      throw fetchError;
    }

    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ error: "No active connections found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sync each connection
    const results = [];
    for (const connection of connections) {
      try {
        // Update sync status
        await supabaseClient
          .from("analytics_platform_connections")
          .update({ sync_status: "syncing" })
          .eq("id", connection.id);

        let recordCount = 0;

        switch (connection.platform) {
          case "google_analytics":
            recordCount = await syncGA4Data(supabaseClient, connection, syncStartDate, syncEndDate);
            break;
          case "google_search_console":
            recordCount = await syncGSCData(supabaseClient, connection, syncStartDate, syncEndDate);
            break;
          case "bing_webmaster":
            recordCount = await syncBingData(supabaseClient, connection, syncStartDate, syncEndDate);
            break;
          case "yandex_webmaster":
            recordCount = await syncYandexData(supabaseClient, connection, syncStartDate, syncEndDate);
            break;
          default:
            throw new Error(`Unknown platform: ${connection.platform}`);
        }

        // Update sync status to success
        await supabaseClient
          .from("analytics_platform_connections")
          .update({
            sync_status: "success",
            last_sync_at: new Date().toISOString(),
            sync_error: null,
          })
          .eq("id", connection.id);

        results.push({
          connectionId: connection.id,
          platform: connection.platform,
          status: "success",
          recordCount,
        });
      } catch (error: any) {
        console.error(`Error syncing ${connection.platform}:`, error);

        // Update sync status to error
        await supabaseClient
          .from("analytics_platform_connections")
          .update({
            sync_status: "error",
            sync_error: error.message,
          })
          .eq("id", connection.id);

        results.push({
          connectionId: connection.id,
          platform: connection.platform,
          status: "error",
          error: error.message,
        });
      }
    }

    // Refresh materialized views
    await supabaseClient.rpc("refresh_analytics_views");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Analytics sync completed",
        results,
        dateRange: { startDate: syncStartDate, endDate: syncEndDate },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in sync-analytics-data:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
