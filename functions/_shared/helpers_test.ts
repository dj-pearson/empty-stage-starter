/**
 * Unit tests for the shared edge-function security helpers
 * (US-324 / US-325 / US-326 / US-327).
 *
 * Run with: `deno test functions/_shared/helpers_test.ts`
 *
 * These cover the deterministic logic (size/text caps, price allowlist) plus
 * the membership/admin/rate-limit decisions against a tiny mock Supabase
 * client, so a cross-household id returns 403, a non-admin returns 403, and an
 * over-limit user returns 429 — without needing a live database.
 */

import {
  assertEquals,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { base64DecodedBytes, validateImageSize, capText, MAX_IMAGE_BYTES } from './validation.ts';
import { resolvePriceId, getAllowedPriceIds } from './stripe-prices.ts';
import { isHouseholdMember, assertHouseholdMember } from './household.ts';
import { isAdmin, assertAdmin } from './admin.ts';
import { enforceRateLimit } from './rate-limit.ts';
import {
  validateExternalUrl,
  safeFetch,
  readCappedBody,
} from './url-validator.ts';
import {
  ownedHosts,
  isOwnedUrl,
  DEFAULT_OWNED_HOSTS,
} from './indexing-allowlist.ts';
import {
  resolveCsatTokenSecret,
  signCsatToken,
  verifyCsatToken,
} from './csat-logic.ts';
import {
  hmacSha256Hex,
  verifyGithubSignature,
  verifySentrySignature,
} from './webhook-signatures.ts';
import {
  isFreshStripeEvent,
  isDuplicateInsertError,
} from './stripe-webhook-logic.ts';
import {
  parseRepoAllowlist,
  isAllowedRepo,
  isValidEmailRecipient,
} from './outward-payload-validation.ts';

const CORS = { 'Access-Control-Allow-Origin': 'https://tryeatpal.com' };

// ---------------------------------------------------------------------------
// validation.ts
// ---------------------------------------------------------------------------

Deno.test('base64DecodedBytes computes decoded length (with/without data URL)', () => {
  // "hello" -> "aGVsbG8=" (5 bytes)
  assertEquals(base64DecodedBytes('aGVsbG8='), 5);
  assertEquals(base64DecodedBytes('data:image/png;base64,aGVsbG8='), 5);
  assertEquals(base64DecodedBytes(''), 0);
});

Deno.test('validateImageSize accepts small images and rejects oversize (413)', () => {
  assertEquals(validateImageSize('aGVsbG8=', CORS), null);

  // Build a base64 string whose decoded size exceeds the cap.
  const oversizeChars = Math.ceil(((MAX_IMAGE_BYTES + 1024) * 4) / 3);
  const big = 'A'.repeat(oversizeChars);
  const res = validateImageSize(big, CORS);
  assert(res !== null);
  assertEquals(res!.status, 413);
});

Deno.test('capText truncates to the max length', () => {
  assertEquals(capText('abc', 10), 'abc');
  assertEquals(capText('abcdef', 3), 'abc');
  assertEquals(capText(null), '');
});

// ---------------------------------------------------------------------------
// stripe-prices.ts
// ---------------------------------------------------------------------------

function envFrom(map: Record<string, string>) {
  return { get: (k: string) => map[k] };
}

Deno.test('resolvePriceId rejects unknown price_id and accepts allowlisted', () => {
  const env = envFrom({ STRIPE_PRICE_IDS: 'price_known1, price_known2' });
  assertEquals(resolvePriceId(env, { price_id: 'price_attacker' }), null);
  assertEquals(resolvePriceId(env, { price_id: 'price_known2' }), 'price_known2');
});

Deno.test('resolvePriceId resolves a plan key via STRIPE_PRICE_MAP', () => {
  const env = envFrom({ STRIPE_PRICE_MAP: '{"monthly":"price_m","yearly":"price_y"}' });
  assertEquals(resolvePriceId(env, { plan: 'monthly' }), 'price_m');
  assertEquals(resolvePriceId(env, { plan: 'nope' }), null);
  // price_id from the map's values is also allowlisted
  assertEquals(resolvePriceId(env, { price_id: 'price_y' }), 'price_y');
  assert(getAllowedPriceIds(env).has('price_m'));
});

// ---------------------------------------------------------------------------
// household.ts — mock client
// ---------------------------------------------------------------------------

/** Minimal chainable mock for supabase.from(...).select().eq().eq().maybeSingle() */
function mockClient(opts: {
  member?: boolean;
  admin?: boolean;
  rate?: { allowed: boolean; reset_at?: string } | 'error';
}) {
  return {
    from(_table: string) {
      const isAdminQuery = _table === 'user_roles';
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () =>
          Promise.resolve({
            data: isAdminQuery ? (opts.admin ? { role: 'admin' } : null) : (opts.member ? { user_id: 'u' } : null),
            error: null,
          }),
      };
      return builder;
    },
    rpc(_fn: string, _args: unknown) {
      if (opts.rate === 'error') return Promise.resolve({ data: null, error: new Error('boom') });
      return Promise.resolve({
        data: [{
          allowed: opts.rate?.allowed ?? true,
          current_count: 1,
          max_requests: 10,
          reset_at: opts.rate?.reset_at ?? new Date(Date.now() + 60000).toISOString(),
          tier: 'free',
        }],
        error: null,
      });
    },
  };
}

