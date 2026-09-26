/**
 * The parent's side of the log: a logging streak, this week's meter, last
 * week's recap and the family milestones.
 *
 * Everything here rewards the adult for showing up, never the child for
 * eating. Feeding therapy that follows responsive feeding treats pressure and
 * food rewards as counterproductive, so a refusal logged is worth exactly as
 * much as a clean plate: it is an offer, and offers are what move a food.
 * The per-child streak in streakRules.ts is a different rule; this does not
 * replace it and does not share its rule.
 *
 * Source of truth is food_attempts alone. Every logged plan result already
 * becomes an attempt through the database trigger (see kidProgress.ts), so
 * reading plan_entries as well would count the same dinner twice. Milestone
 * dates are derived from that history, which is why they need no table of
 * their own: every device and both parents compute the same earned date.
 *
 * Pure. Today is injected as a local 'YYYY-MM-DD' key.
 */
import { addIsoDays } from '@/lib/date-utils';
import { localDay, type KidAttemptRow } from '@/lib/kidProgress';

/**
 * One missed day is forgiven per this many days. A second miss inside the
 * window ends the streak. Hard streaks punish tired parents, and a tired
 * parent is the one this is meant to keep.
 */
export const GRACE_SPACING_DAYS = 7;

/** The household goal: days with anything logged, Monday to Sunday. */
export const WEEKLY_GOAL_DAYS = 5;

/**
 * Offers before a new food is usually accepted. The literature puts it at 8
 * to 15 exposures; 10 is the middle, shown as "about 10" and never as a
 * deadline.
 */
export const EXPOSURE_TARGET = 10;

const ACCEPTED = new Set(['success', 'partial']);

/** Whole days from `a` to `b` (b - a), both 'YYYY-MM-DD'. */
export function isoDayDiff(a: string, b: string): number {
  const ms = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

/** Local days with at least one attempt logged, today and earlier. */
export function loggedDaySet(attempts: readonly KidAttemptRow[], todayIso: string): Set<string> {
  const days = new Set<string>();
  for (const attempt of attempts) {
    const day = localDay(attempt.attempted_at);
    if (day && day <= todayIso) days.add(day);
  }
  return days;
}

export interface ParentStreak {
  /** Logged days in the current streak. Missed days never count. */
  current: number;
  best: number;
  loggedToday: boolean;
  /**
   * The day the next grace day becomes available, or null when one is in
   * hand now.
   */
  graceReadyOn: string | null;
  /** Not logging today would end a live streak tomorrow. */
  atRisk: boolean;
  /** First day the streak reached each length, for milestones. */
  reachedOn: Map<number, string>;
}

/**
 * Walks forward from the first logged day to today.
 *
 * A logged day adds one. A missed day is forgiven when it is the first miss
 * or at least GRACE_SPACING_DAYS after the previous one; otherwise the streak
 * restarts from the logged days since that previous miss. Today is neutral
 * until it is logged: an evening with nothing yet is not a miss.
 *
 * That forward walk gives the same answer as walking back from any day and
 * stopping at the first miss that sits too close to the one after it, which
 * the tests check against a brute-force version.
 */
export function parentStreak(days: ReadonlySet<string>, todayIso: string): ParentStreak {
  const reachedOn = new Map<number, string>();
  const loggedToday = days.has(todayIso);
  const first = [...days].sort()[0];
  if (!first) {
    return { current: 0, best: 0, loggedToday, graceReadyOn: null, atRisk: false, reachedOn };
  }

  let streak = 0;
  let best = 0;
  let loggedSinceMiss = 0;
  let lastMiss: string | null = null;

  for (let day = first; day <= todayIso; day = addIsoDays(day, 1)) {
    if (days.has(day)) {
      streak += 1;
      loggedSinceMiss += 1;
      if (streak > best) best = streak;
      if (!reachedOn.has(streak)) reachedOn.set(streak, day);
      continue;
    }
    if (day === todayIso) continue;
    if (lastMiss !== null && isoDayDiff(lastMiss, day) < GRACE_SPACING_DAYS) {
      streak = loggedSinceMiss;
    }
    loggedSinceMiss = 0;
    lastMiss = day;
  }

  const graceReadyOn =
    lastMiss !== null && isoDayDiff(lastMiss, todayIso) < GRACE_SPACING_DAYS
      ? addIsoDays(lastMiss, GRACE_SPACING_DAYS)
      : null;

  return {
    current: streak,
    best,
    loggedToday,
    graceReadyOn,
    atRisk: streak > 0 && !loggedToday && graceReadyOn !== null,
    reachedOn,
  };
}

export interface WeekMeterDay {
  day: string;
  logged: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export interface WeekMeter {
  startIso: string;
  days: WeekMeterDay[];
  loggedCount: number;
  goal: number;
  reached: boolean;
}

/** Monday of the week holding `iso`. */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const weekday = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay(); // 0 = Sunday
  return addIsoDays(iso, -((weekday + 6) % 7));
}

/**
 * This week, Monday to Sunday, as seven cells. Anyone in the household who
 * logs fills a cell; there is no per-parent split, because there is no
 * leaderboard to feed.
 */
export function weekMeter(days: ReadonlySet<string>, todayIso: string): WeekMeter {
  const startIso = mondayOf(todayIso);
  const cells: WeekMeterDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = addIsoDays(startIso, i);
    cells.push({ day, logged: days.has(day), isToday: day === todayIso, isFuture: day > todayIso });
  }
  const loggedCount = cells.filter((c) => c.logged).length;
  return { startIso, days: cells, loggedCount, goal: WEEKLY_GOAL_DAYS, reached: loggedCount >= WEEKLY_GOAL_DAYS };
}

