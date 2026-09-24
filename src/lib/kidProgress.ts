/**
 * Per-child "this week" progress for the Kids page.
 *
 * The page used to show household-wide counts (every safe food, every try
 * bite) on every child's card, so two siblings always showed the same numbers.
 * Everything here is keyed by kid and pure: plan entries come from context,
 * ladder rows and attempts from useKidsProgressSummary, and "today" is passed
 * in as a local calendar day so tests can pin the window.
 */
import { addIsoDays, toISODate } from '@/lib/date-utils';
import { RUNGS } from '@/lib/exposureLadder';
import type { Kid, PlanEntry } from '@/types';

export interface KidProgressSummary {
  ate: number;
  tasted: number;
  refused: number;
  offered: number;
  newFoodsTried: number;
  mastered: number;
  /** `rung` is the 0-based index into RUNGS (0 = 'looking'). */
  activeLadder: { foodId: string; foodName?: string; rung: number }[];
}

/** The kid_food_ladder columns this summary reads. */
export interface KidLadderRow {
  kid_id: string;
  food_id: string;
  status: string;
  current_rung: string;
  last_attempt_at?: string | null;
  /** Read by the Insights page; the Kids card summary ignores these. */
  id?: string;
  consecutive_successes?: number | null;
  consecutive_holds?: number | null;
  next_due_on?: string | null;
}

/** The food_attempts columns this summary reads. */
export interface KidAttemptRow {
  kid_id: string | null;
  food_id: string | null;
  attempted_at: string | null;
}

/** Days in the window, today included. */
export const PROGRESS_WINDOW_DAYS = 7;

/**
 * First local day of a window of `windowDays` days ending on `todayIso`.
 * A window under one day is read as one day (today only).
 */
export function windowStartIso(todayIso: string, windowDays: number = PROGRESS_WINDOW_DAYS): string {
  const days = Number.isFinite(windowDays) ? Math.max(1, Math.floor(windowDays)) : PROGRESS_WINDOW_DAYS;
  return addIsoDays(todayIso, -(days - 1));
}

type PlanEntryLike = Pick<PlanEntry, 'kid_id' | 'date' | 'result'>;

function emptySummary(): KidProgressSummary {
  return { ate: 0, tasted: 0, refused: 0, offered: 0, newFoodsTried: 0, mastered: 0, activeLadder: [] };
}

function rungIndex(rung: string): number {
  const idx = (RUNGS as readonly string[]).indexOf(rung);
  return idx === -1 ? 0 : idx;
}

/** The local calendar day of a timestamp, or null when it does not parse. */
function localDay(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  // A bare date is already a local day; new Date('YYYY-MM-DD') would read it
  // as UTC midnight and move it back a day west of Greenwich.
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return timestamp;
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? null : toISODate(ms);
}

interface Accumulator {
  summary: KidProgressSummary;
  triedFoods: Set<string>;
}

function inWindow(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}

function addEntry(acc: Accumulator, entry: PlanEntryLike) {
  const { summary } = acc;
  if (entry.result === 'ate') summary.ate += 1;
  else if (entry.result === 'tasted') summary.tasted += 1;
  else if (entry.result === 'refused') summary.refused += 1;
  else return;
  summary.offered += 1;
}

function addLadderRow(acc: Accumulator, row: KidLadderRow, foodNames?: ReadonlyMap<string, string>) {
  if (row.status === 'mastered') acc.summary.mastered += 1;
  else if (row.status === 'active') {
    const foodName = foodNames?.get(row.food_id);
    acc.summary.activeLadder.push({
      foodId: row.food_id,
      ...(foodName ? { foodName } : {}),
      rung: rungIndex(row.current_rung),
    });
  }
}

function finish(acc: Accumulator): KidProgressSummary {
  acc.summary.newFoodsTried = acc.triedFoods.size;
  // Closest to mastery first: that is the food a parent can push this week.
  acc.summary.activeLadder.sort((a, b) => b.rung - a.rung || a.foodId.localeCompare(b.foodId));
  return acc.summary;
}

/**
 * Summarize one child's last `windowDays` local days (default seven: today and
 * the six before it). Future entries and entries with no recorded result are
 * not counted.
 */
export function summarizeKidWeek(
  planEntries: readonly PlanEntryLike[],
  kidId: string,
  todayIso: string,
  ladderRows?: readonly KidLadderRow[],
  attempts?: readonly KidAttemptRow[],
  foodNames?: ReadonlyMap<string, string>,
  windowDays: number = PROGRESS_WINDOW_DAYS,
): KidProgressSummary {
  const start = windowStartIso(todayIso, windowDays);
  const acc: Accumulator = { summary: emptySummary(), triedFoods: new Set() };
  for (const entry of planEntries) {
    if (entry.kid_id !== kidId || entry.result == null) continue;
    if (!inWindow(entry.date.slice(0, 10), start, todayIso)) continue;
    addEntry(acc, entry);
  }
  for (const row of ladderRows ?? []) {
    if (row.kid_id === kidId) addLadderRow(acc, row, foodNames);
  }
  for (const attempt of attempts ?? []) {
    if (attempt.kid_id !== kidId || !attempt.food_id) continue;
    const day = localDay(attempt.attempted_at);
    if (day && inWindow(day, start, todayIso)) acc.triedFoods.add(attempt.food_id);
  }
  return finish(acc);
}