Deno.test('isHouseholdMember true/false', async () => {
  assertEquals(await isHouseholdMember(mockClient({ member: true }), 'u', 'h'), true);
  assertEquals(await isHouseholdMember(mockClient({ member: false }), 'u', 'h'), false);
});

Deno.test('assertHouseholdMember: 403 for non-member, null for member, null when no household', async () => {
  const forbidden = await assertHouseholdMember(mockClient({ member: false }), 'u', 'h', CORS);
  assertEquals(forbidden?.status, 403);
  assertEquals(await assertHouseholdMember(mockClient({ member: true }), 'u', 'h', CORS), null);
  assertEquals(await assertHouseholdMember(mockClient({ member: false }), 'u', null, CORS), null);
});

// ---------------------------------------------------------------------------
// admin.ts
// ---------------------------------------------------------------------------

Deno.test('assertAdmin: 403 for non-admin, null for admin', async () => {
  const res = await assertAdmin(mockClient({ admin: false }), 'u', CORS);
  assertEquals(res?.status, 403);
  assertEquals(await assertAdmin(mockClient({ admin: true }), 'u', CORS), null);
  assertEquals(await isAdmin(mockClient({ admin: true }), 'u'), true);
});

// ---------------------------------------------------------------------------
// rate-limit.ts
// ---------------------------------------------------------------------------

Deno.test('enforceRateLimit: null when allowed, 429 when exceeded', async () => {
  assertEquals(await enforceRateLimit(mockClient({ rate: { allowed: true } }), 'u', 'ep', CORS), null);
  const res = await enforceRateLimit(mockClient({ rate: { allowed: false } }), 'u', 'ep', CORS);
  assertEquals(res?.status, 429);
  assert(res!.headers.get('Retry-After') !== null);
});

Deno.test('enforceRateLimit fails closed (429) when the RPC errors', async () => {
  const res = await enforceRateLimit(mockClient({ rate: 'error' }), 'u', 'ep', CORS);
  assertEquals(res?.status, 429);
});

// ---------------------------------------------------------------------------
// url-validator.ts — SSRF hardening (US-516 / US-517)
// ---------------------------------------------------------------------------

Deno.test('validateExternalUrl rejects a hostname whose A-record resolves to a private range', async () => {
  const original = Deno.resolveDns;
  // Stub DNS so a "public looking" hostname resolves to a private IP
  // (the DNS-rebinding attack the validator must block).
  // deno-lint-ignore no-explicit-any
  (Deno as any).resolveDns = (_host: string, _type: string) =>
    Promise.resolve(['10.0.0.5']);
  try {
    const res = await validateExternalUrl('https://evil.example.com/path');
    assertEquals(res.valid, false);
    assert(/private/i.test(res.error ?? ''));
  } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).resolveDns = original;
  }
});

Deno.test('validateExternalUrl allows a hostname resolving to a public IP', async () => {
  const original = Deno.resolveDns;
  // deno-lint-ignore no-explicit-any
  (Deno as any).resolveDns = (_host: string, _type: string) =>
    Promise.resolve(['93.184.216.34']);
  try {
    const res = await validateExternalUrl('https://example.com/');
    assertEquals(res.valid, true);
  } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).resolveDns = original;
  }
});

