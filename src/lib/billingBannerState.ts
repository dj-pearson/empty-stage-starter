/**
 * The plan the /dashboard billing row describes, from the Stripe row plus
 * current_user_plan_name(). Kept out of the component so it can be tested
 * without rendering.
 */

export const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

export type SubStatus = "trialing" | "active" | "canceled" | "past_due" | null;

export interface BannerSubscription {
  planName: string;
  planId: string | null;
  status: SubStatus;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Where the plan is billed: Stripe (manage in-app) or the App Store. */
  source: "stripe" | "app_store" | "free";
}

export interface StripeSubscriptionRow {
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  trial_end: string | null;
  plan: { id: string; name: string } | { id: string; name: string }[] | null;
}

const isFreeName = (name: string | null | undefined) => !name || name.trim().toLowerCase() === "free";

/**
 * Combine the Stripe row with the effective plan name from
 * current_user_plan_name(), which also sees App Store and complementary
 * plans.
 */
export function resolveSubscription(row: StripeSubscriptionRow | null, effectivePlanName: string | null): BannerSubscription {
  const plan = Array.isArray(row?.plan) ? row?.plan[0] : row?.plan;
  if (row && plan) {
    const status = (row.status as SubStatus) ?? null;
    return {
      planName: plan.name,
      planId: plan.id,
      status,
      // A trialing Stripe row keeps its trial end in current_period_end.
      trialEnd: status === "trialing" ? (row.current_period_end ?? row.trial_end) : row.trial_end,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
      source: "stripe",
    };
  }
  if (!isFreeName(effectivePlanName)) {
    return {
      planName: effectivePlanName as string,
      planId: null,
      status: "active",
      trialEnd: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      source: "app_store",
    };
  }
  return {
    planName: effectivePlanName ?? "Free",
    planId: null,
    status: null,
    trialEnd: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    source: "free",
  };
}
