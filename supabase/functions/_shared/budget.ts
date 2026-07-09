/**
 * Agentic OS — pure budget-guardrail helpers (US-480)
 *
 * Dependency-free so they are shared by the Deno agent-runtime and the
 * Node/Vitest unit tests. A null/negative cap means "no cap" (unlimited).
 */

/** Sum cost_usd across a set of run rows, tolerating null/absent costs. */
export function sumCost(runs: Array<{ cost_usd?: number | null }>): number {
  return runs.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0);
}

/** True when a cap is set and today's spend already meets or exceeds it. */
export function isCostCapReached(
  todaySpendUsd: number,
  dailyCapUsd: number | null | undefined,
): boolean {
  if (dailyCapUsd == null || dailyCapUsd < 0) return false;
  return todaySpendUsd >= dailyCapUsd;
}

/** Remaining budget for today. Infinity when there is no cap. */
export function remainingBudget(
  todaySpendUsd: number,
  dailyCapUsd: number | null | undefined,
): number {
  if (dailyCapUsd == null || dailyCapUsd < 0) return Infinity;
  return Math.max(0, dailyCapUsd - todaySpendUsd);
}

/**
 * True when this run should abort mid-loop: the day's total (spend before the
 * run plus what this run has accrued) has passed the cap. Uses strict '>' so a
 * run that lands exactly on the cap is allowed to finish its current step.
 */
export function exceedsBudget(
  todaySpendBeforeRunUsd: number,
  accruedThisRunUsd: number,
  dailyCapUsd: number | null | undefined,
): boolean {
  if (dailyCapUsd == null || dailyCapUsd < 0) return false;
  return todaySpendBeforeRunUsd + accruedThisRunUsd > dailyCapUsd;
}
