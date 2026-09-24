/**
 * Food Tracker overview: which bucket each ladder row belongs in.
 *
 * Pure module. The Food Tracker screen answers "what do I offer today, and
 * what is one step from safe", so every row lands in exactly one group, in
 * this order of precedence:
 *
 *   dueToday > closeToSafe > workingOn > resting > safeNow
 *
 * A row that is due is never also shown as close to safe; the parent sees it
 * once, in the place where they can act on it. The only date input is the
 * `today` argument, so the grouping is the same on every clock and in tests.
 */

import {
  ADVANCE_THRESHOLD,
  RUNGS,
  rungIndex,
  type LadderStatus,
  type Rung,
} from './exposureLadder';

/** The fields of a ladder row the overview reads. `LadderRow` satisfies it. */
export interface OverviewRow {
  id: string;
  currentRung: Rung;
  consecutiveSuccesses: number;
  consecutiveHolds: number;
  status: LadderStatus;
  nextDueOn: string | null;
}

/** A row with this many or fewer good tries left counts as close to safe. */
export const CLOSE_TO_SAFE_MAX = 3;

/** Holds in a row before a food is flagged as stuck at its rung. */
export const STALLED_HOLDS = 3;

/**
 * Good tries still needed before the food is mastered, assuming every one
 * goes well: the rungs left to climb times ADVANCE_THRESHOLD, plus what is
 * left on the current rung. Mastering at the top rung takes the same
 * ADVANCE_THRESHOLD successes as climbing any other, which is what
 * applyAttemptOutcome does. Zero for a mastered row.
 */
export function exposuresToSafe(
  row: Pick<OverviewRow, 'currentRung' | 'consecutiveSuccesses' | 'status'>
): number {
  if (row.status === 'mastered') return 0;
  const rungsLeft = RUNGS.length - 1 - rungIndex(row.currentRung);
  const onThisRung = Math.max(0, ADVANCE_THRESHOLD - Math.max(0, row.consecutiveSuccesses));
  return Math.max(0, rungsLeft * ADVANCE_THRESHOLD + onThisRung);
}

export interface LadderGroups<T extends OverviewRow = OverviewRow> {
  /** Active and due on or before today, closest to safe first. */
  dueToday: T[];
  /** Active, not due, with CLOSE_TO_SAFE_MAX or fewer good tries left. */
  closeToSafe: T[];
  /** Every other active row, soonest due first. */
  workingOn: T[];
  /** Paused or backed off, soonest due first; undated rows last. */
  resting: T[];
  /** Mastered. */
  safeNow: T[];
  /** Rows held at the same rung STALLED_HOLDS or more times in a row. */
  stalledIds: Set<string>;
}

