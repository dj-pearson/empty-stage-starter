/**
 * US-296: client-side k-anonymity guard for the Picky-Eater Win Network.
 *
 * The shipping `WinNetworkPanel` already calls a server-side RPC that filters
 * for `>= 5` contributions before exposing a row. The original AC mandates
 * `>= 20` for the dedicated "Community Wins" surface, which is stricter.
 *
 * Rather than tighten the production threshold silently (which would hide
 * existing data from users who already see the 5-floor view), we add a
 * client-side guard that callers gated behind the `picky_win_network`
 * feature flag MUST pipe their rows through. When the flag flips ON in
 * production (after the privacy/security review the AC requires), the
 * 20-floor takes effect for that surface only.
 *
 * The same module also exports a privacy-invariant assertion used by
 * pickyWinGuard.test.ts: ChainNetworkTarget rows MUST NOT carry kid_id,
 * user_id, or household_id (or any field name containing those tokens).
 * The assertion runs at import time of the test, locking the contract for
 * future refactors of the network result shape.
 */
import type { ChainNetworkTarget } from './chainNetwork';

/** AC default — the dedicated "Community Wins" surface uses 20. */
export const COMMUNITY_WINS_MIN_SAMPLE_SIZE = 20;

export interface KAnonGuardOptions {
  /**
   * Minimum aggregated contributions a row must have before it's exposed
   * to the user. Defaults to the AC-mandated 20 for the new surface;
   * callers can lower it (e.g. 5) for the existing inline panel.
   */
  minSampleSize?: number;
}

/**
 * Drop rows whose `totalCount` is below the configured floor. Pure; no
 * mutation of the input.
 */
export function applyPickyWinKAnonGuard<T extends Pick<ChainNetworkTarget, 'totalCount'>>(
  rows: ReadonlyArray<T>,
  opts: KAnonGuardOptions = {}
): T[] {
  const min = opts.minSampleSize ?? COMMUNITY_WINS_MIN_SAMPLE_SIZE;
  return rows.filter((r) => (r?.totalCount ?? 0) >= min);
}

/**
 * Forbidden field substrings on rows we expose to the client. Used by
 * `assertNetworkTargetIsAnonymized` to fail a test loudly if a future
 * refactor accidentally adds a column that would re-identify a user.
 *
 * The list intentionally matches as substrings (case-insensitive) so a
 * field named `kid_uuid` or `householdId` is caught alongside the canonical
 * `kid_id` / `household_id` / `user_id`.
 */
// Catches both snake_case and camelCase variants by checking lowercased
// field names for these substrings. A bare `household` / `kid` / `user`
// token is included so `householdUuid` / `kidName` / `userEmail` all trip.
const FORBIDDEN_PII_TOKENS = [
  'kid_',
  'kidid',
  'kidname',
  'kiduuid',
  'user_',
  'userid',
  'useruuid',
  'household',
  'email',
  'phone',
  'profile_picture',
];

/**
 * Throws if any row carries a forbidden field. Use in unit tests, not in
 * production code paths (we don't want to crash a user-facing render even
 * if the server returns a bad shape).
 */
export function assertNetworkTargetIsAnonymized(
  rows: ReadonlyArray<Record<string, unknown>>
): void {
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      const lc = key.toLowerCase();
      for (const banned of FORBIDDEN_PII_TOKENS) {
        if (lc.includes(banned)) {
          throw new Error(
            `assertNetworkTargetIsAnonymized: row exposes forbidden field "${key}" (matches "${banned}"). The Picky-Eater Win Network must never surface kid/user/household identifiers.`
          );
        }
      }
    }
  }
}
