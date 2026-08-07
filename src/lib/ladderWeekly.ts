/**
 * Weekly ladder narrative (US-604).
 *
 * Pure module. Turns a week of `food_attempts` into the four things a parent
 * actually wants from a weekly report: what moved up, what held, what eased
 * back, and how many foods are done.
 *
 * Two design rules drive everything here.
 *
 * The first is that the counting must not be a second opinion. The rung a food
 * sat on at the start of the week and the rung it sits on at the end are both
 * produced by replaying attempts through `applyAttemptOutcome` — the same
 * policy that governs the live ladder. A separate "what probably happened"
 * heuristic would drift from the board the parent is looking at, and a report
 * that disagrees with the app is worse than no report.
 *
 * The second is that the narrative talks about participation and steps, never
 * about amounts eaten. "Peas held at Smelling" is progress; "ate 2 bites of
 * peas" is the framing this feature exists to get away from. That is also why
 * a week with no advancement still produces an encouraging summary: with ARFID,
 * repeated exposure at the same rung is the mechanism, not a stalled week.
 *
 * Nothing here reads the clock or touches Supabase — the week bounds are
 * injected, so every rule below is directly unit-testable.
 */

import {
  applyAttemptOutcome,
  initialLadderState,
  isRung,
  rungIndex,
  type LadderAttempt,
  type LadderState,
  type Rung,
} from './exposureLadder';

/** How a food's week ended, relative to where it started. */
export type LadderMoveKind = 'advanced' | 'held' | 'backed_off';

export interface LadderFoodMove {
  foodId: string;
  /** Display name, or the id when the caller has no name for it. */
  foodName: string;
  fromRung: Rung;
  toRung: Rung;
  /** Exposures logged inside the week window. Always >= 1. */
  exposures: number;
  /** True when this food reached the top of the ladder during the week. */
  masteredThisWeek: boolean;
}

/**
 * One sentence of the report, as data rather than as English.
 *
 * The module decides *which* sentences a week earns and what goes in them;
 * the wording lives in `foodLadder.weekly.*` in the locale files (US-347), so
 * a new language is a locale file and not a second copy of this logic.
 */
export type LadderNarrativeLine =
  | { kind: 'moved_up'; foods: LadderFoodMove[] }
  | { kind: 'mastered'; foods: LadderFoodMove[] }
  | { kind: 'held'; foods: LadderFoodMove[] }
  | { kind: 'backed_off'; foods: LadderFoodMove[] }
  /** Attempts were logged, but no rung changed. Encouraging, never a scold. */
  | { kind: 'no_advancement' }
  /** The ladder exists but the week was empty. */
  | { kind: 'nothing_logged' }
  | { kind: 'mastered_total'; count: number };

export type LadderHeadline =
  | { kind: 'empty_week' }
  | { kind: 'week'; exposures: number; foods: number; advanced: number };

export interface LadderWeekSummary {
  advanced: LadderFoodMove[];
  held: LadderFoodMove[];
  backedOff: LadderFoodMove[];
  /** Foods sitting at 'mastered' as of the end of the week — a running total. */
  masteredCount: number;
  /** Distinct foods with at least one exposure inside the week. */
  foodsWorkedOn: number;
  /** Total exposures logged inside the week. */
  totalExposures: number;
  /** Section subtitle, as data. */
  headline: LadderHeadline;
  /** Section body sentences, in render order. */
  narrative: LadderNarrativeLine[];
}

export interface LadderWeekInput {
  /**
   * Attempt history. Pass everything available, not just the week: rungs
   * before the week are what the week's movement is measured against.
   */
  attempts: LadderAttempt[];
  /** Inclusive ISO 'YYYY-MM-DD' start of the reporting week. */
  weekStart: string;
  /** Inclusive ISO 'YYYY-MM-DD' end of the reporting week. */
  weekEnd: string;
  /** Restrict to one child. Omit to summarize whatever was passed in. */
  kidId?: string;
  /** foodId -> display name. Missing ids fall back to the id itself. */
  foodNames?: Record<string, string>;
}

function isOutcome(value: unknown): value is 'success' | 'partial' | 'refused' | 'tantrum' {
  return value === 'success' || value === 'partial' || value === 'refused' || value === 'tantrum';
}

/** ISO date part of a timestamp, so window checks never touch the local zone. */
function dayOf(timestamp: string): string {
  return timestamp.slice(0, 10);
}

interface FoodWeek {
  startState: LadderState;
  endState: LadderState;
  exposures: number;
}

/**
 * Replay one food's attempts, snapshotting the state at the week boundary.
 *
 * Attempts after `weekEnd` are ignored rather than folded in: a report for
 * last week must not move because something was logged since.
 */
function replayFood(ordered: LadderAttempt[], weekStart: string, weekEnd: string): FoodWeek | null {
  const first = ordered[0];
  if (!first) return null;

  let state = initialLadderState(weekStart);
  // Seed at the rung the earliest attempt was logged at, matching
  // deriveLadderFromAttempts — otherwise a family working at 'small_bite' for
  // months would appear to start every week back at 'looking'.
  if (isRung(first.stage)) {
    state = { ...state, currentRung: first.stage };
  }

  let startState = state;
  let exposures = 0;
  let sawWeekAttempt = false;

  for (const attempt of ordered) {
    const at = attempt.attemptedAt;
    if (!at || !isOutcome(attempt.outcome)) continue;
    const day = dayOf(at);
    if (day > weekEnd) break;

    if (day < weekStart) {
      state = applyAttemptOutcome(state, attempt.outcome, { today: day, attemptAt: at });
      startState = state;
      continue;
    }

    sawWeekAttempt = true;
    exposures += 1;
    state = applyAttemptOutcome(state, attempt.outcome, { today: day, attemptAt: at });
  }

  // A food whose only history is pre-week still counts toward masteredCount,
  // so it is returned with exposures 0 rather than dropped.
  return {
    startState,
    endState: state,
    exposures: sawWeekAttempt ? exposures : 0,
  };
}