export interface WeekRecap {
  startIso: string;
  endIso: string;
  daysLogged: number;
  /** Every attempt in the range, refusals included. */
  offers: number;
  /** Kid+food pairs offered for the first time ever inside the range. */
  newFoodsOffered: number;
  /** Attempts that ended in success or partial. */
  accepted: number;
}

/** First-ever attempt day per kid+food, over the whole history given. */
function firstOfferDays(attempts: readonly KidAttemptRow[], todayIso: string): Map<string, string> {
  const first = new Map<string, string>();
  for (const attempt of attempts) {
    if (!attempt.kid_id || !attempt.food_id) continue;
    const day = localDay(attempt.attempted_at);
    if (!day || day > todayIso) continue;
    const key = `${attempt.kid_id}|${attempt.food_id}`;
    const seen = first.get(key);
    if (!seen || day < seen) first.set(key, day);
  }
  return first;
}

/**
 * Last full Monday-to-Sunday week. The history passed in must reach back
 * before the week for "new" to mean new; the callers read every attempt.
 */
export function lastWeekRecap(attempts: readonly KidAttemptRow[], todayIso: string): WeekRecap {
  const startIso = addIsoDays(mondayOf(todayIso), -7);
  const endIso = addIsoDays(startIso, 6);
  const days = new Set<string>();
  let offers = 0;
  let accepted = 0;
  for (const attempt of attempts) {
    const day = localDay(attempt.attempted_at);
    if (!day || day < startIso || day > endIso) continue;
    days.add(day);
    offers += 1;
    if (attempt.outcome && ACCEPTED.has(attempt.outcome)) accepted += 1;
  }
  let newFoodsOffered = 0;
  for (const day of firstOfferDays(attempts, todayIso).values()) {
    if (day >= startIso && day <= endIso) newFoodsOffered += 1;
  }
  return { startIso, endIso, daysLogged: days.size, offers, newFoodsOffered, accepted };
}

