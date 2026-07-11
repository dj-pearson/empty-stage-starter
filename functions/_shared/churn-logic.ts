/**
 * Pure logic for the churn-risk scoring agent (US-497).
 *
 * Free of DB/LLM so the activity-feature computation and the "crossed into high
 * risk" decision are unit-testable.
 */

export type ChurnRisk = 'low' | 'medium' | 'high';

export interface FeatureInputs {
  lastPlanAt: string | null;
  lastGroceryAt: string | null;
  subscriptionStatus: string | null;
  kidsCount: number;
  signupAt: string | null;
}

export interface ChurnFeatures {
  daysSinceLastPlan: number | null;
  daysSinceLastGrocery: number | null;
  daysSinceAnyActivity: number | null;
  hasActiveSubscription: boolean;
  subscriptionStatus: string | null;
  kidsCount: number;
  daysSinceSignup: number | null;
}

const ACTIVE_SUB = new Set(['active', 'trialing', 'past_due']);

function daysBetween(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/** Compute the activity features fed to the model. */
export function computeFeatures(inputs: FeatureInputs, now: Date): ChurnFeatures {
  const lastActivity = maxIso(inputs.lastPlanAt, inputs.lastGroceryAt);
  return {
    daysSinceLastPlan: daysBetween(inputs.lastPlanAt, now),
    daysSinceLastGrocery: daysBetween(inputs.lastGroceryAt, now),
    daysSinceAnyActivity: daysBetween(lastActivity, now),
    hasActiveSubscription: inputs.subscriptionStatus ? ACTIVE_SUB.has(inputs.subscriptionStatus) : false,
    subscriptionStatus: inputs.subscriptionStatus,
    kidsCount: inputs.kidsCount,
    daysSinceSignup: daysBetween(inputs.signupAt, now),
  };
}

/**
 * Did the household newly cross into 'high' risk this run?
 * True only when the new risk is 'high' and the previous risk was not.
 */
export function crossedIntoHigh(prevRisk: ChurnRisk | null, newRisk: ChurnRisk): boolean {
  return newRisk === 'high' && prevRisk !== 'high';
}

/** Clamp a model score into the 0..100 integer range. */
export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}
