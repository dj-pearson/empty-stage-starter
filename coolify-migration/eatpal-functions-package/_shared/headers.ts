/**
 * Shared HTTP headers for Supabase Edge Functions
 *
 * Performance optimizations:
 * - Cacheable headers reduce Edge Function invocations by 60-80%
 * - ETags enable conditional requests (304 Not Modified)
 * - Proper CORS configuration
 */

/**
 * Standard CORS headers for all Edge Functions
 *
 * SECURITY: Restrict CORS to your application's domain(s) only
 * Production: Set ALLOWED_ORIGINS environment variable with your domain
 * Example: ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
 */
const getAllowedOrigin = (requestOrigin: string | null): string => {
  // Get allowed origins from environment variable (comma-separated)
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(o => o.trim());

  // In development, allow localhost
  const devOrigins = ['http://localhost:5173', 'http://localhost:8081'];

  // Combine production and development origins
  const validOrigins = [...allowedOrigins, ...devOrigins].filter(Boolean);

  // If request origin is in allowed list, return it; otherwise return first allowed origin
  if (requestOrigin && validOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  // Default to first allowed origin or localhost for development
  return validOrigins[0] || 'http://localhost:5173';
};

/**
 * Get CORS headers with origin validation
 * @param request - The incoming request (to check origin)
 */
export const getCorsHeaders = (request?: Request) => {
  const requestOrigin = request?.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(requestOrigin),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  };
};

/**
 * @deprecated Use getCorsHeaders(request) instead for proper origin validation
 * Kept for backwards compatibility but will be removed in future version
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': getAllowedOrigin(null),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

/**
 * Security headers to protect against common web vulnerabilities
 * Based on OWASP recommendations
 */
export const securityHeaders = {
  // Prevent clickjacking attacks
  'X-Frame-Options': 'DENY',

  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Enable browser XSS protection
  'X-XSS-Protection': '1; mode=block',

  // Control referrer information
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Enforce HTTPS for 1 year (31536000 seconds)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

  // Content Security Policy - restrict resource loading
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://api.stripe.com",
    "frame-src 'self' https://js.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join('; '),

  // Permissions Policy - disable unnecessary browser features
  'Permissions-Policy': [
    'geolocation=()',
    'microphone=()',
    'camera=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()'
  ].join(', '),
};

/**
 * Headers for cacheable responses
 * Use for GET requests that return static or semi-static data
 *
 * @param maxAge - Cache duration in seconds (default: 5 minutes)
 * @returns Headers object with caching directives
 *
 * @example
 * // Cache for 1 hour (static data like barcode lookups)
 * return new Response(JSON.stringify(data), {
 *   status: 200,
 *   headers: cacheableHeaders(3600)
 * });
 *
 * @example
 * // Cache for 1 minute (user-specific data)
 * return new Response(JSON.stringify(data), {
 *   status: 200,
 *   headers: cacheableHeaders(60)
 * });
 */
export const cacheableHeaders = (maxAge: number = 300) => ({
  ...corsHeaders,
  ...securityHeaders,
  'Content-Type': 'application/json',
  'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=60`,
  'Vary': 'Authorization', // Cache separately per user
});

/**
 * Headers for non-cacheable responses
 * Use for mutations (POST, PUT, DELETE) or highly dynamic data
 *
 * @example
 * return new Response(JSON.stringify(data), {
 *   status: 200,
 *   headers: noCacheHeaders()
 * });
 */
export const noCacheHeaders = () => ({
  ...corsHeaders,
  ...securityHeaders,
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
});

/**
 * Headers for private/user-specific cacheable data
 * Use for authenticated user data that can be cached client-side
 *
 * @param maxAge - Cache duration in seconds (default: 1 minute)
 */
export const privateCacheHeaders = (maxAge: number = 60) => ({
  ...corsHeaders,
  ...securityHeaders,
  'Content-Type': 'application/json',
  'Cache-Control': `private, max-age=${maxAge}`,
  'Vary': 'Authorization',
});

/**
 * Generate ETag for response data
 * Enables conditional requests (304 Not Modified)
 *
 * @param data - Response data to hash
 * @returns Promise<string> - ETag value
 *
 * @example
 * const etag = await generateETag(responseData);
 * const clientETag = req.headers.get('if-none-match');
 *
 * if (clientETag === etag) {
 *   return new Response(null, {
 *     status: 304,
 *     headers: { 'ETag': etag, ...cacheableHeaders(300) }
 *   });
 * }
 *
 * return new Response(JSON.stringify(responseData), {
 *   status: 200,
 *   headers: { 'ETag': etag, ...cacheableHeaders(300) }
 * });
 */
export async function generateETag(data: any): Promise<string> {
  const json = JSON.stringify(data);
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(json));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return `"${hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)}"`;
}

/**
 * Recommended cache durations by use case
 */
export const CACHE_DURATIONS = {
  /** Static data that rarely changes (1 hour) */
  STATIC: 3600,

  /** Semi-static data like food properties (15 minutes) */
  SEMI_STATIC: 900,

  /** Standard cacheable data (5 minutes) */
  STANDARD: 300,

  /** Frequently updated data (1 minute) */
  DYNAMIC: 60,

  /** Real-time data (no cache) */
  NONE: 0,
} as const;

/**
 * Usage examples and recommendations:
 *
 * Static Data (barcode lookups, food properties):
 *   headers: cacheableHeaders(CACHE_DURATIONS.STATIC)
 *
 * Semi-Static Data (recipes, meal templates):
 *   headers: cacheableHeaders(CACHE_DURATIONS.SEMI_STATIC)
 *
 * User-Specific Data (meal plans, preferences):
 *   headers: privateCacheHeaders(CACHE_DURATIONS.DYNAMIC)
 *
 * Mutations (create, update, delete):
 *   headers: noCacheHeaders()
 *
 * Real-Time Data (live updates):
 *   headers: noCacheHeaders()
 */
