/**
 * Household invite link helpers (US-337). Pure + testable so the web invite
 * (create code -> share link -> accept at /join) doesn't bake URL/parse logic
 * into components.
 *
 * Backend RPCs (migration 20260426000001):
 *   create_household_invite(p_role) -> TEXT code
 *   accept_household_invite(p_code) -> UUID household_id (raises on invalid/expired)
 */

export const JOIN_PATH = '/join';

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
 * The RPC RAISEs 'Invite code is invalid or expired' / 'Sign in required'.
 */
export function inviteErrorMessage(error: unknown): string {
  const msg = (error as { message?: string })?.message ?? '';
  if (/sign in/i.test(msg)) return 'Please sign in to accept this invite.';
  if (/invalid or expired/i.test(msg)) {
    return 'This invite link is invalid, expired, or already used.';
  }
  return 'Could not join the household. Please check the link and try again.';
}
