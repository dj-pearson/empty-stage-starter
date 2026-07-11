/**
 * Unit tests for budget-guardrail logic (US-480).
 *
 * Run with: `deno test functions/_shared/agent-budget-logic_test.ts`
 *
 * Covers the cap-reached (pre-run skip) decision and the mid-run abort decision
 * with no DB or network.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  capReached,
  remainingBudgetUsd,
  shouldAbortMidRun,
  sumTodaySpend,
} from './agent-budget-logic.ts';

// --- capReached (pre-run skip) ---------------------------------------------

Deno.test('capReached: under cap does not skip', () => {
  assertEquals(capReached({ capUsd: 5, todaySpendUsd: 4.99 }), false);
});

Deno.test('capReached: exactly at cap skips (>=)', () => {
  assertEquals(capReached({ capUsd: 5, todaySpendUsd: 5 }), true);
});

Deno.test('capReached: over cap skips', () => {
  assertEquals(capReached({ capUsd: 5, todaySpendUsd: 7.5 }), true);
});

Deno.test('capReached: no cap configured never skips', () => {
  assertEquals(capReached({ capUsd: null, todaySpendUsd: 1000 }), false);
  assertEquals(capReached({ capUsd: undefined, todaySpendUsd: 1000 }), false);
});

Deno.test('capReached: zero cap always skips', () => {
  assertEquals(capReached({ capUsd: 0, todaySpendUsd: 0 }), true);
});

// --- remainingBudgetUsd -----------------------------------------------------

Deno.test('remainingBudgetUsd: normal remaining', () => {
  assertEquals(remainingBudgetUsd({ capUsd: 5, todaySpendUsd: 2 }), 3);
});

Deno.test('remainingBudgetUsd: clamped to zero, never negative', () => {
  assertEquals(remainingBudgetUsd({ capUsd: 5, todaySpendUsd: 9 }), 0);
});

Deno.test('remainingBudgetUsd: infinite when no cap', () => {
  assertEquals(remainingBudgetUsd({ capUsd: null, todaySpendUsd: 3 }), Infinity);
});

// --- shouldAbortMidRun ------------------------------------------------------

Deno.test('shouldAbortMidRun: within remaining budget continues', () => {
  // cap 5, 2 already spent today, this run cost 1 so far -> total 3, under cap.
  assertEquals(shouldAbortMidRun(5, 2, 1), false);
});

Deno.test('shouldAbortMidRun: exactly on cap is allowed to finish', () => {
  // 4 prior + 1 this run = 5 == cap; strict > means no abort.
  assertEquals(shouldAbortMidRun(5, 4, 1), false);
});

Deno.test('shouldAbortMidRun: overrun aborts', () => {
  // 4 prior + 1.5 this run = 5.5 > 5 cap.
  assertEquals(shouldAbortMidRun(5, 4, 1.5), true);
});

Deno.test('shouldAbortMidRun: run alone blows the whole cap', () => {
  assertEquals(shouldAbortMidRun(5, 0, 6), true);
});

Deno.test('shouldAbortMidRun: no cap never aborts', () => {
  assertEquals(shouldAbortMidRun(null, 100, 100), false);
  assertEquals(shouldAbortMidRun(undefined, 100, 100), false);
});

// --- sumTodaySpend ----------------------------------------------------------

Deno.test('sumTodaySpend: sums and treats null cost as zero', () => {
  assertEquals(
    sumTodaySpend([{ cost_usd: 1.5 }, { cost_usd: null }, { cost_usd: 0.25 }]),
    1.75,
  );
});

Deno.test('sumTodaySpend: empty is zero', () => {
  assertEquals(sumTodaySpend([]), 0);
});