/** Offers per kid+food, keyed `${kidId}|${foodId}`. Refusals count. */
export function exposureCounts(attempts: readonly KidAttemptRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const attempt of attempts) {
    if (!attempt.kid_id || !attempt.food_id || !attempt.attempted_at) continue;
    const key = `${attempt.kid_id}|${attempt.food_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export type FamilyMilestoneId =
  | 'first_log'
  | 'days_7'
  | 'days_30'
  | 'days_100'
  | 'streak_7'
  | 'streak_21'
  | 'streak_60'
  | 'new_foods_5'
  | 'new_foods_20'
  | 'stuck_with_it';

export interface FamilyMilestone {
  id: FamilyMilestoneId;
  /** Local day it was earned, or null while locked. */
  earnedOn: string | null;
  /** Where the family is against the threshold, capped at the threshold. */
  progress: number;
  target: number;
}

type Metric = 'days' | 'streak' | 'newFoods' | 'oneFood';

/** Stable catalog. Ids are never renamed; add new ones at the end. */
export const FAMILY_MILESTONES: ReadonlyArray<{ id: FamilyMilestoneId; metric: Metric; target: number }> = [
  { id: 'first_log', metric: 'days', target: 1 },
  { id: 'days_7', metric: 'days', target: 7 },
  { id: 'days_30', metric: 'days', target: 30 },
  { id: 'days_100', metric: 'days', target: 100 },
  { id: 'streak_7', metric: 'streak', target: 7 },
  { id: 'streak_21', metric: 'streak', target: 21 },
  { id: 'streak_60', metric: 'streak', target: 60 },
  { id: 'new_foods_5', metric: 'newFoods', target: 5 },
  { id: 'new_foods_20', metric: 'newFoods', target: 20 },
  { id: 'stuck_with_it', metric: 'oneFood', target: EXPOSURE_TARGET },
];

/**
 * Every family milestone with the day it was earned. Earned dates come out of
 * the history itself, so a milestone reached in March reads as March on every
 * device, and nothing has to be written when it is reached.
 */
export function familyMilestones(attempts: readonly KidAttemptRow[], todayIso: string): FamilyMilestone[] {
  const days = loggedDaySet(attempts, todayIso);
  const sortedDays = [...days].sort();
  const streak = parentStreak(days, todayIso);
  const firstOffers = [...firstOfferDays(attempts, todayIso).values()].sort();

  // The day each kid+food reached its Nth offer, and the most offers any one food has had.
  const offerDays = new Map<string, string[]>();
  for (const attempt of attempts) {
    if (!attempt.kid_id || !attempt.food_id) continue;
    const day = localDay(attempt.attempted_at);
    if (!day || day > todayIso) continue;
    const key = `${attempt.kid_id}|${attempt.food_id}`;
    const list = offerDays.get(key);
    if (list) list.push(day);
    else offerDays.set(key, [day]);
  }
  let mostOffers = 0;
  let firstFoodAtTarget: string | null = null;
  for (const list of offerDays.values()) {
    list.sort();
    mostOffers = Math.max(mostOffers, list.length);
    const hit = list[EXPOSURE_TARGET - 1];
    if (hit && (!firstFoodAtTarget || hit < firstFoodAtTarget)) firstFoodAtTarget = hit;
  }

  return FAMILY_MILESTONES.map(({ id, metric, target }) => {
    let earnedOn: string | null = null;
    let value = 0;
    switch (metric) {
      case 'days':
        value = sortedDays.length;
        earnedOn = sortedDays[target - 1] ?? null;
        break;
      case 'streak':
        value = streak.best;
        earnedOn = streak.reachedOn.get(target) ?? null;
        break;
      case 'newFoods':
        value = firstOffers.length;
        earnedOn = firstOffers[target - 1] ?? null;
        break;
      case 'oneFood':
        value = mostOffers;
        earnedOn = firstFoodAtTarget;
        break;
    }
    return { id, earnedOn, progress: Math.min(value, target), target };
  });
}
