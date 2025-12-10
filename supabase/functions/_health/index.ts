// Health check endpoint for Edge Functions runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      runtime: 'deno',
      version: Deno.version.deno,
      environment: {
        supabaseUrlConfigured: !!Deno.env.get('SUPABASE_URL'),
        anonKeyConfigured: !!Deno.env.get('SUPABASE_ANON_KEY'),
        serviceRoleKeyConfigured: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      }
    }

    return new Response(
      JSON.stringify(health),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
        status: 200
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        status: 'unhealthy', 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      },
    )
  }
})

