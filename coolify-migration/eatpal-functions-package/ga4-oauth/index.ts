// =====================================================
// GOOGLE ANALYTICS 4 OAUTH - EDGE FUNCTION
// =====================================================
// Handles OAuth 2.0 flow for Google Analytics 4 API
// - Initiates OAuth flow
// - Handles OAuth callback
// - Stores and refreshes tokens
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Google OAuth Configuration
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

// Dynamic redirect URI based on environment
function getRedirectUri(req: Request): string {
  const origin = req.headers.get("origin") || req.headers.get("referer") || "http://localhost:8080";
  const baseUrl = origin.replace(/\/$/, "");

  console.log('GA4 OAuth getRedirectUri - Origin detected:', origin);

  if (baseUrl.includes("localhost")) {
    const redirectUri = `${baseUrl}/oauth/callback`;
    console.log('GA4 OAuth getRedirectUri - Using localhost URI:', redirectUri);
    return redirectUri;
  } else if (baseUrl.includes("tryeatpal.com")) {
    const redirectUri = "https://tryeatpal.com/oauth/callback";
    console.log('GA4 OAuth getRedirectUri - Using production URI:', redirectUri);
    return redirectUri;
  }

  const configuredUri = Deno.env.get("GOOGLE_REDIRECT_URI");
  if (configuredUri) {
    console.log('GA4 OAuth getRedirectUri - Using configured URI:', configuredUri);
    return configuredUri;
  }

  const fallbackUri = `${baseUrl}/oauth/callback`;
  console.log('GA4 OAuth getRedirectUri - Using fallback URI:', fallbackUri);
  return fallbackUri;
}

// Google Analytics 4 OAuth Scopes
const GA4_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/analytics",
];

const OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA4_ACCOUNTS_API = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";

serve(async (req) => {
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
    let propertyId: string | null = null;

    // For callback action, get from URL params
    if (action === "callback") {
      // Handle callback action from URL params
    } else {
      try {
        const body = await req.json();
        action = body.action || "initiate";
        userId = body.userId;
        propertyId = body.propertyId;
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
        platform: 'google_analytics',
        timestamp: Date.now()
      }));
      const redirectUri = getRedirectUri(req);

      const authUrl = new URL(OAUTH_AUTHORIZE_URL);
      authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", GA4_SCOPES.join(" "));
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
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

      // Only process if this is for Google Analytics
      if (stateData.platform !== 'google_analytics') {
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
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
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

      // Fetch available GA4 properties
      let properties: any[] = [];
      try {
        const accountsResponse = await fetch(GA4_ACCOUNTS_API, {
          headers: {
            "Authorization": `Bearer ${tokens.access_token}`,
          },
        });

        if (accountsResponse.ok) {
          const accountsData = await accountsResponse.json();
          properties = accountsData.accountSummaries?.flatMap((account: any) =>
            account.propertySummaries?.map((prop: any) => ({
              propertyId: prop.property.split('/').pop(),
              propertyName: prop.displayName,
              accountId: account.account.split('/').pop(),
              accountName: account.displayName,
            })) || []
          ) || [];
        }
      } catch (e) {
        console.error("Failed to fetch GA4 properties:", e);
      }

      // Store tokens in analytics_platform_connections
      const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

      // If user has multiple properties, we'll let them select later
      // For now, store connection without a specific property
      const { error: dbError } = await supabaseClient
        .from("analytics_platform_connections")
        .insert({
          user_id: userId,
          platform: 'google_analytics',
          platform_account_id: properties[0]?.propertyId || null,
          platform_account_name: properties[0]?.propertyName || null,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: expiresAt.toISOString(),
          scope: GA4_SCOPES,
          is_active: true,
          metadata: {
            available_properties: properties,
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
          properties: properties
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
        .eq("platform", "google_analytics")
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
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
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
        .eq("platform", "google_analytics");

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
    // ACTION: LIST PROPERTIES
    // =====================================================
    else if (action === "list-properties") {
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
        .eq("platform", "google_analytics")
        .eq("is_active", true)
        .single();

      if (fetchError || !connection) {
        return new Response(
          JSON.stringify({ error: "Not connected to Google Analytics" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if token is expired
      const isExpired = new Date(connection.token_expires_at) < new Date();
      let accessToken = connection.access_token;

      if (isExpired) {
        // Refresh token first
        const refreshResponse = await fetch(OAUTH_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            refresh_token: connection.refresh_token,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            grant_type: "refresh_token",
          }),
        });

        if (refreshResponse.ok) {
          const newTokens = await refreshResponse.json();
          accessToken = newTokens.access_token;

          // Update in database
          await supabaseClient
            .from("analytics_platform_connections")
            .update({
              access_token: newTokens.access_token,
              token_expires_at: new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString(),
            })
            .eq("user_id", userId)
            .eq("platform", "google_analytics");
        }
      }

      // Fetch properties
      const accountsResponse = await fetch(GA4_ACCOUNTS_API, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      });

      if (!accountsResponse.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch GA4 properties" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const accountsData = await accountsResponse.json();
      const properties = accountsData.accountSummaries?.flatMap((account: any) =>
        account.propertySummaries?.map((prop: any) => ({
          propertyId: prop.property.split('/').pop(),
          propertyName: prop.displayName,
          accountId: account.account.split('/').pop(),
          accountName: account.displayName,
        })) || []
      ) || [];

      return new Response(
        JSON.stringify({
          success: true,
          properties: properties
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =====================================================
    // ACTION: SELECT PROPERTY
    // =====================================================
    else if (action === "select-property") {
      if (!userId || !propertyId) {
        return new Response(
          JSON.stringify({ error: "userId and propertyId are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabaseClient
        .from("analytics_platform_connections")
        .update({
          platform_account_id: propertyId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("platform", "google_analytics");

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to update property selection" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Property selected successfully"
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
        .eq("platform", "google_analytics")
        .eq("is_active", true)
        .single();

      if (fetchError || !connection) {
        return new Response(
          JSON.stringify({
            connected: false,
            message: "Not connected to Google Analytics"
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
          propertyId: connection.platform_account_id,
          propertyName: connection.platform_account_name,
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
        .eq("platform", "google_analytics");

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: "Failed to disconnect" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Disconnected from Google Analytics"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action parameter" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in ga4-oauth:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
