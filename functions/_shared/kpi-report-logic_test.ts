/**
 * Unit tests for the KPI aggregation math (US-513).
 * Run with: `deno test functions/_shared/kpi-report-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { delta, rate, average, buildKpiReport, trendArrow, type KpiRaw } from './kpi-report-logic.ts';

Deno.test('delta computes value, change, and percent', () => {
  const m = delta(120, 100);
  assertEquals(m, { current: 120, previous: 100, delta: 20, pctChange: 20 });
});

Deno.test('delta pctChange is null when previous is zero', () => {
  assertEquals(delta(5, 0).pctChange, null);
});

Deno.test('delta uses magnitude of previous for percent (negative previous)', () => {
  // -10 -> -5 is a +5 delta off a base of 10 = +50%.
  assertEquals(delta(-5, -10).pctChange, 50);
});

Deno.test('rate guards divide-by-zero', () => {
  assertEquals(rate(3, 6), 0.5);
  assertEquals(rate(3, 0), 0);
});

Deno.test('average returns null for empty', () => {
  assertEquals(average([]), null);
  assertEquals(average([4, 5]), 4.5);
});

const raw = (over: Partial<KpiRaw> = {}): KpiRaw => ({
  signups: 100,
  activated: 40,
  activeSubs: 50,
  newSubs: 10,
  canceledSubs: 4,
  mrr: 500,
  supportTickets: 20,
  csatScores: [5, 4, 3],
  contentPublished: 3,
  agentSpend: 12.5,
  ...over,
});

Deno.test('buildKpiReport derives activation rate and net subs', () => {
  const cur = raw({ signups: 200, activated: 100, newSubs: 12, canceledSubs: 2 });
  const prev = raw({ signups: 100, activated: 40, newSubs: 10, canceledSubs: 4 });
  const r = buildKpiReport(cur, prev);
  // activation: 50% now vs 40% last week -> +10pts.
  assertEquals(r.activationRatePct.current, 50);
  assertEquals(r.activationRatePct.previous, 40);
  assertEquals(r.activationRatePct.delta, 10);
  // net subs: (12-2)=10 vs (10-4)=6 -> +4.
  assertEquals(r.netSubs.current, 10);
  assertEquals(r.netSubs.delta, 4);
});

Deno.test('buildKpiReport averages CSAT and tolerates empty ratings', () => {
  const r = buildKpiReport(raw({ csatScores: [] }), raw({ csatScores: [5, 5] }));
  assertEquals(r.csatAvg.current, 0);
  assertEquals(r.csatAvg.previous, 5);
});

Deno.test('trendArrow renders direction and percent', () => {
  assertEquals(trendArrow(delta(120, 100)), '▲ +20 (+20%)');
  assertEquals(trendArrow(delta(90, 100)), '▼ -10 (-10%)');
  assertEquals(trendArrow(delta(5, 5)), '→ 0 (0%)');
  assertEquals(trendArrow(delta(5, 0)), '▲ +5 (n/a)');
});
