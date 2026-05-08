/**
 * Loads & records sibling-meal-finder solver runs (US-295).
 *
 * History feeds the fairness scorer. Recording is best-effort: a missing
 * household won't block the solver UI, the user just won't get fairness
 * weighting on future runs.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { SolverHistoryEntry, SolverResult } from '@/lib/siblingConstraintSolver';

const HISTORY_LOOKBACK_DAYS = 60;

interface ResolutionRow {
  id: string;
  household_id: string;
  recipe_id: string | null;
  resolution_type: 'full_match' | 'with_swaps' | 'split_plate';
  satisfaction_score: number;
  per_kid_satisfaction: Array<{ kid_id: string; score: number }>;
  created_at: string;
}

export interface RecordResolutionArgs {
  result: SolverResult;
  selectedKidIds: string[];
  planEntryId?: string | null;
}

function daysAgoFromIso(iso: string): number {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

export function useSiblingResolutions() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [history, setHistory] = useState<SolverHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Load household + recent history once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }

        const { data: member } = await supabase
          .from('household_members')
          .select('household_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (cancelled) return;
        const hh = member?.household_id ?? null;
        setHouseholdId(hh);

        if (!hh) {
          setHistory([]);
          setLoading(false);
          return;
        }

        const since = new Date();
        since.setDate(since.getDate() - HISTORY_LOOKBACK_DAYS);

        const { data, error } = await supabase
          .from('sibling_meal_resolutions')
          .select(
            'id, household_id, recipe_id, resolution_type, satisfaction_score, per_kid_satisfaction, created_at'
          )
          .eq('household_id', hh)
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: false })
          .limit(100);

        if (cancelled) return;
        if (error) {
          logger.warn('sibling_meal_resolutions load failed', error);
          setHistory([]);
        } else {
          const flat: SolverHistoryEntry[] = [];
          for (const row of (data as ResolutionRow[] | null) ?? []) {
            const da = daysAgoFromIso(row.created_at);
            const list = Array.isArray(row.per_kid_satisfaction) ? row.per_kid_satisfaction : [];
            for (const pk of list) {
              if (typeof pk?.kid_id === 'string' && typeof pk?.score === 'number') {
                flat.push({ kidId: pk.kid_id, score: pk.score, daysAgo: da });
              }
            }
          }
          setHistory(flat);
        }
      } catch (err) {
        logger.warn('useSiblingResolutions init error', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const recordResolution = useCallback(
    async ({ result, selectedKidIds, planEntryId }: RecordResolutionArgs): Promise<boolean> => {
      if (!householdId) {
        logger.info('sibling_meal_resolutions: skipping record (no household)');
        return false;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const perKidJson = result.perKidSatisfaction.map((ks) => ({
        kid_id: ks.kidId,
        score: ks.score,
        soft_violations: ks.softViolations.map((v) => v.foodName),
        hard_violations: ks.hardViolations.map((v) => v.foodName),
      }));
      const swapsJson = result.swaps.map((s) => ({
        kid_id: s.kidId,
        swap_out_food_id: s.swapOutFoodId,
        swap_in_food_id: s.swapInFoodId,
        swap_out_food_name: s.swapOutFoodName,
        swap_in_food_name: s.swapInFoodName,
        reason: s.reason,
      }));
      const splitsJson = result.splitPlates.map((p) => ({
        kid_id: p.kidId,
        plate_description: p.plateDescription,
        modifications: p.modifications,
      }));

      const { data, error } = await supabase
        .from('sibling_meal_resolutions')
        .insert({
          household_id: householdId,
          user_id: user.id,
          kid_ids: selectedKidIds,
          recipe_id: result.recipeId,
          resolution_type: result.resolutionType,
          satisfaction_score: result.satisfactionScore,
          per_kid_satisfaction: perKidJson,
          swaps: swapsJson,
          split_plates: splitsJson,
          plan_entry_id: planEntryId ?? null,
        })
        .select('id, created_at')
        .maybeSingle();

      if (error) {
        logger.warn('sibling_meal_resolutions insert failed', error);
        return false;
      }

      // Locally append so fairness updates immediately on the next run.
      if (data) {
        setHistory((prev) => [
          ...result.perKidSatisfaction.map((ks) => ({
            kidId: ks.kidId,
            score: ks.score,
            daysAgo: 0,
          })),
          ...prev,
        ]);
      }
      return true;
    },
    [householdId]
  );

  return { householdId, history, loading, recordResolution } as const;
}
