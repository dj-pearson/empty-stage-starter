/**
 * Household invite link helpers (US-337). Pure + testable so the web invite
 * (create code -> share link -> accept at /join) doesn't bake URL/parse logic
 * into components.
 *
 * Backend RPCs (migration 20260426000001):
 *   create_household_invite(p_role) -> TEXT code
 *   accept_household_invite(p_code) -> UUID household_id (raises on invalid/expired)
 */

import { OFFLINE_MESSAGE, isOfflineFailure } from '@/lib/networkFailure';

export const JOIN_PATH = '/join';

/** The generic accept failure. Kept exported so tests and the page agree. */
export const JOIN_FAILED_MESSAGE =
  'Could not join the household. Please check the link and try again.';

/**
 * US-840: accept_household_invite refuses once the household has used every
 * seat its plan allows. The joiner cannot upgrade someone else's plan, so the
 * message tells them who can, and that the same link still works afterwards.
 */
export const HOUSEHOLD_FULL_MESSAGE =
  'This household is full on its current plan. Ask the person who invited you to upgrade, then use the same link again.';

/** Build the shareable accept URL for an invite code. */
export function buildInviteLink(code: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}${JOIN_PATH}?code=${encodeURIComponent(code.trim().toUpperCase())}`;
}

/** Extract + normalize the `code` query param from a location.search string. */
export function parseInviteCode(search: string): string | null {
  const params = new URLSearchParams(search);
  const raw = params.get('code');
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return code.length > 0 ? code : null;
}

/**
 * Map an accept_household_invite error to a friendly, user-facing message.
 * The RPC RAISEs 'Invite code is invalid or expired' / 'Sign in required', and
 * (US-840) '... is full ...' when the household has no seat left.
 *
 * The first two strings are compared byte-for-byte with the Swift client by
 * inviteLinkParity.test.ts; change them there too or not at all.
 *
 * Anything else is either offline (said so, because "check the link" is the
 * wrong advice when the link is fine and the phone has no signal) or the
 * generic text. An unrecognised server message is not passed through: this
 * screen is the joiner's only view of the failure, and RPC text such as a
 * constraint name tells them nothing they can act on.
 */
export function inviteErrorMessage(error: unknown): string {
  const msg = (error as { message?: string })?.message ?? '';
  if (/sign in/i.test(msg)) return 'Please sign in to accept this invite.';
  if (/invalid or expired/i.test(msg)) {
    return 'This invite link is invalid, expired, or already used.';
  }
  if (/is full/i.test(msg)) return HOUSEHOLD_FULL_MESSAGE;
  if (isOfflineFailure(error)) return OFFLINE_MESSAGE;
  return JOIN_FAILED_MESSAGE;
}
