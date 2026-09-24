/**
 * Exposure ladder data layer (US-598 / US-600 / US-602).
 *
 * Owns every read and write of `kid_food_ladder` for the active child, and
 * is the one place that closes the loop the app has never closed: a logged
 * attempt advances the ladder, and the attempt id is written back onto the
 * originating plan entry via `plan_entries.food_attempt_id` — a column that
 * Planner.tsx has been setting since US-231 and that nothing has ever read.
 *
 * All progression decisions come from the pure policy in
 * `src/lib/exposureLadder.ts`; this module only persists what it decides.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { generateId } from '@/lib/utils';
import { checkFeatureLimit } from '@/lib/featureLimits';
import { requestUpgradePrompt } from '@/lib/upgradePromptBus';
import { notifyFoodAttemptLogged } from '@/lib/foodAttemptHistory';
import {
  applyAttemptOutcome,
  deriveLadderFromAttempts,
  firstFreeDueDate,
  initialLadderState,
  isRung,
  prevRung,
  type AttemptOutcome,
  type DueDateRow,
  type LadderState,
  type LadderStatus,
  type Rung,
} from '@/lib/exposureLadder';
import {
  bucketPickiness,
  contributeChainNetworkSuccess,
  recordContributionsFromAttempt,
} from '@/lib/chainNetwork';
import {
  buildWinContribution,
  selectHandoffCandidates,
  type ChainSuggestion,
  type MasteryCandidate,
} from '@/lib/ladderMastery';
import {
  buildExposurePlanWrites,
  selectDueExposures,
  successRatesFromAttempts,
  type SchedulableLadderRow,
  type SchedulerFood,
  type SchedulerKid,
  type SchedulerResult,
} from '@/lib/ladderScheduler';

/** What a one-tap control reports. Mapped to a food_attempts outcome. */
export type QuickLogResult = 'accepted' | 'held' | 'refused';

const QUICK_LOG_OUTCOME: Record<QuickLogResult, AttemptOutcome> = {
  accepted: 'success',
  held: 'partial',
  refused: 'refused',
};

export interface LadderRow {
  id: string;
  kidId: string;
  foodId: string;
  currentRung: Rung;
  consecutiveSuccesses: number;
  consecutiveHolds: number;
  consecutiveRefusals: number;
  status: LadderStatus;
  nextDueOn: string | null;
  lastAttemptAt: string | null;
  pairedSafeFoodId: string | null;
  preferredPrep: string | null;
  preferredMealSlot: string | null;
  pausedReason: string | null;
}

interface LadderDbRow {
  id: string;
  kid_id: string;
  food_id: string;
  current_rung: string;
  consecutive_successes: number;
  consecutive_holds: number;
  consecutive_refusals: number;
  status: string;
  next_due_on: string | null;
  last_attempt_at: string | null;
  paired_safe_food_id: string | null;
  preferred_prep: string | null;
  preferred_meal_slot: string | null;
  paused_reason: string | null;
}

const SELECT_COLUMNS =
  'id, kid_id, food_id, current_rung, consecutive_successes, consecutive_holds, ' +
  'consecutive_refusals, status, next_due_on, last_attempt_at, paired_safe_food_id, ' +
  'preferred_prep, preferred_meal_slot, paused_reason';

/** DB is snake_case, UI is camelCase — same convention as normalizeRecipeFromDB. */
export function normalizeLadderRow(row: LadderDbRow): LadderRow {
  return {
    id: row.id,
    kidId: row.kid_id,
    foodId: row.food_id,
    currentRung: isRung(row.current_rung) ? row.current_rung : 'looking',
    consecutiveSuccesses: row.consecutive_successes ?? 0,
    consecutiveHolds: row.consecutive_holds ?? 0,
    consecutiveRefusals: row.consecutive_refusals ?? 0,
    status: (row.status as LadderStatus) ?? 'active',
    nextDueOn: row.next_due_on,
    lastAttemptAt: row.last_attempt_at,
    pairedSafeFoodId: row.paired_safe_food_id,
    preferredPrep: row.preferred_prep,
    preferredMealSlot: row.preferred_meal_slot,
    pausedReason: row.paused_reason,
  };
}

export function toLadderState(row: LadderRow): LadderState {
  return {
    currentRung: row.currentRung,
    consecutiveSuccesses: row.consecutiveSuccesses,
    consecutiveHolds: row.consecutiveHolds,
    consecutiveRefusals: row.consecutiveRefusals,
    status: row.status,
    nextDueOn: row.nextDueOn,
    lastAttemptAt: row.lastAttemptAt,
    pausedReason: row.pausedReason,
  };
}

function stateToUpdate(state: LadderState) {
  return {
    current_rung: state.currentRung,
    consecutive_successes: state.consecutiveSuccesses,
    consecutive_holds: state.consecutiveHolds,
    consecutive_refusals: state.consecutiveRefusals,
    status: state.status,
    next_due_on: state.nextDueOn,
    last_attempt_at: state.lastAttemptAt,
    paused_reason: state.pausedReason,
  };
}

