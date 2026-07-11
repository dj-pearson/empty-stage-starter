/**
 * URL Validation Utility
 *
 * Validates URLs to prevent SSRF (Server-Side Request Forgery) attacks.
 * Blocks private IP ranges, cloud metadata endpoints, and non-HTTP protocols.
 * Includes DNS rebinding protection and fetch timeout helpers.
 */

/** Default fetch timeout in milliseconds for external requests */
export const FETCH_TIMEOUT_MS = 10_000;

/**
 * Patterns that match private, loopback, and link-local IP addresses/hostnames.
 */
const PRIVATE_PATTERNS = [
  /^127\./,                      // Loopback (127.0.0.0/8)
  /^10\./,                       // Private Class A (10.0.0.0/8)
  /^172\.(1[6-9]|2\d|3[01])\./,  // Private Class B (172.16.0.0/12)
  /^192\.168\./,                 // Private Class C (192.168.0.0/16)
  /^169\.254\./,                 // Link-local / cloud metadata (169.254.0.0/16)
  /^0\./,                        // Current network (0.0.0.0/8)
  /^0\.0\.0\.0$/,                // Explicit zero address
  /^localhost$/i,                // Localhost hostname
  /^::1$/,                       // IPv6 loopback
  /^\[::1\]$/,                   // Bracketed IPv6 loopback
  /^fd[0-9a-f]{2}:/i,           // IPv6 unique local (fd00::/8)
  /^fe80:/i,                     // IPv6 link-local (fe80::/10)
  /^0x7f/i,                      // Hex-encoded 127.x (0x7f000001)
  /^2130706/,                    // Decimal-encoded 127.0.0.1 = 2130706433
];

/**
 * Check if an IP address string belongs to a private/reserved range.
 */
function isPrivateIP(ip: string): boolean {
  return PRIVATE_PATTERNS.some((p) => p.test(ip));
}

/**
 * Validate a URL for safe server-side fetching (SSRF prevention).
 *
 * Checks protocol, hostname patterns, and cloud metadata endpoints.
 * Does NOT perform DNS resolution (use `validateExternalUrl` for that).
 */
export function validateUrl(urlString: string): { valid: boolean; error?: string } {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Only allow HTTP/HTTPS
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
  }

  const hostname = url.hostname;

  // Block private IP ranges and internal hostnames
  if (isPrivateIP(hostname)) {
    return { valid: false, error: 'Access to private/internal networks is not allowed' };
  }

  // Block cloud metadata endpoints explicitly
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    return { valid: false, error: 'Access to cloud metadata endpoints is not allowed' };
  }

  return { valid: true };
}

/**
 * Enhanced URL validation with DNS rebinding protection.
 *
 * Resolves the hostname to an IP address and verifies the resolved IP
 * is not in a private range. This prevents DNS rebinding attacks where
 * a hostname initially resolves to a public IP then changes to a private one.
 *
 * Falls back to basic `validateUrl` if DNS resolution is not available.
 */
export async function validateExternalUrl(
  urlString: string
): Promise<{ valid: boolean; error?: string }> {
  // First run basic validation
  const basic = validateUrl(urlString);
  if (!basic.valid) return basic;

  // DNS rebinding protection: resolve hostname and check resulting IP
  try {
    const url = new URL(urlString);
    const hostname = url.hostname;

    // Skip DNS resolution for IP addresses (already checked above)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return { valid: true };
    }

    // Attempt DNS resolution via Deno.resolveDns if available
    if (typeof Deno !== 'undefined' && Deno.resolveDns) {
      try {
        const ips = await Deno.resolveDns(hostname, 'A');
        for (const ip of ips) {
          if (isPrivateIP(ip)) {
            return {
              valid: false,
              error: 'DNS resolves to private/internal network address',
            };
          }
        }
      } catch {
        // DNS resolution failed — allow the request but log
        console.warn(`DNS resolution failed for ${hostname}, proceeding with basic validation`);
      }
    }
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  return { valid: true };
}

/**
 * Create a fetch request with a timeout to prevent slow-loris style SSRF.
 *
 * @param url - URL to fetch
 * @param init - Standard fetch init options
 * @param timeoutMs - Timeout in ms (default: FETCH_TIMEOUT_MS = 10s)
 * @returns Response from the fetch
 * @throws AbortError if the request exceeds the timeout
 */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/** Default cap on the number of bytes read from an external response body (10 MB). */
export const MAX_EXTERNAL_BYTES = 10 * 1024 * 1024;

/** Default maximum number of redirect hops to follow (each re-validated). */
export const MAX_REDIRECTS = 3;

/**
 * Fetch a user-supplied external URL with full SSRF protection.
 *
 * Unlike a plain `fetch`, this:
 *  - runs the DNS-resolving `validateExternalUrl` on the initial URL AND on
 *    every redirect hop (blocks redirect-to-metadata / DNS-rebinding attacks);
 *  - uses `redirect: 'manual'` so a `Location` is never followed before it has
 *    been re-validated;
 *  - bounds each hop with `fetchWithTimeout`.
 *
 * The returned `response` (when `valid`) is the final, already-followed
 * response. Callers MUST read its body with `readCappedBody` to enforce a size
 * limit — the size cap is deliberately not applied here so callers can choose
 * their own limit and decode as bytes or text.
 */
export async function safeFetch(
  urlString: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; maxRedirects?: number } = {}
): Promise<{ valid: boolean; error?: string; response?: Response }> {
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  let current = urlString;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await validateExternalUrl(current);
    if (!check.valid) return { valid: false, error: check.error };

    const res = await fetchWithTimeout(
      current,
      { ...init, redirect: 'manual' },
      opts.timeoutMs
    );

    // Manual redirect handling: re-validate the Location before following.
    if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
      const location = res.headers.get('location')!;
      // Release the connection before following.
      await res.body?.cancel().catch(() => {});
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        return { valid: false, error: 'Invalid redirect Location header' };
      }
      current = next;
      continue;
    }

    return { valid: true, response: res };
  }

  return { valid: false, error: 'Too many redirects' };
}

/**
 * Read a response body while enforcing a maximum byte cap.
 *
 * Rejects early on a declared `Content-Length` over the cap, and also streams
 * defensively so a server that lies about (or omits) `Content-Length` cannot
 * exhaust memory. Returns the raw bytes on success.
 */
export async function readCappedBody(
  response: Response,
  maxBytes: number = MAX_EXTERNAL_BYTES
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  const declared = response.headers.get('content-length');
  if (declared && Number(declared) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    return { ok: false, error: 'Response body exceeds maximum allowed size' };
  }

  if (!response.body) {
    const buf = new Uint8Array(await response.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      return { ok: false, error: 'Response body exceeds maximum allowed size' };
    }
    return { ok: true, bytes: buf };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, error: 'Response body exceeds maximum allowed size' };
      }
      chunks.push(value);
    }
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes: out };
}
