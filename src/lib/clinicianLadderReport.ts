/**
 * Clinician-shareable ladder report — data assembly (US-605).
 *
 * Pure module. Turns a date range of ladder work into the summary a parent
 * hands a feeding therapist, so appointment time goes on decisions instead of
 * trying to remember what happened six weeks ago.
 *
 * Two things shape what is in here.
 *
 * A clinician needs the *shape* of the work, not a highlight reel: where each
 * food sits now, how it got there, how many attempts it took and what was
 * actually refused. So outcome counts are reported raw, refusals and distress
 * included. A report that only showed wins would be useless in the room.
 *
 * And it must carry as little about the child as it can. The report type has
 * exactly one identifier — a first name — because there is no way to leak a
 * DOB, an address or a household id through a structure that cannot hold one.
 * That is enforced by the type, not by remembering to strip fields later.
 *
 * Rung history is read from `food_attempts.stage` as it was logged, not
 * re-derived through the progression policy: this is a record of what was
 * tried, and a replay would quietly rewrite history if the policy ever
 * changed. Nothing here reads the clock or touches Supabase.
 */

import { isRung, type Rung } from './exposureLadder';

/** Outcomes as stored in `food_attempts.outcome`. */
export type ReportOutcome = 'success' | 'partial' | 'refused' | 'tantrum';

/** A prep method needs at least this many attempts before it is ranked. */
export const MIN_PREP_ATTEMPTS = 2;
/** How many prep methods to list per food. A long list is not an insight. */
export const MAX_PREPS_LISTED = 3;

export interface ClinicianReportAttempt {
  foodId: string | null;
  /** `food_attempts.stage` — the rung the attempt was logged at. */
  stage: string | null;
  outcome: string | null;
  /** ISO timestamp or 'YYYY-MM-DD'. */
  attemptedAt: string | null;
  /** `food_attempts.preparation_method`. */
  preparationMethod: string | null;
}

export interface ClinicianReportLadderRow {
  foodId: string;
  currentRung: Rung;
  status: string;
}

export interface ClinicianReportInput {
  /** First name only. The type deliberately has nowhere to put more. */
  kidFirstName: string;
  /** Inclusive ISO 'YYYY-MM-DD'. */
  from: string;
  /** Inclusive ISO 'YYYY-MM-DD'. */
  to: string;
  attempts: ClinicianReportAttempt[];
  /** Current ladder state, for the "where is this food now" column. */
  ladderRows: ClinicianReportLadderRow[];
  /** foodId -> display name. Missing ids fall back to the id. */
  foodNames?: Record<string, string>;
}

export interface PrepAcceptance {
  method: string;
  attempts: number;
  /** 0..1, partials at half credit. */
  acceptanceRate: number;
}

export interface RungChange {
  rung: Rung;
  /** ISO 'YYYY-MM-DD' the rung was first logged at within the range. */
  on: string;
}

export interface OutcomeCounts {
  success: number;
  partial: number;
  refused: number;
  tantrum: number;
  total: number;
}

export interface ClinicianReportRow {
  foodId: string;
  foodName: string;
  /** Where the food sits now. Null when it has no ladder row. */
  currentRung: Rung | null;
  status: string | null;
  /** Rung as first logged inside the range. */
  startRung: Rung | null;
  /** Rung changes within the range, oldest first. Includes the start. */
  rungHistory: RungChange[];
  outcomeCounts: OutcomeCounts;
  /** Ranked by observed acceptance, best first. May be empty. */
  bestPreps: PrepAcceptance[];
}

export interface ClinicianLadderReport {
  kidFirstName: string;
  from: string;
  to: string;
  rows: ClinicianReportRow[];
  totals: { foods: number; attempts: number; mastered: number };
}

function isOutcome(value: unknown): value is ReportOutcome {
  return value === 'success' || value === 'partial' || value === 'refused' || value === 'tantrum';
}

function dayOf(value: string): string {
  const t = value.indexOf('T');
  return t > 0 ? value.slice(0, t) : value;
}