/** Local ISO date, so "today" matches the parent's calendar, not UTC's. */
export function todayIsoDate(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export interface QuickLogArgs {
  row: LadderRow;
  result: QuickLogResult;
  /** Plan entry this exposure came from, when it was scheduled. */
  planEntryId?: string | null;
  mealSlot?: string | null;
}

/** plan_entries.result vocabulary, which predates the ladder. */
const PLAN_RESULT: Record<QuickLogResult, 'ate' | 'tasted' | 'refused'> = {
  accepted: 'ate',
  held: 'tasted',
  refused: 'refused',
};

/**
 * The same mapping read the other way: what a meal result means on the ladder.
 * create_attempt_from_plan_result (20260926000002) writes the attempt outcome
 * with exactly this correspondence, so a meal logged "tasted" holds the rung
 * the way a ladder "held" tap does.
 */
export const LADDER_RESULT_FOR_PLAN: Record<'ate' | 'tasted' | 'refused', QuickLogResult> = {
  ate: 'accepted',
  tasted: 'held',
  refused: 'refused',
};

/** food_attempts.mood_before / mood_after vocabulary (20251008150000). */
export const ATTEMPT_MOODS = ['happy', 'neutral', 'anxious', 'resistant'] as const;
/** food_attempts.amount_consumed vocabulary (20251008150000). */
export const ATTEMPT_AMOUNTS = ['none', 'quarter', 'half', 'most', 'all'] as const;
export const MAX_ATTEMPT_NOTE_LENGTH = 1000;
export const MAX_ATTEMPT_BITES = 50;

/**
 * Optional detail a parent can add to a log. Anything left unset is written
 * as null: a log with no mood recorded is not a happy one, and inventing that
 * is how the old tracker filled its history with defaults nobody chose.
 */
export interface AttemptDetails {
  reactionNotes?: string | null;
  parentNotes?: string | null;
  moodBefore?: string | null;
  moodAfter?: string | null;
  bitesTaken?: number | null;
  amountConsumed?: string | null;
  isMilestone?: boolean;
}

const attemptNote = z
  .string()
  .trim()
  .max(MAX_ATTEMPT_NOTE_LENGTH)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

/** Boundary validation for AttemptDetails before anything is written. */
export const attemptDetailsSchema = z.object({
  reactionNotes: attemptNote,
  parentNotes: attemptNote,
  moodBefore: z.enum(ATTEMPT_MOODS).nullable().optional(),
  moodAfter: z.enum(ATTEMPT_MOODS).nullable().optional(),
  bitesTaken: z.number().int().min(0).max(MAX_ATTEMPT_BITES).nullable().optional(),
  amountConsumed: z.enum(ATTEMPT_AMOUNTS).nullable().optional(),
  isMilestone: z.boolean().optional(),
});

function cleanNote(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

export interface AttemptInsertRow {
  /** Client-generated, so a replayed insert is a 23505 rather than a second row. */
  id: string;
  kid_id: string;
  food_id: string;
  stage: Rung;
  outcome: AttemptOutcome;
  attempted_at: string;
  meal_slot: string | null;
  preparation_method: string | null;
  reaction_notes: string | null;
  parent_notes: string | null;
  mood_before: string | null;
  mood_after: string | null;
  bites_taken: number | null;
  amount_consumed: string | null;
  is_milestone: boolean;
  plan_entry_id?: string;
}

export interface QuickLogWrites {
  attemptRow: AttemptInsertRow;
  planPatch: { result: 'ate' | 'tasted' | 'refused' } | null;
  ladderUpdate: ReturnType<typeof stateToUpdate>;
  nextState: LadderState;
}

/**
 * Keep an active row's due date under the per-day exposure cap. `rows` is
 * the child's ladder as the client last saw it; the row itself is excluded.
 */
function capDueDate(state: LadderState, row: LadderRow, rows: readonly DueDateRow[]): LadderState {
  if (state.status !== 'active' || !state.nextDueOn) return state;
  const nextDueOn = firstFreeDueDate(rows, row.kidId, state.nextDueOn, row.id);
  return nextDueOn === state.nextDueOn ? state : { ...state, nextDueOn };
}

/**
 * Build every write a one-tap log produces, without performing any of them.
 *
 * Pure, so the mapping from a parent's tap to (attempt outcome, plan result,
 * new ladder state) is pinned by tests rather than living inside an async
 * handler. Note the attempt is recorded at the rung the child was actually
 * asked for — `row.currentRung` — not the rung they end up on afterwards.
 */
export function buildQuickLogWrites(args: {
  row: LadderRow;
  result: QuickLogResult;
  now: string;
  today: string;
  mealSlot?: string | null;
  /** Real distress at the table. Recorded as a tantrum, which backs the row off. */
  hardTime?: boolean;
  planEntryId?: string | null;
  details?: AttemptDetails;
  /** Defaults to a fresh uuid. Pass one to make a retry idempotent. */
  attemptId?: string;
  /** The child's other ladder rows; when given, the due date is capped. */
  siblings?: readonly DueDateRow[];
}): QuickLogWrites {
  const { row, result, now, today, mealSlot, hardTime, planEntryId, siblings } = args;
  const details = args.details ?? {};
  const outcome: AttemptOutcome = hardTime ? 'tantrum' : QUICK_LOG_OUTCOME[result];
  let nextState = applyAttemptOutcome(toLadderState(row), outcome, {
    today,
    attemptAt: now,
  });
  if (siblings) nextState = capDueDate(nextState, row, siblings);

  const attemptRow: AttemptInsertRow = {
    id: args.attemptId || generateId(),
    kid_id: row.kidId,
    food_id: row.foodId,
    stage: row.currentRung,
    outcome,
    attempted_at: now,
    meal_slot: mealSlot ?? row.preferredMealSlot,
    preparation_method: row.preferredPrep,
    reaction_notes: cleanNote(details.reactionNotes),
    parent_notes: cleanNote(details.parentNotes),
    mood_before: details.moodBefore ?? null,
    mood_after: details.moodAfter ?? null,
    bites_taken: details.bitesTaken ?? null,
    amount_consumed: details.amountConsumed ?? null,
    // The column is a flag with a DB default of false; false is "not marked".
    is_milestone: details.isMilestone ?? false,
  };
  if (planEntryId) attemptRow.plan_entry_id = planEntryId;

  return {
    attemptRow,
    planPatch: { result: hardTime ? 'refused' : PLAN_RESULT[result] },
    ladderUpdate: stateToUpdate(nextState),
    nextState,
  };
}

export interface LogAttemptArgs {
  /** The row as the caller saw it. Only its id is trusted; state is re-read. */
  row?: LadderRow;
  foodId: string;
  result: QuickLogResult;
  hardTime?: boolean;
  planEntryId?: string | null;
  mealSlot?: string | null;
  details?: AttemptDetails;
  attemptId?: string;
}

export type LogResult =
  | {
      ok: true;
      attemptId: string;
      /** The row before this log, for undoLog. Null when nothing to restore. */
      previous: LadderRow | null;
      /** False when the attempt landed but the rung move did not. */
      ladderSynced: boolean;
    }
  | { ok: false; reason: 'limit' | 'in_flight' | 'cap' | 'error' };

export type StartFoodResult =
  | { ok: true; row: LadderRow }
  | { ok: false; reason: 'duplicate' | 'cap' | 'error' };

/** How long a mastery waits for an Undo before the handoff is offered. */
export const MASTERY_UNDO_WINDOW_MS = 6000;

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as PostgrestLikeError | null)?.code === '23505';
}

function isExposureCapError(error: unknown): boolean {
  return ((error as PostgrestLikeError | null)?.message ?? '').includes('ladder_exposure_cap');
}

interface FoodTrackerGate {
  userId: string | null;
  allowed: boolean;
  limit: number | null;
  current: number;
  message?: string;
}

/** Local session read; no network round trip, unlike auth.getUser(). */
async function sessionUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Write a ladder state, but only over the version the caller based it on.
 * 'stale' means another device (or another fold) moved the row first.
 */
async function writeLadderOver(
  base: Pick<LadderRow, 'id' | 'lastAttemptAt'>,
  state: LadderState
): Promise<'ok' | 'stale' | 'error'> {
  let query = supabase.from('kid_food_ladder').update(stateToUpdate(state)).eq('id', base.id);
  query =
    base.lastAttemptAt === null
      ? query.is('last_attempt_at', null)
      : query.eq('last_attempt_at', base.lastAttemptAt);
  const { data, error: updateError } = await query.select('id');
  if (updateError) {
    logger.error('Ladder update failed:', updateError);
    return 'error';
  }
  return (data ?? []).length > 0 ? 'ok' : 'stale';
}

// ---------------------------------------------------------------------------
// Meal results -> ladder (item 41)
// ---------------------------------------------------------------------------

