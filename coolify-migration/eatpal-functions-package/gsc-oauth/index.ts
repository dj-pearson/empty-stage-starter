// =====================================================
// GOOGLE SEARCH CONSOLE OAUTH - EDGE FUNCTION
// =====================================================
// Handles OAuth 2.0 flow for Google Search Console API
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
  // Get origin from request headers
  const origin = req.headers.get("origin") || req.headers.get("referer") || "http://localhost:8080";
  const baseUrl = origin.replace(/\/$/, ""); // Remove trailing slash
  
  console.log('OAuth getRedirectUri - Origin detected:', origin);
  
  // Use environment-specific redirect URIs that match Google Cloud Console
  if (baseUrl.includes("localhost")) {
    const redirectUri = `${baseUrl}/oauth/callback`;
    console.log('OAuth getRedirectUri - Using localhost URI:', redirectUri);
    return redirectUri;
  } else if (baseUrl.includes("tryeatpal.com")) {
    const redirectUri = "https://tryeatpal.com/oauth/callback";
    console.log('OAuth getRedirectUri - Using production URI:', redirectUri);
    return redirectUri;
  }
  
  // Fallback to configured URI if available
  const configuredUri = Deno.env.get("GOOGLE_REDIRECT_URI");
  if (configuredUri) {
    console.log('OAuth getRedirectUri - Using configured URI:', configuredUri);
    return configuredUri;
  }
  
  // Final fallback
  const fallbackUri = `${baseUrl}/oauth/callback`;
  console.log('OAuth getRedirectUri - Using fallback URI:', fallbackUri);
  return fallbackUri;
}

// Google Search Console OAuth Scope
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

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
    
    // Try to get action from URL params first (for GET callback), then from body
    let action = url.searchParams.get("action");
    let userId: string | null = null;

    // For callback action, get from URL params
    if (action === "callback") {
      // Handle callback action from URL params (this is correct)
    } else {
      // For all other actions, get from request body
      try {
        const body = await req.json();
        action = body.action || "initiate";
        userId = body.userId;
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

      // Build OAuth URL with state parameter (contains user ID)
      const state = btoa(JSON.stringify({ userId, timestamp: Date.now() }));
      const redirectUri = getRedirectUri(req);

      const authUrl = new URL(OAUTH_AUTHORIZE_URL);
      authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", GSC_SCOPE);
      authUrl.searchParams.set("access_type", "offline"); // Get refresh token
      authUrl.searchParams.set("prompt", "consent"); // Force consent to get refresh token
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

      // Decode state to get user ID
      let userId: string;
      try {
        const stateData = JSON.parse(atob(state));
        userId = stateData.userId;
      } catch (e) {
        return new Response(
          JSON.stringify({ error: "Invalid state parameter" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Exchange authorization code for tokens
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

      // Store tokens in database
      const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

      const { error: dbError } = await supabaseClient
        .from("gsc_oauth_credentials")
        .upsert({
          user_id: userId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: tokens.token_type || "Bearer",
          expires_at: expiresAt.toISOString(),
          scope: tokens.scope || GSC_SCOPE,
          is_active: true,
        }, {
          onConflict: "user_id"
        });

      if (dbError) {
        console.error("Failed to store tokens:", dbError);
        return new Response(
          JSON.stringify({ error: "Failed to store OAuth tokens" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "OAuth flow completed successfully",
          expiresAt: expiresAt.toISOString()
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

      // Get existing refresh token
      const { data: credentials, error: fetchError } = await supabaseClient
        .from("gsc_oauth_credentials")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();

      if (fetchError || !credentials) {
        return new Response(
          JSON.stringify({ error: "No OAuth credentials found. Please re-authenticate." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Refresh the access token
      const refreshResponse = await fetch(OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          refresh_token: credentials.refresh_token,
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

      // Update tokens in database
      const { error: updateError } = await supabaseClient
        .from("gsc_oauth_credentials")
        .update({
          access_token: newTokens.access_token,
          expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

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
    // ACTION: CHECK STATUS
    // =====================================================
    else if (action === "status") {
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "userId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: credentials, error: fetchError } = await supabaseClient
        .from("gsc_oauth_credentials")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();

      if (fetchError || !credentials) {
        return new Response(
          JSON.stringify({
            connected: false,
            message: "Not connected to Google Search Console"
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const isExpired = new Date(credentials.expires_at) < new Date();

      return new Response(
        JSON.stringify({
          connected: true,
          isExpired,
          expiresAt: credentials.expires_at,
          scope: credentials.scope,
          lastUpdated: credentials.updated_at
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

      // Soft delete: mark as inactive
      const { error: deleteError } = await supabaseClient
        .from("gsc_oauth_credentials")
        .update({ is_active: false })
        .eq("user_id", userId);

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: "Failed to disconnect" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Disconnected from Google Search Console"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Invalid action
    return new Response(
      JSON.stringify({ error: "Invalid action parameter" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in gsc-oauth:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
