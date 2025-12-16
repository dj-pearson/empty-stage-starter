// Edge Functions Server for Self-Hosted Supabase
// This server hosts all your Supabase Edge Functions

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Map of available functions
const FUNCTIONS_MAP: { [key: string]: string } = {
  "ai-meal-plan": "./functions/ai-meal-plan/index.ts",
  "analyze-blog-posts-seo": "./functions/analyze-blog-posts-seo/index.ts",
  "analyze-blog-quality": "./functions/analyze-blog-quality/index.ts",
  "analyze-content": "./functions/analyze-content/index.ts",
  "analyze-images": "./functions/analyze-images/index.ts",
  "analyze-internal-links": "./functions/analyze-internal-links/index.ts",
  "analyze-semantic-keywords": "./functions/analyze-semantic-keywords/index.ts",
  "analyze-support-ticket": "./functions/analyze-support-ticket/index.ts",
  "apply-seo-fixes": "./functions/apply-seo-fixes/index.ts",
  "backup-scheduler": "./functions/backup-scheduler/index.ts",
  "backup-user-data": "./functions/backup-user-data/index.ts",
  "bing-webmaster-oauth": "./functions/bing-webmaster-oauth/index.ts",
  "calculate-food-similarity": "./functions/calculate-food-similarity/index.ts",
  "check-broken-links": "./functions/check-broken-links/index.ts",
  "check-core-web-vitals": "./functions/check-core-web-vitals/index.ts",
  "check-keyword-positions": "./functions/check-keyword-positions/index.ts",
  "check-mobile-first": "./functions/check-mobile-first/index.ts",
  "check-security-headers": "./functions/check-security-headers/index.ts",
  "crawl-site": "./functions/crawl-site/index.ts",
  "create-checkout": "./functions/create-checkout/index.ts",
  "detect-duplicate-content": "./functions/detect-duplicate-content/index.ts",
  "detect-redirect-chains": "./functions/detect-redirect-chains/index.ts",
  "enrich-barcodes": "./functions/enrich-barcodes/index.ts",
  "ga4-oauth": "./functions/ga4-oauth/index.ts",
  "generate-blog-content": "./functions/generate-blog-content/index.ts",
  "generate-invoice": "./functions/generate-invoice/index.ts",
  "generate-meal-suggestions": "./functions/generate-meal-suggestions/index.ts",
  "generate-schema-markup": "./functions/generate-schema-markup/index.ts",
  "generate-sitemap": "./functions/generate-sitemap/index.ts",
  "generate-social-content": "./functions/generate-social-content/index.ts",
  "generate-weekly-report": "./functions/generate-weekly-report/index.ts",
  "gsc-fetch-core-web-vitals": "./functions/gsc-fetch-core-web-vitals/index.ts",
  "gsc-fetch-properties": "./functions/gsc-fetch-properties/index.ts",
  "gsc-oauth": "./functions/gsc-oauth/index.ts",
  "gsc-sync-data": "./functions/gsc-sync-data/index.ts",
  "identify-food-image": "./functions/identify-food-image/index.ts",
  "join-waitlist": "./functions/join-waitlist/index.ts",
  "list-users": "./functions/list-users/index.ts",
  "lookup-barcode": "./functions/lookup-barcode/index.ts",
  "manage-blog-titles": "./functions/manage-blog-titles/index.ts",
  "manage-meal-plan-templates": "./functions/manage-meal-plan-templates/index.ts",
  "manage-payment-methods": "./functions/manage-payment-methods/index.ts",
  "manage-subscription": "./functions/manage-subscription/index.ts",
  "monitor-performance-budget": "./functions/monitor-performance-budget/index.ts",
  "oauth-token-refresh": "./functions/oauth-token-refresh/index.ts",
  "optimize-page-content": "./functions/optimize-page-content/index.ts",
  "parse-recipe": "./functions/parse-recipe/index.ts",
  "parse-recipe-grocery": "./functions/parse-recipe-grocery/index.ts",
  "process-delivery-order": "./functions/process-delivery-order/index.ts",
  "process-email-sequences": "./functions/process-email-sequences/index.ts",
  "process-notification-queue": "./functions/process-notification-queue/index.ts",
  "publish-scheduled-posts": "./functions/publish-scheduled-posts/index.ts",
  "register-push-token": "./functions/register-push-token/index.ts",
  "repurpose-content": "./functions/repurpose-content/index.ts",
  "run-scheduled-audit": "./functions/run-scheduled-audit/index.ts",
  "schedule-meal-reminders": "./functions/schedule-meal-reminders/index.ts",
  "schedule-weekly-reports": "./functions/schedule-weekly-reports/index.ts",
  "send-auth-email": "./functions/send-auth-email/index.ts",
  "send-emails": "./functions/send-emails/index.ts",
  "send-seo-notification": "./functions/send-seo-notification/index.ts",
  "seo-audit": "./functions/seo-audit/index.ts",
  "stripe-webhook": "./functions/stripe-webhook/index.ts",
  "suggest-foods": "./functions/suggest-foods/index.ts",
  "suggest-recipe": "./functions/suggest-recipe/index.ts",
  "suggest-recipes-from-pantry": "./functions/suggest-recipes-from-pantry/index.ts",
  "sync-analytics-data": "./functions/sync-analytics-data/index.ts",
  "sync-backlinks": "./functions/sync-backlinks/index.ts",
  "test-ai-model": "./functions/test-ai-model/index.ts",
  "test-blog-webhook": "./functions/test-blog-webhook/index.ts",
  "track-engagement": "./functions/track-engagement/index.ts",
  "track-serp-positions": "./functions/track-serp-positions/index.ts",
  "update-blog-image": "./functions/update-blog-image/index.ts",
  "update-user": "./functions/update-user/index.ts",
  "user-intelligence": "./functions/user-intelligence/index.ts",
  "validate-structured-data": "./functions/validate-structured-data/index.ts",
  "weekly-summary-generator": "./functions/weekly-summary-generator/index.ts",
  "yandex-webmaster-oauth": "./functions/yandex-webmaster-oauth/index.ts",
};

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

  // Health check
  if (path === "/" || path === "/health" || path === "/_health") {
    return new Response(JSON.stringify({
      status: "ok",
      functions: Object.keys(FUNCTIONS_MAP).length,
      available: Object.keys(FUNCTIONS_MAP)
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Extract function name from path (e.g., /functions/generate-article or /generate-article)
  const functionName = path.replace(/^\/functions\//, "").replace(/^\//, "").split("/")[0];

  if (!FUNCTIONS_MAP[functionName]) {
    return new Response(JSON.stringify({
      error: "Function not found",
      requested: functionName,
      available: Object.keys(FUNCTIONS_MAP)
    }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Dynamically import the function
    const functionPath = FUNCTIONS_MAP[functionName];
    const module = await import(functionPath);

    // Set environment variables for the function
    Deno.env.set("SUPABASE_URL", SUPABASE_URL);
    Deno.env.set("SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);

    // Call the function's default export (handler)
    const response = await module.default(req);

    // Add CORS headers to response
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error(`Error executing function ${functionName}:`, error);
    return new Response(JSON.stringify({
      error: "Function execution failed",
      function: functionName,
      message: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

console.log("🚀 Edge Functions Server starting on port 8000...");
console.log(`📦 Loaded ${Object.keys(FUNCTIONS_MAP).length} functions`);
console.log(`🔗 Supabase URL: ${SUPABASE_URL}`);

serve(handler, { port: 8000 });