Deno.test('safeFetch re-validates a redirect Location and blocks a redirect to a private address', async () => {
  const originalFetch = globalThis.fetch;
  const originalDns = Deno.resolveDns;
  // Public on first resolve so the initial URL passes; the redirect target is
  // a literal private IP which validateUrl rejects without needing DNS.
  // deno-lint-ignore no-explicit-any
  (Deno as any).resolveDns = () => Promise.resolve(['93.184.216.34']);
  // deno-lint-ignore no-explicit-any
  (globalThis as any).fetch = () =>
    Promise.resolve(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      }),
    );
  try {
    const res = await safeFetch('https://example.com/start');
    assertEquals(res.valid, false);
    assert((res.error ?? '').length > 0);
  } finally {
    globalThis.fetch = originalFetch;
    // deno-lint-ignore no-explicit-any
    (Deno as any).resolveDns = originalDns;
  }
});

Deno.test('readCappedBody rejects a body over the cap (streamed) and accepts one under it', async () => {
  const big = new Response(new Uint8Array(50));
  const over = await readCappedBody(big, 10);
  assertEquals(over.ok, false);

  const small = new Response(new Uint8Array(5));
  const under = await readCappedBody(small, 10);
  assertEquals(under.ok, true);
  if (under.ok) assertEquals(under.bytes.byteLength, 5);
});

Deno.test('readCappedBody rejects early on an oversized Content-Length header', async () => {
  const res = new Response('x', { headers: { 'content-length': '999999999' } });
  const out = await readCappedBody(res, 1024);
  assertEquals(out.ok, false);
});

// ---------------------------------------------------------------------------
// indexing-allowlist.ts — google-indexing owned-host gate (US-518)
// ---------------------------------------------------------------------------

Deno.test('ownedHosts parses env override and falls back to defaults', () => {
  assertEquals(ownedHosts(undefined), DEFAULT_OWNED_HOSTS);
  assertEquals(ownedHosts(''), DEFAULT_OWNED_HOSTS);
  assertEquals(ownedHosts('  '), DEFAULT_OWNED_HOSTS);
  assertEquals(ownedHosts('a.com, b.com ,C.COM'), ['a.com', 'b.com', 'c.com']);
});

Deno.test('isOwnedUrl accepts owned https hosts and rejects everything else', () => {
  const hosts = ['tryeatpal.com', 'www.tryeatpal.com'];
  assert(isOwnedUrl('https://tryeatpal.com/blog/post', hosts));
  assert(isOwnedUrl('https://www.tryeatpal.com/', hosts));
  // Third-party host — the de-index / quota-burn attack.
  assertEquals(isOwnedUrl('https://evil.com/', hosts), false);
  // Subdomain not explicitly allowlisted.
  assertEquals(isOwnedUrl('https://sneaky.tryeatpal.com/', hosts), false);
  // Non-https.
  assertEquals(isOwnedUrl('http://tryeatpal.com/', hosts), false);
  // Malformed.
  assertEquals(isOwnedUrl('not a url', hosts), false);
});

// ---------------------------------------------------------------------------
// csat-logic.ts — fail-closed token secret (US-521)
// ---------------------------------------------------------------------------

Deno.test('resolveCsatTokenSecret is null for unset/empty, value otherwise', () => {
  assertEquals(resolveCsatTokenSecret(undefined), null);
  assertEquals(resolveCsatTokenSecret(null), null);
  assertEquals(resolveCsatTokenSecret(''), null);
  assertEquals(resolveCsatTokenSecret('s3cret'), 's3cret');
});

Deno.test('a CSAT token signed with a different key is rejected under the real key', async () => {
  const real = 'the-real-dedicated-secret';
  const forgedWithOtherKey = await signCsatToken('ticket-123', 'attacker-guess');
  assertEquals(await verifyCsatToken(forgedWithOtherKey, real), null);

  // A token signed with the real key still verifies.
  const legit = await signCsatToken('ticket-123', real);
  assertEquals(await verifyCsatToken(legit, real), 'ticket-123');

  // The old `?? ''` fallback is unreachable now: the resolver returns null for
  // an empty/unset secret, so verification never runs with a forgeable key.
  assertEquals(resolveCsatTokenSecret(''), null);
  assertEquals(resolveCsatTokenSecret(undefined), null);
});

// ---------------------------------------------------------------------------
// webhook-signatures.ts — provider HMAC verification (US-520)
// ---------------------------------------------------------------------------