/**
 * Every kid's summary in one pass over each input, rather than filtering the
 * whole plan once per card. Kids with no data still get a zeroed summary.
 */
export function buildProgressByKid(
  kids: readonly Pick<Kid, 'id'>[],
  planEntries: readonly PlanEntryLike[],
  todayIso: string,
  ladderRows?: readonly KidLadderRow[],
  attempts?: readonly KidAttemptRow[],
  foodNames?: ReadonlyMap<string, string>,
  windowDays: number = PROGRESS_WINDOW_DAYS,
): Map<string, KidProgressSummary> {
  const start = windowStartIso(todayIso, windowDays);
  const accs = new Map<string, Accumulator>();
  for (const kid of kids) accs.set(kid.id, { summary: emptySummary(), triedFoods: new Set() });

  for (const entry of planEntries) {
    if (entry.result == null) continue;
    const acc = accs.get(entry.kid_id);
    if (!acc || !inWindow(entry.date.slice(0, 10), start, todayIso)) continue;
    addEntry(acc, entry);
  }
  for (const row of ladderRows ?? []) {
    const acc = accs.get(row.kid_id);
    if (acc) addLadderRow(acc, row, foodNames);
  }
  for (const attempt of attempts ?? []) {
    if (!attempt.kid_id || !attempt.food_id) continue;
    const acc = accs.get(attempt.kid_id);
    if (!acc) continue;
    const day = localDay(attempt.attempted_at);
    if (day && inWindow(day, start, todayIso)) acc.triedFoods.add(attempt.food_id);
  }

  const out = new Map<string, KidProgressSummary>();
  for (const [id, acc] of accs) out.set(id, finish(acc));
  return out;
}

/* ------------------------------------------------------------------------ */
/* Four-week trend for the Insights page.                                   */
/* ------------------------------------------------------------------------ */

/** Days the Insights trend covers, today included: inside the -30d plan load. */
export const TREND_WINDOW_DAYS = 28;

/** A plan row as the trend reads it: one row per food, grouped into dishes. */
export type TrendPlanEntryLike = Pick<PlanEntry, 'kid_id' | 'date' | 'result' | 'meal_slot' | 'food_id'> & {
  recipe_id?: string | null;
};

export interface WeekBucket {
  /** First local day of the bucket, inclusive. */
  startIso: string;
  /** Last local day of the bucket, inclusive. */
  endIso: string;
  /** Logged dishes plus recorded food attempts in the bucket. */
  exposures: number;
  ate: number;
  tasted: number;
  refused: number;
  /** Distinct dishes (recipe or food) and attempted foods. */
  distinctFoods: number;
  /** Dishes with a recorded result. Attempts are not counted here. */
  logged: number;
  /** Latest day in the bucket with a logged dish, or null. */
  lastLoggedIso: string | null;
}

type MealOutcome = 'ate' | 'tasted' | 'refused';

const OUTCOME_RANK: Record<MealOutcome, number> = { ate: 3, tasted: 2, refused: 1 };

function isOutcome(value: unknown): value is MealOutcome {
  return value === 'ate' || value === 'tasted' || value === 'refused';
}

/**
 * One child's last `weeks` seven-day buckets, oldest first; the last bucket
 * ends today. A recipe is several plan rows in one slot, so rows are counted
 * as dishes (`date|slot|recipe or food`), each resolved to its best result.
 * Only logged rows count: future plans and rows with no result are skipped.
 * The whole range is clamped to the 28-day window the plan load covers.
 */
