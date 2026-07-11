/**
 * Provider webhook HMAC signature verification (US-520).
 *
 * Inbound provider webhooks (GitHub, Sentry) sign the RAW request body with a
 * shared secret. Verifying that HMAC — instead of a plaintext shared-secret
 * header — means a leaked header value cannot be replayed/forged and an
 * attacker cannot inject an arbitrary payload (which then feeds agent
 * prompts/actions).
 *
 * All comparisons are constant-time. Verifiers take the raw body string, so the
 * caller must read `await req.text()` BEFORE `JSON.parse` (a re-serialized body
 * would not match the provider's signature byte-for-byte).
 */

/** Lower-case hex HMAC-SHA256 of `body` under `secret`. */
export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time string comparison (returns false on any length mismatch). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a GitHub `X-Hub-Signature-256` header (format: `sha256=<hex>`) over the
 * raw request body. Returns false for a missing/mis-formatted header, an empty
 * secret, or a mismatch.
 */
export async function verifyGithubSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined | null,
): Promise<boolean> {
  if (!secret) return false;
  if (!header || !header.startsWith('sha256=')) return false;
  const provided = header.slice('sha256='.length).toLowerCase();
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(provided, expected);
}

/**
 * Verify a Sentry `Sentry-Hook-Signature` header (hex HMAC-SHA256 over the raw
 * body). Optionally enforce a timestamp tolerance when the provider sends a
 * `Sentry-Hook-Timestamp` (unix seconds) — replay protection.
 */
export async function verifySentrySignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined | null,
  opts: { timestamp?: string | null; nowSeconds?: number; toleranceSeconds?: number } = {},
): Promise<boolean> {
  if (!secret) return false;
  if (!header) return false;

  // Optional replay window when a timestamp is supplied.
  if (opts.timestamp) {
    const ts = Number(opts.timestamp);
    const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
    const tolerance = opts.toleranceSeconds ?? 300;
    if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) return false;
  }

  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(header.toLowerCase(), expected);
}
