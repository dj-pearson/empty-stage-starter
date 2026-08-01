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
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  applyAttemptOutcome,
  deriveLadderFromAttempts,
  initialLadderState,
  isRung,
  prevRung,
  type AttemptOutcome,
  type LadderState,
  type LadderStatus,
  type Rung,
} from '@/lib/exposureLadder';
import { bucketPickiness, contributeChainNetworkSuccess } from '@/lib/chainNetwork';
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

export interface QuickLogWrites {
  attemptRow: {
    kid_id: string;
    food_id: string;
    stage: Rung;
    outcome: AttemptOutcome;
    attempted_at: string;
    meal_slot: string | null;
    preparation_method: string | null;
  };
  planPatch: { result: 'ate' | 'tasted' | 'refused' } | null;
  ladderUpdate: ReturnType<typeof stateToUpdate>;
  nextState: LadderState;
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
}): QuickLogWrites {
  const { row, result, now, today, mealSlot } = args;
  const outcome = QUICK_LOG_OUTCOME[result];
  const nextState = applyAttemptOutcome(toLadderState(row), outcome, {
    today,
    attemptAt: now,
  });

  return {
    attemptRow: {
      kid_id: row.kidId,
      food_id: row.foodId,
      stage: row.currentRung,
      outcome,
      attempted_at: now,
      meal_slot: mealSlot ?? row.preferredMealSlot,
      preparation_method: row.preferredPrep,
    },
    planPatch: { result: PLAN_RESULT[result] },
    ladderUpdate: stateToUpdate(nextState),
    nextState,
  };
}

export interface UseFoodLadderOptions {
  /** Kid record, used for the Win Network pickiness bucket and allergens. */
  kid?: { pickiness_level?: string | null; allergens?: string[] } | null;
  /** Food names/allergens for building mastery candidates. */
  foods?: Array<{ id: string; name: string; allergens?: string[] }>;
  /** usePickyWinSharePref — a household that opted out contributes nothing. */
  shareWins?: boolean;
}

