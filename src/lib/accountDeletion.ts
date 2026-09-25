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

import {
  STRIPE_CANCEL_FAILED_MESSAGE,
  TRANSFER_FAILED_MESSAGE,
  type DeleteAccountPreflight,
  type PreflightHousehold,
} from "../../supabase/functions/_shared/accountDeletion";
import { REAUTH_REQUIRED_MESSAGE } from "../../supabase/functions/_shared/requireRecentAuth";

const MISSING_RELATION = /does not exist|could not find the table|schema cache/i;

export interface DeleteAccountResponse {
  success?: boolean;
  partialFailures?: Record<string, string> | null;
  /** Set on a refusal: 'reauth_required', 'transfer_failed', 'stripe_cancel_failed'. */
  code?: string;
  household?: DeleteAccountPreflight;
}

export type { DeleteAccountPreflight, PreflightHousehold };

/** What POST { mode: 'preflight' } answers. */
export interface DeleteAccountPreflightResponse {
  success?: boolean;
  mode?: "preflight";
  preflight?: DeleteAccountPreflight;
  /** Whether the current session's sign-in is recent enough to delete now. */
  recentAuth?: boolean;
}

/**
 * How the web app identifies itself to delete-account, so the server applies
 * the recent-sign-in rule to it (supabase/functions/_shared/requireRecentAuth.ts).
 * invokeEdgeFunction uses a plain fetch, so the global client's X-Client-Info
 * is not sent unless it is passed here. Same convention as AI_COACH_CLIENT_HEADERS.
 */
export const DELETE_ACCOUNT_CLIENT_HEADERS: Readonly<Record<"X-Client-Info", string>> = {
  "X-Client-Info": "eatpal-web/1",
};

export type DeleteRefusal = "reauth" | "stripe" | "transfer" | "other";

/**
 * Why delete-account refused, from the error invokeEdgeFunction returns. It
 * keeps only the server's `error` text, so the texts are shared with the
 * function rather than retyped here.
 */
export function deleteRefusalKind(error: { message?: string } | null | undefined): DeleteRefusal {
  const message = error?.message ?? "";
  if (message.includes(REAUTH_REQUIRED_MESSAGE)) return "reauth";
  if (message.includes(STRIPE_CANCEL_FAILED_MESSAGE)) return "stripe";
  if (message.includes(TRANSFER_FAILED_MESSAGE)) return "transfer";
  return "other";
}

/**
 * The co-parent a preflight household is left with, by name: the household
 * roster's label when that member is on it, then the profile name the server
 * sent, then null so the caller can fall back to a role label.
 */
export function successorLabel(
  household: Pick<PreflightHousehold, "successorUserId" | "successorName">,
  rosterName: (userId: string) => string | null | undefined
): string | null {
  const fromRoster = rosterName(household.successorUserId);
  if (fromRoster && fromRoster.trim()) return fromRoster.trim();
  if (household.successorName && household.successorName.trim()) return household.successorName.trim();
  return null;
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
