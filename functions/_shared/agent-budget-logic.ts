/**
 * Pure budget-guardrail logic for the shared agent runtime (US-480).
 *
 * Separated from agent-runtime.ts so the cap-reached (pre-run skip) and
 * mid-run-abort decisions are unit-testable without a database or network.
 * The runtime supplies the runtime facts (the agent's daily cap and today's
 * accumulated spend) and asks these functions what to do.
 *
 * A null/undefined cap means "no cap configured" — guardrails are disabled and
 * every check passes. This keeps agents whose cap column is somehow unset from
 * being silently frozen.
 */

export interface DailyBudget {
  /** agent_definitions.daily_cost_cap_usd; null/undefined disables the cap. */
  capUsd: number | null | undefined;
  /** Sum of today's agent_runs.cost_usd for this agent, BEFORE the current run. */
  todaySpendUsd: number;
}

/**
 * Has the agent already reached (or exceeded) its daily cap before a run starts?
 * When true the runtime records a 'skipped' run with reason 'cost cap' and does
 * not invoke the handler at all.
 */
export function capReached(budget: DailyBudget): boolean {
  if (budget.capUsd == null) return false;
  return budget.todaySpendUsd >= budget.capUsd;
}

/** Remaining USD budget for today (never negative). Infinity when no cap. */
export function remainingBudgetUsd(budget: DailyBudget): number {
  if (budget.capUsd == null) return Infinity;
  return Math.max(0, budget.capUsd - budget.todaySpendUsd);
}

/**
 * Mid-run abort test. Given the spend that existed BEFORE this run started and
 * the cost this run has accumulated so far, should the run stop now?
 *
 * Aborts once this run's accumulated cost strictly EXCEEDS the remaining daily
 * budget — i.e. prior spend + this run's cost > cap. Using strict `>` means a
 * run that lands exactly on the cap is allowed to finish; only genuine overrun
 * is cut off.
 */
export function shouldAbortMidRun(
  capUsd: number | null | undefined,
  todaySpendBeforeRunUsd: number,
  currentRunCostUsd: number,
): boolean {
  if (capUsd == null) return false;
  return todaySpendBeforeRunUsd + currentRunCostUsd > capUsd;
}

/** Sum today's cost from a set of run rows (nulls treated as 0). Exported for tests. */
export function sumTodaySpend(runs: Array<{ cost_usd: number | null }>): number {
  return runs.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
}
