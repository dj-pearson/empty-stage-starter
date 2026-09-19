// Edge Functions Server for Self-Hosted Supabase
// This server hosts all your Supabase Edge Functions

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// Read once at startup, for the boot log and the readiness warning below.
// US-623: these are NOT re-set into the environment per request any more — the
// handlers read Deno.env directly, and writing process-global state on every
// request was pointless and racy.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Routing table, derived from the tree at boot (US-774).
//
// This used to be a hand-written literal, and it had drifted: ten functions
// that ship in supabase/functions/ were missing from it, so the server
// answered 404 for delete-account, bind-email-request, bind-email-verify,
// tonight-mode, parse-receipt-image, recognize-fridge-contents,
// identify-product, generate-image, schedule-trial-reminders and
// app-store-notifications. Nine of those ten have live callers in src/ and in
// the shipped Swift app, and the tenth is the App Store Server Notifications V2
// endpoint Apple posts to on this same host. Adding a function meant remembering
// to add a second line in a second file, and nothing failed when you didn't.
//
// A directory holding an index.ts is a function, unless its name starts with an
// underscore. That prefix marks the internals: _shared/ holds helper modules,
// and _health/ is a handler that reports which env vars are configured -- the
// server answers /health and /_health itself, and US-623 cut that response back
// to {status:"ok"} precisely so an unauthenticated probe learns nothing. Routing
// _health/ would have put that detail back at /functions/_health. common/ has no
// index.ts and drops out on the index.ts rule.
const FUNCTIONS_ROOT = new URL("./functions/", import.meta.url);

function discoverFunctions(root: URL): { [key: string]: string } {
  const map: { [key: string]: string } = {};
  for (const entry of Deno.readDirSync(root)) {
    if (!entry.isDirectory) continue;
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const handler = new URL(`${entry.name}/index.ts`, root);
    try {
      if (!Deno.statSync(handler).isFile) continue;
    } catch {
      continue;
    }
    map[entry.name] = handler.href;
  }
  return map;
}

const FUNCTIONS_MAP: { [key: string]: string } = discoverFunctions(FUNCTIONS_ROOT);

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check.
  // US-623: liveness only. This endpoint is unauthenticated, and previously
  // returned the full FUNCTIONS_MAP — handing anyone probing the host a
  // complete map of the callable surface.
  if (path === "/" || path === "/health" || path === "/_health") {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Extract function name from path (e.g., /functions/generate-article or /generate-article)
  const functionName = path.replace(/^\/functions\//, "").replace(/^\//, "").split("/")[0];

  if (!FUNCTIONS_MAP[functionName]) {
    // US-623: do not echo the routing table back to the caller.
    return new Response(JSON.stringify({ error: "Function not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // US-623: correlation id so an operator can tie a client-visible 500 back to
  // the stack trace in the container logs without shipping the trace itself.
  const requestId = crypto.randomUUID();

  try {
    // Dynamically import the function
    const functionPath = FUNCTIONS_MAP[functionName];
    const module = await import(functionPath);

    // Call the function's default export (handler)
    const response = await module.default(req);

    // US-623: fill in CORS only where the function did not set it. The previous
    // version overwrote unconditionally, which replaced the per-function origin
    // allowlist computed by common/headers.ts and _shared/cors.ts with "*" —
    // silently defeating it on every single response.
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      if (!headers.has(key)) headers.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error: unknown) {
    // Log the detail server-side; return only the correlation id.
    console.error(`[${requestId}] Error executing function ${functionName}:`, error);
    return new Response(JSON.stringify({
      error: "Function execution failed",
      requestId,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

console.log("🚀 Edge Functions Server starting on port 8000...");
console.log(`📦 Loaded ${Object.keys(FUNCTIONS_MAP).length} functions`);
if (Object.keys(FUNCTIONS_MAP).length === 0) {
  // Discovery found nothing, which means the tree is not where the server
  // expects it. Every route would 404 while the health check still said ok.
  console.error(`\u274C No functions found under ${FUNCTIONS_ROOT.href} - every route will 404.`);
}
console.log(`🔗 Supabase URL: ${SUPABASE_URL || "(not configured)"}`);

// Fail loudly at boot rather than per request. Every handler builds a Supabase
// client from these; missing values turn into confusing 401s deep inside a
// function instead of an obvious startup problem.
for (const [name, value] of [
  ["SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_ANON_KEY", SUPABASE_ANON_KEY],
  ["SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY],
] as const) {
  if (!value) console.error(`❌ ${name} is not set — functions depending on it will fail.`);
}

serve(handler, { port: 8000 });

