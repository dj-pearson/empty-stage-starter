import { format, subDays } from "date-fns";
import type { Food, Kid, PlanEntry } from "@/types";

export interface CategoryCoverage {
  category: string;
  count: number;
  percentage: number;
}

/** Derived nutrition insights for the InsightsDashboard (US-540). */
export interface Insights {
  safeFoodsCount: number;
  tryBitesCount: number;
  completedMeals: number;
  tastedMeals: number;
  refusedMeals: number;
  totalTracked: number;
  successRate: number;
  uniqueFoodsTried: number;
  successfulTryBites: number;
  totalTryBites: number;
  /** Per-category safe-food coverage; only present in single-child mode. */
  coverage?: CategoryCoverage[];
  familyMode?: boolean;
}

export const EMPTY_INSIGHTS: Insights = {
  safeFoodsCount: 0,
  tryBitesCount: 0,
  completedMeals: 0,
  tastedMeals: 0,
  refusedMeals: 0,
  totalTracked: 0,
  successRate: 0,
  uniqueFoodsTried: 0,
  successfulTryBites: 0,
  totalTryBites: 0,
};

const CATEGORIES = ["protein", "carb", "dairy", "fruit", "vegetable", "snack"];

export interface ComputeInsightsParams {
  activeKid: Kid | undefined;
  isFamilyMode: boolean;
  kids: Kid[];
  foods: Food[];
  planEntries: PlanEntry[];
  /** Injectable for deterministic tests; defaults to now. */
  now?: Date;
}

/**
 * Pure derivation of dashboard insights from the current app state — replaces
 * the previous effect+setState(any) approach so the value is memoizable and
 * strongly typed (US-540). Returns EMPTY_INSIGHTS when there is nothing to show.
 */
export function computeInsights(params: ComputeInsightsParams): Insights {
  const { activeKid, isFamilyMode, kids, foods, planEntries, now = new Date() } = params;
  const thirtyDaysAgo = format(subDays(now, 30), "yyyy-MM-dd");

  const successRate = (completed: number, tasted: number, total: number) =>
    total > 0 ? ((completed + tasted) / total) * 100 : 0;

  if (isFamilyMode && kids.length > 0) {
    const recentEntries = planEntries.filter((e) => e.date >= thirtyDaysAgo);
    const completedMeals = recentEntries.filter((e) => e.result === "ate").length;
    const tastedMeals = recentEntries.filter((e) => e.result === "tasted").length;
    const refusedMeals = recentEntries.filter((e) => e.result === "refused").length;
    const totalTracked = completedMeals + tastedMeals + refusedMeals;
    return {
      ...EMPTY_INSIGHTS,
      safeFoodsCount: foods.filter((f) => f.is_safe).length,
      tryBitesCount: foods.filter((f) => f.is_try_bite).length,
      completedMeals,
      tastedMeals,
      refusedMeals,
      totalTracked,
      successRate: successRate(completedMeals, tastedMeals, totalTracked),
      uniqueFoodsTried: new Set(recentEntries.map((e) => e.food_id)).size,
      familyMode: true,
    };
  }

  if (!activeKid) return EMPTY_INSIGHTS;

  const kidAllergens = activeKid.allergens || [];
  const isSafeForKid = (f: Food) => !f.allergens?.some((a) => kidAllergens.includes(a));
  const safeFoods = foods.filter((f) => f.is_safe && isSafeForKid(f));
  const tryBites = foods.filter((f) => f.is_try_bite && isSafeForKid(f));

  const coverage: CategoryCoverage[] = CATEGORIES.map((cat) => {
    const count = safeFoods.filter((f) => f.category === cat).length;
    return { category: cat, count, percentage: (count / Math.max(safeFoods.length, 1)) * 100 };
  });

  const recentEntries = planEntries.filter((e) => e.kid_id === activeKid.id && e.date >= thirtyDaysAgo);
  const completedMeals = recentEntries.filter((e) => e.result === "ate").length;
  const tastedMeals = recentEntries.filter((e) => e.result === "tasted").length;
  const refusedMeals = recentEntries.filter((e) => e.result === "refused").length;
  const totalTracked = completedMeals + tastedMeals + refusedMeals;

  const tryBiteEntries = recentEntries.filter((e) => foods.find((f) => f.id === e.food_id)?.is_try_bite);
  const successfulTryBites = tryBiteEntries.filter((e) => e.result === "ate" || e.result === "tasted").length;

  return {
    safeFoodsCount: safeFoods.length,
    tryBitesCount: tryBites.length,
    coverage,
    completedMeals,
    tastedMeals,
    refusedMeals,
    totalTracked,
    successRate: successRate(completedMeals, tastedMeals, totalTracked),
    uniqueFoodsTried: new Set(recentEntries.map((e) => e.food_id)).size,
    successfulTryBites,
    totalTryBites: tryBiteEntries.length,
  };
}
