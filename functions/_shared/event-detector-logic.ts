/**
 * Pure decision logic for the lifecycle event detector (US-496).
 *
 * Free of DB/network so the once-only and inactivity (re-arm) decisions are
 * unit-testable over sample rows.
 */

/** Events that fire at most once per household (backed by a partial unique index). */
export const ONCE_ONLY_EVENTS = new Set([
  'signup',
  'first_kid_added',
  'first_plan_created',
  'first_grocery_list',
  'subscription_started',
  'subscription_canceled',
]);

/** Inactivity milestones (re-armable — fire once per inactivity streak). */
export const INACTIVITY_THRESHOLDS = [
  { event_type: 'inactive_7d', days: 7 },
  { event_type: 'inactive_14d', days: 14 },
  { event_type: 'inactive_30d', days: 30 },
] as const;

export interface PriorEvent {
  event_type: string;
  created_at: string;
}

export function daysSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000;
}

/** Once-only candidate types not already recorded for the household. */
export function missingOnceEvents(candidates: string[], existing: Set<string>): string[] {
  return candidates.filter((c) => ONCE_ONLY_EVENTS.has(c) && !existing.has(c));
}

/**
 * Which inactivity events to emit now.
 *
 * A threshold fires when the user has been inactive at least that many days AND
 * it has not already fired SINCE the user was last active — so the milestone
 * re-arms after the user returns and lapses again (a prior event recorded before
 * lastActive does not suppress a fresh one).
 */
export function inactivityEventsToEmit(
  lastActiveIso: string,
  now: Date,
  prior: PriorEvent[],
): string[] {
  const inactiveDays = daysSince(lastActiveIso, now);
  const lastActiveMs = new Date(lastActiveIso).getTime();
  const out: string[] = [];
  for (const { event_type, days } of INACTIVITY_THRESHOLDS) {
    if (inactiveDays < days) continue;
    const firedSinceActive = prior.some(
      (p) => p.event_type === event_type && new Date(p.created_at).getTime() >= lastActiveMs,
    );
    if (!firedSinceActive) out.push(event_type);
  }
  return out;
}
