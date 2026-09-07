/**
 * US-806: access resolution for `parse-recipe`.
 *
 * The regression this pins: b9d0427b put `requireUser` in front of
 * parse-recipe, and every shipped iOS build calls it with the anon key as the
 * bearer (Shared/RecipeParseAPI.swift). An anon key is not a user JWT, so
 * `auth.getUser()` returned nothing and the share extension, the
 * `eatpal://recipe/import` deep link and the Shortcuts intent all got a 401.
 *
 * So an anon caller has to be let through again -- but parse-recipe fetches an
 * arbitrary URL and pays for a Claude call, so "let through" must come with a
 * hard ceiling. These tests fix both halves: anon is allowed, and anon is
 * capped per-IP and globally.
 *
 * Run with: `deno test supabase/functions/_shared/parse-recipe-access.test.ts`
 */

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  ANON_GLOBAL_LIMIT,
  ANON_PER_IP_LIMIT,
  ANON_WINDOW_MS,
  clientIp,
  resetAnonBudget,
  resolveAccess,
  type GateResult,
} from './parse-recipe-access.ts';

const ANON_KEY = 'anon-key-for-tests';

function req(headers: Record<string, string>): Request {
  return new Request('https://functions.tryeatpal.com/parse-recipe', {
    method: 'POST',
    headers,
  });
}

function fromIp(ip: string, token = ANON_KEY): Request {
  return req({ Authorization: `Bearer ${token}`, 'x-forwarded-for': ip });
}

/** A gate stub that records whether it was consulted. */
function gateStub(result: GateResult) {
  let calls = 0;
  return {
    gate: () => {
      calls++;
      return Promise.resolve(result);
    },
    get calls() {
      return calls;
    },
  };
}

const ok: GateResult = { ok: true, status: 200, userId: 'user-1' };
const unauthorized: GateResult = { ok: false, status: 401, error: 'Unauthorized' };
const misconfigured: GateResult = { ok: false, status: 500, error: 'Server misconfigured' };

function setup() {
  resetAnonBudget();
}

Deno.test('a signed-in caller is allowed and spends no anon budget', async () => {
  setup();
  const stub = gateStub(ok);

  const access = await resolveAccess(fromIp('203.0.113.1', 'a-real-user-jwt'), stub.gate, {
    anonKey: ANON_KEY,
  });

  assert(access.allowed);
  assertEquals(access.mode, 'user');
  assertEquals(access.userId, 'user-1');
  assertEquals(stub.calls, 1);

  // The whole per-IP budget is still there for the same address.
  for (let i = 0; i < ANON_PER_IP_LIMIT; i++) {
    const anon = await resolveAccess(fromIp('203.0.113.1'), stub.gate, { anonKey: ANON_KEY });
    assert(anon.allowed, `anon call ${i + 1} should be allowed`);
  }
});

Deno.test('the anon key is allowed without a round-trip to the auth server', async () => {
  setup();
  const stub = gateStub(unauthorized);

  const access = await resolveAccess(fromIp('203.0.113.2'), stub.gate, { anonKey: ANON_KEY });

  assert(access.allowed);
  assertEquals(access.mode, 'anon');
  assertEquals(stub.calls, 0, 'the anon key is recognizable without asking GoTrue');
});

Deno.test('an expired user token falls back to the anon budget rather than 401', async () => {
  setup();
  const stub = gateStub(unauthorized);

  const access = await resolveAccess(fromIp('203.0.113.3', 'expired.jwt.here'), stub.gate, {
    anonKey: ANON_KEY,
  });

  assert(access.allowed);
  assertEquals(access.mode, 'anon');
  assertEquals(stub.calls, 1);
});

Deno.test('a broken gate is not treated as anonymous', async () => {
  setup();
  const stub = gateStub(misconfigured);

  const access = await resolveAccess(fromIp('203.0.113.4', 'some.jwt'), stub.gate, {
    anonKey: ANON_KEY,
  });

  assert(!access.allowed);
  assertEquals(access.status, 500);
  assertEquals(access.error, 'Server misconfigured');
});

Deno.test('a request with no Authorization header is refused outright', async () => {
  setup();
  const stub = gateStub(ok);

  const access = await resolveAccess(req({ 'x-forwarded-for': '203.0.113.5' }), stub.gate, {
    anonKey: ANON_KEY,
  });

  assert(!access.allowed);
  assertEquals(access.status, 401);
  assertEquals(stub.calls, 0);

  // ...and it did not spend the address's anon budget.
  for (let i = 0; i < ANON_PER_IP_LIMIT; i++) {
    const anon = await resolveAccess(fromIp('203.0.113.5'), stub.gate, { anonKey: ANON_KEY });
    assert(anon.allowed, `anon call ${i + 1} should be allowed`);
  }
});

