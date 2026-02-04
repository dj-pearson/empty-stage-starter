// =====================================================
// BING WEBMASTER TOOLS OAUTH - EDGE FUNCTION
// =====================================================
// Handles OAuth 2.0 flow for Bing Webmaster Tools API
// - Initiates OAuth flow (Microsoft OAuth)
// - Handles OAuth callback
// - Stores and refreshes tokens
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Microsoft OAuth Configuration
const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID") || "";
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET") || "";

// Dynamic redirect URI based on environment
function getRedirectUri(req: Request): string {
  const origin = req.headers.get("origin") || req.headers.get("referer") || "http://localhost:8080";
  const baseUrl = origin.replace(/\/$/, "");

  console.log('Bing OAuth getRedirectUri - Origin detected:', origin);

  if (baseUrl.includes("localhost")) {
    const redirectUri = `${baseUrl}/oauth/callback`;
    console.log('Bing OAuth getRedirectUri - Using localhost URI:', redirectUri);
    return redirectUri;
  } else if (baseUrl.includes("tryeatpal.com")) {
    const redirectUri = "https://tryeatpal.com/oauth/callback";
    console.log('Bing OAuth getRedirectUri - Using production URI:', redirectUri);
    return redirectUri;
  }

  const configuredUri = Deno.env.get("MICROSOFT_REDIRECT_URI");
  if (configuredUri) {
    console.log('Bing OAuth getRedirectUri - Using configured URI:', configuredUri);
    return configuredUri;
  }

  const fallbackUri = `${baseUrl}/oauth/callback`;
  console.log('Bing OAuth getRedirectUri - Using fallback URI:', fallbackUri);
  return fallbackUri;
}

// Microsoft OAuth endpoints
const OAUTH_AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const OAUTH_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

// Bing Webmaster Tools API scope
const BING_SCOPE = "https://api.bing.microsoft.com/.default offline_access";

