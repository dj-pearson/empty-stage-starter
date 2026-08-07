/**
 * Safe Food Insurance data layer (US-611).
 *
 * Scores the household's safe foods with the shared rule set (US-610), works
 * out which alerts are allowed to show right now (US-611), and finds the
 * closest chain target to offer as a backup.
 *
 * The backup target comes from `get_food_chain_suggestions` filtered through
 * `selectHandoffCandidates` — the same pairing the ladder already does after a
 * win — so the offered food is never one the child is already working on and
 * never an allergen. The at-risk food goes in as the anchor, which is the
 * whole point: the backup is built beside the thing that still works.
 *
 * Dismissals live in localStorage per household browser rather than in the
 * database. Being nagged is a local annoyance, not shared household state, and
 * this keeps the feature off the write path entirely.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { scoreSafeFoodRisk, type SafeFoodObservation, type SafeFoodRisk } from '@/lib/safeFoodRisk';
import {
  pruneDismissals,
  recordDismissal,
  selectSafeFoodAlerts,
  type SafeFoodAlert,
  type SafeFoodDismissal,
} from '@/lib/safeFoodAlerts';
import { selectHandoffCandidates, type ChainSuggestion } from '@/lib/ladderMastery';

const DISMISS_KEY = 'safeFoodInsurance.dismissals';

export interface SafeFoodInsuranceFood {
  id: string;
  name: string;
  isSafe: boolean;
  allergens?: string[] | null;
}

interface UseSafeFoodInsuranceArgs {
  kidId: string | null | undefined;
  foods: SafeFoodInsuranceFood[];
  /** Plan entries, for both the outcome stream and the over-serving read. */
  planEntries: {
    recipeId: string | null;
    foodId: string | null;
    date: string;
    result: string | null;
  }[];
  kidAllergens?: string[] | null;
  /** Food ids already on this kid's ladder, so a backup is never a repeat. */
  ladderFoodIds?: string[];
  /** ISO 'YYYY-MM-DD' treated as today. */
  today: string;
}

export interface SafeFoodBackupTarget {
  foodId: string;
  foodName: string;
  anchorFoodId: string;
}

export interface UseSafeFoodInsuranceResult {
  alerts: SafeFoodAlert[];
  /** Backup chain target per at-risk food id, when one could be found. */
  backupByFood: Map<string, SafeFoodBackupTarget>;
  dismiss: (risk: SafeFoodRisk) => void;
  loading: boolean;
}

export function useSafeFoodInsurance({
  kidId,
  foods,
  planEntries,
  kidAllergens,
  ladderFoodIds,
  today,
}: UseSafeFoodInsuranceArgs): UseSafeFoodInsuranceResult {
  const [attempts, setAttempts] = useState<SafeFoodObservation[]>([]);
  const [backupByFood, setBackupByFood] = useState<Map<string, SafeFoodBackupTarget>>(new Map());
  const [loading, setLoading] = useState(false);
  const [dismissals, setDismissals] = useLocalStorage<SafeFoodDismissal[]>(DISMISS_KEY, []);

  // Logged attempts carry outcomes the plan does not, so both feed the score.
  useEffect(() => {
    if (!kidId) {
      setAttempts([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase
          .from('food_attempts')
          .select('food_id, outcome, attempted_at')
          .eq('kid_id', kidId);
        if (error) throw error;
        if (cancelled) return;

        setAttempts(
          (data ?? []).map((row) => ({
            foodId: row.food_id,
            date: row.attempted_at,
            result: row.outcome,
          }))
        );
      } catch (err) {
        if (!cancelled) {
          // The card is additive: on failure it simply does not appear.
          logger.error('Safe food risk load failed:', err);
          setAttempts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kidId]);

  const rows = useMemo(() => {
    if (!kidId || foods.length === 0) return [];
    const observations: SafeFoodObservation[] = [
      ...planEntries.map((entry) => ({
        foodId: entry.foodId,
        date: entry.date,
        result: entry.result,
      })),
      ...attempts,
    ];

    return scoreSafeFoodRisk({
      foods: foods.map((f) => ({ id: f.id, name: f.name, isSafe: f.isSafe })),
      observations,
      planEntries: planEntries.map((entry) => ({
        recipeId: entry.recipeId,
        foodId: entry.foodId,
        date: entry.date,
      })),
      asOf: today,
    });
  }, [kidId, foods, planEntries, attempts, today]);

  const alerts = useMemo(
    () => selectSafeFoodAlerts(rows, dismissals, `${today}T12:00:00.000Z`),
    [rows, dismissals, today]
  );

  // One suggestion lookup per flagged food, and only for flagged foods.
  const alertFoodKey = alerts.map((a) => a.risk.foodId).join(',');
  useEffect(() => {
    const foodIds = alertFoodKey ? alertFoodKey.split(',') : [];
    if (foodIds.length === 0) {
      setBackupByFood(new Map());
      return;
    }

    let cancelled = false;

    (async () => {
      const found = new Map<string, SafeFoodBackupTarget>();
      const allergensByFoodId = new Map(foods.map((f) => [f.id, f.allergens ?? []]));

      for (const foodId of foodIds) {
        try {
          const { data, error } = await supabase.rpc('get_food_chain_suggestions', {
            source_food: foodId,
            limit_count: 10,
          });
          if (error) throw error;

          const suggestions: ChainSuggestion[] = (
            (data ?? []) as {
              food_id: string;
              food_name: string;
              similarity_score: number;
              reasons: string[];
            }[]
          ).map((s) => ({
            foodId: s.food_id,
            foodName: s.food_name,
            similarityScore: s.similarity_score ?? 0,
            reasons: s.reasons ?? [],
          }));

          // Same filtering as the post-mastery handoff: nothing already on the
          // ladder, nothing the child is allergic to, anchored to this food.
          const [best] = selectHandoffCandidates(suggestions, {
            masteredFoodId: foodId,
            ladderFoodIds: ladderFoodIds ?? [],
            kidAllergens: (kidAllergens ?? []).map((a) => a.toLowerCase()),
            allergensByFoodId,
            limit: 1,
          });

          if (best) {
            found.set(foodId, {
              foodId: best.foodId,
              foodName: best.foodName,
              anchorFoodId: best.anchorFoodId,
            });
          }
        } catch (err) {
          // A missing suggestion just means no backup offer for that food.
          logger.warn('Could not load a backup chain target:', err);
        }
      }

      if (!cancelled) setBackupByFood(found);
    })();

    return () => {
      cancelled = true;
    };
    // `foods` and `ladderFoodIds` are read inside but intentionally not
    // dependencies: they change identity on every render and would re-run this
    // RPC loop constantly. The flagged-food set is what should drive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertFoodKey]);

  const dismiss = useCallback(
    (risk: SafeFoodRisk) => {
      const now = new Date().toISOString();
      setDismissals((current) => pruneDismissals(recordDismissal(current, risk, now), now));
    },
    [setDismissals]
  );

  return { alerts, backupByFood, dismiss, loading };
}
