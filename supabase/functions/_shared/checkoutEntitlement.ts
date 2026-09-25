/**
 * Who create-checkout refuses: the server half of the double-billing guard.
 *
 * Pricing.tsx already asks resolveCheckoutSource() before it calls
 * create-checkout, but that is a client check. A second tab, a stale page, an
 * App Store purchase made on the phone a minute ago, or any caller that is not
 * Pricing.tsx reaches Stripe without it, and Stripe will happily open a second
 * subscription for a customer that already has one. This is the same decision,
 * made where it cannot be skipped.
 *
 * The rules mirror src/lib/checkoutSource.ts so the two cannot disagree about
 * what "already subscribed" means:
 *   - an App Store row that is active and not expired (effective_plan_id's
 *     App Store arm);
 *   - a user_subscriptions row that is active or trialing: complimentary when
 *     it is flagged so, Stripe when it carries a Stripe subscription id;
 *   - a past_due row with a Stripe subscription id, which is still a live
 *     subscription that bills again once the card is fixed;
 *   - otherwise a paid plan from effective_plan_id with no row above to
 *     explain it, which is an admin comp (complementary_subscriptions).
 *
 * Pure: no network, no Deno APIs, so the vitest mirror imports it directly.
 */

export const ALREADY_SUBSCRIBED_CODE = 'already_subscribed';
export const ENTITLEMENT_UNVERIFIED_CODE = 'entitlement_unverified';

export type EntitlementSource = 'stripe' | 'appStore' | 'comp';

export interface StripeRowFacts {
  status: string | null;
  stripe_subscription_id: string | null;
  is_complementary?: boolean | null;
}

export interface AppleRowFacts {
  status: string | null;
  expires_at: string | null;
}

export interface EntitlementFacts {
  /** The caller's user_subscriptions row, or null when there is none. */
  stripe: StripeRowFacts | null;
  /** The caller's apple_subscriptions rows. */
  apple: AppleRowFacts[];
  /** subscription_plans.name for effective_plan_id(user), or null. */
  effectivePlanName: string | null;
}

export type EntitlementLookup = { ok: true; facts: EntitlementFacts } | { ok: false };

export type CheckoutGate =
  | { allow: true }
  | { allow: false; status: 409; code: typeof ALREADY_SUBSCRIBED_CODE; source: EntitlementSource; message: string }
  | { allow: false; status: 503; code: typeof ENTITLEMENT_UNVERIFIED_CODE; message: string };

const ENTITLING_STRIPE = new Set(['active', 'trialing']);

const isFreeName = (name: string | null | undefined): boolean =>
  !name || name.trim().toLowerCase() === 'free';

/** effective_plan_id's App Store arm: active, and not expired (NULL = no end). */
export function isActiveAppleRow(row: AppleRowFacts, now: Date): boolean {
  if (row.status !== 'active') return false;
  if (row.expires_at === null) return true;
  const t = new Date(row.expires_at).getTime();
  return !Number.isNaN(t) && t > now.getTime();
}

/** Which entitlement the caller already holds, or null for none. */
export function entitlementSource(facts: EntitlementFacts, now: Date = new Date()): EntitlementSource | null {
  if (facts.apple.some((row) => isActiveAppleRow(row, now))) return 'appStore';

  const row = facts.stripe;
  if (row && row.status && ENTITLING_STRIPE.has(row.status)) {
    if (row.is_complementary) return 'comp';
    if (row.stripe_subscription_id) return 'stripe';
  }
  if (row?.status === 'past_due' && row.stripe_subscription_id) return 'stripe';

  return isFreeName(facts.effectivePlanName) ? null : 'comp';
}

/**
 * Whether create-checkout may open a session.
 *
 * A failed lookup refuses (503) rather than allowing: the cost of a wrong
 * "allow" is a parent billed twice, the cost of a wrong "refuse" is a retry.
 * The client makes the same call ("unknown" refuses) for the same reason.
 */
export function decideCheckoutGate(lookup: EntitlementLookup, now: Date = new Date()): CheckoutGate {
  if (!lookup.ok) {
    return {
      allow: false,
      status: 503,
      code: ENTITLEMENT_UNVERIFIED_CODE,
      message: 'Could not verify your current plan',
    };
  }
  const source = entitlementSource(lookup.facts, now);
  if (source === null) return { allow: true };
  return {
    allow: false,
    status: 409,
    code: ALREADY_SUBSCRIBED_CODE,
    source,
    message: 'You already have an active subscription',
  };
}
