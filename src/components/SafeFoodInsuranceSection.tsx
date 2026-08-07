/**
 * Safe Food Insurance container (US-611, web surface).
 *
 * Wires the shared rule set to the card and to the ladder. Kept separate from
 * the presentational card so the card stays free of data access, and so the
 * page mounting this only has to render one thing.
 *
 * Gated behind the same `exposure_ladder` flag as the rest of the epic —
 * default OFF. The card's main offer is to start a ladder, so it should not
 * appear anywhere the ladder itself does not.
 */

import { useMemo } from 'react';
import { useFoods, useKids, usePlan } from '@/contexts/AppContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useFoodLadder, todayIsoDate } from '@/hooks/useFoodLadder';
import { useSafeFoodInsurance, type SafeFoodBackupTarget } from '@/hooks/useSafeFoodInsurance';
import { SafeFoodInsuranceCard } from '@/components/SafeFoodInsuranceCard';

interface Props {
  /** Analytics tag for where this was rendered. */
  surface?: string;
}

export function SafeFoodInsuranceSection({ surface = 'unknown' }: Props) {
  const enabled = useFeatureFlag('exposure_ladder', false);
  const { activeKidId, kids } = useKids();
  const { foods } = useFoods();
  const { planEntries } = usePlan();

  const activeKid = kids.find((k) => k.id === activeKidId) ?? null;
  const { rows, addFoodToLadder } = useFoodLadder(enabled ? activeKidId : null, {
    kid: activeKid,
    foods,
  });

  const kidPlanEntries = useMemo(
    () =>
      planEntries
        .filter((entry) => entry.kid_id === activeKidId)
        .map((entry) => ({
          recipeId: entry.recipe_id ?? null,
          foodId: entry.food_id ?? null,
          date: entry.date,
          result: entry.result ?? null,
        })),
    [planEntries, activeKidId]
  );

  const ladderFoodIds = useMemo(() => rows.map((row) => row.foodId), [rows]);

  const { alerts, backupByFood, dismiss } = useSafeFoodInsurance({
    kidId: enabled ? activeKidId : null,
    foods: foods.map((f) => ({
      id: f.id,
      name: f.name,
      isSafe: !!f.is_safe,
      allergens: f.allergens ?? null,
    })),
    planEntries: kidPlanEntries,
    kidAllergens: activeKid?.allergens ?? null,
    ladderFoodIds,
    today: todayIsoDate(),
  });

  if (!enabled || alerts.length === 0) return null;

  const handleStartBackup = async (target: SafeFoodBackupTarget): Promise<boolean> =>
    // The at-risk food goes in as the anchor: the backup is built beside the
    // thing that still works, not instead of it.
    addFoodToLadder(target.foodId, target.anchorFoodId);

  return (
    <SafeFoodInsuranceCard
      alerts={alerts}
      backupByFood={backupByFood}
      onDismiss={dismiss}
      onStartBackup={handleStartBackup}
      surface={surface}
    />
  );
}
