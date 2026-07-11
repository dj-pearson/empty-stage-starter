/**
 * Pure baseline/anomaly math for the system health & cost anomaly agent (US-512).
 *
 * DB-free so the threshold logic is unit-testable against fixtures. The agent
 * feeds in the current window and trailing-7-day baselines; this module decides
 * what is anomalous and at what tier.
 */

export interface HealthThresholds {
  /** Error rate is anomalous above this multiple of the trailing baseline. */
  errorRateBaselineMult: number;
  /** …but never below this absolute floor (ignore trivial jitter off a ~0 baseline). */
  errorRateFloor: number;
  /** p95 latency (ms) above this is anomalous outright. */
  latencyP95Ms: number;
  /** Daily agent spend above this multiple of the trailing average is anomalous. */
  spendBaselineMult: number;
  /** …but never below this absolute floor (dollars). */
  spendFloor: number;
  /** Consecutive error-rate anomalies that upgrade tier-2 → tier-3 (sustained outage). */
  sustainChecks: number;
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  errorRateBaselineMult: 3,
  errorRateFloor: 2,
  latencyP95Ms: 1000,
  spendBaselineMult: 2,
  spendFloor: 5,
  sustainChecks: 3,
};

const numOr = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 ? v : d);

export function resolveHealthThresholds(policy: Record<string, unknown> | null | undefined): HealthThresholds {
  const t = (policy?.health_thresholds ?? {}) as Partial<HealthThresholds>;
  const d = DEFAULT_HEALTH_THRESHOLDS;
  return {
    errorRateBaselineMult: numOr(t.errorRateBaselineMult, d.errorRateBaselineMult),
    errorRateFloor: numOr(t.errorRateFloor, d.errorRateFloor),
    latencyP95Ms: numOr(t.latencyP95Ms, d.latencyP95Ms),
    spendBaselineMult: numOr(t.spendBaselineMult, d.spendBaselineMult),
    spendFloor: numOr(t.spendFloor, d.spendFloor),
    sustainChecks: numOr(t.sustainChecks, d.sustainChecks) || d.sustainChecks,
  };
}

/** Arithmetic mean; 0 for an empty list. */
export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export type AnomalyType = 'error_rate' | 'latency_p95' | 'spend';

export interface HealthAnomaly {
  type: AnomalyType;
  fingerprint: string;
  evidence: Record<string, unknown>;
}

export interface HealthInput {
  currentErrorRate: number | null;
  baselineErrorRates: number[];
  currentLatencyP95: number | null;
  todaySpend: number;
  trailingDailySpends: number[];
}

/**
 * A metric is anomalous when it clears BOTH the multiplier-vs-baseline test and
 * an absolute floor — so a spike off a near-zero baseline still needs to be
 * materially large before it alarms.
 */
function overBaseline(current: number, baseline: number, mult: number, floor: number): boolean {
  if (current < floor) return false;
  if (baseline <= 0) return current > 0; // any material value off a zero baseline
  return current > mult * baseline;
}

export function analyzeHealth(input: HealthInput, t: HealthThresholds): HealthAnomaly[] {
  const out: HealthAnomaly[] = [];

  if (input.currentErrorRate !== null) {
    const baseline = mean(input.baselineErrorRates);
    if (overBaseline(input.currentErrorRate, baseline, t.errorRateBaselineMult, t.errorRateFloor)) {
      out.push({
        type: 'error_rate',
        fingerprint: 'health:error_rate',
        evidence: {
          current: input.currentErrorRate,
          baseline: round(baseline),
          multiple: baseline > 0 ? round(input.currentErrorRate / baseline) : null,
          threshold: `${t.errorRateBaselineMult}x baseline`,
        },
      });
    }
  }

  if (input.currentLatencyP95 !== null && input.currentLatencyP95 > t.latencyP95Ms) {
    out.push({
      type: 'latency_p95',
      fingerprint: 'health:latency_p95',
      evidence: { current: input.currentLatencyP95, thresholdMs: t.latencyP95Ms },
    });
  }

  const spendBaseline = mean(input.trailingDailySpends);
  if (overBaseline(input.todaySpend, spendBaseline, t.spendBaselineMult, t.spendFloor)) {
    out.push({
      type: 'spend',
      fingerprint: 'health:spend',
      evidence: {
        today: round(input.todaySpend),
        trailingAvg: round(spendBaseline),
        multiple: spendBaseline > 0 ? round(input.todaySpend / spendBaseline) : null,
        threshold: `${t.spendBaselineMult}x trailing avg`,
      },
    });
  }

  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Tier for an anomaly given how many consecutive checks it has persisted. Only a
 * sustained error-rate anomaly (>= sustainChecks in a row) upgrades to tier-3;
 * everything else stays tier-2.
 */
export function tierForAnomaly(type: AnomalyType, consecutive: number, t: HealthThresholds): 2 | 3 {
  if (type === 'error_rate' && consecutive >= t.sustainChecks) return 3;
  return 2;
}