export function buildWeeklyTrend(
  planEntries: readonly TrendPlanEntryLike[],
  kidId: string,
  todayIso: string,
  attempts?: readonly KidAttemptRow[],
  weeks: number = 4,
): WeekBucket[] {
  const count = Number.isFinite(weeks) ? Math.max(1, Math.floor(weeks)) : 4;
  const floor = windowStartIso(todayIso, TREND_WINDOW_DAYS);

  const buckets: WeekBucket[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const endIso = addIsoDays(todayIso, -7 * i);
    if (endIso < floor) continue;
    const start = addIsoDays(endIso, -6);
    buckets.push({
      startIso: start < floor ? floor : start,
      endIso,
      exposures: 0,
      ate: 0,
      tasted: 0,
      refused: 0,
      distinctFoods: 0,
      logged: 0,
      lastLoggedIso: null,
    });
  }
  const bucketFor = (day: string): WeekBucket | undefined =>
    buckets.find((b) => day >= b.startIso && day <= b.endIso);

  const dishes = new Map<string, { day: string; food: string; result: MealOutcome }>();
  for (const entry of planEntries) {
    if (entry.kid_id !== kidId || !isOutcome(entry.result)) continue;
    const day = entry.date.slice(0, 10);
    if (!bucketFor(day)) continue;
    const food = entry.recipe_id ?? entry.food_id;
    const key = `${day}|${entry.meal_slot}|${food}`;
    const prev = dishes.get(key);
    if (!prev || OUTCOME_RANK[entry.result] > OUTCOME_RANK[prev.result]) {
      dishes.set(key, { day, food, result: entry.result });
    }
  }

  const foodsByBucket = new Map<WeekBucket, Set<string>>();
  const foodsOf = (b: WeekBucket) => {
    let set = foodsByBucket.get(b);
    if (!set) {
      set = new Set();
      foodsByBucket.set(b, set);
    }
    return set;
  };

  for (const dish of dishes.values()) {
    const b = bucketFor(dish.day);
    if (!b) continue;
    b.logged += 1;
    b.exposures += 1;
    b[dish.result] += 1;
    foodsOf(b).add(dish.food);
    if (!b.lastLoggedIso || dish.day > b.lastLoggedIso) b.lastLoggedIso = dish.day;
  }
  for (const attempt of attempts ?? []) {
    if (attempt.kid_id !== kidId) continue;
    const day = localDay(attempt.attempted_at);
    const b = day ? bucketFor(day) : undefined;
    if (!b) continue;
    b.exposures += 1;
    if (attempt.food_id) foodsOf(b).add(attempt.food_id);
  }
  for (const [b, set] of foodsByBucket) b.distinctFoods = set.size;
  return buckets;
}

/**
 * The one sentence the Insights page leads with. Params never carry a refusal
 * count: the headline says what went on the plate, not what came back.
 */
export type WeekHeadline =
  | { kind: 'reachedSafe'; params: { count: number; foodId: string; foodName?: string } }
  | { kind: 'notEnough'; params: { logged: number } }
  | { kind: 'quiet'; params: { lastLoggedIso: string | null; daysAgo: number | null } }
  | { kind: 'aboveAverage'; params: { exposures: number; average: number } }
  | { kind: 'steady'; params: { dishes: number; distinctFoods: number } };

/** Whole days from `fromIso` to `toIso` (string arithmetic, DST-proof). */
function daysBetween(fromIso: string, toIso: string): number {
  const ms = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((ms(toIso) - ms(fromIso)) / 86_400_000);
}

/** Minimum logged dishes in the window before a trend claim is made. */
export const MIN_LOGGED_FOR_HEADLINE = 3;

/**
 * Pick the headline for one child. `trend` is buildWeeklyTrend's output
 * (oldest first, current week last); `ladderRows` should already be this
 * child's. Order: a food that became safe this week wins, because it is real
 * news even on a thin log; then too little data; then a quiet week; then a
 * week above the child's own recent average; otherwise the plain count.
 */
export function pickWeekHeadline(
  trend: readonly WeekBucket[],
  ladderRows: readonly KidLadderRow[] | undefined,
  todayIso: string,
  foodNames?: ReadonlyMap<string, string>,
): WeekHeadline {
  const current = trend[trend.length - 1];
  const weekStart = addIsoDays(todayIso, -6);

  const mastered = (ladderRows ?? []).filter((row) => {
    if (row.status !== 'mastered') return false;
    const day = localDay(row.last_attempt_at);
    return day != null && inWindow(day, weekStart, todayIso);
  });
  if (mastered.length > 0) {
    const first = [...mastered].sort((a, b) =>
      (b.last_attempt_at ?? '').localeCompare(a.last_attempt_at ?? ''),
    )[0];
    const foodName = foodNames?.get(first.food_id);
    return {
      kind: 'reachedSafe',
      params: { count: mastered.length, foodId: first.food_id, ...(foodName ? { foodName } : {}) },
    };
  }

  const totalLogged = trend.reduce((sum, b) => sum + b.logged, 0);
  if (!current || totalLogged < MIN_LOGGED_FOR_HEADLINE) {
    return { kind: 'notEnough', params: { logged: totalLogged } };
  }

  if (current.logged === 0) {
    let lastLoggedIso: string | null = null;
    for (const b of trend) {
      if (b.lastLoggedIso && (!lastLoggedIso || b.lastLoggedIso > lastLoggedIso)) lastLoggedIso = b.lastLoggedIso;
    }
    return {
      kind: 'quiet',
      params: { lastLoggedIso, daysAgo: lastLoggedIso ? daysBetween(lastLoggedIso, todayIso) : null },
    };
  }

  const prior = trend.slice(0, -1);
  if (prior.some((b) => b.logged > 0)) {
    const average = Math.floor(prior.reduce((sum, b) => sum + b.exposures, 0) / prior.length);
    // "More than the usual 0" is not a claim worth leading with.
    if (average >= 1 && current.exposures > average) {
      return { kind: 'aboveAverage', params: { exposures: current.exposures, average } };
    }
  }

  return { kind: 'steady', params: { dishes: current.logged, distinctFoods: current.distinctFoods } };
}