// Bing Webmaster API endpoint
const BING_API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

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

    const url = new URL(req.url);

    let action = url.searchParams.get("action");
    let userId: string | null = null;
    let siteUrl: string | null = null;

    // For callback action, get from URL params
    if (action === "callback") {
      // Handle callback action from URL params
    } else {
      try {
        const body = await req.json();
        action = body.action || "initiate";
        userId = body.userId;
        siteUrl = body.siteUrl;
      } catch (e) {
        return new Response(
          JSON.stringify({ error: "Invalid request body" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // =====================================================
    // ACTION: INITIATE OAUTH FLOW
    // =====================================================
    if (action === "initiate") {
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "userId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const state = btoa(JSON.stringify({
        userId,
        platform: 'bing_webmaster',
        timestamp: Date.now()
      }));
      const redirectUri = getRedirectUri(req);

      const authUrl = new URL(OAUTH_AUTHORIZE_URL);
      authUrl.searchParams.set("client_id", MICROSOFT_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", BING_SCOPE);
      authUrl.searchParams.set("response_mode", "query");
      authUrl.searchParams.set("state", state);

      return new Response(
        JSON.stringify({
          authUrl: authUrl.toString(),
          message: "Redirect user to this URL to begin OAuth flow"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =====================================================
    // ACTION: HANDLE OAUTH CALLBACK
    // =====================================================
    else if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        return new Response(
          JSON.stringify({ error: `OAuth error: ${error}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!code || !state) {
        return new Response(
          JSON.stringify({ error: "Missing code or state parameter" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let stateData: any;
      try {
        stateData = JSON.parse(atob(state));
        userId = stateData.userId;
      } catch (e) {
        return new Response(
          JSON.stringify({ error: "Invalid state parameter" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Only process if this is for Bing Webmaster
      if (stateData.platform !== 'bing_webmaster') {
        return new Response(
          JSON.stringify({ error: "Invalid platform in state" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const redirectUri = getRedirectUri(req);

      const tokenResponse = await fetch(OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error("Token exchange failed:", errorData);
        return new Response(
          JSON.stringify({ error: "Failed to exchange authorization code for tokens" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokens = await tokenResponse.json();

      // Fetch available sites from Bing Webmaster Tools
      let sites: any[] = [];
      try {
        const sitesResponse = await fetch(`${BING_API_BASE}/GetSites`, {
          headers: {
            "Authorization": `Bearer ${tokens.access_token}`,
            "Content-Type": "application/json",
          },
        });

        if (sitesResponse.ok) {
          const sitesData = await sitesResponse.json();
          sites = sitesData.d || [];
        }
      } catch (e) {
        console.error("Failed to fetch Bing sites:", e);
      }

      // Store tokens in analytics_platform_connections
      const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

      const { error: dbError } = await supabaseClient
        .from("analytics_platform_connections")
        .insert({
          user_id: userId,
          platform: 'bing_webmaster',
          platform_account_id: sites[0]?.Url || null,
          platform_account_name: sites[0]?.Url || null,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: expiresAt.toISOString(),
          scope: [BING_SCOPE],
          is_active: true,
          metadata: {
            available_sites: sites,
            token_type: tokens.token_type || "Bearer",
          }
        });

      if (dbError) {
        console.error("Failed to store tokens:", dbError);
        return new Response(
          JSON.stringify({ error: "Failed to store OAuth tokens", details: dbError }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "OAuth flow completed successfully",
          expiresAt: expiresAt.toISOString(),
          sites: sites
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =====================================================
    // ACTION: REFRESH TOKEN
    // =====================================================
    else if (action === "refresh") {
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "userId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: connection, error: fetchError } = await supabaseClient
        .from("analytics_platform_connections")
        .select("*")
        .eq("user_id", userId)
        .eq("platform", "bing_webmaster")
        .eq("is_active", true)
        .single();

      if (fetchError || !connection) {
        return new Response(
          JSON.stringify({ error: "No OAuth credentials found. Please re-authenticate." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const refreshResponse = await fetch(OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          refresh_token: connection.refresh_token,
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          grant_type: "refresh_token",
        }),
      });

      if (!refreshResponse.ok) {
        const errorData = await refreshResponse.text();
        console.error("Token refresh failed:", errorData);
        return new Response(
          JSON.stringify({ error: "Failed to refresh access token. Please re-authenticate." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const newTokens = await refreshResponse.json();
      const newExpiresAt = new Date(Date.now() + (newTokens.expires_in * 1000));

      const { error: updateError } = await supabaseClient
        .from("analytics_platform_connections")
        .update({
          access_token: newTokens.access_token,
          token_expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("platform", "bing_webmaster");

      if (updateError) {
        console.error("Failed to update tokens:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update OAuth tokens" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Access token refreshed successfully",
          expiresAt: newExpiresAt.toISOString()
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =====================================================
    // ACTION: LIST SITES
    // =====================================================
    else if (action === "list-sites") {
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "userId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: connection, error: fetchError } = await supabaseClient
        .from("analytics_platform_connections")
        .select("*")
        .eq("user_id", userId)
        .eq("platform", "bing_webmaster")
        .eq("is_active", true)
        .single();

      if (fetchError || !connection) {
        return new Response(
          JSON.stringify({ error: "Not connected to Bing Webmaster Tools" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if token is expired and refresh if needed
      const isExpired = new Date(connection.token_expires_at) < new Date();
      let accessToken = connection.access_token;

      if (isExpired) {
        const refreshResponse = await fetch(OAUTH_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            refresh_token: connection.refresh_token,
            client_id: MICROSOFT_CLIENT_ID,
            client_secret: MICROSOFT_CLIENT_SECRET,
            grant_type: "refresh_token",
          }),
        });

        if (refreshResponse.ok) {
          const newTokens = await refreshResponse.json();
          accessToken = newTokens.access_token;

          await supabaseClient
            .from("analytics_platform_connections")
            .update({
              access_token: newTokens.access_token,
              token_expires_at: new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString(),
            })
            .eq("user_id", userId)
            .eq("platform", "bing_webmaster");
        }
      }

      // Fetch sites
      const sitesResponse = await fetch(`${BING_API_BASE}/GetSites`, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!sitesResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch Bing sites" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const sitesData = await sitesResponse.json();
      const sites = sitesData.d || [];

      return new Response(
        JSON.stringify({
          success: true,
          sites: sites
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =====================================================
    // ACTION: SELECT SITE
    // =====================================================
    else if (action === "select-site") {
      if (!userId || !siteUrl) {
        return new Response(
          JSON.stringify({ error: "userId and siteUrl are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabaseClient
        .from("analytics_platform_connections")
        .update({
          platform_account_id: siteUrl,
          platform_account_name: siteUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("platform", "bing_webmaster");

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to update site selection" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Site selected successfully"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =====================================================
    // ACTION: CHECK STATUS
    // =====================================================
    else if (action === "status") {
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "userId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: connection, error: fetchError } = await supabaseClient
        .from("analytics_platform_connections")
        .select("*")
        .eq("user_id", userId)
        .eq("platform", "bing_webmaster")
        .eq("is_active", true)
        .single();

      if (fetchError || !connection) {
        return new Response(
          JSON.stringify({
            connected: false,
            message: "Not connected to Bing Webmaster Tools"
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isExpired = new Date(connection.token_expires_at) < new Date();

      return new Response(
        JSON.stringify({
          connected: true,
          isExpired,
          expiresAt: connection.token_expires_at,
          scope: connection.scope,
          siteUrl: connection.platform_account_id,
          lastUpdated: connection.updated_at
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =====================================================
    // ACTION: DISCONNECT
    // =====================================================
    else if (action === "disconnect") {
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "userId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: deleteError } = await supabaseClient
        .from("analytics_platform_connections")
        .update({ is_active: false })
        .eq("user_id", userId)
        .eq("platform", "bing_webmaster");

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: "Failed to disconnect" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Disconnected from Bing Webmaster Tools"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action parameter" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in bing-webmaster-oauth:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
