/**
 * US-630: the disclosure that has to sit next to a "Start Free Trial" button.
 *
 * A trial that converts to a paid subscription is a negative-option offer. The
 * FTC's rule and ROSCA both want the material terms next to the consent point,
 * not buried in Terms: what is charged, when the first charge lands, and how to
 * get out. This builds that sentence from the same plan data checkout uses, so
 * the promise on the page and the session Stripe creates cannot disagree.
 */

/**
 * The trial length used by marketing pages that render hardcoded pricing and do
 * not fetch subscription_plans (Landing). The database is the source of truth -
 * create-checkout reads subscription_plans.trial_period_days and that is what
 * Stripe actually applies. This constant only exists so static copy can state a
 * number; trialDisclosure.test.ts fails if it stops matching the value the
 * migration seeds, so the two cannot drift silently.
 */
export const MARKETING_TRIAL_DAYS = 7;

export interface TrialTerms {
  /** Trial length in days. NULL/0/undefined means the plan has no trial. */
  trialPeriodDays?: number | null;
  /** Amount charged when the trial ends. */
  price: number;
  /** Billing cadence the price is quoted at. */
  billingCycle: 'monthly' | 'yearly';
}

export function hasTrial(terms: Pick<TrialTerms, 'trialPeriodDays'>): boolean {
  const days = Number(terms.trialPeriodDays);
  return Number.isFinite(days) && days > 0;
}

/** "7 days free" - the promise, for use on or beside the button. */
export function formatTrialLength(trialPeriodDays?: number | null): string | null {
  const days = Number(trialPeriodDays);
  if (!Number.isFinite(days) || days <= 0) return null;
  return days === 1 ? '1 day free' : `${days} days free`;
}

/**
 * The full disclosure. Returns null when the plan has no trial, so callers can
 * render nothing rather than an empty element.
 */
export function formatTrialDisclosure(terms: TrialTerms): string | null {
  if (!hasTrial(terms)) return null;

  const days = Math.floor(Number(terms.trialPeriodDays));
  const amount = `$${terms.price.toFixed(2)}`;
  const cadence = terms.billingCycle === 'yearly' ? 'year' : 'month';
  const dayLabel = days === 1 ? 'day' : 'days';

  return (
    `Free for ${days} ${dayLabel}, then ${amount} per ${cadence}. ` +
    `We'll email you before the first charge. ` +
    `Cancel any time from Account Settings and you won't be billed.`
  );
}

/**
 * The date the first charge lands, for a trial started now. Kept separate from
 * the copy so a caller can render it in the user's locale.
 */
export function firstChargeDate(trialPeriodDays: number, from: Date): Date {
  const date = new Date(from.getTime());
  date.setDate(date.getDate() + Math.floor(trialPeriodDays));
  return date;
}