function classify(week: FoodWeek): LadderMoveKind {
  const from = rungIndex(week.startState.currentRung);
  const to = rungIndex(week.endState.currentRung);

  // Mastery is the top of the ladder, so it reads as advancement even though
  // the rung label itself cannot go any higher.
  if (week.endState.status === 'mastered' && week.startState.status !== 'mastered') {
    return 'advanced';
  }
  if (to > from) return 'advanced';
  // 'backed_off' is the distress path: the rung may have stepped down or been
  // held, but either way the week ended with the food resting.
  if (to < from || week.endState.status === 'backed_off') return 'backed_off';
  return 'held';
}

/**
 * Summarize a child's ladder week.
 *
 * Returns `null` when there is no ladder history at all, which is how the
 * caller omits the section entirely for households that never enabled the
 * feature — an empty ladder card would be a regression for them, not a
 * feature.
 */
export function summarizeLadderWeek(input: LadderWeekInput): LadderWeekSummary | null {
  const { attempts, weekStart, weekEnd, kidId, foodNames } = input;

  const groups = new Map<string, LadderAttempt[]>();
  for (const attempt of attempts) {
    if (!attempt.foodId || !attempt.attemptedAt) continue;
    if (kidId && attempt.kidId !== kidId) continue;
    if (!isOutcome(attempt.outcome)) continue;
    const bucket = groups.get(attempt.foodId);
    if (bucket) bucket.push(attempt);
    else groups.set(attempt.foodId, [attempt]);
  }

  if (groups.size === 0) return null;

  const advanced: LadderFoodMove[] = [];
  const held: LadderFoodMove[] = [];
  const backedOff: LadderFoodMove[] = [];
  let masteredCount = 0;
  let totalExposures = 0;

  for (const [foodId, rows] of groups) {
    const ordered = [...rows].sort((a, b) => {
      const at = a.attemptedAt ?? '';
      const bt = b.attemptedAt ?? '';
      if (at === bt) return 0;
      return at < bt ? -1 : 1;
    });

    const week = replayFood(ordered, weekStart, weekEnd);
    if (!week) continue;

    if (week.endState.status === 'mastered') masteredCount += 1;
    if (week.exposures === 0) continue;

    totalExposures += week.exposures;
    const move: LadderFoodMove = {
      foodId,
      foodName: foodNames?.[foodId] ?? foodId,
      fromRung: week.startState.currentRung,
      toRung: week.endState.currentRung,
      exposures: week.exposures,
      masteredThisWeek:
        week.endState.status === 'mastered' && week.startState.status !== 'mastered',
    };

    switch (classify(week)) {
      case 'advanced':
        advanced.push(move);
        break;
      case 'backed_off':
        backedOff.push(move);
        break;
      default:
        held.push(move);
    }
  }

  // Stable output so the report does not reshuffle between renders.
  const byName = (a: LadderFoodMove, b: LadderFoodMove) => a.foodName.localeCompare(b.foodName);
  advanced.sort(byName);
  held.sort(byName);
  backedOff.sort(byName);

  const foodsWorkedOn = advanced.length + held.length + backedOff.length;

  return {
    advanced,
    held,
    backedOff,
    masteredCount,
    foodsWorkedOn,
    totalExposures,
    headline:
      foodsWorkedOn === 0
        ? { kind: 'empty_week' }
        : {
            kind: 'week',
            exposures: totalExposures,
            foods: foodsWorkedOn,
            advanced: advanced.length,
          },
    narrative: buildNarrative({ advanced, held, backedOff, masteredCount, foodsWorkedOn }),
  };
}

function buildNarrative(args: {
  advanced: LadderFoodMove[];
  held: LadderFoodMove[];
  backedOff: LadderFoodMove[];
  masteredCount: number;
  foodsWorkedOn: number;
}): LadderNarrativeLine[] {
  const { advanced, held, backedOff, masteredCount, foodsWorkedOn } = args;
  const lines: LadderNarrativeLine[] = [];

  const mastered = advanced.filter((m) => m.masteredThisWeek);
  const stepped = advanced.filter((m) => !m.masteredThisWeek);

  if (stepped.length > 0) lines.push({ kind: 'moved_up', foods: stepped });
  if (mastered.length > 0) lines.push({ kind: 'mastered', foods: mastered });
  if (held.length > 0) lines.push({ kind: 'held', foods: held });
  if (backedOff.length > 0) lines.push({ kind: 'backed_off', foods: backedOff });

  // A week with no advancement gets an encouraging read, never an empty or
  // negative one. This is the line that keeps the report honest about how slow
  // this work actually is.
  if (advanced.length === 0) {
    lines.push(foodsWorkedOn === 0 ? { kind: 'nothing_logged' } : { kind: 'no_advancement' });
  }

  if (masteredCount > 0) lines.push({ kind: 'mastered_total', count: masteredCount });

  return lines;
}
