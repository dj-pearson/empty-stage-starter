/**
 * Which plan EatPal enforces for this account, and who bills it.
 *
 * Pure, so Billing, Pricing, the upgrade prompts and the tests all resolve the
 * same way. The plan of record is get_usage_stats (plan.name,
 * plan.is_complementary), which resolves through the server's
 * effective_plan_id: Stripe, an admin comp and the App Store, most generous
 * wins. The Stripe row and the App Store row only say who bills it and which
 * controls are honest to offer; neither is ever shown as the plan on its own
 * say-so.
 */
import type { Subscription } from "@/hooks/useSubscription";
import type { UsageErrorCode, UsageStats } from "@/hooks/useUsageStats";
import { APPLE_SUBSCRIPTIONS_URL } from "@/lib/billingBannerState";

export type PlanStatus =
  | { kind: "loading" }
  | { kind: "error"; offline: boolean }
  | { kind: "free"; endedPlan?: { name: string; endedAt: string | null } }
  | { kind: "stripe"; planName: string; sub: Subscription; mismatch?: { enforcedPlan: string } }
  | { kind: "appStore"; planName: string; expiresAt: string | null; strayStripe?: Subscription }
  | { kind: "comp"; planName: string; endDate: string | null };

export type PlanKind = PlanStatus["kind"];

/** The caller's own apple_subscriptions row (RLS: auth.uid() = user_id). */
export interface AppleSubscriptionRow {
  id: string;
  status: string;
  expires_at: string | null;
  product_id: string | null;
}

/** The caller's own active complementary_subscriptions row, for its end date. */
export interface CompRow {
  end_date: string | null;
}

export interface ResolvePlanInput {
  stats: UsageStats | null;
  subscription: Subscription | null;
  appleRow: AppleSubscriptionRow | null;
  compRow?: CompRow | null;
  subError: Error | null;
  usageError: UsageErrorCode | null;
  appleError?: Error | null;
  /** True until every source has answered at least once. */
  loading?: boolean;
  online: boolean;
  now?: Date;
}

const ENTITLING_STRIPE = new Set(["active", "trialing"]);
const ENDED_STRIPE = new Set(["canceled", "incomplete_expired"]);

const isFreeName = (name: string) => name.trim().toLowerCase() === "free";

function isActiveStripe(sub: Subscription | null): boolean {
  return !!sub && ENTITLING_STRIPE.has(sub.status) && !!sub.stripe_subscription_id;
}

/** Mirrors effective_plan_id's App Store arm: active and not yet expired. */
export function isActiveApple(row: AppleSubscriptionRow | null, now: Date = new Date()): row is AppleSubscriptionRow {
  if (!row || row.status !== "active") return false;
  if (row.expires_at === null) return true;
  const t = new Date(row.expires_at).getTime();
  return !Number.isNaN(t) && t > now.getTime();
}

export function resolvePlanStatus(input: ResolvePlanInput): PlanStatus {
  const { stats, subscription, appleRow, compRow, subError, usageError, appleError, online } = input;
  const now = input.now ?? new Date();

  // A source that failed and has nothing cached cannot be guessed around.
  // Reading it as Free would tell a paying parent they have no plan and offer
  // them a second checkout.
  if ((subError && !subscription) || (usageError && !stats) || (appleError && !appleRow)) {
    return { kind: "error", offline: !online };
  }
  if (!stats) {
    return input.loading === false ? { kind: "error", offline: !online } : { kind: "loading" };
  }

  const enforced = stats.plan.name;

  if (stats.plan.is_complementary) {
    const endDate =
      compRow?.end_date ??
      (subscription?.is_complementary ? subscription.current_period_end : null) ??
      null;
    return { kind: "comp", planName: enforced, endDate };
  }

  if (isActiveApple(appleRow, now)) {
    const stray = subscription && isActiveStripe(subscription) ? subscription : undefined;
    return {
      kind: "appStore",
      planName: enforced,
      expiresAt: appleRow.expires_at,
      ...(stray ? { strayStripe: stray } : {}),
    };
  }

  if (subscription && isActiveStripe(subscription)) {
    return {
      kind: "stripe",
      planName: subscription.plan_name,
      sub: subscription,
      ...(subscription.plan_name !== enforced ? { mismatch: { enforcedPlan: enforced } } : {}),
    };
  }

  // past_due keeps the Stripe controls (update the card) but not the plan:
  // effective_plan_id ignores a past_due row, so name what is enforced.
  if (subscription && subscription.status === "past_due") {
    return { kind: "stripe", planName: enforced, sub: subscription };
  }

  // The server enforces a paid plan that none of the rows we can read explains
  // (a replication lag, an App Store row this build cannot see). Showing Free
  // would name a plan the server does not enforce and invite a second
  // checkout, so this is an error state until a refetch explains it.
  if (!isFreeName(enforced)) {
    return { kind: "error", offline: !online };
  }

  if (subscription && ENDED_STRIPE.has(subscription.status)) {
    return {
      kind: "free",
      endedPlan: { name: subscription.plan_name, endedAt: subscription.current_period_end },
    };
  }

  return { kind: "free" };
}

export type UpgradeTarget =
  | { type: "pricing" }
  | { type: "portal" }
  | { type: "appStore"; href: string }
  | { type: "support" };

/**
 * Where "upgrade" honestly goes for each source. Only a free (or not yet
 * known) account is sent to /pricing checkout; Pricing re-resolves the source
 * itself before it calls create-checkout, so 'loading' and 'error' are safe
 * there.
 */
export function upgradeTargetFor(kind: PlanKind): UpgradeTarget {
  switch (kind) {
    case "stripe":
      return { type: "portal" };
    case "appStore":
      return { type: "appStore", href: APPLE_SUBSCRIPTIONS_URL };
    case "comp":
      return { type: "support" };
    case "free":
    case "loading":
    case "error":
    default:
      return { type: "pricing" };
  }
}
