/**
 * SSRF guards for user-supplied URLs (US-710).
 *
 * The recipe importers fetch whatever URL a signed-in user pastes. Without a
 * guard that is a read primitive against anything the function container can
 * reach: the cloud metadata service at 169.254.169.254, Supabase's own internal
 * services, anything on 10./172.16./192.168., anything on loopback.
 *
 * `fetchRecipePage` is the only entry point callers need. It enforces, in
 * order: https-only, a host that does not resolve into a private range, at most
 * MAX_REDIRECTS hops with every hop re-validated before it is followed, a
 * per-hop timeout, and a byte cap on the body.
 *
 * Ported from the non-deployed `functions/_shared/url-validator.ts`, which
 * already had this and which the deployed tree never got. See
 * scripts/ci/check-function-trees.sh for why there are two trees.
 */

/** Per-hop fetch timeout. */
export const FETCH_TIMEOUT_MS = 10_000;

/** Maximum redirect hops. Each one is re-validated before it is followed. */
export const MAX_REDIRECTS = 3;

/** Byte cap on a fetched recipe page. Over this the caller returns 413. */
export const RECIPE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Private, loopback, link-local and obfuscated-loopback hosts.
 *
 * The hex and decimal forms matter: `http://0x7f000001/` and
 * `http://2130706433/` both reach 127.0.0.1 and both survive a naive
 * "does it start with 127." check.
 */
const PRIVATE_PATTERNS = [
  /^127\./, // loopback 127.0.0.0/8
  /^10\./, // private 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // private 172.16.0.0/12
  /^192\.168\./, // private 192.168.0.0/16
  /^169\.254\./, // link-local, incl. the 169.254.169.254 metadata service
  /^0\./, // 0.0.0.0/8
  /^localhost$/i,
  /^::1$/,
  /^\[::1\]$/,
  /^fd[0-9a-f]{2}:/i, // IPv6 unique local fd00::/8
  /^fe80:/i, // IPv6 link-local fe80::/10
  /^0x7f/i, // hex-encoded 127.x
  /^2130706/, // decimal-encoded 127.0.0.1
];

/** Hostnames that name a metadata service directly rather than by IP. */
const METADATA_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.goog',
]);

export function isPrivateHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '');
  if (METADATA_HOSTS.has(host.toLowerCase())) return true;
  return PRIVATE_PATTERNS.some((p) => p.test(host)) || PRIVATE_PATTERNS.some((p) => p.test(bare));
}

export interface UrlCheck {
  valid: boolean;
  error?: string;
}

/**
 * Static checks on a URL: scheme and the literal host.
 *
 * `httpsOnly` is on for recipe fetching. Plain http to a public host is not
 * itself an SSRF, but it is never needed to import a recipe and it is one more
 * way to reach a service that only listens on 80.
 */
export function validateUrl(urlString: string, httpsOnly = true): UrlCheck {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  const allowed = httpsOnly ? ['https:'] : ['http:', 'https:'];
  if (!allowed.includes(url.protocol)) {
    return {
      valid: false,
      error: httpsOnly ? 'Only https URLs are allowed' : 'Only http and https URLs are allowed',
    };
  }

  if (url.username || url.password) {
    return { valid: false, error: 'Credentials in the URL are not allowed' };
  }

  if (isPrivateHost(url.hostname)) {
    return { valid: false, error: 'Access to private or internal addresses is not allowed' };
  }

  return { valid: true };
}

/**
 * Static checks plus DNS resolution, so a public hostname that resolves into a
 * private range is rejected too.
 *
 * A resolution failure is not treated as a rejection: the fetch that follows
 * will fail on its own, and failing closed here would break importing from any
 * host this container cannot resolve at check time.
 */
export async function validateExternalUrl(urlString: string, httpsOnly = true): Promise<UrlCheck> {
  const basic = validateUrl(urlString, httpsOnly);
  if (!basic.valid) return basic;

  const hostname = new URL(urlString).hostname;

  // Already an IP literal: validateUrl checked it.
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || hostname.includes(':')) {
    return { valid: true };
  }

  const resolver = (globalThis as { Deno?: { resolveDns?: typeof Deno.resolveDns } }).Deno
    ?.resolveDns;
  if (!resolver) return { valid: true };

  for (const kind of ['A', 'AAAA'] as const) {
    try {
      const ips = await resolver(hostname, kind);
      for (const ip of ips) {
        if (isPrivateHost(ip)) {
          return { valid: false, error: 'Host resolves to a private or internal address' };
        }
      }
    } catch {
      // NXDOMAIN for AAAA is normal; a real failure surfaces on the fetch.
    }
  }

  return { valid: true };
}

/** Browser-ish headers. Several recipe sites 403 an obvious bot. */
export const RECIPE_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

/**
 * Read a body with a hard byte cap.
 *
 * Checks the declared Content-Length first, then streams anyway: a server that
 * omits or lies about the header must not be able to exhaust memory.
 */
export async function readCappedBody(
  response: Response,
  maxBytes: number = RECIPE_MAX_BYTES
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  const tooBig = { ok: false as const, error: 'Response body exceeds the maximum allowed size' };

  const declared = response.headers.get('content-length');
  if (declared && Number(declared) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    return tooBig;
  }

  if (!response.body) {
    const buf = new Uint8Array(await response.arrayBuffer());
    return buf.byteLength > maxBytes ? tooBig : { ok: true, bytes: buf };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return tooBig;
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes: out };
}

export type RecipePageResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; status: number; error: string };

export interface FetchRecipePageOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Fetch a user-supplied recipe page under every guard at once.
 *
 * Redirects use `redirect: 'manual'` so a Location is re-validated before it is
 * followed; `redirect: 'follow'` would let a public host bounce the request to
 * 169.254.169.254 with nothing to stop it.
 *
 * The `status` on a failure is what the calling function should return: 400 for
 * a URL we refuse, 413 for an oversized body, 502 for an upstream failure.
 */
export async function fetchRecipePage(
  urlString: string,
  opts: FetchRecipePageOptions = {}
): Promise<RecipePageResult> {
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const maxBytes = opts.maxBytes ?? RECIPE_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const doFetch = opts.fetchImpl ?? fetch;

  let current = urlString;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await validateExternalUrl(current);
    if (!check.valid) {
      return { ok: false, status: 400, error: check.error ?? 'URL rejected' };
    }

    let response: Response;
    try {
      response = await doFetch(current, {
        headers: RECIPE_FETCH_HEADERS,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      return {
        ok: false,
        status: timedOut ? 504 : 502,
        error: timedOut ? 'Timed out fetching the recipe page' : `Failed to fetch the URL: ${message}`,
      };
    }

    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
      await response.body?.cancel().catch(() => {});
      let next: string;
      try {
        next = new URL(response.headers.get('location')!, current).toString();
      } catch {
        return { ok: false, status: 400, error: 'Invalid redirect Location header' };
      }
      current = next;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return {
        ok: false,
        status: 502,
        error: `Failed to fetch the URL (HTTP ${response.status})`,
      };
    }

    const body = await readCappedBody(response, maxBytes);
    if (!body.ok) {
      return { ok: false, status: 413, error: body.error };
    }

    return {
      ok: true,
      html: new TextDecoder().decode(body.bytes),
      finalUrl: current,
    };
  }

  return { ok: false, status: 400, error: 'Too many redirects' };
}