/** Statuses a meal result moves. Paused and mastered rows are the parent's call. */
const FOLDABLE_STATUSES: readonly LadderStatus[] = ['active', 'backed_off'];

/**
 * No meal result older than this is folded into a ladder. Attempts written
 * before item 41 were stamped under a contract where meal results never moved
 * the ladder, so replaying months of them on the first load after deploy
 * would jump a beta child several rungs (or pause a food over two old
 * refusals). Set to the day the fold was built; results between this and the
 * deploy are the only history it will ever read.
 */
export const PLAN_FOLD_EPOCH = '2026-09-24T00:00:00.000Z';

/** The later of two ISO timestamps; null only when both are. */
function laterOf(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/** A food_attempts row a plan result produced, as the fold reads it. */
export interface PlanAttempt {
  id: string;
  foodId: string;
  outcome: string;
  attemptedAt: string;
}

/** Local calendar date of an ISO timestamp, the way todayIsoDate reads now. */
function localIsoDate(timestamp: string): string {
  const at = new Date(timestamp);
  if (Number.isNaN(at.getTime())) return todayIsoDate();
  const offsetMs = at.getTimezoneOffset() * 60_000;
  return new Date(at.getTime() - offsetMs).toISOString().slice(0, 10);
}

function isFoldableOutcome(value: string): value is AttemptOutcome {
  return value === 'success' || value === 'partial' || value === 'refused' || value === 'tantrum';
}

/**
 * Fold the attempts a meal result wrote into one ladder row. Pure.
 *
 * Setting plan_entries.result fires create_attempt_from_plan_result, which
 * writes the attempt (at the row's rung, since 20260926000002) but does not
 * move the ladder. This applies those attempts with applyAttemptOutcome, the
 * same policy a ladder tap goes through, so a meal "tasted" and a ladder
 * "held" land on the same state.
 *
 * Exactly once: only attempts strictly newer than `since` (the row's
 * last_attempt_at, or its created_at when nothing was ever folded) count, and
 * the result carries the newest one's timestamp as lastAttemptAt. Folding the
 * same attempts again over the written state finds nothing newer.
 *
 * Returns null when nothing applies.
 */
export function foldPlanAttempts(
  row: LadderRow,
  attempts: readonly PlanAttempt[],
  since: string | null,
  siblings?: readonly DueDateRow[]
): { state: LadderState; applied: string[] } | null {
  if (!FOLDABLE_STATUSES.includes(row.status)) return null;
  const sinceMs = since ? Date.parse(since) : Number.NEGATIVE_INFINITY;
  const pending = attempts
    .filter(
      (a) =>
        a.foodId === row.foodId &&
        isFoldableOutcome(a.outcome) &&
        Date.parse(a.attemptedAt) > sinceMs
    )
    .sort((a, b) => Date.parse(a.attemptedAt) - Date.parse(b.attemptedAt));
  if (pending.length === 0) return null;

  let state = toLadderState(row);
  const applied: string[] = [];
  for (const attempt of pending) {
    // A refusal that pauses the row ends the run: what comes after it is a
    // meal, not a ladder exposure, until a parent resumes the food.
    if (!FOLDABLE_STATUSES.includes(state.status)) break;
    state = applyAttemptOutcome(state, attempt.outcome as AttemptOutcome, {
      today: localIsoDate(attempt.attemptedAt),
      attemptAt: attempt.attemptedAt,
    });
    applied.push(attempt.id);
  }
  if (siblings) state = capDueDate(state, row, siblings);
  return { state, applied };
}

type LadderSyncListener = (kidId: string, source: symbol | null) => void;
const ladderSyncListeners = new Set<LadderSyncListener>();

/** "This child's ladder moved outside this hook." In-process only. */
function notifyLadderSynced(kidId: string, source: symbol | null): void {
  for (const listener of [...ladderSyncListeners]) {
    try {
      listener(kidId, source);
    } catch {
      // A broken listener must not fail the log that triggered it.
    }
  }
}

/**
 * Apply every meal-result attempt this child's ladder has not seen yet.
 *
 * Runs after a quick log (syncLadderAfterPlanResult) and whenever a ladder
 * loads, which is how a result an older iOS build set straight on
 * plan_entries reaches the ladder. Only attempts with a plan_entry_id are
 * read: those are the ones the trigger writes, and the ladder's own logs
 * (web or iOS) move the rung themselves. Each row is written over the
 * last_attempt_at it was read at, so two folds racing (two tabs, the Home
 * card and Food Tracker) move it once; the loser sees 'stale' and stops.
 *
 * Returns the rows it moved. Never throws.
 */
export async function syncLadderFromPlanAttempts(
  kidId: string,
  opts: { foodIds?: readonly string[]; source?: symbol | null } = {}
): Promise<LadderRow[]> {
  try {
    let ladderQuery = supabase
      .from('kid_food_ladder')
      .select(`${SELECT_COLUMNS}, created_at`)
      .eq('kid_id', kidId);
    if (opts.foodIds) ladderQuery = ladderQuery.in('food_id', [...opts.foodIds]);
    const { data: ladderData, error: ladderError } = await ladderQuery;
    if (ladderError) throw ladderError;

    const all = (ladderData ?? []).map((raw) => {
      const db = raw as unknown as LadderDbRow & { created_at?: string | null };
      return {
        row: normalizeLadderRow(db),
        since: laterOf(db.last_attempt_at ?? db.created_at ?? null, PLAN_FOLD_EPOCH),
      };
    });
    const foldable = all.filter(({ row }) => FOLDABLE_STATUSES.includes(row.status));
    if (foldable.length === 0) return [];

    // One read for every row: from the oldest point any of them has seen.
    const floors = foldable.map((f) => f.since);
    const oldest = floors.includes(null)
      ? null
      : floors.reduce<string | null>(
          (min, s) => (min === null || (s !== null && Date.parse(s) < Date.parse(min)) ? s : min),
          null
        );
    let attemptQuery = supabase
      .from('food_attempts')
      .select('id, food_id, outcome, attempted_at')
      .eq('kid_id', kidId)
      .not('plan_entry_id', 'is', null)
      .in(
        'food_id',
        foldable.map((f) => f.row.foodId)
      );
    if (oldest) attemptQuery = attemptQuery.gt('attempted_at', oldest);
    const { data: attemptData, error: attemptError } = await attemptQuery.order('attempted_at', {
      ascending: true,
    });
    if (attemptError) throw attemptError;

    const attempts: PlanAttempt[] = (attemptData ?? []).flatMap((a) =>
      a.id && a.food_id && a.outcome && a.attempted_at
        ? [{ id: a.id, foodId: a.food_id, outcome: a.outcome, attemptedAt: a.attempted_at }]
        : []
    );
    if (attempts.length === 0) return [];

    const siblings = all.map(({ row }) => row);
    const moved: LadderRow[] = [];
    for (const { row, since } of foldable) {
      const folded = foldPlanAttempts(row, attempts, since, siblings);
      if (!folded) continue;
      const written = await writeLadderOver(row, folded.state);
      if (written === 'ok') moved.push({ ...row, ...folded.state });
    }
    if (moved.length > 0) notifyLadderSynced(kidId, opts.source ?? null);
    return moved;
  } catch (syncError) {
    logger.warn('Folding meal results into the ladder failed:', syncError);
    return [];
  }
}

/**
 * After a meal result is saved: move that food's rung if the child has it on
 * an active ladder. What performQuickLog calls, so the shell quick log, the
 * Home "today" card and the journal editor all get it.
 */
export async function syncLadderAfterPlanResult(planEntryId: string): Promise<LadderRow[]> {
  try {
    const { data, error: readError } = await supabase
      .from('plan_entries')
      .select('kid_id, food_id')
      .eq('id', planEntryId)
      .maybeSingle();
    if (readError) throw readError;
    const kidId = data?.kid_id;
    const foodId = data?.food_id;
    if (!kidId || !foodId) return [];
    const moved = await syncLadderFromPlanAttempts(kidId, { foodIds: [foodId] });
    // The trigger wrote an attempt either way; the history under the ladder
    // should show it without a page visit.
    notifyFoodAttemptLogged(kidId);
    return moved;
  } catch (syncError) {
    logger.warn('Could not move the ladder after a meal result:', syncError);
    return [];
  }
}

export interface UseFoodLadderOptions {
  /** Kid record, used for the Win Network pickiness bucket and allergens. */
  kid?: { pickiness_level?: string | null; allergens?: string[] } | null;
  /** Food names/allergens for building mastery candidates. */
  foods?: Array<{ id: string; name: string; allergens?: string[] }>;
  /** usePickyWinSharePref — a household that opted out contributes nothing. */
  shareWins?: boolean;
  /** Undo window before a mastery handoff is offered. Tests pass 0. */
  masteryDelayMs?: number;
}

export function useFoodLadder(
  activeKidId: string | null | undefined,
  options: UseFoodLadderOptions = {}
) {
  const [rows, setRowsState] = useState<LadderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'load_failed' | null>(null);
  const backfilledKids = useRef<Set<string>>(new Set());
  /** US-603: targets offered after a food graduates. */
  const [masteryCandidates, setMasteryCandidates] = useState<MasteryCandidate[]>([]);
  const [masteredFoodName, setMasteredFoodName] = useState<string | null>(null);

  // Held in a ref so the mastery handler is not rebuilt (and quickLog's
  // identity does not churn) every time the pantry array is replaced.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const activeKidRef = useRef(activeKidId ?? null);
  activeKidRef.current = activeKidId ?? null;

  /** Identifies this instance's own folds, so it does not re-read after them. */
  const [syncSource] = useState(() => Symbol('useFoodLadder'));

  // The ladder as last committed. Every write path reads the row it is about
  // to change from here by id, never from a caller's prop, which may be a
  // render or two stale. Updated synchronously with state, so two logs in a
  // row see each other's due dates for the per-day cap.
  const rowsRef = useRef<LadderRow[]>([]);
  const commitRows = useCallback(
    (next: LadderRow[] | ((current: LadderRow[]) => LadderRow[])) => {
      const value = typeof next === 'function' ? next(rowsRef.current) : next;
      rowsRef.current = value;
      setRowsState(value);
    },
    []
  );
  const replaceRow = useCallback(
    (id: string, update: (row: LadderRow) => LadderRow) => {
      commitRows((current) => current.map((r) => (r.id === id ? update(r) : r)));
    },
    [commitRows]
  );

  /** Row ids (or pending food keys) with a log on the wire. */
  const inFlight = useRef<Set<string>>(new Set());
  /** Attempts this hook has fully landed, so a repeat call is a no-op. */
  const landedAttempts = useRef<Set<string>>(new Set());
  /** Deferred mastery handoffs, keyed by the attempt that caused them. */
  const masteryTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** Plan-limit answer for food_tracker, fetched once per user per session. */
  const gateRef = useRef<FoodTrackerGate | null>(null);

  useEffect(() => {
    const timers = masteryTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const load = useCallback(async (kidId: string) => {
    const { data, error: loadError } = await supabase
      .from('kid_food_ladder')
      .select(SELECT_COLUMNS)
      .eq('kid_id', kidId);

    if (loadError) throw loadError;
    // Cast through unknown: the row type inferred from a select-column string
    // does not structurally overlap LadderDbRow under every tsconfig, and
    // normalizeLadderRow already defends against unexpected values.
    return (data ?? []).map((row) => normalizeLadderRow(row as unknown as LadderDbRow));
  }, []);

  const dismissMastery = useCallback(() => {
    setMasteryCandidates([]);
    setMasteredFoodName(null);
  }, []);

  useEffect(() => {
    // A kid change is the one time rows are cleared: the previous child's
    // ladder must not sit on screen (or take a tap) under the new child's
    // name. A failed load for the same child keeps what is showing.
    commitRows([]);
    setError(null);
    dismissMastery();

    if (!activeKidId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const loaded = await load(activeKidId);
        if (cancelled) return;
        commitRows(loaded);
        setLoading(false);
        // Item 41: meal results logged where no ladder was listening (an
        // older iOS build, the planner) move the rung now. Moved rows are
        // merged over what is showing, so a tap made meanwhile is kept.
        const moved = await syncLadderFromPlanAttempts(activeKidId, { source: syncSource });
        if (cancelled || moved.length === 0) return;
        const byId = new Map(moved.map((r) => [r.id, r]));
        commitRows((current) => current.map((r) => byId.get(r.id) ?? r));
      } catch (loadError) {
        logger.error('Failed to load food ladder:', loadError);
        if (!cancelled) setError('load_failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeKidId, load, commitRows, dismissMastery, syncSource]);

  const reload = useCallback(async () => {
    const kidId = activeKidId;
    if (!kidId) return;
    try {
      const loaded = await load(kidId);
      if (activeKidRef.current !== kidId) return;
      commitRows(loaded);
      setError(null);
    } catch (loadError) {
      logger.error('Failed to reload ladder:', loadError);
      if (activeKidRef.current === kidId) setError('load_failed');
    }
  }, [activeKidId, load, commitRows]);

  // Another surface (the shell quick log, another mounted ladder) folded a
  // meal result into this child's ladder: re-read so this one shows it.
  useEffect(
    () => {
      const listener: LadderSyncListener = (kidId, source) => {
        if (source === syncSource || kidId !== activeKidRef.current) return;
        void reload();
      };
      ladderSyncListeners.add(listener);
      return () => {
        ladderSyncListeners.delete(listener);
      };
    },
    [reload, syncSource]
  );

  /**
   * US-598: populate the ladder from a child's existing attempt history.
   *
   * Runs at most once per kid per session and is safe to call repeatedly —
   * the (kid_id, food_id) unique index makes the upsert idempotent, so a
   * second run reproduces the same rows rather than duplicating them.
   */
  const backfillFromHistory = useCallback(
    async (kidId: string): Promise<number> => {
      if (backfilledKids.current.has(kidId)) return 0;
      backfilledKids.current.add(kidId);

      try {
        const { data: attempts, error: attemptsError } = await supabase
          .from('food_attempts')
          .select('kid_id, food_id, stage, outcome, attempted_at')
          .eq('kid_id', kidId);

        if (attemptsError) throw attemptsError;

        const derived = deriveLadderFromAttempts(
          (attempts ?? []).map((a) => ({
            kidId: a.kid_id,
            foodId: a.food_id,
            stage: a.stage,
            outcome: a.outcome,
            attemptedAt: a.attempted_at,
          })),
          { today: todayIsoDate() }
        );

        if (derived.length === 0) return 0;

        // The DB caps how many exposures may be due on one day (US-602). A
        // backfill of a long history would otherwise trip that trigger, so
        // derived rows land unscheduled and the parent picks what to start.
        const payload = derived.map((d) => ({
          kid_id: d.kidId,
          food_id: d.foodId,
          ...stateToUpdate({ ...d.state, nextDueOn: null }),
        }));

        const { error: upsertError } = await supabase
          .from('kid_food_ladder')
          .upsert(payload, { onConflict: 'kid_id,food_id', ignoreDuplicates: true });

        if (upsertError) throw upsertError;

        const loaded = await load(kidId);
        if (activeKidRef.current === kidId) commitRows(loaded);
        return derived.length;
      } catch (backfillError) {
        logger.error('Ladder backfill failed:', backfillError);
        // Allow a retry on the next explicit request — a transient failure
        // should not permanently mark this kid as backfilled.
        backfilledKids.current.delete(kidId);
        return 0;
      }
    },
    [load, commitRows]
  );

  /**
   * US-603: a food just graduated — offer what to chain to next, and tell
   * the Win Network.
   *
   * Best-effort throughout. A failure here must never surface as an error on
   * top of what is, for the parent, unambiguously good news.
   */
  const handleMastery = useCallback(async (row: LadderRow, currentRows: LadderRow[]) => {
    const { kid, foods = [], shareWins = true } = optionsRef.current;
    const foodById = new Map(foods.map((f) => [f.id, f]));
    const masteredFood = foodById.get(row.foodId);

    try {
      const contribution = buildWinContribution({
        ladderRowId: row.id,
        sourceFoodName: row.pairedSafeFoodId
          ? foodById.get(row.pairedSafeFoodId)?.name ?? ''
          : masteredFood?.name ?? '',
        targetFoodName: masteredFood?.name ?? '',
        pickinessBucket: bucketPickiness(kid?.pickiness_level),
        shareEnabled: shareWins,
      });

      if (contribution) {
        void contributeChainNetworkSuccess(contribution);
      }
    } catch (contributionError) {
      logger.warn('Win Network contribution failed after mastery:', contributionError);
    }

    // The candidates are filtered against this child's allergens and ladder;
    // once the parent has switched child they would be offered to the wrong one.
    if (activeKidRef.current !== row.kidId) return;

    try {
      const { data, error: rpcError } = await supabase.rpc('get_food_chain_suggestions', {
        source_food: row.foodId,
        limit_count: 10,
      });
      if (rpcError) throw rpcError;

      const suggestions: ChainSuggestion[] = (data ?? []).map(
        (s: { food_id: string; food_name: string; similarity_score: number; reasons: string[] }) => ({
          foodId: s.food_id,
          foodName: s.food_name,
          similarityScore: s.similarity_score ?? 0,
          reasons: s.reasons ?? [],
        })
      );

      const candidates = selectHandoffCandidates(suggestions, {
        masteredFoodId: row.foodId,
        ladderFoodIds: currentRows.map((r) => r.foodId),
        kidAllergens: kid?.allergens ?? [],
        allergensByFoodId: new Map(foods.map((f) => [f.id, f.allergens ?? []])),
        kidId: row.kidId,
      });

      if (candidates.length > 0 && activeKidRef.current === row.kidId) {
        setMasteryCandidates(candidates);
        setMasteredFoodName(masteredFood?.name ?? null);
      }
    } catch (suggestionError) {
      logger.warn('Could not load next-step suggestions after mastery:', suggestionError);
    }
  }, []);

  /**
   * Plan-limit gate for food_tracker. Asks the server once per user per
   * session, then counts locally, so a log costs no extra round trip. The
   * server-side count is still bumped after every durable insert.
   */
  const passesGate = useCallback(async (userId: string | null): Promise<boolean> => {
    if (!gateRef.current || gateRef.current.userId !== userId) {
      const result = await checkFeatureLimit('food_tracker');
      gateRef.current = {
        userId,
        allowed: result.allowed !== false,
        limit: typeof result.limit === 'number' ? result.limit : null,
        current: typeof result.current === 'number' ? result.current : 0,
        message: result.message,
      };
    }
    const gate = gateRef.current;
    const blocked = !gate.allowed || (gate.limit !== null && gate.current >= gate.limit);
    if (blocked) {
      requestUpgradePrompt({ feature: 'Food tracking', message: gate.message });
      return false;
    }
    return true;
  }, []);

  /** Guarded ladder write; see writeLadderOver. */
  const writeLadderGuarded = useCallback(
    (base: LadderRow, state: LadderState) => writeLadderOver(base, state),
    []
  );

  /**
   * Start a food on this child's ladder. The first due date respects the
   * per-day cap, so a fourth food due today starts tomorrow instead of
   * failing.
   */
  const startFood = useCallback(
    async (
      foodId: string,
      opts: { pairedSafeFoodId?: string | null; kidId?: string } = {}
    ): Promise<StartFoodResult> => {
      const kidId = opts.kidId ?? activeKidRef.current;
      if (!kidId) return { ok: false, reason: 'error' };

      const today = todayIsoDate();
      const base = initialLadderState(today);
      const state: LadderState = {
        ...base,
        nextDueOn: firstFreeDueDate(rowsRef.current, kidId, today),
      };

      const { data, error: insertError } = await supabase
        .from('kid_food_ladder')
        .insert({
          kid_id: kidId,
          food_id: foodId,
          paired_safe_food_id: opts.pairedSafeFoodId ?? null,
          ...stateToUpdate(state),
        })
        .select(SELECT_COLUMNS)
        .single();

      if (insertError || !data) {
        if (isUniqueViolation(insertError)) return { ok: false, reason: 'duplicate' };
        logger.error('Failed to add food to ladder:', insertError);
        if (isExposureCapError(insertError)) return { ok: false, reason: 'cap' };
        return { ok: false, reason: 'error' };
      }

      const row = normalizeLadderRow(data as unknown as LadderDbRow);
      if (activeKidRef.current === row.kidId) {
        commitRows((current) =>
          current.some((r) => r.id === row.id) ? current : [...current, row]
        );
      }
      return { ok: true, row };
    },
    [commitRows]
  );

  /** A row that exists on the server but not locally, e.g. started elsewhere. */
  const fetchRowFor = useCallback(
    async (kidId: string, foodId: string): Promise<LadderRow | null> => {
      const { data, error: fetchError } = await supabase
        .from('kid_food_ladder')
        .select(SELECT_COLUMNS)
        .eq('kid_id', kidId)
        .eq('food_id', foodId)
        .maybeSingle();
      if (fetchError || !data) return null;
      const row = normalizeLadderRow(data as unknown as LadderDbRow);
      if (activeKidRef.current === row.kidId) {
        commitRows((current) =>
          current.some((r) => r.id === row.id)
            ? current.map((r) => (r.id === row.id ? row : r))
            : [...current, row]
        );
      }
      return row;
    },
    [commitRows]
  );

  /**
   * Every log on the Food Tracker goes through here (US-600 and after): the
   * attempt row, the plan-entry link, the rung, mastery and the plan-limit
   * gate move together.
   *
   * - The attempt id is generated here, so a retry with the same id is a
   *   23505 the hook reads as "already landed", never a second row.
   * - The attempt is the durable fact. If it lands and the rung move does
   *   not, the log is kept and reported as `ladderSynced: false`; rolling
   *   the rung back would invite the parent to log the same bite twice.
   * - A second tap on a row that is still saving is ignored.
   */
  const logAttempt = useCallback(
    async (args: LogAttemptArgs): Promise<LogResult> => {
      const { foodId, result, hardTime, planEntryId, mealSlot } = args;
      const kidId = args.row?.kidId ?? activeKidRef.current;
      if (!kidId) return { ok: false, reason: 'error' };

      const findRow = (): LadderRow | undefined =>
        (args.row ? rowsRef.current.find((r) => r.id === args.row?.id) : undefined) ??
        rowsRef.current.find((r) => r.foodId === foodId && r.kidId === kidId);

      // Claimed synchronously, before the first await, so a double tap
      // cannot slip in behind it.
      let row = findRow();
      const pendingKey = `food:${kidId}:${foodId}`;
      const claimed = [row?.id ?? pendingKey];
      if (claimed.some((key) => inFlight.current.has(key))) {
        return { ok: false, reason: 'in_flight' };
      }
      claimed.forEach((key) => inFlight.current.add(key));

      try {
        if (args.attemptId && landedAttempts.current.has(args.attemptId)) {
          return { ok: true, attemptId: args.attemptId, previous: null, ladderSynced: true };
        }

        const parsed = attemptDetailsSchema.safeParse(args.details ?? {});
        if (!parsed.success) {
          logger.warn('Rejected attempt details:', parsed.error.flatten());
          return { ok: false, reason: 'error' };
        }

        const userId = await sessionUserId();
        if (!(await passesGate(userId))) return { ok: false, reason: 'limit' };

        if (!row) {
          const started = await startFood(foodId, { kidId });
          if (started.ok) {
            row = started.row;
          } else if (started.reason === 'duplicate') {
            row = (await fetchRowFor(kidId, foodId)) ?? undefined;
          } else {
            return { ok: false, reason: started.reason };
          }
          if (!row) return { ok: false, reason: 'error' };
          if (inFlight.current.has(row.id)) return { ok: false, reason: 'in_flight' };
          inFlight.current.add(row.id);
          claimed.push(row.id);
        }

        const previous = rowsRef.current.find((r) => r.id === row?.id) ?? row;
        const now = new Date().toISOString();
        const today = todayIsoDate();
        const writes = buildQuickLogWrites({
          row: previous,
          result,
          hardTime,
          now,
          today,
          mealSlot,
          planEntryId,
          details: parsed.data,
          attemptId: args.attemptId,
          siblings: rowsRef.current,
        });
        const attemptId = writes.attemptRow.id;
        const outcome = writes.attemptRow.outcome;
        let finalState = writes.nextState;

        replaceRow(previous.id, (r) => ({ ...r, ...writes.nextState }));

        // Reserve the entry against the cached limit before the insert, so
        // two quick logs on different rows cannot both squeeze under it.
        const gate = gateRef.current;
        if (gate) gate.current += 1;

        // 1. The attempt itself, at the rung the child was actually asked for.
        const { error: attemptError } = await supabase
          .from('food_attempts')
          .insert(writes.attemptRow);

        const alreadyLanded = isUniqueViolation(attemptError);
        if (attemptError && !alreadyLanded) {
          logger.error('Logging the attempt failed:', attemptError);
          if (gate) gate.current -= 1;
          replaceRow(previous.id, () => previous);
          return { ok: false, reason: 'error' };
        }
        // A replay of an insert that landed earlier is not a new entry.
        if (alreadyLanded && gate) gate.current -= 1;

        // 2. Close the loop back onto the plan entry. Setting food_attempt_id
        // in the same update keeps create_attempt_from_plan_result from
        // inserting a second attempt for this result.
        if (planEntryId) {
          const { error: planError } = await supabase
            .from('plan_entries')
            .update({ food_attempt_id: attemptId, ...writes.planPatch })
            .eq('id', planEntryId);

          // A failed link leaves the attempt and the ladder correct; only the
          // back-reference is missing, so this is logged rather than rolled back.
          if (planError) logger.error('Failed to link attempt to plan entry:', planError);
        }

        // 3. Move the ladder, over the version this log was based on.
        let ladder = await writeLadderGuarded(previous, writes.nextState);
        if (ladder === 'stale') {
          // Another device logged this food first. Fold this attempt onto
          // what the server holds rather than overwriting it.
          const { data: fresh } = await supabase
            .from('kid_food_ladder')
            .select(SELECT_COLUMNS)
            .eq('id', previous.id)
            .maybeSingle();
          if (fresh) {
            const server = normalizeLadderRow(fresh as unknown as LadderDbRow);
            finalState = capDueDate(
              applyAttemptOutcome(toLadderState(server), outcome, { today, attemptAt: now }),
              server,
              rowsRef.current
            );
            replaceRow(previous.id, () => ({ ...server, ...finalState }));
            ladder = await writeLadderGuarded(server, finalState);
          }
        }
        const ladderSynced = ladder === 'ok';

        landedAttempts.current.add(attemptId);
        notifyFoodAttemptLogged(kidId);

        // Usage count and Win Network contributions are bookkeeping; neither
        // holds up the parent's tap.
        if (!alreadyLanded) {
          const { kid, foods = [], shareWins = true } = optionsRef.current;
          const foodName = foods.find((f) => f.id === previous.foodId)?.name;
          const followUps: Array<PromiseLike<unknown>> = [];
          if (userId) {
            followUps.push(
              supabase.rpc('increment_usage', {
                p_user_id: userId,
                p_feature_type: 'food_tracker',
              })
            );
          }
          if (shareWins) {
            followUps.push(
              recordContributionsFromAttempt(
                { id: attemptId, food_id: previous.foodId, outcome, kid_id: previous.kidId },
                {
                  pickinessLevel: kid ? kid.pickiness_level ?? null : undefined,
                  foodName,
                }
              )
            );
          }
          void Promise.allSettled(followUps).then((settled) => {
            settled.forEach((s) => {
              if (s.status === 'rejected') logger.warn('Post-log follow-up failed:', s.reason);
            });
          });
        }

        // US-603: only after the win is durable, and only once the Undo
        // window has passed. Offering "what's next" for a mastery the parent
        // is about to take back would be worse than saying nothing.
        if (ladderSynced && finalState.status === 'mastered' && previous.status !== 'mastered') {
          const masteredRow: LadderRow = { ...previous, ...finalState };
          const delay = optionsRef.current.masteryDelayMs ?? MASTERY_UNDO_WINDOW_MS;
          const timer = setTimeout(() => {
            masteryTimers.current.delete(attemptId);
            void handleMastery(masteredRow, rowsRef.current);
          }, delay);
          masteryTimers.current.set(attemptId, timer);
        }

        return { ok: true, attemptId, previous, ladderSynced };
      } catch (logError) {
        logger.error('Logging the attempt failed:', logError);
        return { ok: false, reason: 'error' };
      } finally {
        claimed.forEach((key) => inFlight.current.delete(key));
      }
    },
    [handleMastery, passesGate, startFood, fetchRowFor, replaceRow, writeLadderGuarded]
  );

  /**
   * US-600: one tap logs the attempt, links it to the plan entry, and moves
   * the ladder. Kept as a boolean wrapper over logAttempt for the board, the
   * insurance section and the Kids progress card.
   */
  const quickLog = useCallback(
    async ({ row, result, planEntryId, mealSlot }: QuickLogArgs): Promise<boolean> => {
      const outcome = await logAttempt({ row, foodId: row.foodId, result, planEntryId, mealSlot });
      return outcome.ok;
    },
    [logAttempt]
  );

  const patchRow = useCallback(
    async (row: LadderRow, patch: Partial<LadderState>): Promise<boolean> => {
      const current = rowsRef.current.find((r) => r.id === row.id) ?? row;
      const nextState = capDueDate(
        { ...toLadderState(current), ...patch },
        current,
        rowsRef.current
      );

      replaceRow(row.id, (r) => ({ ...r, ...nextState }));

      const { error: updateError } = await supabase
        .from('kid_food_ladder')
        .update(stateToUpdate(nextState))
        .eq('id', row.id);

      if (updateError) {
        logger.error('Failed to update ladder row:', updateError);
        replaceRow(row.id, () => current);
        return false;
      }
      return true;
    },
    [replaceRow]
  );

  /**
   * Take back a log: delete the attempt and put the rung back where it was.
   * Cancels a mastery handoff that has not been offered yet.
   */
  const undoLog = useCallback(
    async ({
      attemptId,
      previous,
    }: {
      attemptId: string;
      previous: LadderRow | null;
    }): Promise<boolean> => {
      const timer = masteryTimers.current.get(attemptId);
      if (timer !== undefined) {
        clearTimeout(timer);
        masteryTimers.current.delete(attemptId);
      }

      const { error: deleteError } = await supabase
        .from('food_attempts')
        .delete()
        .eq('id', attemptId);
      if (deleteError) {
        logger.error('Failed to undo attempt:', deleteError);
        return false;
      }
      landedAttempts.current.delete(attemptId);

      if (!previous) return true;
      return patchRow(previous, toLadderState(previous));
    },
    [patchRow]
  );

  const pause = useCallback(
    (row: LadderRow) =>
      patchRow(row, { status: 'paused', pausedReason: 'parent', nextDueOn: null }),
    [patchRow]
  );

  // patchRow runs nextDueOn through the per-day cap, so a resumed food that
  // would be the fourth due today starts tomorrow instead of failing.
  //
  // Resuming also moves the fold watermark to now. Meals logged while the
  // food was paused were meals, not ladder exposures; without this the next
  // load would replay every one of them onto the rung the moment it resumed.
  // Never moves the watermark backwards.
  const resume = useCallback(
    (row: LadderRow) => {
      const current = rowsRef.current.find((r) => r.id === row.id) ?? row;
      return patchRow(row, {
        status: 'active',
        pausedReason: null,
        consecutiveRefusals: 0,
        nextDueOn: todayIsoDate(),
        lastAttemptAt: laterOf(current.lastAttemptAt, new Date().toISOString()),
      });
    },
    [patchRow]
  );

  /** Manual pressure release: a parent can always make a step gentler. */
  const stepDown = useCallback(
    (row: LadderRow) => {
      const current = rowsRef.current.find((r) => r.id === row.id) ?? row;
      return patchRow(current, {
        currentRung: prevRung(current.currentRung),
        consecutiveSuccesses: 0,
      });
    },
    [patchRow]
  );

  /** US-602: one control stops every ladder for this child. */
  const pauseAll = useCallback(async (): Promise<boolean> => {
    if (!activeKidId) return false;
    const previous = rowsRef.current;

    commitRows((current) =>
      current.map((r) =>
        r.status === 'active'
          ? { ...r, status: 'paused', pausedReason: 'parent', nextDueOn: null }
          : r
      )
    );

    const { error: updateError } = await supabase
      .from('kid_food_ladder')
      .update({ status: 'paused', paused_reason: 'parent', next_due_on: null })
      .eq('kid_id', activeKidId)
      .eq('status', 'active');

    if (updateError) {
      logger.error('Failed to pause all ladders:', updateError);
      if (activeKidRef.current === activeKidId) commitRows(previous);
      return false;
    }
    return true;
  }, [activeKidId, commitRows]);

  /**
   * Boolean wrapper over startFood. An explicit kidId wins over the active
   * child, so a mastery candidate computed for one child is never started
   * for another.
   */
  const addFoodToLadder = useCallback(
    async (foodId: string, pairedSafeFoodId?: string | null, kidId?: string): Promise<boolean> => {
      const started = await startFood(foodId, { pairedSafeFoodId, kidId });
      return started.ok;
    },
    [startFood]
  );

  const removeFromLadder = useCallback(
    async (row: LadderRow): Promise<boolean> => {
      const previous = rowsRef.current;
      commitRows((current) => current.filter((r) => r.id !== row.id));

      const { error: deleteError } = await supabase
        .from('kid_food_ladder')
        .delete()
        .eq('id', row.id);
      if (deleteError) {
        logger.error('Failed to remove ladder row:', deleteError);
        if (activeKidRef.current === row.kidId) commitRows(previous);
        return false;
      }
      return true;
    },
    [commitRows]
  );

  /**
   * Undo for removeFromLadder: put the row back with its original id and
   * counters, so the food's history is exactly where it was.
   */
  const restoreRow = useCallback(
    async (row: LadderRow): Promise<boolean> => {
      const state = capDueDate(toLadderState(row), row, rowsRef.current);
      const restored: LadderRow = { ...row, ...state };
      const isActiveKid = activeKidRef.current === row.kidId;
      if (isActiveKid) {
        commitRows((current) =>
          current.some((r) => r.id === row.id) ? current : [...current, restored]
        );
      }

      const { error: insertError } = await supabase.from('kid_food_ladder').insert({
        id: row.id,
        kid_id: row.kidId,
        food_id: row.foodId,
        paired_safe_food_id: row.pairedSafeFoodId,
        preferred_prep: row.preferredPrep,
        preferred_meal_slot: row.preferredMealSlot,
        ...stateToUpdate(state),
      });

      // 23505: the row was never actually removed, so it is already back.
      if (insertError && !isUniqueViolation(insertError)) {
        logger.error('Failed to restore ladder row:', insertError);
        if (isActiveKid) commitRows((current) => current.filter((r) => r.id !== row.id));
        return false;
      }
      return true;
    },
    [commitRows]
  );

  /**
   * US-599: put today's due exposures on the plan.
   *
   * Reads the signals the scheduler needs (sensory properties, acceptance
   * history, what is already on the plate), asks the pure scheduler what
   * should happen, then writes it. All the judgement lives in the pure
   * module; this function only gathers and persists.
   *
   * Safe to call repeatedly for the same day — `buildExposurePlanWrites`
   * dedupes against the entries already on that date.
   */
  const scheduleDueExposures = useCallback(
    async (args: {
      date?: string;
      foods: Array<{ id: string; name: string; is_safe: boolean; allergens?: string[] }>;
      kid: { id: string; allergens?: string[]; texture_dislikes?: string[] };
    }): Promise<SchedulerResult | null> => {
      const { foods, kid } = args;
      const date = args.date ?? todayIsoDate();
      if (!activeKidId || rows.length === 0) return null;

      try {
        // plan_entries.user_id is NOT NULL and household_id scopes RLS, so an
        // insert without them is rejected outright. Everything else on this
        // path is derived from the ladder; ownership has to come from the
        // session, exactly as PlanContext does it.
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: member } = await supabase
          .from('household_members')
          .select('household_id')
          .eq('user_id', user.id)
          .maybeSingle();

        const foodIds = foods.map((f) => f.id);

        const [propsResult, attemptsResult, planResult] = await Promise.all([
          // Texture only matters for foods we might schedule, so this is
          // scoped to the pantry rather than the whole properties table.
          supabase
            .from('food_properties')
            .select('food_id, texture_primary')
            .in('food_id', foodIds),
          supabase.from('food_attempts').select('food_id, outcome').eq('kid_id', activeKidId),
          supabase
            .from('plan_entries')
            .select('food_id, meal_slot')
            .eq('kid_id', activeKidId)
            .eq('date', date),
        ]);

        const textureByFoodId = new Map<string, string | null>(
          (propsResult.data ?? []).map((p) => [p.food_id as string, p.texture_primary])
        );

        const schedulerFoods: SchedulerFood[] = foods.map((f) => ({
          id: f.id,
          name: f.name,
          isSafe: f.is_safe,
          allergens: f.allergens ?? [],
          texturePrimary: textureByFoodId.get(f.id) ?? null,
        }));

        const schedulerKid: SchedulerKid = {
          id: kid.id,
          allergens: kid.allergens ?? [],
          textureDislikes: kid.texture_dislikes ?? [],
          // No UI exists yet for marking a meal stressful; the scheduler
          // honours the field, so wiring it is a UI change, not a rules one.
          stressfulSlots: [],
          // A blanket pause is stored per-row (pauseAll flips each active row
          // to paused), so there is no separate kid-level flag to read here.
          // Paused rows are excluded by status either way.
          laddersPaused: false,
        };

        const schedulable: SchedulableLadderRow[] = rows.map((r) => ({
          id: r.id,
          kidId: r.kidId,
          foodId: r.foodId,
          currentRung: r.currentRung,
          status: r.status,
          nextDueOn: r.nextDueOn,
          pairedSafeFoodId: r.pairedSafeFoodId,
          preferredMealSlot: r.preferredMealSlot,
          preferredPrep: r.preferredPrep,
        }));

        const existing = (planResult.data ?? []).map((e) => ({
          foodId: e.food_id as string,
          mealSlot: e.meal_slot as string,
        }));

        const result = selectDueExposures(schedulable, {
          date,
          kid: schedulerKid,
          foodsById: new Map(schedulerFoods.map((f) => [f.id, f])),
          successRateByFoodId: successRatesFromAttempts(
            (attemptsResult.data ?? []).map((a) => ({
              foodId: a.food_id,
              outcome: a.outcome,
            }))
          ),
          occupiedSlots: existing.map((e) => e.mealSlot),
        });

        if (result.scheduled.length === 0) return result;

        const { entries, ladderPatches } = buildExposurePlanWrites(
          result.scheduled,
          date,
          existing
        );

        if (entries.length > 0) {
          const { error } = await supabase.from('plan_entries').insert(
            entries.map((entry) => ({
              ...entry,
              user_id: user.id,
              household_id: member?.household_id ?? null,
            }))
          );
          if (error) throw error;
        }

        // Record the pairing that was actually chosen so the board shows the
        // real anchor rather than one we guessed at last week.
        await Promise.all(
          ladderPatches.map((patch) =>
            supabase
              .from('kid_food_ladder')
              .update({
                paired_safe_food_id: patch.paired_safe_food_id,
                preferred_meal_slot: patch.preferred_meal_slot,
              })
              .eq('id', patch.id)
          )
        );

        const loaded = await load(activeKidId);
        if (activeKidRef.current === activeKidId) commitRows(loaded);
        return result;
      } catch (error) {
        logger.error('Failed to schedule due exposures:', error);
        return null;
      }
    },
    [activeKidId, rows, load, commitRows]
  );

  const grouped = useMemo(() => {
    const byStatus: Record<LadderStatus, LadderRow[]> = {
      active: [],
      backed_off: [],
      paused: [],
      mastered: [],
    };
    for (const row of rows) {
      byStatus[row.status]?.push(row);
    }
    return byStatus;
  }, [rows]);

  // Belt and braces for the kid-change reset: a candidate computed for one
  // child is never shown while another is selected.
  const visibleMasteryCandidates = useMemo(
    () => masteryCandidates.filter((c) => c.kidId === (activeKidId ?? null)),
    [masteryCandidates, activeKidId]
  );

  return {
    rows,
    grouped,
    loading,
    quickLog,
    pause,
    resume,
    pauseAll,
    stepDown,
    addFoodToLadder,
    removeFromLadder,
    backfillFromHistory,
    scheduleDueExposures,
    masteryCandidates: visibleMasteryCandidates,
    masteredFoodName: visibleMasteryCandidates.length > 0 ? masteredFoodName : null,
    dismissMastery,
    logAttempt,
    startFood,
    undoLog,
    restoreRow,
    error,
    reload,
  };
}
