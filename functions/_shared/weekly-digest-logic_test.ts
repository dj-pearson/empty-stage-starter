/**
 * Unit tests for the weekly digest logic (US-501).
 * Run with: `deno test functions/_shared/weekly-digest-logic_test.ts`
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeWeeklyStats, hasActivity, renderDigest } from './weekly-digest-logic.ts';

Deno.test('computeWeeklyStats: entries, distinct active days, new foods', () => {
  const s = computeWeeklyStats(
    ['2026-07-06T10:00:00Z', '2026-07-06T18:00:00Z', '2026-07-08T09:00:00Z'],
    2,
  );
  assertEquals(s.plansMade, 3);
  assertEquals(s.activeDays, 2); // 07-06 and 07-08
  assertEquals(s.newFoodsTried, 2);
});

Deno.test('computeWeeklyStats: empty', () => {
  assertEquals(computeWeeklyStats([], 0), { plansMade: 0, newFoodsTried: 0, activeDays: 0 });
});

Deno.test('hasActivity: true when plans or foods, false when empty', () => {
  assertEquals(hasActivity({ plansMade: 0, newFoodsTried: 0, activeDays: 0 }), false);
  assertEquals(hasActivity({ plansMade: 1, newFoodsTried: 0, activeDays: 1 }), true);
  assertEquals(hasActivity({ plansMade: 0, newFoodsTried: 3, activeDays: 0 }), true);
});

Deno.test('renderDigest: deterministic body with stats, encouragement, unsubscribe, pluralization', () => {
  const r = renderDigest(
    { plansMade: 1, newFoodsTried: 2, activeDays: 1 },
    { unsubscribeUrl: 'https://fn/u?t=tok', encouragement: 'Great momentum!' },
  );
  assert(r.subject.length > 0);
  assert(r.body.includes('1 meal planned')); // singular
  assert(r.body.includes('2 new foods tried')); // plural
  assert(r.body.includes('1 active day')); // singular
  assert(r.body.includes('Great momentum!'));
  assert(r.body.includes('https://fn/u?t=tok'));
});

Deno.test('renderDigest: omits encouragement when absent', () => {
  const r = renderDigest({ plansMade: 3, newFoodsTried: 0, activeDays: 2 }, { unsubscribeUrl: 'https://fn/u' });
  assert(r.body.includes('3 meals planned'));
  assert(!r.body.includes('<p></p>'));
});
