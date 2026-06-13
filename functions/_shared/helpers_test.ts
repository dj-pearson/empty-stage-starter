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
