/**
 * How a food or recipe fits one specific child (contract C4).
 *
 * `is_safe` and `is_try_bite` are household flags on the food, so on their own
 * they cannot say whether THIS kid eats it: a sibling's safe food can carry
 * this child's allergen, or be on this child's dislike list. These helpers
 * fold the kid's profile and their own plan history into one answer the
 * pickers and the grid can badge from.
 *
 * `disliked_foods` and `always_eats_foods` hold either food ids or free-text
 * names depending on which screen wrote them, so both are matched on id and on
 * the lowercased, trimmed name.
 *
 * Pure: no React, no Supabase.
 */

import type { Food, Kid, PlanEntry, Recipe } from "@/types";
import { matchingAllergen } from "./allergens";

export type KidFitKid = Pick<Kid, "id" | "allergens" | "disliked_foods" | "always_eats_foods">;

export type KidFitResult = "ate" | "tasted" | "refused";

export interface KidFit {
  /** The first of the kid's allergens this item carries, canonicalized, or null. */
  allergen: string | null;
  disliked: boolean;
  alwaysEats: boolean;
  safe: boolean;
  tryBite: boolean;
  /** Offers with a recorded result (ate + tasted + refused). */
  tries: number;
  ate: number;
  /** Every past offer, logged or not. */
  offered: number;
  /** The most recent recorded result, by date. */
  lastResult: KidFitResult | null;
}

export interface ResultStats {
  tries: number;
  ate: number;
  tasted: number;
  refused: number;
  offered: number;
  lastResult: KidFitResult | null;
  /** Date key (YYYY-MM-DD) of lastResult; used to keep "last" honest. */
  lastDate: string | null;
}

/** Per-food outcome counts for one kid, keyed by food id. */
export type ResultIndex = Map<string, ResultStats>;

const nameKey = (value: string | null | undefined): string =>
  String(value ?? "").trim().toLowerCase();

function listMatches(list: readonly string[] | null | undefined, food: Pick<Food, "id" | "name">): boolean {
  if (!list || list.length === 0) return false;
  const name = nameKey(food.name);
  for (const raw of list) {
    if (raw === food.id) return true;
    const k = nameKey(raw);
    if (k && k === name) return true;
  }
  return false;
}

function emptyStats(): ResultStats {
  return { tries: 0, ate: 0, tasted: 0, refused: 0, offered: 0, lastResult: null, lastDate: null };
}

/**
 * Build the outcome index for one kid from plan history. Entries for other
 * kids are ignored. Only entries dated before `before` (a YYYY-MM-DD key,
 * exclusive) count when it is given, so the index can describe "how it went
 * last time" without counting today's still-open plan.
 */
export function buildResultIndex(
  planEntries: readonly PlanEntry[],
  kidId: string,
  before?: string,
): ResultIndex {
  const index: ResultIndex = new Map();
  for (const entry of planEntries) {
    if (entry.kid_id !== kidId || !entry.food_id) continue;
    const date = typeof entry.date === "string" ? entry.date.slice(0, 10) : "";
    if (before && date && date >= before) continue;
    let stats = index.get(entry.food_id);
    if (!stats) {
      stats = emptyStats();
      index.set(entry.food_id, stats);
    }
    stats.offered++;
    const result = entry.result;
    if (result === "ate" || result === "tasted" || result === "refused") {
      stats.tries++;
      stats[result]++;
      if (stats.lastDate === null || date >= stats.lastDate) {
        stats.lastDate = date;
        stats.lastResult = result;
      }
    }
  }
  return index;
}

function statsFor(index: ResultIndex, foodId: string): ResultStats {
  return index.get(foodId) ?? emptyStats();
}

function fitFromStats(
  food: Pick<Food, "is_safe" | "is_try_bite">,
  allergen: string | null,
  disliked: boolean,
  alwaysEats: boolean,
  stats: ResultStats,
): KidFit {
  return {
    allergen,
    disliked,
    alwaysEats,
    safe: Boolean(food.is_safe),
    tryBite: Boolean(food.is_try_bite),
    tries: stats.tries,
    ate: stats.ate,
    offered: stats.offered,
    lastResult: stats.lastResult,
  };
}

/**
 * Fit of one food for one kid. `history` may be the full plan (other kids are
 * filtered out) or a prebuilt ResultIndex when a caller scores many foods.
 */
export function getKidFoodFit(
  kid: KidFitKid,
  food: Pick<Food, "id" | "name" | "allergens" | "is_safe" | "is_try_bite">,
  history: readonly PlanEntry[] | ResultIndex,
): KidFit {
  const index = history instanceof Map ? history : buildResultIndex(history, kid.id);
  return fitFromStats(
    food,
    matchingAllergen(kid.allergens, food.allergens),
    listMatches(kid.disliked_foods, food),
    listMatches(kid.always_eats_foods, food),
    statsFor(index, food.id),
  );
}

/**
 * Fit of a recipe for one kid, judged over the recipe's foods.
 *
 * - allergen: the first hit among the recipe's foods, in food_ids order.
 * - disliked: any food is on the dislike list.
 * - alwaysEats / safe: every resolvable food qualifies.
 * - tryBite: any food is a try bite.
 * - History: summed over the recipe's foods; lastResult is the most recent.
 *
 * Foods missing from `foodById` are skipped rather than guessed at.
 */
export function getKidRecipeFit(
  kid: KidFitKid,
  recipe: Pick<Recipe, "food_ids">,
  foodById: ReadonlyMap<string, Food> | Readonly<Record<string, Food>>,
  history: readonly PlanEntry[] | ResultIndex,
): KidFit {
  const index = history instanceof Map ? history : buildResultIndex(history, kid.id);
  const lookup = (id: string): Food | undefined =>
    foodById instanceof Map ? foodById.get(id) : (foodById as Readonly<Record<string, Food>>)[id];

  const foods = (recipe.food_ids ?? [])
    .map(lookup)
    .filter((f): f is Food => Boolean(f));

  let allergen: string | null = null;
  let disliked = false;
  let tryBite = false;
  let alwaysEats = foods.length > 0;
  let safe = foods.length > 0;
  const totals = emptyStats();

  for (const food of foods) {
    const fit = getKidFoodFit(kid, food, index);
    if (allergen === null && fit.allergen) allergen = fit.allergen;
    if (fit.disliked) disliked = true;
    if (fit.tryBite) tryBite = true;
    if (!fit.alwaysEats) alwaysEats = false;
    if (!fit.safe) safe = false;
    const stats = statsFor(index, food.id);
    totals.tries += stats.tries;
    totals.ate += stats.ate;
    totals.offered += stats.offered;
    if (stats.lastResult && (totals.lastDate === null || (stats.lastDate ?? "") >= totals.lastDate)) {
      totals.lastDate = stats.lastDate;
      totals.lastResult = stats.lastResult;
    }
  }

  return {
    allergen,
    disliked,
    alwaysEats,
    safe,
    tryBite,
    tries: totals.tries,
    ate: totals.ate,
    offered: totals.offered,
    lastResult: totals.lastResult,
  };
}

/**
 * Acceptance rate as a planning weight: ate > tasted > untried > refused.
 * Returns a positive number so it can be used directly for weighted picks.
 */
export function acceptanceWeight(stats: ResultStats | undefined): number {
  if (!stats || stats.tries === 0) return 2; // untried: neutral
  const score = (stats.ate * 4 + stats.tasted * 2.5 + stats.refused * 0.5) / stats.tries;
  return Math.max(0.25, score);
}
