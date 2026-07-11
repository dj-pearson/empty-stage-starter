/**
 * Unit tests for churn-risk logic (US-497).
 * Run with: `deno test functions/_shared/churn-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeFeatures, crossedIntoHigh, clampScore } from './churn-logic.ts';

const NOW = new Date('2026-07-10T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

Deno.test('computeFeatures: days + active-subscription + any-activity', () => {
  const f = computeFeatures(
    {
      lastPlanAt: daysAgo(10),
      lastGroceryAt: daysAgo(3),
      subscriptionStatus: 'active',
      kidsCount: 2,
      signupAt: daysAgo(200),
    },
    NOW,
  );
  assertEquals(f.daysSinceLastPlan, 10);
  assertEquals(f.daysSinceLastGrocery, 3);
  assertEquals(f.daysSinceAnyActivity, 3); // most recent of the two
  assertEquals(f.hasActiveSubscription, true);
  assertEquals(f.kidsCount, 2);
  assertEquals(f.daysSinceSignup, 200);
});

Deno.test('computeFeatures: nulls when no activity, inactive sub', () => {
  const f = computeFeatures(
    { lastPlanAt: null, lastGroceryAt: null, subscriptionStatus: 'canceled', kidsCount: 0, signupAt: null },
    NOW,
  );
  assertEquals(f.daysSinceLastPlan, null);
  assertEquals(f.daysSinceAnyActivity, null);
  assertEquals(f.hasActiveSubscription, false);
});

Deno.test('crossedIntoHigh', () => {
  assertEquals(crossedIntoHigh(null, 'high'), true);
  assertEquals(crossedIntoHigh('medium', 'high'), true);
  assertEquals(crossedIntoHigh('low', 'high'), true);
  assertEquals(crossedIntoHigh('high', 'high'), false); // already high
  assertEquals(crossedIntoHigh('high', 'medium'), false);
  assertEquals(crossedIntoHigh('low', 'medium'), false);
});

Deno.test('clampScore', () => {
  assertEquals(clampScore(-5), 0);
  assertEquals(clampScore(150), 100);
  assertEquals(clampScore(72.6), 73);
  assertEquals(clampScore(NaN), 0);
});
