// =====================================================
// YANDEX WEBMASTER OAUTH - EDGE FUNCTION
// =====================================================
// Handles OAuth 2.0 flow for Yandex Webmaster API
// - Initiates OAuth flow
// - Handles OAuth callback
// - Stores and refreshes tokens
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Yandex OAuth Configuration
const YANDEX_CLIENT_ID = Deno.env.get("YANDEX_CLIENT_ID") || "";
const YANDEX_CLIENT_SECRET = Deno.env.get("YANDEX_CLIENT_SECRET") || "";

// Dynamic redirect URI based on environment
function getRedirectUri(req: Request): string {
  const origin = req.headers.get("origin") || req.headers.get("referer") || "http://localhost:8080";
  const baseUrl = origin.replace(/\/$/, "");

  console.log('Yandex OAuth getRedirectUri - Origin detected:', origin);

  if (baseUrl.includes("localhost")) {
    const redirectUri = `${baseUrl}/oauth/callback`;
    console.log('Yandex OAuth getRedirectUri - Using localhost URI:', redirectUri);
    return redirectUri;
  } else if (baseUrl.includes("tryeatpal.com")) {
    const redirectUri = "https://tryeatpal.com/oauth/callback";
    console.log('Yandex OAuth getRedirectUri - Using production URI:', redirectUri);
    return redirectUri;
  }

  const configuredUri = Deno.env.get("YANDEX_REDIRECT_URI");
  if (configuredUri) {
    console.log('Yandex OAuth getRedirectUri - Using configured URI:', configuredUri);
    return configuredUri;
  }

  const fallbackUri = `${baseUrl}/oauth/callback`;
  console.log('Yandex OAuth getRedirectUri - Using fallback URI:', fallbackUri);
  return fallbackUri;
}

// Yandex OAuth endpoints
const OAUTH_AUTHORIZE_URL = "https://oauth.yandex.com/authorize";
const OAUTH_TOKEN_URL = "https://oauth.yandex.com/token";

// Yandex Webmaster API endpoints
const YANDEX_API_BASE = "https://api.webmaster.yandex.net/v4";

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
    let hostId: string | null = null;

    // For callback action, get from URL params
    if (action === "callback") {
      // Handle callback action from URL params
    } else {
      try {
        const body = await req.json();
        action = body.action || "initiate";
        userId = body.userId;
        hostId = body.hostId;
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
        platform: 'yandex_webmaster',
        timestamp: Date.now()
      }));
      const redirectUri = getRedirectUri(req);

      const authUrl = new URL(OAUTH_AUTHORIZE_URL);
      authUrl.searchParams.set("client_id", YANDEX_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("force_confirm", "yes");

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

      // Only process if this is for Yandex Webmaster
      if (stateData.platform !== 'yandex_webmaster') {
        return new Response(
          JSON.stringify({ error: "Invalid platform in state" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const redirectUri = getRedirectUri(req);

      // Yandex requires Basic Auth for token exchange
      const authString = btoa(`${YANDEX_CLIENT_ID}:${YANDEX_CLIENT_SECRET}`);

      const tokenResponse = await fetch(OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${authString}`,
        },
        body: new URLSearchParams({
          code,
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

      // Fetch available hosts from Yandex Webmaster
      let hosts: any[] = [];
      try {
        const hostsResponse = await fetch(`${YANDEX_API_BASE}/user`, {
          headers: {
            "Authorization": `OAuth ${tokens.access_token}`,
            "Content-Type": "application/json",
          },
        });

        if (hostsResponse.ok) {
          const hostsData = await hostsResponse.json();
          hosts = hostsData.hosts || [];
        }
      } catch (e) {
        console.error("Failed to fetch Yandex hosts:", e);
      }

      // Store tokens in analytics_platform_connections
      // Yandex tokens don't expire (unless revoked), but we'll set a far future date
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + (tokens.expires_in * 1000))
        : new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)); // 1 year

      const { error: dbError } = await supabaseClient
        .from("analytics_platform_connections")
        .insert({
          user_id: userId,
          platform: 'yandex_webmaster',
          platform_account_id: hosts[0]?.host_id || null,
          platform_account_name: hosts[0]?.unicode_host_url || null,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          token_expires_at: expiresAt.toISOString(),
          scope: [],
          is_active: true,
          metadata: {
            available_hosts: hosts,
            token_type: tokens.token_type || "OAuth",
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
          hosts: hosts
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
        .eq("platform", "yandex_webmaster")
        .eq("is_active", true)
        .single();

      if (fetchError || !connection) {
        return new Response(
          JSON.stringify({ error: "No OAuth credentials found. Please re-authenticate." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!connection.refresh_token) {
        return new Response(
          JSON.stringify({ error: "No refresh token available. Yandex tokens generally don't expire." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const authString = btoa(`${YANDEX_CLIENT_ID}:${YANDEX_CLIENT_SECRET}`);

      const refreshResponse = await fetch(OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${authString}`,
        },
        body: new URLSearchParams({
          refresh_token: connection.refresh_token,
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
      const newExpiresAt = newTokens.expires_in
        ? new Date(Date.now() + (newTokens.expires_in * 1000))
        : new Date(Date.now() + (365 * 24 * 60 * 60 * 1000));

      const { error: updateError } = await supabaseClient
        .from("analytics_platform_connections")
        .update({
          access_token: newTokens.access_token,
          token_expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("platform", "yandex_webmaster");

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
    // ACTION: LIST HOSTS
    // =====================================================
    else if (action === "list-hosts") {
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
        .eq("platform", "yandex_webmaster")
        .eq("is_active", true)
        .single();

      if (fetchError || !connection) {
        return new Response(
          JSON.stringify({ error: "Not connected to Yandex Webmaster" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Yandex tokens generally don't expire, but check anyway
      const isExpired = new Date(connection.token_expires_at) < new Date();
      let accessToken = connection.access_token;

      if (isExpired && connection.refresh_token) {
        const authString = btoa(`${YANDEX_CLIENT_ID}:${YANDEX_CLIENT_SECRET}`);
        const refreshResponse = await fetch(OAUTH_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${authString}`,
          },
          body: new URLSearchParams({
            refresh_token: connection.refresh_token,
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
              token_expires_at: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)).toISOString(),
            })
            .eq("user_id", userId)
            .eq("platform", "yandex_webmaster");
        }
      }

      // Fetch hosts
      const hostsResponse = await fetch(`${YANDEX_API_BASE}/user`, {
        headers: {
          "Authorization": `OAuth ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!hostsResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch Yandex hosts" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const hostsData = await hostsResponse.json();
      const hosts = hostsData.hosts || [];

      return new Response(
        JSON.stringify({
          success: true,
          hosts: hosts
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =====================================================
    // ACTION: SELECT HOST
    // =====================================================
    else if (action === "select-host") {
      if (!userId || !hostId) {
        return new Response(
          JSON.stringify({ error: "userId and hostId are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabaseClient
        .from("analytics_platform_connections")
        .update({
          platform_account_id: hostId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("platform", "yandex_webmaster");

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to update host selection" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Host selected successfully"
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
        .eq("platform", "yandex_webmaster")
        .eq("is_active", true)
        .single();

      if (fetchError || !connection) {
        return new Response(
          JSON.stringify({
            connected: false,
            message: "Not connected to Yandex Webmaster"
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
          hostId: connection.platform_account_id,
          hostUrl: connection.platform_account_name,
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
        .eq("platform", "yandex_webmaster");

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: "Failed to disconnect" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Disconnected from Yandex Webmaster"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action parameter" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in yandex-webmaster-oauth:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
