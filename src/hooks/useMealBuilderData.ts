/**
 * Everything Meal Builder's plate reads, for one child and one meal slot.
 *
 * The candidates come from one call to the pure selector in
 * src/lib/plateBuilder.ts, memoized on the inputs that can change them. The
 * ladder is this child's (useFoodLadder), the chain suggestions are for the
 * safe food currently on the plate (useChainBridgeSuggestions), and the plan
 * rows are narrowed to this child before they reach the selector, so a
 * sibling's meal never re-runs it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFoods, useKids, usePlan, useRecipes } from '@/contexts/AppContext';
import { useFoodLadder } from '@/hooks/useFoodLadder';
import { useOnline } from '@/hooks/useCommon';
import { useChainBridgeSuggestions } from '@/hooks/useChainBridgeSuggestions';
import { localIsoDate } from '@/components/foodTracker/ladderDates';
import {
  selectPlateCandidates,
  type PlateCandidates,
  type PlateZone,
} from '@/lib/plateBuilder';
import type { Food, Kid, MealSlot, PlanEntry } from '@/types';

export type MealBuilderStatus = 'loading' | 'ready' | 'error' | 'offline';

export type ChosenPlate = Partial<Record<PlateZone, string>>;

export interface MealBuilderData {
  status: MealBuilderStatus;
  candidates: PlateCandidates | null;
  reloadLadder: () => Promise<void>;
  kid: Kid | null;
  foodsById: ReadonlyMap<string, Food>;
  /** This child's plan rows, every date. */
  kidEntries: readonly PlanEntry[];
  online: boolean;
  todayIso: string;
}

const NO_CHOICE: ChosenPlate = {};

export function useMealBuilderData(
  kidId: string | null,
  date: string,
  slot: MealSlot,
  chosen: ChosenPlate = NO_CHOICE,
): MealBuilderData {
  const { foods, foodsHydrated } = useFoods();
  const { kids } = useKids();
  const { planEntries } = usePlan();
  const { recipes } = useRecipes();
  const online = useOnline();

  const kid = useMemo(() => (kidId ? (kids.find((k) => k.id === kidId) ?? null) : null), [kids, kidId]);

  const ladder = useFoodLadder(kid?.id ?? null, { kid, foods });

  // useFoodLadder starts with loading=false and flips it on in its own effect,
  // so the first paint of a new child would read "no ladder" and flash the
  // empty state. An empty ladder only counts once a load for this child has
  // been seen to start.
  const seenLoadingFor = useRef<string | null>(null);
  if (ladder.loading && kid) seenLoadingFor.current = kid.id;
  const ladderStatus: 'loading' | 'error' | 'ready' = !kid
    ? 'ready'
    : ladder.error
      ? 'error'
      : ladder.loading || (ladder.rows.length === 0 && seenLoadingFor.current !== kid.id)
        ? 'loading'
        : 'ready';

  const foodsById = useMemo(() => {
    const map = new Map<string, Food>();
    for (const f of foods) if (f?.id) map.set(f.id, f);
    return map;
  }, [foods]);

  const currentKidId = kid?.id ?? null;
  const kidEntries = useMemo(
    () => (currentKidId ? planEntries.filter((e) => e.kid_id === currentKidId) : []),
    [planEntries, currentKidId],
  );

  const todayIso = localIsoDate(new Date());

  // The bridge follows the safe food on the plate. That is the chosen one, or
  // the selector's default, which is only known after a run; the default is
  // carried from the last run into this state.
  const [defaultSafeId, setDefaultSafeId] = useState<string | null>(null);
  const bridgeSource = chosen.safe ?? defaultSafeId;
  const chainSuggestions = useChainBridgeSuggestions(bridgeSource);

  const candidates = useMemo<PlateCandidates | null>(() => {
    if (!kid) return null;
    return selectPlateCandidates({
      kid,
      foods,
      ladderRows: ladder.rows,
      ladderStatus,
      planEntries: kidEntries,
      recipes,
      date,
      slot,
      todayIso,
      chainSuggestions,
      chosen,
    });
  }, [kid, ladder.rows, ladderStatus, foods, kidEntries, recipes, date, slot, todayIso, chainSuggestions, chosen]);

  const nextDefaultSafe = candidates?.defaults.safe ?? null;
  useEffect(() => {
    setDefaultSafeId(nextDefaultSafe);
  }, [nextDefaultSafe]);

  const { reload } = ladder;
  const reloadLadder = useCallback(() => reload(), [reload]);

  const status: MealBuilderStatus = !foodsHydrated
    ? 'loading'
    : !online
      ? 'offline'
      : ladderStatus === 'error'
        ? 'error'
        : 'ready';

  return { status, candidates, reloadLadder, kid, foodsById, kidEntries, online, todayIso };
}
