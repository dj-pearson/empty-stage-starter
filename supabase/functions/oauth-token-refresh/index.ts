import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCorsHeaders, securityHeaders, noCacheHeaders } from "../_shared/headers.ts";

/**
 * OAuth Token Refresh Edge Function
 *
 * Securely refreshes OAuth tokens for various providers.
 * Keeps client secrets server-side for security.
 *
 * Supported providers:
 * - google (Google Search Console, Analytics)
 * - bing (Bing Webmaster Tools)
 *
 * Request body:
 * {
 *   provider: 'google' | 'bing',
 *   refreshToken: string,
 *   forceRotation?: boolean
 * }
 *
 * Response:
 * {
 *   accessToken: string,
 *   refreshToken?: string (if rotated),
 *   expiresIn: number
 * }
 */

interface ProviderConfig {
  tokenEndpoint: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  additionalParams?: Record<string, string>;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  google: {
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
  },
  bing: {
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientIdEnv: 'BING_CLIENT_ID',
    clientSecretEnv: 'BING_CLIENT_SECRET',
  },
  yandex: {
    tokenEndpoint: 'https://oauth.yandex.com/token',
    clientIdEnv: 'YANDEX_CLIENT_ID',
    clientSecretEnv: 'YANDEX_CLIENT_SECRET',
  },
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate request
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { provider, refreshToken, forceRotation = false } = await req.json();

    // Validate provider
    const providerConfig = PROVIDERS[provider];
    if (!providerConfig) {
      return new Response(
        JSON.stringify({ error: `Unknown provider: ${provider}` }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get credentials from environment
    const clientId = Deno.env.get(providerConfig.clientIdEnv);
    const clientSecret = Deno.env.get(providerConfig.clientSecretEnv);

    if (!clientId || !clientSecret) {
      console.error(`Missing credentials for provider: ${provider}`);
      return new Response(
        JSON.stringify({ error: 'Provider not configured' }),
        { status: 500, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build refresh request
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      ...(providerConfig.additionalParams || {}),
    });

    console.log(`Refreshing ${provider} token for user: ${user.id}`);

    // Request new tokens
    const response = await fetch(providerConfig.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Token refresh failed for ${provider}:`, response.status, errorText);

      // Log security event
      await logSecurityEvent(supabaseClient, user.id, 'TOKEN_REFRESH_FAILED', {
        provider,
        statusCode: response.status,
        error: errorText.substring(0, 200), // Truncate for safety
      });

      // Check if refresh token is invalid (requires re-auth)
      if (response.status === 400 || response.status === 401) {
        return new Response(
          JSON.stringify({
            error: 'Invalid refresh token',
            requiresReauth: true,
          }),
          { status: 401, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Token refresh failed' }),
        { status: 500, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData = await response.json();

    // Log successful refresh
    await logSecurityEvent(supabaseClient, user.id, tokenData.refresh_token ? 'TOKEN_ROTATED' : 'TOKEN_REFRESHED', {
      provider,
      expiresIn: tokenData.expires_in,
      hasNewRefreshToken: !!tokenData.refresh_token,
    });

    console.log(`Token refreshed successfully for ${provider}`);

    return new Response(
      JSON.stringify({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token, // Will be undefined if not rotated
        expiresIn: tokenData.expires_in || 3600,
        tokenType: tokenData.token_type || 'Bearer',
        scope: tokenData.scope,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          ...securityHeaders,
          ...noCacheHeaders(),
          'Content-Type': 'application/json',
        }
      }
    );
  } catch (error) {
    console.error('Token refresh error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Log security audit event
 */
async function logSecurityEvent(
  supabase: any,
  userId: string,
  eventType: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('security_audit_logs').insert({
      user_id: userId,
      event_type: `oauth:${eventType}`,
      event_category: 'oauth',
      severity: eventType.includes('FAILED') ? 'high' : 'low',
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
      },
      success: !eventType.includes('FAILED'),
    });
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}
