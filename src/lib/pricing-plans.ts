/**
 * Plan prices, in one place, matching Stripe.
 *
 * They were stated in eleven places and did not agree. Stripe charges $14.99 for Pro
 * and $24.99 for Family Plus (every export in scripts/stripe-ids-*.json agrees, and
 * UpgradeDialog.tsx matched them). The homepage pricing cards, the pricing page copy,
 * the FAQ, seo-config, the SoftwareApplication schema, llms.txt and llms-full.txt all
 * said $9.99 and $19.99.
 *
 * So the public marketing site advertised a number roughly a third below what checkout
 * actually charges, the structured data handed Google the wrong price, and llms.txt
 * told every AI crawler the wrong price in the file specifically written for them.
 *
 * Rules:
 *
 * 1. Stripe is the source of truth. If a price changes there, it changes here, and
 *    nowhere else in the repo may state a price as a literal.
 * 2. The monthly figure is the monthly-billing price, not an annual-equivalent. A page
 *    that shows the annual-equivalent number next to the word "month" without saying
 *    "billed annually" is the trick that got us here.
 * 3. src/lib/pricing-plans.test.ts fails the build if a stale price string appears in
 *    shipped copy, including public/llms.txt and public/llms-full.txt, which no test
 *    covered before.
 *
 * The subscription_plans table in Supabase drives the interactive cards on /pricing and
 * is NOT covered by any of this. It has to be checked separately, and it is the one
 * place a wrong price becomes a wrong charge.
 */

export interface PricingPlan {
  /** Stable key, also the name shown to users. */
  name: string;
  /** Monthly-billing price in USD. */
  monthly: number;
  /** Annual-billing total in USD, or null when the plan has no annual option. */
  yearly: number | null;
  /** One line for schema and for the AI-facing files. */
  summary: string;
}

/** Sourced from scripts/stripe-ids-*.json; every export agrees. */
export const PRICING_PLANS: Readonly<Record<string, PricingPlan>> = Object.freeze({
  free: {
    name: 'Free',
    monthly: 0,
    yearly: null,
    summary: 'One child, basic meal planning, limited food library',
  },
  pro: {
    name: 'Pro',
    monthly: 14.99,
    yearly: 143.9,
    summary: 'Unlimited children, AI food chaining, full food chains, grocery lists',
  },
  familyPlus: {
    name: 'Family Plus',
    monthly: 24.99,
    yearly: 239.9,
    summary: 'Advanced nutrition tracking, progress reports, multi-household support',
  },
  professional: {
    name: 'Professional',
    monthly: 99,
    yearly: 950,
    summary: 'Therapist portal, multi-client management, insurance-compatible documentation',
  },
});

/** "14.99" — the string form schema.org offers expect. */
export function priceString(plan: keyof typeof PRICING_PLANS): string {
  return PRICING_PLANS[plan].monthly.toFixed(2);
}

/** "$14.99" for display. */
export function priceLabel(plan: keyof typeof PRICING_PLANS): string {
  const { monthly } = PRICING_PLANS[plan];
  return monthly === 0 ? 'Free' : `$${monthly.toFixed(2)}`;
}

/** The lowest and highest monthly prices, for priceRange fields. */
export const PRICE_RANGE = `Free - $${PRICING_PLANS.professional.monthly.toFixed(2)}/month`;
