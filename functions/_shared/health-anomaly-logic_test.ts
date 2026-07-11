/**
 * Unit tests for the health/cost anomaly math (US-512).
 * Run with: `deno test functions/_shared/health-anomaly-logic_test.ts`
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  analyzeHealth,
  tierForAnomaly,
  mean,
  resolveHealthThresholds,
  DEFAULT_HEALTH_THRESHOLDS,
  type HealthInput,
} from './health-anomaly-logic.ts';

const t = DEFAULT_HEALTH_THRESHOLDS;
const base = (over: Partial<HealthInput> = {}): HealthInput => ({
  currentErrorRate: 1,
  baselineErrorRates: [1, 1, 1, 1, 1, 1, 1],
  currentLatencyP95: 400,
  todaySpend: 3,
  trailingDailySpends: [3, 3, 3, 3, 3, 3, 3],
  ...over,
});

Deno.test('mean handles empty and non-empty', () => {
  assertEquals(mean([]), 0);
  assertEquals(mean([2, 4]), 3);
});

Deno.test('steady-state input is clean', () => {
  assertEquals(analyzeHealth(base(), t), []);
});

Deno.test('error rate 3x baseline over the floor is anomalous', () => {
  // baseline mean 1, current 5 (>3x AND >= floor 2).
  const a = analyzeHealth(base({ currentErrorRate: 5 }), t);
  assertEquals(a.length, 1);
  assertEquals(a[0].type, 'error_rate');
  assertEquals(a[0].fingerprint, 'health:error_rate');
  assertEquals(a[0].evidence.multiple, 5);
});

Deno.test('error rate above the multiple but below the floor is NOT anomalous', () => {
  // baseline 0.1, current 1.0 -> 10x baseline but below the 2.0 absolute floor.
  const a = analyzeHealth(base({ currentErrorRate: 1, baselineErrorRates: [0.1, 0.1, 0.1] }), t);
  assertEquals(a.filter((x) => x.type === 'error_rate').length, 0);
});

Deno.test('error rate spike off a zero baseline (over floor) alarms', () => {
  const a = analyzeHealth(base({ currentErrorRate: 8, baselineErrorRates: [0, 0, 0] }), t);
  assertEquals(a[0].type, 'error_rate');
  assertEquals(a[0].evidence.multiple, null);
});

Deno.test('latency p95 above threshold is anomalous', () => {
  const a = analyzeHealth(base({ currentLatencyP95: 1500 }), t);
  assert(a.some((x) => x.type === 'latency_p95'));
  const lat = a.find((x) => x.type === 'latency_p95')!;
  assertEquals(lat.evidence.current, 1500);
});

Deno.test('latency exactly at threshold is not anomalous', () => {
  assertEquals(analyzeHealth(base({ currentLatencyP95: 1000 }), t).some((x) => x.type === 'latency_p95'), false);
});

Deno.test('spend above 2x trailing avg over the floor is anomalous', () => {
  // trailing avg 3, today 10 (>2x=6 AND >= floor 5).
  const a = analyzeHealth(base({ todaySpend: 10 }), t);
  const spend = a.find((x) => x.type === 'spend');
  assert(spend);
  assertEquals(spend!.evidence.trailingAvg, 3);
});

Deno.test('spend spike below the floor is not anomalous', () => {
  // trailing avg 0.5, today 2 -> 4x but below $5 floor.
  const a = analyzeHealth(base({ todaySpend: 2, trailingDailySpends: [0.5, 0.5] }), t);
  assertEquals(a.some((x) => x.type === 'spend'), false);
});

Deno.test('null current metrics are skipped', () => {
  const a = analyzeHealth(base({ currentErrorRate: null, currentLatencyP95: null }), t);
  // only spend could fire; here it's steady, so clean.
  assertEquals(a, []);
});

Deno.test('multiple anomalies surface together', () => {
  const a = analyzeHealth(base({ currentErrorRate: 9, currentLatencyP95: 2000, todaySpend: 20 }), t);
  assertEquals(new Set(a.map((x) => x.type)).size, 3);
});

Deno.test('tierForAnomaly: error rate upgrades to 3 only when sustained', () => {
  assertEquals(tierForAnomaly('error_rate', 1, t), 2);
  assertEquals(tierForAnomaly('error_rate', 2, t), 2);
  assertEquals(tierForAnomaly('error_rate', 3, t), 3);
  assertEquals(tierForAnomaly('latency_p95', 5, t), 2);
  assertEquals(tierForAnomaly('spend', 9, t), 2);
});

Deno.test('resolveHealthThresholds honors overrides and keeps defaults', () => {
  assertEquals(resolveHealthThresholds(null), DEFAULT_HEALTH_THRESHOLDS);
  const c = resolveHealthThresholds({ health_thresholds: { latencyP95Ms: 2000, sustainChecks: 5 } });
  assertEquals(c.latencyP95Ms, 2000);
  assertEquals(c.sustainChecks, 5);
  assertEquals(c.spendBaselineMult, DEFAULT_HEALTH_THRESHOLDS.spendBaselineMult);
  // sustainChecks can't be 0 (would make every anomaly tier-3 immediately).
  assertEquals(resolveHealthThresholds({ health_thresholds: { sustainChecks: 0 } }).sustainChecks, DEFAULT_HEALTH_THRESHOLDS.sustainChecks);
});