export function useFoodLadder(
  activeKidId: string | null | undefined,
  options: UseFoodLadderOptions = {}
) {
  const [rows, setRows] = useState<LadderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const backfilledKids = useRef<Set<string>>(new Set());
  /** US-603: targets offered after a food graduates. */
  const [masteryCandidates, setMasteryCandidates] = useState<MasteryCandidate[]>([]);
  const [masteredFoodName, setMasteredFoodName] = useState<string | null>(null);

  // Held in a ref so the mastery handler is not rebuilt (and quickLog's
  // identity does not churn) every time the pantry array is replaced.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // quickLog needs the current ladder to filter already-tracked foods out of
  // the mastery handoff, but must not take `rows` as a dependency — that
  // would rebuild the callback on every log and churn every consumer.
  const rowsRef = useRef<LadderRow[]>([]);
  rowsRef.current = rows;

  const load = useCallback(async (kidId: string) => {
    const { data, error } = await supabase
      .from('kid_food_ladder')
      .select(SELECT_COLUMNS)
      .eq('kid_id', kidId);

    if (error) throw error;
    return (data ?? []).map((row) => normalizeLadderRow(row as LadderDbRow));
  }, []);

  useEffect(() => {
    if (!activeKidId) {
      setRows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const loaded = await load(activeKidId);
        if (!cancelled) setRows(loaded);
      } catch (error) {
        logger.error('Failed to load food ladder:', error);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeKidId, load]);

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
        const { data: attempts, error } = await supabase
          .from('food_attempts')
          .select('kid_id, food_id, stage, outcome, attempted_at')
          .eq('kid_id', kidId);

        if (error) throw error;

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

        setRows(await load(kidId));
        return derived.length;
      } catch (error) {
        logger.error('Ladder backfill failed:', error);
        // Allow a retry on the next explicit request — a transient failure
        // should not permanently mark this kid as backfilled.
        backfilledKids.current.delete(kidId);
        return 0;
      }
    },
    [load]
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
    } catch (error) {
      logger.warn('Win Network contribution failed after mastery:', error);
    }

    try {
      const { data, error } = await supabase.rpc('get_food_chain_suggestions', {
        source_food: row.foodId,
        limit_count: 10,
      });
      if (error) throw error;

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
      });

      if (candidates.length > 0) {
        setMasteryCandidates(candidates);
        setMasteredFoodName(masteredFood?.name ?? null);
      }
    } catch (error) {
      logger.warn('Could not load next-step suggestions after mastery:', error);
    }
  }, []);

  const dismissMastery = useCallback(() => {
    setMasteryCandidates([]);
    setMasteredFoodName(null);
  }, []);

  /**
   * US-600: one tap logs the attempt, links it to the plan entry, and moves
   * the ladder — all from a single control at the table.
   *
   * Optimistic with a non-destructive rollback (US-535): on failure the row
   * is restored to exactly its prior value rather than being dropped.
   */
  const quickLog = useCallback(
    async ({ row, result, planEntryId, mealSlot }: QuickLogArgs): Promise<boolean> => {
      const previous = row;
      const writes = buildQuickLogWrites({
        row,
        result,
        now: new Date().toISOString(),
        today: todayIsoDate(),
        mealSlot,
      });
      const { nextState } = writes;

      setRows((current) =>
        current.map((r) => (r.id === row.id ? { ...r, ...nextState } : r))
      );

      try {
        // 1. The attempt itself, at the rung the child was actually asked for.
        const { data: attempt, error: attemptError } = await supabase
          .from('food_attempts')
          .insert(writes.attemptRow)
          .select('id')
          .single();

        if (attemptError) throw attemptError;

        // 2. Close the loop back onto the plan entry.
        if (planEntryId && attempt?.id) {
          const { error: planError } = await supabase
            .from('plan_entries')
            .update({ food_attempt_id: attempt.id, ...writes.planPatch })
            .eq('id', planEntryId);

          // A failed link leaves the attempt and the ladder correct; only the
          // back-reference is missing, so this is logged rather than rolled back.
          if (planError) logger.error('Failed to link attempt to plan entry:', planError);
        }

        // 3. Move the ladder.
        const { error: ladderError } = await supabase
          .from('kid_food_ladder')
          .update(writes.ladderUpdate)
          .eq('id', row.id);

        if (ladderError) throw ladderError;

        // US-603: only after the win is durable. Offering "what's next" for
        // a mastery that failed to save would be worse than saying nothing.
        if (nextState.status === 'mastered' && previous.status !== 'mastered') {
          void handleMastery({ ...previous, ...nextState }, rowsRef.current);
        }

        return true;
      } catch (error) {
        logger.error('Quick log failed:', error);
        setRows((current) => current.map((r) => (r.id === row.id ? previous : r)));
        return false;
      }
    },
    [handleMastery]
  );

  const patchRow = useCallback(
    async (row: LadderRow, patch: Partial<LadderState>): Promise<boolean> => {
      const previous = row;
      const nextState = { ...toLadderState(row), ...patch };

      setRows((current) => current.map((r) => (r.id === row.id ? { ...r, ...nextState } : r)));

      const { error } = await supabase
        .from('kid_food_ladder')
        .update(stateToUpdate(nextState))
        .eq('id', row.id);

      if (error) {
        logger.error('Failed to update ladder row:', error);
        setRows((current) => current.map((r) => (r.id === row.id ? previous : r)));
        return false;
      }
      return true;
    },
    []
  );

  const pause = useCallback(
    (row: LadderRow) =>
      patchRow(row, { status: 'paused', pausedReason: 'parent', nextDueOn: null }),
    [patchRow]
  );

  const resume = useCallback(
    (row: LadderRow) =>
      patchRow(row, {
        status: 'active',
        pausedReason: null,
        consecutiveRefusals: 0,
        nextDueOn: todayIsoDate(),
      }),
    [patchRow]
  );

  /** Manual pressure release: a parent can always make a step gentler. */
  const stepDown = useCallback(
    (row: LadderRow) =>
      patchRow(row, {
        currentRung: prevRung(row.currentRung),
        consecutiveSuccesses: 0,
      }),
    [patchRow]
  );

  /** US-602: one control stops every ladder for this child. */
  const pauseAll = useCallback(async (): Promise<boolean> => {
    if (!activeKidId) return false;
    const previous = rows;

    setRows((current) =>
      current.map((r) =>
        r.status === 'active'
          ? { ...r, status: 'paused', pausedReason: 'parent', nextDueOn: null }
          : r
      )
    );

    const { error } = await supabase
      .from('kid_food_ladder')
      .update({ status: 'paused', paused_reason: 'parent', next_due_on: null })
      .eq('kid_id', activeKidId)
      .eq('status', 'active');

    if (error) {
      logger.error('Failed to pause all ladders:', error);
      setRows(previous);
      return false;
    }
    return true;
  }, [activeKidId, rows]);

  const addFoodToLadder = useCallback(
    async (foodId: string, pairedSafeFoodId?: string | null): Promise<boolean> => {
      if (!activeKidId) return false;

      const state = initialLadderState(todayIsoDate());
      const { error } = await supabase.from('kid_food_ladder').insert({
        kid_id: activeKidId,
        food_id: foodId,
        paired_safe_food_id: pairedSafeFoodId ?? null,
        ...stateToUpdate(state),
      });

      if (error) {
        logger.error('Failed to add food to ladder:', error);
        return false;
      }

      try {
        setRows(await load(activeKidId));
      } catch (loadError) {
        logger.error('Failed to reload ladder after add:', loadError);
      }
      return true;
    },
    [activeKidId, load]
  );

  const removeFromLadder = useCallback(async (row: LadderRow): Promise<boolean> => {
    const previous = rows;
    setRows((current) => current.filter((r) => r.id !== row.id));

    const { error } = await supabase.from('kid_food_ladder').delete().eq('id', row.id);
    if (error) {
      logger.error('Failed to remove ladder row:', error);
      setRows(previous);
      return false;
    }
    return true;
  }, [rows]);


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
          const { error } = await supabase.from('plan_entries').insert(entries);
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

        setRows(await load(activeKidId));
        return result;
      } catch (error) {
        logger.error('Failed to schedule due exposures:', error);
        return null;
      }
    },
    [activeKidId, rows, load]
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
    masteryCandidates,
    masteredFoodName,
    dismissMastery,
    reload: useCallback(async () => {
      if (!activeKidId) return;
      try {
        setRows(await load(activeKidId));
      } catch (error) {
        logger.error('Failed to reload ladder:', error);
      }
    }, [activeKidId, load]),
  };
}
