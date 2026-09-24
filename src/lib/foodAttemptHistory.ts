/**
 * Per-food history for one child, from every food_attempts row they have.
 *
 * The old tracker computed its stats from a list that was capped at 50 rows
 * and filtered by outcome first, so "Successes" and "Success rate" changed
 * when the parent picked "Refused only". Here the summary is built once from
 * the whole history and there is no filter argument at all: the list screen
 * filters what it shows, never what it counts.
 *
 * This is the per-food view ("how has broccoli gone over time"). Meals by
 * day belong to the Food Journal (foodJournal.ts); weekly counts belong to
 * the Kids card (kidProgress.ts).
 */
import type { Database } from '@/integrations/supabase/types';
import { isRung, rungIndex, type AttemptOutcome } from '@/lib/exposureLadder';

type AttemptDbRow = Database['public']['Tables']['food_attempts']['Row'];

/** The columns the history reads. Matches the hook's select list. */
export type FoodAttemptHistoryRow = Pick<
  AttemptDbRow,
  'id' | 'food_id' | 'stage' | 'outcome' | 'attempted_at' | 'is_milestone' | 'reaction_notes'
>;

export const ATTEMPT_OUTCOMES: readonly AttemptOutcome[] = ['success', 'partial', 'refused', 'tantrum'];

export function isAttemptOutcome(value: unknown): value is AttemptOutcome {
  return typeof value === 'string' && (ATTEMPT_OUTCOMES as readonly string[]).includes(value);
}

export interface FoodHistorySummary {
  count: number;
  /** ISO timestamp of the most recent attempt. */
  lastAt: string;
  /** Outcome of the most recent attempt, as stored. */
  lastOutcome: string;
  /** Highest rung reached on a success or partial; -1 when there is none. */
  bestStageIndex: number;
  outcomeCounts: Record<AttemptOutcome, number>;
  /** True when any attempt carries a reaction note. */
  hasReaction: boolean;
}

export interface FoodAttemptSummary {
  /** Attempts counted, across every food in the set. */
  total: number;
  perFood: Map<string, FoodHistorySummary>;
}

const emptyCounts = (): Record<AttemptOutcome, number> => ({
  success: 0,
  partial: 0,
  refused: 0,
  tantrum: 0,
});

/**
 * Fold a child's attempts into one summary per food.
 *
 * Rows for a food outside `foodIds` (deleted, or another household's) are
 * skipped, as are rows with no attempted_at, which cannot be placed in time.
 */
export function summarizeFoodAttempts(
  rows: readonly FoodAttemptHistoryRow[],
  foodIds: ReadonlySet<string>
): FoodAttemptSummary {
  const perFood = new Map<string, FoodHistorySummary>();
  let total = 0;

  for (const row of rows) {
    const foodId = row.food_id;
    const at = row.attempted_at;
    if (!foodId || !foodIds.has(foodId) || !at) continue;
    const time = Date.parse(at);
    if (Number.isNaN(time)) continue;

    total += 1;
    let entry = perFood.get(foodId);
    if (!entry) {
      entry = {
        count: 0,
        lastAt: at,
        lastOutcome: row.outcome,
        bestStageIndex: -1,
        outcomeCounts: emptyCounts(),
        hasReaction: false,
      };
      perFood.set(foodId, entry);
    }

    entry.count += 1;
    if (time > Date.parse(entry.lastAt)) {
      entry.lastAt = at;
      entry.lastOutcome = row.outcome;
    }
    if (isAttemptOutcome(row.outcome)) entry.outcomeCounts[row.outcome] += 1;
    if (
      (row.outcome === 'success' || row.outcome === 'partial') &&
      isRung(row.stage)
    ) {
      entry.bestStageIndex = Math.max(entry.bestStageIndex, rungIndex(row.stage));
    }
    if ((row.reaction_notes ?? '').trim()) entry.hasReaction = true;
  }

  return { total, perFood };
}

/**
 * "An attempt for this child just landed." useFoodLadder().logAttempt says it;
 * useFoodAttemptHistory listens and re-reads, so the history under the ladder
 * shows a tasting as soon as it is logged instead of after the next visit.
 * In-process only: another device's log shows up on the next load.
 */
type AttemptLoggedListener = (kidId: string) => void;
const attemptLoggedListeners = new Set<AttemptLoggedListener>();

export function notifyFoodAttemptLogged(kidId: string): void {
  for (const listener of [...attemptLoggedListeners]) {
    try {
      listener(kidId);
    } catch {
      // One broken listener must not stop the others or fail the log.
    }
  }
}

export function onFoodAttemptLogged(listener: AttemptLoggedListener): () => void {
  attemptLoggedListeners.add(listener);
  return () => {
    attemptLoggedListeners.delete(listener);
  };
}
