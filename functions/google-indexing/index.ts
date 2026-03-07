/**
 * Google Indexing API Edge Function
 *
 * Submits URLs to Google for indexing/removal using the Indexing API v3.
 * Requires GOOGLE_SERVICE_ACCOUNT_JSON environment variable containing the
 * service account JSON key file contents.
 *
 * Prerequisites:
 * 1. Enable the Indexing API in Google Cloud Console
 * 2. Create a service account with Indexing API permissions
 * 3. Add the service account email as an owner in Google Search Console
 * 4. Set GOOGLE_SERVICE_ACCOUNT_JSON env var with the JSON key file contents
 *
 * See: https://developers.google.com/search/apis/indexing-api/v3/prereqs
 *
 * POST /google-indexing
 *
 * Request body:
 * {
 *   "urls": ["https://tryeatpal.com/blog/my-post"],
 *   "type": "URL_UPDATED" | "URL_DELETED"
 * }
 *
 * Response:
 * {
 *   "results": [
 *     { "url": "https://...", "status": "success", "metadata": {...} },
 *     { "url": "https://...", "status": "error", "error": "..." }
 *   ]
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_INDEXING_API_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const TOKEN_EXPIRY_SECONDS = 3600;

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface IndexingRequest {
  urls: string[];
  type?: 'URL_UPDATED' | 'URL_DELETED';
}

interface IndexingResult {
  url: string;
  status: 'success' | 'error';
  metadata?: Record<string, unknown>;
  error?: string;
}

/**
 * Convert a PEM-encoded RSA private key to a CryptoKey for signing JWTs.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/**
 * Base64url encode a string or Uint8Array.
 */
function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Create a signed JWT for Google OAuth2 service account authentication.
 */
async function createSignedJwt(serviceAccount: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + TOKEN_EXPIRY_SECONDS,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );

  const encodedSignature = base64url(new Uint8Array(signature));
  return `${signingInput}.${encodedSignature}`;
}

/**
 * Exchange a signed JWT for a Google OAuth2 access token.
 */
async function getAccessToken(serviceAccount: ServiceAccountKey): Promise<string> {
  const jwt = await createSignedJwt(serviceAccount);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Submit a single URL to the Google Indexing API.
 */
async function submitUrl(
  url: string,
  type: string,
  accessToken: string
): Promise<IndexingResult> {
  try {
    const response = await fetch(GOOGLE_INDEXING_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ url, type }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        url,
        status: 'error',
        error: `Google API returned ${response.status}: ${errorText}`,
      };
    }

    const metadata = await response.json();
    return { url, status: 'success', metadata };
  } catch (err) {
    return {
      url,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight(req);
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // Authenticate the requesting user
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  // Parse the service account JSON from environment
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!serviceAccountJson) {
    return new Response(
      JSON.stringify({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  let serviceAccount: ServiceAccountKey;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error('Missing client_email or private_key');
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Invalid GOOGLE_SERVICE_ACCOUNT_JSON format' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // Parse the request body
  let body: IndexingRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  if (!body.urls || !Array.isArray(body.urls) || body.urls.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Request body must include a non-empty "urls" array' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // Validate URLs
  const MAX_URLS = 100;
  if (body.urls.length > MAX_URLS) {
    return new Response(
      JSON.stringify({ error: `Maximum ${MAX_URLS} URLs per request` }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  for (const url of body.urls) {
    try {
      new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ error: `Invalid URL: ${url}` }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }
  }

  const notificationType = body.type || 'URL_UPDATED';
  if (!['URL_UPDATED', 'URL_DELETED'].includes(notificationType)) {
    return new Response(
      JSON.stringify({ error: 'type must be "URL_UPDATED" or "URL_DELETED"' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // Get access token from service account
  let accessToken: string;
  try {
    accessToken = await getAccessToken(serviceAccount);
  } catch (err) {
    console.error('Failed to get Google access token:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to authenticate with Google. Check service account configuration.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  // Submit all URLs (Google Indexing API has a 200 req/day quota, process sequentially)
  const results: IndexingResult[] = [];
  for (const url of body.urls) {
    const result = await submitUrl(url, notificationType, accessToken);
    results.push(result);
  }

  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  return new Response(
    JSON.stringify({
      results,
      summary: {
        total: results.length,
        success: successCount,
        errors: errorCount,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    }
  );
});
