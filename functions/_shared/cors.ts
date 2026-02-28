const PRODUCTION_ORIGIN = 'https://tryeatpal.com';
const DEV_ORIGIN = 'http://localhost:8080';

function getAllowedOrigin(requestOrigin: string | null): string {
  const isDev = Deno.env.get('ENVIRONMENT') === 'development';
  if (isDev && requestOrigin === DEV_ORIGIN) return DEV_ORIGIN;
  if (requestOrigin === PRODUCTION_ORIGIN) return PRODUCTION_ORIGIN;
  return PRODUCTION_ORIGIN; // default
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(origin),
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, stripe-signature',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
}

export function handleCorsPreFlight(req: Request): Response {
  return new Response('ok', { headers: getCorsHeaders(req) });
}
