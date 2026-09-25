/**
 * Tonight's dinner, per kid, with how it fits each one.
 *
 * Reads the domain hooks rather than the merged useApp(), so the home hero
 * does not re-render on a grocery tick. Everything derived is computed in one
 * useMemo; the only other state is today's date key, which rolls over when a
 * tab left open overnight becomes visible again.
 */

import { useEffect, useMemo, useState } from "react";
import { useFoods, useKids, usePlan, useRecipes } from "@/contexts/AppContext";
import { toISODate } from "@/lib/date-utils";
import {
  buildResultIndex,
  countUncheckedIngredients,
  findAllergenConflicts,
  getKidFoodFit,
  getKidRecipeFit,
  summarizeKidFits,
  type AllergenConflict,
  type AllergenStatus,
  type ItemFit,
  type KidFit,
} from "@/lib/kidFit";
import { buildTodayPlan, type TodayDish, type TodayPlan } from "@/lib/todayPlan";
import type { Food, Kid, Recipe } from "@/types";

export interface TonightKidRow {
  kid: Kid;
  /** Tonight's dinner for this kid, or null when none is planned. */
  dish: TodayDish | null;
  /** The recipe's name, else the foods' names joined; null without a dish. */
  dishName: string | null;
  recipe: Recipe | null;
  /** Fit of the dinner for this kid alone, for KidFitBadges. Null without a dish. */
  fit: ItemFit | null;
  /** Never 'safe' when the kid's allergy list or an ingredient is unknown. */
  allergenStatus: AllergenStatus | null;
  /** Foods in tonight's dinner that carry one of this kid's allergens. */
  conflicts: AllergenConflict<Kid>[];
}

export interface TonightPlan {
  todayKey: string;
  targetKids: Kid[];
  rows: TonightKidRow[];
  /** At least one target kid has dinner planned. */
  anyDinner: boolean;
  /** Rows with allergenStatus 'hit', in kid order. */
  allergenRows: TonightKidRow[];
  today: TodayPlan;
  foodById: ReadonlyMap<string, Food>;
}

/**
 * Today's local date key, recomputed whenever the page becomes visible again,
 * so a tab opened yesterday does not keep showing yesterday's dinner.
 */
export function useTodayKey(): string {
  const [todayKey, setTodayKey] = useState(() => toISODate(new Date()));
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const next = toISODate(new Date());
      setTodayKey((prev) => (prev === next ? prev : next));
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
  return todayKey;
}

/** activeKid alone when one is picked; every kid in Family mode. */
export function selectTargetKids(kids: readonly Kid[], activeKidId: string | null): Kid[] {
  if (activeKidId) {
    const kid = kids.find((k) => k.id === activeKidId);
    if (kid) return [kid];
  }
  return [...kids];
}

function dishNameFor(dish: TodayDish, recipe: Recipe | null, foodById: ReadonlyMap<string, Food>): string {
  if (recipe?.name) return recipe.name;
  const names = dish.foodIds.map((id) => foodById.get(id)?.name).filter((n): n is string => Boolean(n));
  return names.join(", ");
}

export function computeTonightPlan(args: {
  planEntries: Parameters<typeof buildTodayPlan>[0];
  foods: readonly Food[];
  recipes: readonly Recipe[];
  kids: readonly Kid[];
  activeKidId: string | null;
  todayKey: string;
}): TonightPlan {
  const { planEntries, foods, recipes, kids, activeKidId, todayKey } = args;
  const foodById = new Map<string, Food>(foods.map((f) => [f.id, f]));
  const recipeById = new Map<string, Recipe>(recipes.map((r) => [r.id, r]));
  const targetKids = selectTargetKids(kids, activeKidId);
  const today = buildTodayPlan(planEntries, targetKids, todayKey);

  const rows: TonightKidRow[] = targetKids.map((kid) => {
    const dish = today.byKid.get(kid.id)?.dinner ?? null;
    if (!dish) {
      return { kid, dish: null, dishName: null, recipe: null, fit: null, allergenStatus: null, conflicts: [] };
    }
    const recipe = dish.recipeId ? recipeById.get(dish.recipeId) ?? null : null;
    const index = buildResultIndex(planEntries, kid.id, todayKey);

    let fit: KidFit;
    let unchecked = 0;
    let dinnerFoodIds: string[];
    if (recipe) {
      fit = getKidRecipeFit(kid, recipe, foodById, index);
      unchecked = countUncheckedIngredients(recipe, foodById);
      dinnerFoodIds = recipe.food_ids ?? dish.foodIds;
    } else if (!dish.recipeId && dish.foodIds.length === 1 && foodById.has(dish.foodIds[0])) {
      fit = getKidFoodFit(kid, foodById.get(dish.foodIds[0]) as Food, index);
      dinnerFoodIds = dish.foodIds;
    } else {
      // A recipe that has not loaded (or was deleted), or several loose foods:
      // judge the rows we can see and count what we cannot.
      fit = getKidRecipeFit(kid, { food_ids: dish.foodIds }, foodById, index);
      unchecked = dish.foodIds.filter((id) => !foodById.has(id)).length + (dish.recipeId && !recipe ? 1 : 0);
      dinnerFoodIds = dish.foodIds;
    }

    // allergens: null is "not sure yet"; kidFit only treats undefined as unknown.
    const unknownKidIds = kid.allergens == null ? [kid.id] : [];
    const summary = summarizeKidFits([{ kid, fit }], { unchecked, unknownKidIds });
    const conflicts = findAllergenConflicts([kid], dinnerFoodIds, foodById);

    return {
      kid,
      dish,
      dishName: dishNameFor(dish, recipe, foodById),
      recipe,
      fit: summary,
      allergenStatus: summary.allergenStatus,
      conflicts,
    };
  });

  return {
    todayKey,
    targetKids,
    rows,
    anyDinner: rows.some((r) => r.dish !== null),
    allergenRows: rows.filter((r) => r.allergenStatus === "hit"),
    today,
    foodById,
  };
}

export function useTonightPlan(): TonightPlan {
  const { kids, activeKidId } = useKids();
  const { foods } = useFoods();
  const { recipes } = useRecipes();
  const { planEntries } = usePlan();
  const todayKey = useTodayKey();

  return useMemo(
    () => computeTonightPlan({ planEntries, foods, recipes, kids, activeKidId, todayKey }),
    [planEntries, foods, recipes, kids, activeKidId, todayKey],
  );
}
