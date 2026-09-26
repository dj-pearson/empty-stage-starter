/**
 * Progress hints for locked badges, where the web can count what iOS counts.
 *
 * The web holds a -30d..+90d window of plan entries, so an all-time count
 * ("30 meal results") would read low for any family older than a month and
 * tell a parent their child is further away than they are. Only two kinds of
 * rule fit inside that window, and only those get a bar:
 *
 *   - the streak badges, through the shared streak rule (streakRules.ts),
 *     which is the phone's rule and walks back at most a few weeks in practice;
 *   - perfectWeek, which only looks at the current Monday-first week, the same
 *     week iOS uses (Date.weekDates in DateFormatters.swift).
 *
 * Everything else returns null and the tile shows no bar.
 */
import { currentStreak, type StreakEntry } from '@/lib/streakRules';
import { addIsoDays } from '@/lib/date-utils';
import type { BadgeId } from '@/lib/badgeCatalog';

export interface BadgeHint {
  progress: number;
  total: number;
}

/** Monday of the week containing `dayIso`, computed on the day key (no local Date). */
export function mondayOf(dayIso: string): string {
  const [y, m, d] = dayIso.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return addIsoDays(dayIso, -((weekday + 6) % 7));
}

/** This week's recorded results for one child, up to and including today, oldest first. */
export function thisWeekResults(
  entries: readonly StreakEntry[],
  kidId: string,
  todayIso: string,
): StreakEntry[] {
  const start = mondayOf(todayIso);
  return entries
    .filter(
      (e) =>
        (e.kid_id ?? e.kidId) === kidId &&
        e.result != null &&
        e.date >= start &&
        e.date <= todayIso,
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * The hint for one locked badge, or null when the web cannot count it
 * honestly. `target` is the catalog target.
 */
export function lockedBadgeHint(
  id: BadgeId,
  target: number,
  entries: readonly StreakEntry[],
  kidId: string,
  todayIso: string,
): BadgeHint | null {
  switch (id) {
    case 'fiveDayStreak':
    case 'tenDayStreak':
      return { progress: currentStreak(entries, kidId, { todayKey: todayIso }), total: target };
    case 'perfectWeek': {
      // Any logged result counts, "not today" included, as on iOS
      // (BadgeService.swift): rewarding zero refusals taught parents to skip
      // logging the hard meals.
      return { progress: thisWeekResults(entries, kidId, todayIso).length, total: target };
    }
    default:
      return null;
  }
}