function emptyCounts(): OutcomeCounts {
  return { success: 0, partial: 0, refused: 0, tantrum: 0, total: 0 };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface PrepTally {
  /** First-seen spelling, so the report reads the way the parent typed it. */
  label: string;
  attempts: number;
  credit: number;
}

/**
 * Assemble the report.
 *
 * Rows are ordered most-worked first — a clinician scanning the page wants the
 * food the family has put the most effort into at the top — with ties broken
 * by name so the same range always produces the same document.
 */
export function buildClinicianLadderReport(input: ClinicianReportInput): ClinicianLadderReport {
  const { kidFirstName, from, to, attempts, ladderRows, foodNames } = input;

  const ladderByFood = new Map(ladderRows.map((row) => [row.foodId, row]));

  const inRange = attempts
    .filter((attempt) => {
      if (!attempt.foodId || !attempt.attemptedAt) return false;
      if (!isOutcome(attempt.outcome)) return false;
      const day = dayOf(attempt.attemptedAt);
      return day >= from && day <= to;
    })
    .sort((a, b) => {
      const at = a.attemptedAt ?? '';
      const bt = b.attemptedAt ?? '';
      if (at === bt) return 0;
      return at < bt ? -1 : 1;
    });

  const counts = new Map<string, OutcomeCounts>();
  const history = new Map<string, RungChange[]>();
  const preps = new Map<string, Map<string, PrepTally>>();

  for (const attempt of inRange) {
    const foodId = attempt.foodId as string;
    const outcome = attempt.outcome as ReportOutcome;
    const day = dayOf(attempt.attemptedAt as string);

    const tally = counts.get(foodId) ?? emptyCounts();
    tally[outcome] += 1;
    tally.total += 1;
    counts.set(foodId, tally);

    if (isRung(attempt.stage)) {
      const log = history.get(foodId) ?? [];
      // Only transitions are recorded — a food worked at the same rung for
      // three weeks should read as one line, not twenty.
      if (log.length === 0 || log[log.length - 1].rung !== attempt.stage) {
        log.push({ rung: attempt.stage, on: day });
      }
      history.set(foodId, log);
    }

    const method = attempt.preparationMethod?.trim();
    if (method) {
      const byMethod = preps.get(foodId) ?? new Map<string, PrepTally>();
      const key = method.toLowerCase();
      const entry = byMethod.get(key) ?? { label: method, attempts: 0, credit: 0 };
      entry.attempts += 1;
      entry.credit += outcome === 'success' ? 1 : outcome === 'partial' ? 0.5 : 0;
      byMethod.set(key, entry);
      preps.set(foodId, byMethod);
    }
  }

  // Every food touched in the range, plus every food currently on the ladder —
  // a food paused before the range still belongs in "where things stand".
  const foodIds = new Set<string>([...counts.keys(), ...ladderByFood.keys()]);

  const rows: ClinicianReportRow[] = [...foodIds].map((foodId) => {
    const ladderRow = ladderByFood.get(foodId);
    const rungHistory = history.get(foodId) ?? [];
    const byMethod = preps.get(foodId);

    const bestPreps = [...(byMethod?.values() ?? [])]
      .filter((entry) => entry.attempts >= MIN_PREP_ATTEMPTS)
      .map((entry) => ({
        method: entry.label,
        attempts: entry.attempts,
        acceptanceRate: round2(entry.credit / entry.attempts),
      }))
      .sort((a, b) => {
        if (b.acceptanceRate !== a.acceptanceRate) return b.acceptanceRate - a.acceptanceRate;
        if (b.attempts !== a.attempts) return b.attempts - a.attempts;
        return a.method.localeCompare(b.method);
      })
      .slice(0, MAX_PREPS_LISTED);

    return {
      foodId,
      foodName: foodNames?.[foodId] ?? foodId,
      currentRung: ladderRow?.currentRung ?? null,
      status: ladderRow?.status ?? null,
      startRung: rungHistory[0]?.rung ?? null,
      rungHistory,
      outcomeCounts: counts.get(foodId) ?? emptyCounts(),
      bestPreps,
    };
  });

  rows.sort((a, b) => {
    if (b.outcomeCounts.total !== a.outcomeCounts.total) {
      return b.outcomeCounts.total - a.outcomeCounts.total;
    }
    return a.foodName.localeCompare(b.foodName);
  });

  return {
    kidFirstName,
    from,
    to,
    rows,
    totals: {
      foods: rows.length,
      attempts: inRange.length,
      mastered: ladderRows.filter((row) => row.status === 'mastered').length,
    },
  };
}
