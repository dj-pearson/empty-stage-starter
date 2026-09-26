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
import { getKidFoodFit, type KidFitKid, type ResultIndex } from '@/lib/kidFit';
import type { Food, Kid, PlanEntry } from '@/types';

export interface KidProgressSummary {
  ate: number;
  tasted: number;
  refused: number;
  offered: number;
  /** Distinct foods tried in window (any recorded attempt, first-ever or not). */
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
  /** Row timestamps, read by the Progress page's months view. */
  updated_at?: string | null;
  created_at?: string | null;
}

/** The food_attempts columns this summary reads. */
export interface KidAttemptRow {
  kid_id: string | null;
  food_id: string | null;
  attempted_at: string | null;
  /** 'success' | 'partial' | 'refused' | 'tantrum'; read by the months view. */
  outcome?: string | null;
  /** Set when the attempt was written by a plan result (the DB trigger). */
  plan_entry_id?: string | null;
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
export function localDay(timestamp: string | null | undefined): string | null {
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

/* ------------------------------------------------------------------------ */
/* Months trajectory for the Progress page.                                 */
/* ------------------------------------------------------------------------ */

/**
 * The local day a ladder row most likely reached mastery, or null.
 *
 * exposureLadder stamps last_attempt_at on EVERY attempt, not only the one
 * that graduated the food, so for a mastered row it is an approximation (a
 * later attempt moves it). That is why the page buckets graduations by month
 * and labels them "by {month}" rather than printing a day.
 */
export function masteredOnIso(row: Pick<KidLadderRow, 'last_attempt_at' | 'updated_at'>): string | null {
  return localDay(row.last_attempt_at) ?? localDay(row.updated_at);
}

/** 'YYYY-MM' of a 'YYYY-MM-DD' day. */
function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** 'YYYY-MM' shifted by `delta` months. */
function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * The earliest local day on which each food was attempted by this child.
 * Attempts after `todayIso` (when given) do not count.
 */
function firstTryDays(
  attempts: readonly KidAttemptRow[],
  kidId: string,
  todayIso?: string,
): Map<string, string> {
  const first = new Map<string, string>();
  for (const attempt of attempts) {
    if (attempt.kid_id !== kidId || !attempt.food_id) continue;
    const day = localDay(attempt.attempted_at);
    if (!day || (todayIso && day > todayIso)) continue;
    const prev = first.get(attempt.food_id);
    if (!prev || day < prev) first.set(attempt.food_id, day);
  }
  return first;
}

/**
 * First tries per month: each food counts once, in the month of the child's
 * earliest attempt at it, however many times it was offered afterwards.
 * Keyed by 'YYYY-MM'.
 */
export function firstTriesByMonth(
  attempts: readonly KidAttemptRow[],
  kidId: string,
  todayIso?: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const day of firstTryDays(attempts, kidId, todayIso).values()) {
    const month = monthOf(day);
    out.set(month, (out.get(month) ?? 0) + 1);
  }
  return out;
}

/** The child's earliest attempt day on or before `todayIso`, or null. */
export function firstAttemptIso(
  attempts: readonly KidAttemptRow[],
  kidId: string,
  todayIso: string,
): string | null {
  let first: string | null = null;
  for (const attempt of attempts) {
    if (attempt.kid_id !== kidId) continue;
    const day = localDay(attempt.attempted_at);
    if (day && day <= todayIso && (!first || day < first)) first = day;
  }
  return first;
}

type SafeFoodLike = Pick<Food, 'id' | 'name' | 'allergens' | 'is_safe' | 'is_try_bite'>;

const NO_HISTORY: ResultIndex = new Map();

/**
 * The foods that are safe for THIS child: foods they have mastered on their
 * own ladder, plus their always-eats list, minus anything that carries one of
 * their allergens or sits on their dislike list.
 *
 * The household `is_safe` flag is deliberately not read: it is the same for
 * every sibling. A food missing from `foodsById` is left out, because its
 * allergens cannot be checked.
 */
export function kidSafeFoodIds(
  kid: KidFitKid,
  ladderRows: readonly KidLadderRow[],
  foodsById: ReadonlyMap<string, SafeFoodLike>,
): Set<string> {
  const candidates = new Set<string>();
  for (const row of ladderRows) {
    if (row.kid_id === kid.id && row.status === 'mastered') candidates.add(row.food_id);
  }
  const always = kid.always_eats_foods ?? [];
  if (always.length > 0) {
    // The list holds ids or free-text names depending on the screen that wrote it.
    const byName = new Map<string, string>();
    for (const food of foodsById.values()) {
      const key = String(food.name ?? '').trim().toLowerCase();
      if (key && !byName.has(key)) byName.set(key, food.id);
    }
    for (const raw of always) {
      if (foodsById.has(raw)) candidates.add(raw);
      else {
        const id = byName.get(String(raw).trim().toLowerCase());
        if (id) candidates.add(id);
      }
    }
  }

  const safe = new Set<string>();
  for (const id of candidates) {
    const food = foodsById.get(id);
    if (!food) continue;
    const fit = getKidFoodFit(kid, food, NO_HISTORY);
    if (fit.allergen || fit.disliked) continue;
    safe.add(id);
  }
  return safe;
}

export interface MonthPoint {
  /** 'YYYY-MM'. */
  month: string;
  /** Foods tried for the first time ever in this month. */
  firstTries: number;
  /** Ladder foods that reached mastery in this month (approximate, see masteredOnIso). */
  graduations: number;
  /** Attempts with outcome success or partial. */
  acceptedExposures: number;
  /** Every recorded attempt in the month, refusals included. */
  loggedExposures: number;
}

/** Months in the Progress trajectory strip, this month included. */
export const TRAJECTORY_MONTHS = 6;

const ACCEPTED_OUTCOMES = new Set(['success', 'partial']);

/**
 * One child's last `months` calendar months, oldest first, ending with the
 * month of `todayIso`.
 *
 * Exposures come from food_attempts alone. A logged plan result already
 * becomes an attempt through the database trigger (it carries plan_entry_id),
 * so adding plan rows here would count the same dinner twice.
 *
 * Months before the child's first attempt are left off the front, so a family
 * that started in July does not see four empty bars for March to June.
 * Attempts and graduations dated after today are ignored.
 */
export function buildMonthlyTrajectory(
  attempts: readonly KidAttemptRow[],
  ladderRows: readonly KidLadderRow[],
  kidId: string,
  todayIso: string,
  months: number = TRAJECTORY_MONTHS,
): MonthPoint[] {
  const count = Number.isFinite(months) ? Math.max(1, Math.floor(months)) : TRAJECTORY_MONTHS;
  const thisMonth = monthOf(todayIso);
  const firstMonth = addMonths(thisMonth, -(count - 1));

  const points = new Map<string, MonthPoint>();
  for (let i = 0; i < count; i += 1) {
    const month = addMonths(firstMonth, i);
    points.set(month, { month, firstTries: 0, graduations: 0, acceptedExposures: 0, loggedExposures: 0 });
  }

  let earliest: string | null = null;
  for (const attempt of attempts) {
    if (attempt.kid_id !== kidId) continue;
    const day = localDay(attempt.attempted_at);
    if (!day || day > todayIso) continue;
    const month = monthOf(day);
    if (!earliest || month < earliest) earliest = month;
    const point = points.get(month);
    if (!point) continue;
    point.loggedExposures += 1;
    if (attempt.outcome && ACCEPTED_OUTCOMES.has(attempt.outcome)) point.acceptedExposures += 1;
  }

  for (const [month, n] of firstTriesByMonth(attempts, kidId, todayIso)) {
    const point = points.get(month);
    if (point) point.firstTries += n;
  }

  for (const row of ladderRows) {
    if (row.kid_id !== kidId || row.status !== 'mastered') continue;
    const day = masteredOnIso(row);
    if (!day || day > todayIso) continue;
    const month = monthOf(day);
    if (!earliest || month < earliest) earliest = month;
    const point = points.get(month);
    if (point) point.graduations += 1;
  }

  if (!earliest) return [];
  return [...points.values()].filter((p) => p.month >= earliest!);
}

/** Days of logging before the Progress page draws a months trend. */
export const TRAJECTORY_MIN_DAYS = 28;

/**
 * The one sentence each child's Progress card leads with. Like the weekly
 * headline it never names a refusal count.
 */
export type TrajectoryHeadline =
  | { kind: 'notEnough'; params: { logged: number } }
  | { kind: 'progress'; params: { sinceMonth: string; safe: number; firstTries: number } }
  | { kind: 'steady'; params: { sinceMonth: string; exposures: number } };

/**
 * Pick the headline from buildMonthlyTrajectory's output. Too little data
 * (fewer than MIN_LOGGED_FOR_HEADLINE attempts, or a first attempt less than
 * TRAJECTORY_MIN_DAYS ago) says so rather than drawing a trend from a week.
 */
export function pickTrajectoryHeadline(
  trajectory: readonly MonthPoint[],
  firstAttempt: string | null,
  todayIso: string,
): TrajectoryHeadline {
  const logged = trajectory.reduce((sum, p) => sum + p.loggedExposures, 0);
  const tooNew = !firstAttempt || daysBetween(firstAttempt, todayIso) < TRAJECTORY_MIN_DAYS;
  if (trajectory.length === 0 || logged < MIN_LOGGED_FOR_HEADLINE || tooNew) {
    return { kind: 'notEnough', params: { logged } };
  }
  const sinceMonth = trajectory[0].month;
  const safe = trajectory.reduce((sum, p) => sum + p.graduations, 0);
  const firstTries = trajectory.reduce((sum, p) => sum + p.firstTries, 0);
  if (safe > 0 || firstTries > 0) return { kind: 'progress', params: { sinceMonth, safe, firstTries } };
  return { kind: 'steady', params: { sinceMonth, exposures: logged } };
}
