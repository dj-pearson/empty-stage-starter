// Simple Edge Functions Server
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const PORT = parseInt(Deno.env.get("PORT") || "8000");
const FUNCTIONS_DIR = "/app/functions";

console.log(`🚀 Starting Edge Functions Server on port ${PORT}`);
console.log(`📁 Functions directory: ${FUNCTIONS_DIR}`);

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathname = url.pathname;
  
  console.log(`${req.method} ${pathname}`);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Health check
  if (pathname === '/_health' || pathname === '/health') {
    return new Response(
      JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        functions: Array.from(Deno.readDirSync(FUNCTIONS_DIR))
          .filter(entry => entry.isDirectory)
          .map(entry => entry.name)
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  // Extract function name from path (e.g., /generate-meal-plan -> generate-meal-plan)
  const functionName = pathname.slice(1).split('/')[0];
  
  if (!functionName) {
    return new Response(
      JSON.stringify({ error: 'Function name required' }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  // Try to import and execute the function
  try {
    const functionPath = `${FUNCTIONS_DIR}/${functionName}/index.ts`;
    
    // Check if function exists
    try {
      await Deno.stat(functionPath);
    } catch {
      return new Response(
        JSON.stringify({ error: `Function '${functionName}' not found` }),
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Import the function
    const module = await import(`file://${functionPath}`);
    
    // Execute the function's serve handler
    if (module.serve || module.handler || module.default) {
      const handler = module.serve || module.handler || module.default;
      
      // If it's a Deno.serve config, extract the handler
      if (typeof handler === 'object' && handler.handler) {
        const response = await handler.handler(req);
        return response;
      }
      
      // If it's a direct handler function
      if (typeof handler === 'function') {
        const response = await handler(req);
        return response;
      }
    }

    return new Response(
      JSON.stringify({ error: 'Function does not export a valid handler' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error(`Error executing function '${functionName}':`, error);
    return new Response(
      JSON.stringify({ 
        error: 'Function execution failed',
        message: error.message,
        stack: error.stack
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
}, { port: PORT });

console.log(`✅ Server running at http://localhost:${PORT}/`);