Deno.test('verifyGithubSignature accepts a correct sha256= HMAC and rejects tampering', async () => {
  const secret = 'gh-webhook-secret';
  const body = '{"action":"completed","workflow_run":{"conclusion":"failure"}}';
  const good = 'sha256=' + (await hmacSha256Hex(secret, body));

  assertEquals(await verifyGithubSignature(body, good, secret), true);
  // Wrong secret.
  assertEquals(await verifyGithubSignature(body, good, 'other'), false);
  // Tampered body (a forged/injected payload).
  assertEquals(await verifyGithubSignature(body + 'x', good, secret), false);
  // Missing / mis-formatted header.
  assertEquals(await verifyGithubSignature(body, null, secret), false);
  assertEquals(await verifyGithubSignature(body, 'deadbeef', secret), false);
  // Unset secret fails closed.
  assertEquals(await verifyGithubSignature(body, good, undefined), false);
});

Deno.test('verifySentrySignature verifies hex HMAC and enforces timestamp tolerance', async () => {
  const secret = 'sentry-secret';
  const body = '{"data":{"event":{"title":"boom"}}}';
  const sig = await hmacSha256Hex(secret, body);

  assertEquals(await verifySentrySignature(body, sig, secret), true);
  // Forged header.
  assertEquals(await verifySentrySignature(body, 'deadbeef', secret), false);
  // Fresh timestamp within tolerance.
  assertEquals(
    await verifySentrySignature(body, sig, secret, { timestamp: '1000', nowSeconds: 1100 }),
    true,
  );
  // Stale timestamp beyond tolerance (replay).
  assertEquals(
    await verifySentrySignature(body, sig, secret, { timestamp: '1000', nowSeconds: 99999 }),
    false,
  );
});

// ---------------------------------------------------------------------------
// stripe-webhook-logic.ts — idempotency + ordering (US-519)
// ---------------------------------------------------------------------------

Deno.test('isFreshStripeEvent: a stale updated after a newer deleted is rejected', () => {
  // A subscription.deleted (created=200) was applied; a late
  // subscription.updated (created=100) must NOT reactivate it.
  assertEquals(isFreshStripeEvent(100, 200), false);
  // A newer event applies.
  assertEquals(isFreshStripeEvent(300, 200), true);
  // Equal timestamps still apply (idempotent replay handled separately).
  assertEquals(isFreshStripeEvent(200, 200), true);
  // First event on a fresh row always applies.
  assertEquals(isFreshStripeEvent(100, null), true);
  // A guarded row with no ordering info on the incoming event is skipped.
  assertEquals(isFreshStripeEvent(null, 200), false);
});

Deno.test('isDuplicateInsertError detects unique-violations (redelivered event)', () => {
  assertEquals(isDuplicateInsertError({ code: '23505' }), true);
  assertEquals(isDuplicateInsertError({ message: 'duplicate key value violates unique constraint' }), true);
  assertEquals(isDuplicateInsertError({ code: '23503' }), false);
  assertEquals(isDuplicateInsertError(null), false);
  assertEquals(isDuplicateInsertError('boom'), false);
});

// ---------------------------------------------------------------------------
// outward-payload-validation.ts — repo/recipient allowlisting (US-522)
// ---------------------------------------------------------------------------

Deno.test('isAllowedRepo: only allowlisted owner/name repos pass, fails closed when empty', () => {
  const allow = parseRepoAllowlist('dj-pearson/empty-stage-starter, Owner/Repo');
  assert(isAllowedRepo('dj-pearson/empty-stage-starter', allow));
  assert(isAllowedRepo('owner/repo', allow)); // case-insensitive
  // A payload-injected foreign repo (the prompt-injection target).
  assertEquals(isAllowedRepo('attacker/evil', allow), false);
  // Malformed.
  assertEquals(isAllowedRepo('not-a-repo', allow), false);
  // Empty allowlist fails closed.
  assertEquals(isAllowedRepo('dj-pearson/empty-stage-starter', []), false);
});

Deno.test('isValidEmailRecipient: valid single/array, rejects injection and junk', () => {
  assert(isValidEmailRecipient('user@example.com'));
  assert(isValidEmailRecipient(['a@example.com', 'b@example.org']));
  assertEquals(isValidEmailRecipient('not-an-email'), false);
  // Header-injection attempt.
  assertEquals(isValidEmailRecipient('a@example.com\r\nBcc: victim@x.com'), false);
  assertEquals(isValidEmailRecipient(''), false);
  assertEquals(isValidEmailRecipient([]), false);
  assertEquals(isValidEmailRecipient({ to: 'x' }), false);
});
