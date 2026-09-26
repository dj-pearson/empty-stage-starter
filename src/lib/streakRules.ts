import { addIsoDays, toISODate } from '@/lib/date-utils';

/**
 * One per-child streak rule, for the whole product (US-781).
 *
 * There were three, over the same plan entries, and they returned different
 * numbers for the same child:
 *
 *   Home.tsx              any day with a result counted; first gap ended it.
 *   ProgressDashboard.tsx any day with an entry counted, result never read;
 *                         one empty day forgiven.
 *   BadgeService.swift    a day with a try-bite counted; a pure refusal ended
 *                         it; one empty day forgiven.
 *
 * So a child who refused everything yesterday had a live streak on the web and
 * a broken one on the phone, and the two web numbers disagreed with each other
 * as well.
 *
 * THE DECISION, recorded in PLATFORMS.md: the phone's rule wins, because iOS
 * is what ships in the App Store. The phone's rule then changed (M12 in
 * BadgeService.swift): any logged result counts, a refusal included. Offering
 * a food and writing down how it went IS the exposure, and a streak that a
 * hard day could break taught parents to stop logging hard days, which are
 * the days a feeding therapist most wants to see. This follows it again.
 */

/**
 * Empty days forgiven in a row before the streak ends. One, as on the phone:
 * a family that misses a Tuesday has not stopped.
 */
export const EMPTY_DAYS_FORGIVEN = 1;

/** How far back to walk. A year is longer than any streak worth displaying. */
export const MAX_STREAK_DAYS = 365;

/** The shape the rule needs; both clients' entries are wider than this. */
export interface StreakEntry {
  date: string;
  kid_id?: string | null;
  kidId?: string | null;
  result?: string | null;
}

export interface StreakOptions {
  /** Defaults to today. Injected in tests, and by anything replaying history. */
  todayKey?: string;
  emptyDaysForgiven?: number;
}

const entryKid = (entry: StreakEntry): string | null | undefined =>
  entry.kid_id ?? entry.kidId;

/**
 * The current streak for one child: days in a row with any result logged.
 *
 * `kidId` is required and not optional on purpose. Home.tsx computed its
 * streak over the UNFILTERED entries while the filtered list sat one line
 * above, so in a two-child household either child eating kept the other
 * child's streak alive. A rule that cannot be called without naming a child
 * cannot make that mistake again.
 */
export function currentStreak(
  entries: readonly StreakEntry[],
  kidId: string,
  options: StreakOptions = {},
): number {
  const todayKey = options.todayKey ?? toISODate(new Date());
  const forgiven = options.emptyDaysForgiven ?? EMPTY_DAYS_FORGIVEN;

  // Day key -> the results recorded that day, for this child only.
  const byDay = new Map<string, string[]>();
  for (const entry of entries) {
    if (entryKid(entry) !== kidId) continue;
    if (!entry.result) continue;
    const day = byDay.get(entry.date);
    if (day) day.push(entry.result);
    else byDay.set(entry.date, [entry.result]);
  }

  let streak = 0;
  let skipsLeft = forgiven;

  // Walked as STRINGS (US-818). Stepping a Date with setDate and formatting
  // with toISOString is two bugs at once: the UTC conversion shifts the day
  // for everyone west of Greenwich, and a DST boundary lands on the same
  // calendar day twice, counting it as two.
  for (let offset = 0; offset < MAX_STREAK_DAYS; offset++) {
    const results = byDay.get(addIsoDays(todayKey, -offset)) ?? [];

    if (results.length === 0) {
      if (skipsLeft > 0) skipsLeft--;
      else break;
      continue;
    }

    // Any result counts, refusals included (M12).
    streak++;
    skipsLeft = forgiven; // a logged day restores the budget
  }

  return streak;
}

/**
 * The longest streak the child has ever had, over the same rule.
 *
 * Walks from the earliest recorded day forward, asking the same question at
 * each day, so the two numbers can never come from different rules.
 */
export function bestStreak(
  entries: readonly StreakEntry[],
  kidId: string,
  options: StreakOptions = {},
): number {
  const days = entries
    .filter((entry) => entryKid(entry) === kidId && entry.result)
    .map((entry) => entry.date)
    .sort();
  if (days.length === 0) return 0;

  let best = 0;
  const seen = new Set<string>();
  for (const day of days) {
    if (seen.has(day)) continue;
    seen.add(day);
    best = Math.max(best, currentStreak(entries, kidId, { ...options, todayKey: day }));
  }
  return best;
}
