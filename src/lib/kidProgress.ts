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
