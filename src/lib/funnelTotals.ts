import { ACTIVATION_EVENT_TYPES } from '@/lib/conversion-tracking';

/**
 * Turning funnel_events rows into the numbers a funnel chart can show (US-707).
 *
 * Pure, and in its own file, because the two halves of this table have to be
 * counted DIFFERENTLY and that is the part worth pinning with a test:
 *
 *  - ACQUISITION (landing_view ... paid_conversion) is one row per visit, most
 *    of it fired before there is a user to attribute it to. Adding the rows up
 *    is the number you want.
 *  - ACTIVATION (US-707: onboarding_start ... meal_planned) asks whether an
 *    ACCOUNT was ever used. Counting rows there would report a household that
 *    added forty foods as forty activations, and a funnel step that exceeds the
 *    step above it is a chart nobody trusts twice. So: distinct user_id.
 *
 * src/lib/activationFunnel.ts also fires each activation event at most once per
 * user per device, but that marker lives in localStorage and cannot be relied
 * on -- a parent who adds their first food on a phone and again on a laptop
 * writes two rows. Counting distinct users makes the figure right regardless,
 * which is why the same rule is in the SQL view
 * (20260918000005_funnel_activation_events.sql) and here.
 */

export interface FunnelEventRow {
  event_type: string;
  user_id?: string | null;
}

export interface FunnelEventTotals {
  pageViews: number;
  quizStarts: number;
  quizCompletes: number;
  emailCaptures: number;
  signups: number;
  trialStarts: number;
  paidConversions: number;
  onboardingStarts: number;
  onboardingCompletes: number;
  onboardingSkips: number;
  childrenCreated: number;
  foodsAdded: number;
  mealsPlanned: number;
}

const ACTIVATION = new Set<string>(ACTIVATION_EVENT_TYPES);

/** Rows of one type, counted the way that type should be counted. */
function count(rows: readonly FunnelEventRow[], eventType: string): number {
  const matching = rows.filter((r) => r.event_type === eventType);
  if (!ACTIVATION.has(eventType)) return matching.length;

  // An activation row with no user cannot be attributed to an account, so it
  // cannot be part of a per-account count. Dropping it is right, and it should
  // not happen: these all fire behind the login.
  const users = new Set(matching.map((r) => r.user_id).filter((id): id is string => Boolean(id)));
  return users.size;
}

export function totalsFromFunnelEvents(rows: readonly FunnelEventRow[]): FunnelEventTotals {
  return {
    pageViews: count(rows, 'landing_view'),
    quizStarts: count(rows, 'quiz_start'),
    quizCompletes: count(rows, 'quiz_complete'),
    emailCaptures: count(rows, 'email_capture'),
    signups: count(rows, 'signup'),
    trialStarts: count(rows, 'trial_start'),
    paidConversions: count(rows, 'paid_conversion'),
    onboardingStarts: count(rows, 'onboarding_start'),
    onboardingCompletes: count(rows, 'onboarding_complete'),
    onboardingSkips: count(rows, 'onboarding_skip'),
    childrenCreated: count(rows, 'child_created'),
    foodsAdded: count(rows, 'food_added'),
    mealsPlanned: count(rows, 'meal_planned'),
  };
}
