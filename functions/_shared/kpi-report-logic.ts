/**
 * Pure KPI aggregation for the weekly business KPI report agent (US-513).
 *
 * DB-free: takes the raw counts computed by SQL for the current and prior week
 * and produces week-over-week metrics. Figures come from SQL, never the model —
 * this module only does the arithmetic (deltas, rates, averages).
 */

export interface KpiRaw {
  signups: number;
  activated: number; // signups in the window who created a first plan
  activeSubs: number; // active subscriptions at window end
  newSubs: number; // subscriptions created in window
  canceledSubs: number; // subscriptions canceled in window
  mrr: number; // monthly recurring revenue from active subs
  supportTickets: number; // tickets opened in window
  csatScores: number[]; // csat ratings collected in window (1-5)
  contentPublished: number; // content items published in window
  agentSpend: number; // total agent cost in window
}

export interface Metric {
  current: number;
  previous: number;
  delta: number;
  /** Percent change vs previous; null when previous is 0 (undefined ratio). */
  pctChange: number | null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function delta(current: number, previous: number): Metric {
  const d = current - previous;
  return {
    current: round(current),
    previous: round(previous),
    delta: round(d),
    pctChange: previous !== 0 ? round((d / Math.abs(previous)) * 100) : null,
  };
}

/** Fraction numerator/denominator in [0,1]; 0 when denominator is 0. */
export function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/** Mean of a list, or null when empty. */
export function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((s, x) => s + x, 0) / nums.length;
}

export interface KpiReport {
  signups: Metric;
  /** Activation rate as a percentage (activated / signups * 100). */
  activationRatePct: Metric;
  activeSubs: Metric;
  netSubs: Metric; // new - canceled
  mrr: Metric;
  supportTickets: Metric;
  /** Average CSAT (1-5); current/previous default to 0 when no ratings. */
  csatAvg: Metric;
  contentPublished: Metric;
  agentSpend: Metric;
}

export function buildKpiReport(cur: KpiRaw, prev: KpiRaw): KpiReport {
  return {
    signups: delta(cur.signups, prev.signups),
    activationRatePct: delta(rate(cur.activated, cur.signups) * 100, rate(prev.activated, prev.signups) * 100),
    activeSubs: delta(cur.activeSubs, prev.activeSubs),
    netSubs: delta(cur.newSubs - cur.canceledSubs, prev.newSubs - prev.canceledSubs),
    mrr: delta(cur.mrr, prev.mrr),
    supportTickets: delta(cur.supportTickets, prev.supportTickets),
    csatAvg: delta(average(cur.csatScores) ?? 0, average(prev.csatScores) ?? 0),
    contentPublished: delta(cur.contentPublished, prev.contentPublished),
    agentSpend: delta(cur.agentSpend, prev.agentSpend),
  };
}

/** Compact "▲ +12 (+8%)" / "▼ -3 (-5%)" / "→ 0" arrow string for a metric. */
export function trendArrow(m: Metric): string {
  const arrow = m.delta > 0 ? '▲' : m.delta < 0 ? '▼' : '→';
  const sign = m.delta > 0 ? '+' : '';
  const pct = m.pctChange === null ? 'n/a' : `${m.pctChange > 0 ? '+' : ''}${m.pctChange}%`;
  return `${arrow} ${sign}${m.delta} (${pct})`;
}