Deno.test('one address gets ANON_PER_IP_LIMIT calls per window, then 429', async () => {
  setup();
  const stub = gateStub(unauthorized);

  for (let i = 0; i < ANON_PER_IP_LIMIT; i++) {
    const access = await resolveAccess(fromIp('198.51.100.7'), stub.gate, { anonKey: ANON_KEY });
    assert(access.allowed, `call ${i + 1} should be allowed`);
  }

  const denied = await resolveAccess(fromIp('198.51.100.7'), stub.gate, { anonKey: ANON_KEY });
  assert(!denied.allowed);
  assertEquals(denied.status, 429);
  assert(
    (denied.retryAfterSeconds ?? 0) > 0 &&
      (denied.retryAfterSeconds ?? 0) <= ANON_WINDOW_MS / 1000,
    'a 429 carries a usable Retry-After',
  );
});

Deno.test('addresses have independent budgets', async () => {
  setup();
  const stub = gateStub(unauthorized);

  for (let i = 0; i < ANON_PER_IP_LIMIT; i++) {
    await resolveAccess(fromIp('198.51.100.8'), stub.gate, { anonKey: ANON_KEY });
  }
  assert(!(await resolveAccess(fromIp('198.51.100.8'), stub.gate, { anonKey: ANON_KEY })).allowed);

  const neighbour = await resolveAccess(fromIp('198.51.100.9'), stub.gate, { anonKey: ANON_KEY });
  assert(neighbour.allowed, 'a different address still has its full budget');
});

Deno.test('the budget refills once the window rolls over', async () => {
  setup();
  const stub = gateStub(unauthorized);
  const t0 = 1_700_000_000_000;

  for (let i = 0; i < ANON_PER_IP_LIMIT; i++) {
    await resolveAccess(fromIp('198.51.100.10'), stub.gate, { anonKey: ANON_KEY, now: t0 });
  }
  const denied = await resolveAccess(fromIp('198.51.100.10'), stub.gate, {
    anonKey: ANON_KEY,
    now: t0 + ANON_WINDOW_MS - 1,
  });
  assert(!denied.allowed, 'still inside the window');

  const refilled = await resolveAccess(fromIp('198.51.100.10'), stub.gate, {
    anonKey: ANON_KEY,
    now: t0 + ANON_WINDOW_MS,
  });
  assert(refilled.allowed, 'the next window starts fresh');
});

Deno.test('a global ceiling caps anon spend across every address', async () => {
  setup();
  const stub = gateStub(unauthorized);

  // Spread the load so no single address ever trips the per-IP cap.
  const addresses = Math.ceil(ANON_GLOBAL_LIMIT / ANON_PER_IP_LIMIT) + 1;
  let allowed = 0;
  for (let a = 0; a < addresses; a++) {
    for (let i = 0; i < ANON_PER_IP_LIMIT; i++) {
      const access = await resolveAccess(fromIp(`192.0.2.${a}`), stub.gate, { anonKey: ANON_KEY });
      if (access.allowed) allowed++;
    }
  }

  assertEquals(allowed, ANON_GLOBAL_LIMIT, 'the global ceiling is the binding constraint');
});

Deno.test('an unattributable caller is capped globally, not squeezed into one tiny bucket', async () => {
  setup();
  const stub = gateStub(unauthorized);

  // No x-forwarded-for and no cf-connecting-ip: if every such request shared a
  // single per-IP bucket, the 11th share-extension import behind a proxy that
  // strips the header would fail for everybody.
  for (let i = 0; i < ANON_PER_IP_LIMIT + 5; i++) {
    const access = await resolveAccess(req({ Authorization: `Bearer ${ANON_KEY}` }), stub.gate, {
      anonKey: ANON_KEY,
    });
    assert(access.allowed, `unattributable call ${i + 1} should be allowed`);
  }
});

Deno.test('clientIp reads the left-most forwarded address, then Cloudflare, then nothing', () => {
  assertEquals(clientIp(req({ 'x-forwarded-for': '203.0.113.1, 70.41.3.18, 150.172.238.178' })), '203.0.113.1');
  assertEquals(clientIp(req({ 'x-forwarded-for': '  203.0.113.2  ' })), '203.0.113.2');
  assertEquals(clientIp(req({ 'cf-connecting-ip': '203.0.113.3' })), '203.0.113.3');
  assertEquals(clientIp(req({ 'x-forwarded-for': '', 'cf-connecting-ip': '203.0.113.4' })), '203.0.113.4');
  assertEquals(clientIp(req({})), null);
});
