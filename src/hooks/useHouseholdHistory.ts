/**
 * Twelve months of logged meals for the whole household, read from the
 * server for the Progress page's numbers block.
 *
 * The plan cache in context spans roughly -30..+90 days, which cannot answer
 * "what changed over the year". This reads plan_entries directly: logged rows
 * only (result is not null), from the local day twelve months ago to today,
 * ordered by date then id so fetchAllRows pages over a total order.
 * `truncated` says when the row ceiling stopped the read with rows unread.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { addMonths, toISODate } from '@/lib/date-utils';
import type { AmountEaten, MealResult, MealSlot, PlanEntry } from '@/types';

/** The plan_entries columns read here: existing columns, no schema change. */
export const HOUSEHOLD_HISTORY_SELECT =
  'id,kid_id,date,meal_slot,food_id,recipe_id,result,amount_eaten,is_primary_dish,notes';

/** Months read back from today. */
export const HOUSEHOLD_HISTORY_MONTHS = 12;

interface HistoryRow {
  id: string;
  kid_id: string;
  date: string;
  meal_slot: string;
  food_id: string;
  recipe_id: string | null;
  result: string | null;
  amount_eaten: string | null;
  is_primary_dish: boolean | null;
  notes: string | null;
}

export interface HouseholdHistory {
  entries: PlanEntry[];
  loading: boolean;
  error: boolean;
  truncated: boolean;
  /** First local day covered by the read. */
  fromIso: string;
}

function toPlanEntry(row: HistoryRow): PlanEntry {
  return {
    id: row.id,
    kid_id: row.kid_id,
    date: row.date,
    meal_slot: row.meal_slot as MealSlot,
    food_id: row.food_id,
    result: row.result as MealResult,
    amount_eaten: (row.amount_eaten as AmountEaten | null) ?? null,
    recipe_id: row.recipe_id,
    is_primary_dish: row.is_primary_dish ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export function historyFromIso(todayIso: string): string {
  return toISODate(addMonths(new Date(`${todayIso}T00:00:00`), -HOUSEHOLD_HISTORY_MONTHS));
}

export function useHouseholdHistory(
  householdId: string | null,
  refreshKey?: string | number
): HouseholdHistory {
  const todayIso = toISODate(new Date());
  const fromIso = historyFromIso(todayIso);
  const [state, setState] = useState<Omit<HouseholdHistory, 'fromIso'>>(() => ({
    entries: [],
    loading: Boolean(householdId),
    error: false,
    truncated: false,
  }));

  useEffect(() => {
    if (!householdId) {
      setState({ entries: [], loading: false, error: false, truncated: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    (async () => {
      try {
        const res = await fetchAllRows<HistoryRow>((from, to) =>
          supabase
            .from('plan_entries')
            .select(HOUSEHOLD_HISTORY_SELECT)
            .eq('household_id', householdId)
            .not('result', 'is', null)
            .gte('date', fromIso)
            .lte('date', todayIso)
            .order('date', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{ data: HistoryRow[] | null; error: unknown }>
        );
        if (cancelled) return;
        if (res.error) {
          logger.warn('Household history: read failed', res.error);
          setState({ entries: [], loading: false, error: true, truncated: false });
          return;
        }
        setState({
          entries: (res.data ?? []).map(toPlanEntry),
          loading: false,
          error: false,
          truncated: res.truncated,
        });
      } catch (error) {
        if (cancelled) return;
        logger.warn('Household history: read failed', error);
        setState({ entries: [], loading: false, error: true, truncated: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [householdId, fromIso, todayIso, refreshKey]);

  return { ...state, fromIso };
}
