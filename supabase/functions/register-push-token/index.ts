import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getCorsHeaders, securityHeaders, noCacheHeaders } from "../common/headers.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { token, platform, deviceName, deviceId } = await req.json();

    if (!token || !platform) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: token, platform' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate platform
    const validPlatforms = ['expo', 'ios', 'android', 'web'];
    if (!validPlatforms.includes(platform)) {
      return new Response(
        JSON.stringify({ error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token already exists
    const { data: existingToken, error: checkError } = await supabaseClient
      .from('push_tokens')
      .select('*')
      .eq('token', token)
      .single();

    if (existingToken) {
      // Update existing token
      const { data: updatedToken, error: updateError } = await supabaseClient
        .from('push_tokens')
        .update({
          is_active: true,
          last_used_at: new Date().toISOString(),
          device_name: deviceName,
          device_id: deviceId,
          failed_attempts: 0,
          last_error: null,
        })
        .eq('id', existingToken.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      return new Response(
        JSON.stringify({
          message: 'Push token updated',
          token: updatedToken
        }),
        { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create new token
    const { data: newToken, error: insertError } = await supabaseClient
      .from('push_tokens')
      .insert({
        user_id: user.id,
        token,
        platform,
        device_name: deviceName,
        device_id: deviceId,
        is_active: true,
        last_used_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return new Response(
      JSON.stringify({
        message: 'Push token registered successfully',
        token: newToken
      }),
      { status: 201, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in register-push-token:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
