/**
 * Safe Food Insurance container (US-611, web surface).
 *
 * Wires the shared rule set to the card and to the ladder. Kept separate from
 * the presentational card so the card stays free of data access, and so the
 * page mounting this only has to render one thing.
 *
 * Gated behind the `exposure_ladder` flag, which is on by default and kept as
 * a kill switch (see useExposureLadderFlag). The card's main offer is to start
 * a ladder, so it goes wherever the ladder goes.
 */

import { useEffect, useMemo } from 'react';
import { useFoods, useKids, usePlan } from '@/contexts/AppContext';
import { useExposureLadderFlag } from '@/hooks/useExposureLadderFlag';
import { useFoodLadder, todayIsoDate } from '@/hooks/useFoodLadder';
import { useSafeFoodInsurance, type SafeFoodBackupTarget } from '@/hooks/useSafeFoodInsurance';
import { SafeFoodInsuranceCard } from '@/components/SafeFoodInsuranceCard';

interface Props {
  /** Analytics tag for where this was rendered. */
  surface?: string;
  /**
   * Told whether the card currently has something to show, so the Home
   * insight slot can fall through to the next candidate when it does not.
   */
  onAvailabilityChange?: (hasContent: boolean) => void;
}

/**
 * Flag gate. The inner component's hooks fetch food_attempts and chain
 * suggestions, so the check happens before any of them run rather than after.
 */
export function SafeFoodInsuranceSection(props: Props) {
  const enabled = useExposureLadderFlag();
  const { onAvailabilityChange } = props;
  useEffect(() => {
    if (!enabled) onAvailabilityChange?.(false);
  }, [enabled, onAvailabilityChange]);
  if (!enabled) return null;
  return <SafeFoodInsuranceSectionInner {...props} />;
}

function SafeFoodInsuranceSectionInner({ surface = 'unknown', onAvailabilityChange }: Props) {
  const { activeKidId, kids } = useKids();
  const { foods } = useFoods();
  const { planEntries } = usePlan();

  const activeKid = kids.find((k) => k.id === activeKidId) ?? null;
  const { rows, addFoodToLadder } = useFoodLadder(activeKidId, {
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

  // Memoized so the hook's scoring memo is not invalidated on every render.
  const insuranceFoods = useMemo(
    () =>
      foods.map((f) => ({
        id: f.id,
        name: f.name,
        isSafe: !!f.is_safe,
        allergens: f.allergens ?? null,
      })),
    [foods]
  );

  const { alerts, backupByFood, dismiss } = useSafeFoodInsurance({
    kidId: activeKidId,
    foods: insuranceFoods,
    planEntries: kidPlanEntries,
    kidAllergens: activeKid?.allergens ?? null,
    ladderFoodIds,
    today: todayIsoDate(),
  });

  const hasContent = alerts.length > 0;
  useEffect(() => {
    onAvailabilityChange?.(hasContent);
  }, [hasContent, onAvailabilityChange]);

  if (!hasContent) return null;

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
