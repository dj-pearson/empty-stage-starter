/**
 * The pure parts of delete-account (owner decision 1a, 2026-09-25): which
 * request mode was asked for, which Stripe subscription the server cancels,
 * and the preflight answer the web dialog reads.
 *
 * No Deno globals, no network. Deno tests: accountDeletion.test.ts. Vitest
 * mirror: src/lib/accountDeletionShared.test.ts.
 */

export type DeleteAccountMode = 'delete' | 'preflight';

/**
 * Refusal messages. The web client's invokeEdgeFunction surfaces only the
 * `error` string, so the dialog tells the cases apart by these exact texts;
 * they are shared rather than retyped so the two cannot drift.
 */
export const TRANSFER_FAILED_MESSAGE =
  'Failed to hand household data to the remaining members; nothing was deleted';
export const STRIPE_CANCEL_FAILED_MESSAGE =
  'Failed to cancel your subscription, so your account was not deleted';

/**
 * The mode a request body asks for. Shipped iOS builds send `{}`; anything
 * that is not exactly `{ mode: 'preflight' }` is a real delete, as before.
 */
export function parseDeleteMode(body: unknown): DeleteAccountMode {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const mode = (body as { mode?: unknown }).mode;
    if (mode === 'preflight') return 'preflight';
  }
  return 'delete';
}

/** The user_subscriptions columns the cancel decision reads. */
export interface SubscriptionRowFacts {
  status: string | null;
  cancel_at_period_end: boolean | null;
  is_complementary: boolean | null;
  stripe_subscription_id: string | null;
}

const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete']);

/**
 * The Stripe subscription id to cancel before the account goes, or null.
 *
 * Skipped: no row, a complimentary plan, one already ending, and anything that
 * is not a Stripe id (an App Store purchase lives in apple_subscriptions and
 * is cancelled by the user in iOS Settings, not by us).
 */
export function stripeSubscriptionToCancel(row: SubscriptionRowFacts | null | undefined): string | null {
  if (!row) return null;
  if (row.is_complementary) return null;
  if (row.cancel_at_period_end) return null;
  if (!row.status || !LIVE_STATUSES.has(row.status)) return null;
  const id = row.stripe_subscription_id;
  if (!id || !id.startsWith('sub_')) return null;
  return id;
}

/** One household the leaving user shares, as transfer_user_household_data reports it. */
export interface PreflightHousehold {
  householdId: string;
  householdName: string | null;
  successorUserId: string;
  successorName: string | null;
  successorRole: string | null;
  remainingMembers: number;
  kidNames: string[];
}

export interface DeleteAccountPreflight {
  soleMember: boolean;
  households: PreflightHousehold[];
  /** Rows per table that move to a successor. */
  transferred: Record<string, number>;
  /** Rows per table still the user's, deleted with the account. */
  deleted: Record<string, number>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function counts(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(asRecord(value))) {
    const num = typeof n === 'number' ? n : Number(n);
    if (Number.isFinite(num)) out[key] = num;
  }
  return out;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The RPC's jsonb summary, reshaped for the client. Tolerates a malformed value. */
export function toPreflight(summary: unknown): DeleteAccountPreflight {
  const s = asRecord(summary);
  const households: PreflightHousehold[] = [];
  if (Array.isArray(s.households)) {
    for (const raw of s.households) {
      const h = asRecord(raw);
      const successorUserId = stringOrNull(h.successor_user_id);
      const householdId = stringOrNull(h.household_id);
      if (!successorUserId || !householdId) continue;
      households.push({
        householdId,
        householdName: stringOrNull(h.household_name),
        successorUserId,
        successorName: stringOrNull(h.successor_name),
        successorRole: stringOrNull(h.successor_role),
        remainingMembers: typeof h.remaining_members === 'number' ? h.remaining_members : 0,
        kidNames: Array.isArray(h.kid_names)
          ? h.kid_names.filter((n): n is string => typeof n === 'string' && n.length > 0)
          : [],
      });
    }
  }
  return {
    soleMember: households.length === 0,
    households,
    transferred: counts(s.transferred),
    deleted: counts(s.left_for_deletion),
  };
}