function byDueDate(a: OverviewRow, b: OverviewRow): number {
  if (a.nextDueOn !== b.nextDueOn) {
    if (a.nextDueOn === null) return 1;
    if (b.nextDueOn === null) return -1;
    return a.nextDueOn < b.nextDueOn ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

function byExposuresToSafe(a: OverviewRow, b: OverviewRow): number {
  const diff = exposuresToSafe(a) - exposuresToSafe(b);
  return diff !== 0 ? diff : byDueDate(a, b);
}

/** Put every row in exactly one group. `today` is an ISO 'YYYY-MM-DD' date. */
export function groupLadder<T extends OverviewRow>(
  rows: readonly T[],
  today: string
): LadderGroups<T> {
  const groups: LadderGroups<T> = {
    dueToday: [],
    closeToSafe: [],
    workingOn: [],
    resting: [],
    safeNow: [],
    stalledIds: new Set(),
  };

  for (const row of rows) {
    if (row.consecutiveHolds >= STALLED_HOLDS) groups.stalledIds.add(row.id);

    if (row.status === 'mastered') {
      groups.safeNow.push(row);
    } else if (row.status === 'active') {
      if (row.nextDueOn !== null && row.nextDueOn <= today) {
        groups.dueToday.push(row);
      } else if (exposuresToSafe(row) <= CLOSE_TO_SAFE_MAX) {
        groups.closeToSafe.push(row);
      } else {
        groups.workingOn.push(row);
      }
    } else {
      // paused, backed_off, and any status an older client wrote that this
      // build does not model: never offered, so it rests.
      groups.resting.push(row);
    }
  }

  groups.dueToday.sort(byExposuresToSafe);
  groups.closeToSafe.sort(byExposuresToSafe);
  groups.workingOn.sort(byDueDate);
  groups.resting.sort(byDueDate);
  groups.safeNow.sort((a, b) => a.id.localeCompare(b.id));
  return groups;
}

export interface SummaryCounts {
  /** Foods to offer today. */
  due: number;
  /** Foods a few good tries from safe that are not due today. */
  close: number;
  /** Every food still on the ladder, i.e. not yet safe. */
  onLadder: number;
}

/** The numbers behind the status line ("2 to offer today, 1 one step from safe"). */
export function summaryCounts<T extends OverviewRow>(groups: LadderGroups<T>): SummaryCounts {
  return {
    due: groups.dueToday.length,
    close: groups.closeToSafe.length,
    onLadder:
      groups.dueToday.length +
      groups.closeToSafe.length +
      groups.workingOn.length +
      groups.resting.length,
  };
}

// ---------------------------------------------------------------------------
// Insights: the raw kid_food_ladder row, and the one next step.
// ---------------------------------------------------------------------------

/**
 * The kid_food_ladder columns the Insights page reads, as they come off the
 * wire. Declared here rather than imported from kidProgress so this module
 * does not depend on which optional columns a caller's select includes.
 */
export interface LadderRowLike {
  id?: string | null;
  food_id: string;
  kid_id: string;
  status: string;
  current_rung: string;
  consecutive_successes?: number | null;
  consecutive_holds?: number | null;
  next_due_on?: string | null;
  /** Row timestamps; the Progress page falls back to updated_at for a graduation month. */
  updated_at?: string | null;
  created_at?: string | null;
}

const KNOWN_STATUSES: readonly LadderStatus[] = ['active', 'paused', 'mastered', 'backed_off'];

function isRung(value: string): value is Rung {
  return (RUNGS as readonly string[]).includes(value);
}

function isLadderStatus(value: string): value is LadderStatus {
  return (KNOWN_STATUSES as readonly string[]).includes(value);
}

function countOrZero(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * A raw ladder row as an OverviewRow. An unknown rung reads as the bottom
 * one, missing counters as 0, and an unknown status (written by a client
 * newer than this build) as 'paused' so it rests rather than being offered.
 */
export function toOverviewRow(row: LadderRowLike): OverviewRow & { foodId: string } {
  return {
    id: row.id ?? `${row.kid_id}:${row.food_id}`,
    foodId: row.food_id,
    currentRung: isRung(row.current_rung) ? row.current_rung : RUNGS[0],
    consecutiveSuccesses: countOrZero(row.consecutive_successes),
    consecutiveHolds: countOrZero(row.consecutive_holds),
    status: isLadderStatus(row.status) ? row.status : 'paused',
    nextDueOn: row.next_due_on ?? null,
  };
}

export type NextStepReason = 'stalled' | 'close' | 'resting';

export interface NextStep<T extends OverviewRow = OverviewRow> {
  row: T;
  reason: NextStepReason;
  /** Good tries left before the food is safe (exposuresToSafe). */
  triesLeft: number;
}

/**
 * The one ladder food worth a parent's attention next, or null.
 *
 *   1. A food held at its rung STALLED_HOLDS or more times in a row: the plan
 *      for it needs changing, which matters more than anything going well.
 *   2. Otherwise the food fewest good tries from safe, whether or not it is
 *      due today.
 *   3. Otherwise the longest-resting paused or backed-off food.
 *
 * Mastered rows are never chosen. Deterministic: ties break on due date, then
 * id, never on input order or chance.
 */
export function selectNextStep<T extends OverviewRow>(
  rows: readonly T[],
  today: string
): NextStep<T> | null {
  const groups = groupLadder(rows, today);

  const stalled = rows
    .filter((r) => r.status === 'active' && r.consecutiveHolds >= STALLED_HOLDS)
    .sort(byExposuresToSafe);
  if (stalled.length > 0) {
    const row = stalled[0];
    return { row, reason: 'stalled', triesLeft: exposuresToSafe(row) };
  }

  const close = [...groups.dueToday, ...groups.closeToSafe].sort(byExposuresToSafe);
  if (close.length > 0) {
    const row = close[0];
    return { row, reason: 'close', triesLeft: exposuresToSafe(row) };
  }

  const resting = groups.resting.filter((r) => r.status === 'backed_off' || r.status === 'paused');
  if (resting.length > 0) {
    const row = resting[0];
    return { row, reason: 'resting', triesLeft: exposuresToSafe(row) };
  }

  return null;
}
