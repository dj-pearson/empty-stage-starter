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
  /**
   * Split of the remaining tries. Optional so fixtures written before they
   * existed still type-check; getKidFoodFit and getKidRecipeFit always set them.
   */
  tasted?: number;
  refused?: number;
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
    tasted: stats.tasted,
    refused: stats.refused,
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
 * - disliked: at least one food is on the dislike list.
 * - alwaysEats / safe: every resolvable food qualifies.
 * - tryBite: at least one food is a try bite.
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
    totals.tasted += stats.tasted;
    totals.refused += stats.refused;
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
    tasted: totals.tasted,
    refused: totals.refused,
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

/** acceptanceWeight for a KidFit, which carries the same counts as ResultStats. */
export function fitAcceptanceWeight(fit: KidFit): number {
  if (fit.tries === 0) return acceptanceWeight(undefined);
  const tasted = fit.tasted ?? 0;
  return acceptanceWeight({
    tries: fit.tries,
    ate: fit.ate,
    tasted,
    refused: fit.refused ?? Math.max(0, fit.tries - fit.ate - tasted),
    offered: fit.offered,
    lastResult: fit.lastResult,
    lastDate: null,
  });
}

// ---------------------------------------------------------------------------
// One item scored against several kids (lifted from MealQuickAddDrawer).
// ---------------------------------------------------------------------------

export interface KidHit {
  kid: Kid;
  fit: KidFit;
}

/**
 * Whether an item is safe from allergens for every target kid.
 *
 * - hit: at least one kid's allergen is in it.
 * - unknown: no hit found, but we could not check everything, because a kid's
 *   allergy list is missing (redacted from the offline cache) or some of the
 *   item's ingredients do not resolve to a food we know the allergens of.
 * - safe: every kid's list was known and every ingredient was checked.
 *
 * Unknown is never shown as safe.
 */
export type AllergenStatus = "safe" | "hit" | "unknown";

/** One item scored against every target kid. */
export interface ItemFit {
  perKid: KidHit[];
  allergenKids: KidHit[];
  dislikeKids: Kid[];
  goToKids: Kid[];
  /** Safe or go-to for every kid, no dislike, and allergenStatus is "safe". */
  safeForAll: boolean;
  trying: boolean;
  tries: number;
  lastResult: KidFit["lastResult"];
  allergenStatus: AllergenStatus;
  /** Ingredients that could not be checked for allergens. */
  unchecked: number;
}

export interface SummarizeOptions {
  /** Ingredients that could not be checked (see countUncheckedIngredients). */
  unchecked?: number;
  /** Kids whose allergy list is not known. Kids with `allergens` undefined count too. */
  unknownKidIds?: readonly string[];
}

/** A kid's allergy list is unknown when the field is absent, not when it is empty. */
export function isAllergyUnknown(kid: Pick<Kid, "allergens">): boolean {
  return kid.allergens === undefined;
}

export function summarizeKidFits(perKid: KidHit[], opts: SummarizeOptions = {}): ItemFit {
  const unchecked = Math.max(0, opts.unchecked ?? 0);
  const unknownIds = new Set(opts.unknownKidIds ?? []);
  const allergenKids = perKid.filter((h) => h.fit.allergen);
  const dislikeKids = perKid.filter((h) => h.fit.disliked).map((h) => h.kid);
  const goToKids = perKid.filter((h) => h.fit.alwaysEats).map((h) => h.kid);
  const anyUnknownKid = perKid.some((h) => unknownIds.has(h.kid.id) || isAllergyUnknown(h.kid));
  const allergenStatus: AllergenStatus =
    allergenKids.length > 0 ? "hit" : anyUnknownKid || unchecked > 0 ? "unknown" : "safe";
  const safeForAll =
    allergenStatus === "safe" &&
    perKid.length > 0 &&
    perKid.every((h) => (h.fit.safe || h.fit.alwaysEats) && !h.fit.allergen && !h.fit.disliked);
  const trying = allergenKids.length === 0 && perKid.some((h) => h.fit.tryBite);
  const tries = perKid.reduce((m, h) => Math.max(m, h.fit.tries), 0);
  const lastResult = perKid.length === 1 ? perKid[0].fit.lastResult : null;
  return {
    perKid,
    allergenKids,
    dislikeKids,
    goToKids,
    safeForAll,
    trying,
    tries,
    lastResult,
    allergenStatus,
    unchecked,
  };
}

export type FitGroup = "safe" | "trying" | "other";

/** Safe for everyone first, then what a kid is working on, then the rest. */
export function fitGroup(fit: ItemFit): FitGroup {
  if (fit.allergenKids.length > 0) return "other";
  if (fit.safeForAll) return "safe";
  if (fit.trying) return "trying";
  return "other";
}

type FoodLookup = ReadonlyMap<string, Food>;

/**
 * Ingredients whose allergens we cannot check: food_ids that do not resolve in
 * `foodById`, plus recipe_ingredients rows with no food at all (typed-in
 * ingredients, or an import nothing matched).
 */
export function countUncheckedIngredients(
  recipe: Pick<Recipe, "food_ids" | "recipe_ingredients">,
  foodById: FoodLookup,
): number {
  let n = 0;
  for (const id of recipe.food_ids ?? []) if (!foodById.has(id)) n++;
  for (const row of recipe.recipe_ingredients ?? []) if (row.food_id == null) n++;
  return n;
}

export interface AllergenConflict<K extends Pick<Kid, "id" | "allergens"> = Kid> {
  kid: K;
  food: Food;
  /** Canonical allergen name, e.g. "peanut". */
  allergen: string;
}

/**
 * Every (kid, food) pair where the food carries one of the kid's allergens.
 * Canonical matching, so a kid's "peanuts" matches a food's "en:peanuts".
 * Foods missing from `foodById` are skipped: they are "unknown", not a hit.
 */
export function findAllergenConflicts<K extends Pick<Kid, "id" | "allergens">>(
  kids: readonly K[],
  foodIds: readonly string[],
  foodById: FoodLookup,
): AllergenConflict<K>[] {
  const out: AllergenConflict<K>[] = [];
  const foods = [...new Set(foodIds)]
    .map((id) => foodById.get(id))
    .filter((f): f is Food => Boolean(f));
  for (const kid of kids) {
    if (!kid.allergens || kid.allergens.length === 0) continue;
    for (const food of foods) {
      const allergen = matchingAllergen(kid.allergens, food.allergens);
      if (allergen) out.push({ kid, food, allergen });
    }
  }
  return out;
}

/**
 * Score every recipe against the target kids. History counts up to (not
 * including) `todayKey`. One ResultIndex is built per kid and shared across
 * all recipes, so the cost is kids x plan + recipes x kids x foods.
 */
export function buildRecipeFits(
  recipes: readonly Recipe[],
  targetKids: readonly Kid[],
  foodById: FoodLookup,
  planEntries: readonly PlanEntry[],
  todayKey?: string,
): Map<string, ItemFit> {
  const indexes = new Map<string, ResultIndex>();
  for (const k of targetKids) indexes.set(k.id, buildResultIndex(planEntries, k.id, todayKey));
  const out = new Map<string, ItemFit>();
  for (const recipe of recipes) {
    const perKid = targetKids.map((k) => ({
      kid: k,
      fit: getKidRecipeFit(k, recipe, foodById, indexes.get(k.id) ?? new Map()),
    }));
    out.set(recipe.id, summarizeKidFits(perKid, { unchecked: countUncheckedIngredients(recipe, foodById) }));
  }
  return out;
}
