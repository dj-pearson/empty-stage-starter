/**
 * What the delete-account response means for the person who asked (settings
 * pass B). Pure, so DeleteAccountDialog.test.tsx and the dialog agree.
 *
 * The edge function deletes the auth user and reports every table it could
 * not scrub in `partialFailures`. Some of those are tables that do not exist
 * in this environment (meal_voting is on the list and is not a table): there
 * was nothing to delete, so they do not make the deletion incomplete. Anything
 * else does, and the dialog says so instead of a bare "deleted".
 */

const MISSING_RELATION = /does not exist|could not find the table|schema cache/i;

export interface DeleteAccountResponse {
  success?: boolean;
  partialFailures?: Record<string, string> | null;
}

/** The failure keys that mean data may have been left behind. */
export function meaningfulDeleteFailures(response: DeleteAccountResponse | null | undefined): string[] {
  const failures = response?.partialFailures;
  if (!failures || typeof failures !== "object") return [];
  return Object.entries(failures)
    .filter(([, message]) => !(typeof message === "string" && MISSING_RELATION.test(message)))
    .map(([key]) => key);
}

export interface SubscriptionFacts {
  status: string | null | undefined;
  cancelAtPeriodEnd: boolean;
  isComplementary: boolean;
  stripeSubscriptionId: string | null | undefined;
}

/**
 * Only a live, billed Stripe subscription that is not already ending needs a
 * cancel call before the account goes. A complimentary plan, a free account or
 * one already set to cancel has nothing for Stripe to stop.
 */
export function needsStripeCancel(sub: SubscriptionFacts | null | undefined): boolean {
  if (!sub) return false;
  const live = sub.status === "active" || sub.status === "trialing" || sub.status === "past_due";
  return live && !sub.cancelAtPeriodEnd && !sub.isComplementary && Boolean(sub.stripeSubscriptionId);
}

/** The word typed to confirm. Compared trimmed and case-insensitively in the user's locale. */
export function confirmWordMatches(typed: string, word: string, locale?: string): boolean {
  const a = typed.trim().toLocaleLowerCase(locale);
  const b = word.trim().toLocaleLowerCase(locale);
  return a.length > 0 && a === b;
}
