/**
 * Test AI Configuration Edge Function
 * 
 * Tests the centralized AI configuration from Coolify Team Shared Variables.
 * Verifies environment variables, API keys, and model connectivity.
 * 
 * Requires: root_admin role
 * 
 * Usage:
 * POST /test-ai-configuration
 * Body: { "testType": "full" | "config_only" }
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AIServiceV2 } from '../_shared/ai-service-v2.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Extract token
    const token = authHeader.replace('Bearer ', '');

    // Verify user is root_admin
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if user is root_admin
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'root_admin')
      .maybeSingle();

    if (rolesError || !roles) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: root_admin role required' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse request
    const { testType = 'full' } = await req.json().catch(() => ({}));

    // Initialize AI Service
    const aiService = new AIServiceV2();

    // Run test
    console.log(`[test-ai-configuration] Running ${testType} test for user ${user.id}`);
    const testResults = await aiService.testConfiguration();

    // Get environment configuration from database
    const { data: envConfig, error: envError } = await supabase
      .from('ai_environment_config')
      .select('*')
      .order('is_required', { ascending: false });

    if (envError) {
      console.error('[test-ai-configuration] Error fetching environment config:', envError);
    }

    // Build response
    const response = {
      success: testResults.success,
      timestamp: new Date().toISOString(),
      environment: {
        variables: envConfig || [],
        loadedConfig: testResults.config,
      },
      database: {
        connected: testResults.databaseConnection,
      },
      tests: testResults.testResults,
      errors: testResults.errors,
    };

    console.log(`[test-ai-configuration] Test completed:`, {
      success: response.success,
      errorCount: response.errors.length,
    });

    return new Response(
      JSON.stringify(response),
      { 
        status: response.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[test-ai-configuration] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.toString(),
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
