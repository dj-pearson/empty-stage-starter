/**
 * Pure helpers for support ticket intake (US-489).
 *
 * Zod boundary validation lives in the edge function; these are the small,
 * dependency-free pieces (reference formatting, the rate-limit decision, and
 * the window start) so they can be unit-tested without Deno/network.
 */

/** Max anonymous/self intake tickets allowed per email within the window. */
export const INTAKE_MAX_PER_WINDOW = 5;
/** Rate-limit window length in minutes. */
export const INTAKE_WINDOW_MINUTES = 60;

/** Human-facing ticket reference derived from the ticket id (e.g. "T-3F2504E0"). */
export function ticketReference(id: string): string {
  return `T-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/** Start of the rate-limit window as an ISO timestamp. */
export function rateLimitWindowStart(now: Date, minutes: number = INTAKE_WINDOW_MINUTES): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

/** True when the recent count meets/exceeds the cap (submission should be blocked). */
export function isRateLimited(recentCount: number, max: number = INTAKE_MAX_PER_WINDOW): boolean {
  return recentCount >= max;
}
