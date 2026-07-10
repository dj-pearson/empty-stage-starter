/**
 * Unit tests for the agent dispatcher's pure decision logic (US-478).
 *
 * Run with: `deno test functions/_shared/agent-dispatch-logic_test.ts`
 *
 * Covers cron due/not-due evaluation and the per-agent dispatch decision
 * (idempotency, disabled/pause/cap skip reasons) without any DB or network.
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isDue, matchesCron, parseCron, previousMatch } from './cron.ts';
import { decideDispatch, type DispatchAgent, type DispatchFacts } from './agent-dispatch-logic.ts';

// --- cron parsing / matching ------------------------------------------------

Deno.test('parseCron rejects wrong field count', () => {
  let threw = false;
  try {
    parseCron('* * * *');
  } catch {
    threw = true;
  }
  assert(threw, 'expected 4-field expression to throw');
});

Deno.test('matchesCron every-5-minutes', () => {
  const expr = '*/5 * * * *';
  assert(matchesCron(expr, new Date('2026-07-10T12:00:00Z')));
  assert(matchesCron(expr, new Date('2026-07-10T12:05:00Z')));
  assert(!matchesCron(expr, new Date('2026-07-10T12:03:00Z')));
});

Deno.test('matchesCron hourly at minute 0', () => {
  const expr = '0 * * * *';
  assert(matchesCron(expr, new Date('2026-07-10T09:00:00Z')));
  assert(!matchesCron(expr, new Date('2026-07-10T09:30:00Z')));
});

Deno.test('matchesCron weekly Monday 09:00 (dow)', () => {
  const expr = '0 9 * * 1'; // Monday
  assert(matchesCron(expr, new Date('2026-07-13T09:00:00Z')), '2026-07-13 is a Monday');
  assert(!matchesCron(expr, new Date('2026-07-14T09:00:00Z')), 'Tuesday should not match');
});

Deno.test('matchesCron dow 7 treated as Sunday', () => {
  assert(matchesCron('0 0 * * 7', new Date('2026-07-12T00:00:00Z')), '2026-07-12 is a Sunday');
});

Deno.test('previousMatch finds prior slot', () => {
  const prev = previousMatch('*/5 * * * *', new Date('2026-07-10T12:07:30Z'));
  assertEquals(prev?.toISOString(), '2026-07-10T12:05:00.000Z');
});

// --- isDue -------------------------------------------------------------------

Deno.test('isDue: never for empty/null cron', () => {
  assertEquals(isDue(null, null, new Date()), false);
  assertEquals(isDue('', null, new Date()), false);
});

Deno.test('isDue: due when never run', () => {
  assertEquals(isDue('*/5 * * * *', null, new Date('2026-07-10T12:06:00Z')), true);
});

Deno.test('isDue: not due when ran after last slot', () => {
  // last slot at 12:05; ran at 12:05:30 -> not due at 12:06
  assertEquals(
    isDue('*/5 * * * *', '2026-07-10T12:05:30Z', new Date('2026-07-10T12:06:00Z')),
    false,
  );
});

Deno.test('isDue: due when a new slot elapsed since last run', () => {
  // ran at 12:05; now 12:11 -> slot 12:10 elapsed, due
  assertEquals(
    isDue('*/5 * * * *', '2026-07-10T12:05:30Z', new Date('2026-07-10T12:11:00Z')),
    true,
  );
});

Deno.test('isDue: weekly agent not due mid-week if already ran this week', () => {
  // Monday 09:00 schedule; ran Monday 09:01; now Wednesday -> not due
  assertEquals(
    isDue('0 9 * * 1', '2026-07-13T09:01:00Z', new Date('2026-07-15T12:00:00Z')),
    false,
  );
});

// --- decideDispatch ----------------------------------------------------------

const baseAgent: DispatchAgent = {
  id: 'a1',
  name: 'support-triage',
  enabled: true,
  schedule_cron: '*/5 * * * *',
  daily_cost_cap_usd: 5,
};
const now = new Date('2026-07-10T12:06:00Z');
const dueFacts: DispatchFacts = {
  globalPause: false,
  lastRunAt: '2026-07-10T12:00:30Z',
  hasRunningRun: false,
  todaySpendUsd: 0,
};

Deno.test('decideDispatch: invokes a due, clear agent', () => {
  assertEquals(decideDispatch(baseAgent, dueFacts, now), { action: 'invoke' });
});

Deno.test('decideDispatch: noop when not due', () => {
  const facts = { ...dueFacts, lastRunAt: '2026-07-10T12:05:30Z' };
  assertEquals(decideDispatch(baseAgent, facts, now), { action: 'noop' });
});

Deno.test('decideDispatch: noop (idempotent) when a run is already running', () => {
  assertEquals(
    decideDispatch(baseAgent, { ...dueFacts, hasRunningRun: true }, now),
    { action: 'noop' },
  );
});

Deno.test('decideDispatch: skip disabled', () => {
  assertEquals(
    decideDispatch({ ...baseAgent, enabled: false }, dueFacts, now),
    { action: 'skip', reason: 'disabled' },
  );
});

Deno.test('decideDispatch: skip global pause', () => {
  assertEquals(
    decideDispatch(baseAgent, { ...dueFacts, globalPause: true }, now),
    { action: 'skip', reason: 'global pause' },
  );
});

Deno.test('decideDispatch: skip cost cap when spend >= cap', () => {
  assertEquals(
    decideDispatch(baseAgent, { ...dueFacts, todaySpendUsd: 5 }, now),
    { action: 'skip', reason: 'cost cap' },
  );
});

Deno.test('decideDispatch: running beats blockers (no skip row while in-flight)', () => {
  assertEquals(
    decideDispatch(
      { ...baseAgent, enabled: false },
      { ...dueFacts, hasRunningRun: true, globalPause: true },
      now,
    ),
    { action: 'noop' },
  );
});
