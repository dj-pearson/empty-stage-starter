/**
 * Pure logic for the win-back re-engagement agent (US-500).
 *
 * The frequency cap and the "became active" exit signal are DB-free so they are
 * unit-testable.
 */

/** Max one win-back campaign per household per this many days. */
export const WINBACK_FREQUENCY_DAYS = 30;

/**
 * Is a household inside the win-back cooldown? True when a win-back email was
 * sent within WINBACK_FREQUENCY_DAYS — a new win-back enrollment is blocked so
 * lapsed users are not re-contacted more than once a month.
 */
export function winbackFrequencyBlocked(
  lastWinbackAtIso: string | null,
  now: Date,
  days: number = WINBACK_FREQUENCY_DAYS,
): boolean {
  if (!lastWinbackAtIso) return false;
  const ageDays = (now.getTime() - new Date(lastWinbackAtIso).getTime()) / 86_400_000;
  return ageDays < days;
}

/**
 * The sentinel exit event the win-back sequence uses. The engine injects this
 * into a household's recent-event list when the household has become active
 * since enrollment, so the sequence exits (decideStepAction returns 'exit').
 */
export const REACTIVATED_EVENT = 'reactivated';

/** Did the household act (plan/grocery/food) after `enrolledAtIso`? */
export function becameActiveSince(
  enrolledAtIso: string,
  activityTimestamps: Array<string | null>,
): boolean {
  const enrolledMs = new Date(enrolledAtIso).getTime();
  return activityTimestamps.some((t) => t != null && new Date(t).getTime() > enrolledMs);
}
