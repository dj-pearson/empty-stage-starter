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
import { AIServiceV2 } from '../_shared/ai-service-v2.ts';
import { requireAdmin } from '../_shared/require-admin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Was a hand-rolled copy of the admin gate that ran
    //   .eq('role', 'root_admin')
    // against user_roles.role, which is the app_role enum. Postgres rejects a
    // label the enum does not define (22P02), so rolesError was always set and
    // every caller got 403 "Unauthorized: root_admin role required" -- the same
    // answer a genuine non-admin gets. Use the shared gate, which compares in
    // JS and cannot hit that.
    const gate = await requireAdmin(req, ['root_admin']);
    if (!gate.ok) {
      return new Response(
        JSON.stringify({ error: gate.error ?? 'Unauthorized' }),
        {
          status: gate.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    const supabase = gate.admin!;

    // Parse request
    const { testType = 'full' } = await req.json().catch(() => ({}));

    // Initialize AI Service
    const aiService = new AIServiceV2();

    // Run test
    console.log(`[test-ai-configuration] Running ${testType} test for user ${gate.userId ?? gate.role}`);
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
};
