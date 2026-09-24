/**
 * Every food attempt for one child, for the per-food history.
 *
 * Follows useKidsProgressSummary's shape (one effect, a `cancelled` guard),
 * with two things the old tracker got wrong made explicit:
 *
 * - The state is keyed by kidId, and a result is only painted for the child
 *   it was fetched for. Switching kids used to leave the first child's list on
 *   screen when their request was the slower one.
 * - A failed read is `error` with a retry, not an empty list. "No attempts
 *   yet" and "couldn't load" are different things to a parent.
 *
 * The summary query has no limit and no outcome filter, so the per-food
 * counts are the child's whole history (up to the API's row cap), not the
 * last 50 of whatever outcome was selected.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Database } from '@/integrations/supabase/types';
import { onFoodAttemptLogged, type FoodAttemptHistoryRow } from '@/lib/foodAttemptHistory';

export const HISTORY_SUMMARY_COLUMNS =
  'id, food_id, stage, outcome, attempted_at, is_milestone, reaction_notes';

export const ATTEMPT_DETAIL_COLUMNS =
  'id, food_id, stage, outcome, attempted_at, is_milestone, reaction_notes, parent_notes';

export const ATTEMPT_PAGE_SIZE = 20;

export type FoodAttemptDetailRow = Pick<
  Database['public']['Tables']['food_attempts']['Row'],
  | 'id'
  | 'food_id'
  | 'stage'
  | 'outcome'
  | 'attempted_at'
  | 'is_milestone'
  | 'reaction_notes'
  | 'parent_notes'
>;

export type FoodAttemptHistoryState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; rows: FoodAttemptHistoryRow[] };

type Stored =
  | { kidId: string; status: 'error' }
  | { kidId: string; status: 'ready'; rows: FoodAttemptHistoryRow[] };

const LOADING: FoodAttemptHistoryState = { status: 'loading' };

export function useFoodAttemptHistory(
  kidId: string | null | undefined
): FoodAttemptHistoryState & { reload: () => void } {
  const [stored, setStored] = useState<Stored | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // A log made anywhere in this tab for this child re-reads the history.
  useEffect(() => {
    if (!kidId) return;
    return onFoodAttemptLogged((loggedKidId) => {
      if (loggedKidId === kidId) setNonce((n) => n + 1);
    });
  }, [kidId]);

  useEffect(() => {
    // A kid change drops whatever the previous child had, so nothing of
    // theirs can show while this child's rows are on the way.
    setStored((prev) => (prev && prev.kidId === kidId ? prev : null));
    if (!kidId) return;

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('food_attempts')
          .select(HISTORY_SUMMARY_COLUMNS)
          .eq('kid_id', kidId);
        if (cancelled) return;
        if (error) {
          logger.warn('Food history: attempts read failed', error);
          setStored({ kidId, status: 'error' });
          return;
        }
        setStored({ kidId, status: 'ready', rows: (data ?? []) as FoodAttemptHistoryRow[] });
      } catch (error) {
        if (cancelled) return;
        logger.warn('Food history: attempts read failed', error);
        setStored({ kidId, status: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kidId, nonce]);

  if (!kidId || !stored || stored.kidId !== kidId) return { ...LOADING, reload };
  if (stored.status === 'error') return { status: 'error', retry: reload, reload };
  return { status: 'ready', rows: stored.rows, reload };
}

export type LoadFoodAttemptsResult =
  | { ok: true; rows: FoodAttemptDetailRow[]; hasMore: boolean }
  | { ok: false };

/** One page (20 rows, newest first) of one food's attempts for one child. */
export async function loadFoodAttempts(
  kidId: string,
  foodId: string,
  page: number
): Promise<LoadFoodAttemptsResult> {
  const from = page * ATTEMPT_PAGE_SIZE;
  try {
    const { data, error } = await supabase
      .from('food_attempts')
      .select(ATTEMPT_DETAIL_COLUMNS)
      .eq('kid_id', kidId)
      .eq('food_id', foodId)
      .order('attempted_at', { ascending: false })
      .range(from, from + ATTEMPT_PAGE_SIZE - 1);
    if (error) {
      logger.warn('Food history: timeline read failed', error);
      return { ok: false };
    }
    const rows = (data ?? []) as FoodAttemptDetailRow[];
    return { ok: true, rows, hasMore: rows.length === ATTEMPT_PAGE_SIZE };
  } catch (error) {
    logger.warn('Food history: timeline read failed', error);
    return { ok: false };
  }
}
