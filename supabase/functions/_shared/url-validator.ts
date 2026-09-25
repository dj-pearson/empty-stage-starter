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

// The static rules (scheme, credentials, private and metadata hosts) live in
// url-rules.ts, which names no Deno global, so the web-side vitest mirrors can
// import them without pulling this file into the browser type-check.
import { isPrivateHost, validateUrl, type UrlCheck } from './url-rules.ts';

export { isPrivateHost, validateUrl };
export type { UrlCheck };

/** Per-hop fetch timeout. */
export const FETCH_TIMEOUT_MS = 10_000;

/** Maximum redirect hops. Each one is re-validated before it is followed. */
export const MAX_REDIRECTS = 3;

/** Byte cap on a fetched recipe page. Over this the caller returns 413. */
export const RECIPE_MAX_BYTES = 2 * 1024 * 1024;

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

export type GuardedFetchResult =
  | { ok: true; bytes: Uint8Array; contentType: string; finalUrl: string }
  | { ok: false; status: number; error: string };

export interface FetchRecipePageOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface FetchGuardedOptions extends FetchRecipePageOptions {
  /** Request headers. Defaults to the browser-ish recipe set. */
  headers?: Record<string, string>;
}

/**
 * Fetch a caller-supplied URL under every guard at once, and return the bytes.
 *
 * Redirects use `redirect: 'manual'` so a Location is re-validated before it is
 * followed; `redirect: 'follow'` would let a public host bounce the request to
 * 169.254.169.254 with nothing to stop it.
 *
 * The `status` on a failure is what the calling function should return: 400 for
 * a URL we refuse, 413 for an oversized body, 502/504 for an upstream failure.
 *
 * US-773 lifted this out of fetchRecipePage, which decoded the body as text and
 * so could only serve the recipe importer. update-blog-image needs the same
 * guards for an image: it was fetching an arbitrary URL with a bare `fetch()`
 * and no size cap, while the copy of it in the tree that never deploys had both.
 */
export async function fetchGuardedResource(
  urlString: string,
  opts: FetchGuardedOptions = {}
): Promise<GuardedFetchResult> {
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const maxBytes = opts.maxBytes ?? RECIPE_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const headers = opts.headers ?? RECIPE_FETCH_HEADERS;
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
        headers,
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

    const contentType = response.headers.get('content-type') ?? '';
    const body = await readCappedBody(response, maxBytes);
    if (!body.ok) {
      return { ok: false, status: 413, error: body.error };
    }

    return { ok: true, bytes: body.bytes, contentType, finalUrl: current };
  }

  return { ok: false, status: 400, error: 'Too many redirects' };
}

/**
 * The recipe importer's view of the same fetch: HTML as text.
 */
export async function fetchRecipePage(
  urlString: string,
  opts: FetchRecipePageOptions = {}
): Promise<RecipePageResult> {
  const result = await fetchGuardedResource(urlString, opts);
  if (!result.ok) return result;
  return {
    ok: true,
    html: new TextDecoder().decode(result.bytes),
    finalUrl: result.finalUrl,
  };
}
