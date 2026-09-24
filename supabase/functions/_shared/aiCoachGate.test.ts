// Deno tests for the AI Coach daily-limit gate (owner decision 1a).
// Run with: deno test supabase/functions/_shared/aiCoachGate.test.ts
// Vitest mirror: src/lib/aiCoachGateShared.test.ts
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  AI_COACH_LIMIT_CODE,
  AI_COACH_LIMIT_UNAVAILABLE_CODE,
  classifyCoachClient,
  runCoachTurn,
  type CoachClient,
  type LimitLookup,
} from './aiCoachGate.ts';

const WEB: CoachClient = { kind: 'web', version: 1 };
const LEGACY: CoachClient = { kind: 'legacy' };
const UNDER: LimitLookup = { ok: true, result: { allowed: true, limit: 10, current: 3 } };
const OVER: LimitLookup = { ok: true, result: { allowed: false, limit: 10, current: 10 } };
const FAILED: LimitLookup = { ok: false };

function harness(client: CoachClient, lookup: LimitLookup | 'throw', flag: boolean | 'throw', modelFails = false) {
  const calls = { generate: 0, increment: 0, flagReads: 0 };
  const run = () =>
    runCoachTurn({
      client,
      checkLimit: () => (lookup === 'throw' ? Promise.reject(new Error('rpc down')) : Promise.resolve(lookup)),
      readEnforceLegacy: () => {
        calls.flagReads += 1;
        return flag === 'throw' ? Promise.reject(new Error('flag read')) : Promise.resolve(flag);
      },
      generate: () => {
        calls.generate += 1;
        return modelFails ? Promise.reject(new Error('provider 500')) : Promise.resolve('reply');
      },
      incrementUsage: () => {
        calls.increment += 1;
        return Promise.resolve();
      },
    });
  return { calls, run };
}

Deno.test('classify: eatpal-web/<n> and bare eatpal-web are web, anything else legacy', () => {
  assertEquals(classifyCoachClient('eatpal-web/1'), { kind: 'web', version: 1 });
  assertEquals(classifyCoachClient('eatpal-web'), { kind: 'web', version: 0 });
  assertEquals(classifyCoachClient(null), { kind: 'legacy' });
  assertEquals(classifyCoachClient('supabase-js-web/2.57.0'), { kind: 'legacy' });
  assertEquals(classifyCoachClient('eatpal-webby'), { kind: 'legacy' });
});

Deno.test('web over the limit: 402 ai_coach_limit, model never called, nothing metered', async () => {
  const h = harness(WEB, OVER, false);
  const out = await h.run();
  assertEquals(out.kind, 'refused');
  if (out.kind === 'refused') {
    assertEquals(out.decision.status, 402);
    assertEquals(out.decision.body.code, AI_COACH_LIMIT_CODE);
    assertEquals(out.decision.body.limit, 10);
  }
  assertEquals(h.calls, { generate: 0, increment: 0, flagReads: 0 });
});

Deno.test('web under the limit: allowed and incremented once, after the reply', async () => {
  const h = harness(WEB, UNDER, false);
  const out = await h.run();
  assertEquals(out.kind, 'replied');
  assertEquals(h.calls, { generate: 1, increment: 1, flagReads: 0 });
});

Deno.test('legacy over the limit with the flag off: allowed and metered', async () => {
  const h = harness(LEGACY, OVER, false);
  const out = await h.run();
  assertEquals(out.kind === 'replied' && out.reason, 'legacy_grace');
  assertEquals(h.calls, { generate: 1, increment: 1, flagReads: 1 });
});

Deno.test('legacy over the limit with the flag on: 402', async () => {
  const h = harness(LEGACY, OVER, true);
  const out = await h.run();
  assertEquals(out.kind === 'refused' && out.decision.status, 402);
  assertEquals(h.calls.generate, 0);
});

Deno.test('legacy under the limit does not read the flag', async () => {
  const h = harness(LEGACY, UNDER, true);
  await h.run();
  assertEquals(h.calls, { generate: 1, increment: 1, flagReads: 0 });
});

Deno.test('model failure: the error propagates and nothing is metered', async () => {
  const h = harness(WEB, UNDER, false, true);
  await assertRejects(() => h.run(), Error, 'provider 500');
  assertEquals(h.calls.increment, 0);
});

Deno.test('check RPC error: web fails closed with 503, not a limit message', async () => {
  for (const lookup of [FAILED, 'throw'] as const) {
    const h = harness(WEB, lookup, false);
    const out = await h.run();
    assertEquals(out.kind === 'refused' && out.decision.status, 503);
    assertEquals(out.kind === 'refused' && out.decision.body.code, AI_COACH_LIMIT_UNAVAILABLE_CODE);
    assertEquals(h.calls.generate, 0);
  }
});

Deno.test('check RPC error: legacy is allowed during grace, refused after', async () => {
  const grace = harness(LEGACY, FAILED, false);
  assertEquals((await grace.run()).kind, 'replied');
  assertEquals(grace.calls.increment, 1);

  const after = harness(LEGACY, FAILED, true);
  const out = await after.run();
  assertEquals(out.kind === 'refused' && out.decision.status, 503);
});

Deno.test('a failed flag read keeps the grace period', async () => {
  const h = harness(LEGACY, OVER, 'throw');
  assertEquals((await h.run()).kind, 'replied');
});
