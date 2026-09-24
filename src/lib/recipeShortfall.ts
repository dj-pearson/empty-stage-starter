/**
 * US-284: shortfall detector for the "missing ingredient" bulk-add flow.
 *
 * Compares a recipe's structured ingredients (US-281, hydrated as
 * `recipe.recipe_ingredients`) against the current pantry foods and
 * returns one row per ingredient that the household doesn't have on
 * hand in sufficient quantity.
 *
 * Unit handling: same unit (case-insensitive, trimmed) subtracts directly;
 * different units go through unitNormalize.convert (2 lb covers 16 oz).
 * Only when convert cannot bridge them (cups vs lb, an unknown unit) is the
 * row marked `comparable: false` with the on-hand contribution treated as
 * zero, so the user is reminded to verify before submitting. A recipe line
 * with no amount ("to taste") is also a verify row, never a guessed 1.
 *
 * Pantry-match strategy:
 *   1. If ingredient.food_id is set, look up by id.
 *   2. Otherwise, lowercased trimmed name match against `foods.name`.
 *   3. No match → treated as "not in pantry" (full quantity is short).
 */

import type { Recipe, RecipeIngredient, Food, GroceryItem } from "@/types";
import { convert } from "./unitNormalize";

/**
 * Why a row is on the list, so the dialog can say it in words instead of a
 * bare "verify" badge.
 *   short            - matched in the pantry, same or convertible unit, not enough
 *   not_in_pantry    - no pantry food matched
 *   unit_mismatch    - matched, but the units cannot be converted (cups vs lb)
 *   unknown_quantity - the recipe gives no amount ("to taste", 0, blank)
 */
export type ShortfallReason = "short" | "not_in_pantry" | "unit_mismatch" | "unknown_quantity";

export type Shortfall = {
  ingredient: RecipeIngredient;
  /**
   * Quantity still to buy, in neededUnit. 0 when the recipe gives no amount
   * (reason "unknown_quantity"); callers adding to a list pick their own
   * default then.
   */
  needed: number;
  /** Recipe-side unit; null when missing. */
  neededUnit: string | null;
  /** Quantity already on hand from the matched pantry food, in onHandUnit. */
  onHand: number;
  /** Pantry-side unit; null when missing or no match. */
  onHandUnit: string | null;
  /** The matched pantry food, or null if there is none. */
  matchedFood: Food | null;
  /**
   * True when `needed` is a real figure: the recipe gave an amount and the
   * pantry side was either absent or subtracted (same unit, or converted via
   * unitNormalize). False means "verify before adding to grocery".
   */
  comparable: boolean;
  reason: ShortfallReason;
  /** Quantity already on the grocery list (unchecked), in neededUnit. */
  onListQty?: number;
};

const nameKey = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();

/**
 * Convert `qty` from one unit to another. Same unit (or both absent) passes
 * through; otherwise unitNormalize.convert decides, and null means the two
 * cannot be compared (cups vs lb, or an unknown unit).
 */
function toUnit(qty: number, from: string | null, to: string | null): number | null {
  if ((from ?? "") === (to ?? "")) return qty;
  if (!from || !to) return null;
  return convert(qty, from, to);
}

/**
 * Total unchecked grocery-list quantity per lowercased name, kept per unit so
 * each can be converted to the recipe's unit at lookup time.
 */
function indexOnList(onList: readonly GroceryItem[] | undefined) {
  const byName = new Map<string, Array<{ qty: number; unit: string | null }>>();
  for (const item of onList ?? []) {
    if (item.checked) continue;
    const k = nameKey(item.name);
    if (!k) continue;
    const bucket = byName.get(k) ?? [];
    bucket.push({ qty: Number(item.quantity) || 0, unit: normalizeUnitTag(item.unit ?? null) });
    byName.set(k, bucket);
  }
  return byName;
}

/**
 * Compute the ingredients-needed-but-not-on-hand list for a recipe.
 * Returns rows in `sort_order` to match the recipe's display order.
 *
 * `onList`, when given, is the current grocery list: unchecked rows with the
 * same name count toward the need (converted to the recipe's unit where the
 * units allow), so an ingredient already on the list is not offered twice.
 */
export function computeRecipeShortfall(
  recipe: Recipe,
  foods: Food[],
  onList?: readonly GroceryItem[],
): Shortfall[] {
  const ingredients = recipe.recipe_ingredients ?? [];
  if (ingredients.length === 0) return [];

  const sorted = ingredients
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const foodById = new Map(foods.map((f) => [f.id, f]));
  const foodByName = new Map<string, Food>();
  for (const f of foods) {
    const k = nameKey(f.name);
    if (k && !foodByName.has(k)) foodByName.set(k, f);
  }
  const listByName = indexOnList(onList);

  const shortfalls: Shortfall[] = [];

  for (const ing of sorted) {
    // Skip ingredients without a usable name (defensive — DB has NOT NULL
    // on `name`, but legacy rows may have empty strings).
    const name = (ing.name ?? "").trim();
    if (!name) continue;

    const quantityKnown = typeof ing.quantity === "number" && ing.quantity > 0;
    const neededUnit = normalizeUnitTag(ing.unit ?? null);

    const matchedFood =
      (ing.food_id ? foodById.get(ing.food_id) : undefined) ??
      foodByName.get(name.toLowerCase()) ??
      null;
    const onHand = matchedFood ? matchedFood.quantity ?? 0 : 0;
    const onHandUnit = matchedFood ? normalizeUnitTag(matchedFood.unit ?? null) : null;
    const listed = listByName.get(name.toLowerCase()) ?? [];

    if (!quantityKnown) {
      // "To taste", 0 or blank: there is no amount to subtract from, so any
      // stock in the pantry or on the list counts as covered and anything
      // else is a row the user has to judge.
      if (onHand > 0 || listed.length > 0) continue;
      shortfalls.push({
        ingredient: ing,
        needed: 0,
        neededUnit,
        onHand,
        onHandUnit,
        matchedFood,
        comparable: false,
        reason: "unknown_quantity",
      });
      continue;
    }

    let needed = ing.quantity as number;
    let reason: ShortfallReason = matchedFood ? "short" : "not_in_pantry";
    let comparable = true;

    if (matchedFood) {
      const onHandInNeeded = toUnit(onHand, onHandUnit, neededUnit);
      if (onHandInNeeded === null) {
        comparable = false;
        reason = "unit_mismatch";
      } else {
        needed -= onHandInNeeded;
      }
    }

    let onListQty = 0;
    for (const row of listed) {
      const converted = toUnit(row.qty, row.unit, neededUnit);
      if (converted !== null) onListQty += converted;
    }
    if (comparable) needed -= onListQty;

    // Float noise from conversions ("2 lb" is 32.00000001 oz) must not leave a
    // phantom 0.00000001-oz row behind.
    if (comparable && needed <= 1e-6) continue;
    // An incomparable row already on the list is covered as far as we can tell.
    if (!comparable && listed.length > 0) continue;

    shortfalls.push({
      ingredient: ing,
      needed: comparable ? roundQty(needed) : (ing.quantity as number),
      neededUnit,
      onHand,
      onHandUnit,
      matchedFood,
      comparable,
      reason,
      ...(onListQty > 0 ? { onListQty: roundQty(onListQty) } : {}),
    });
  }

  return shortfalls;
}

function roundQty(qty: number): number {
  return Math.round(qty * 1000) / 1000;
}

/** Trim + lowercase a unit string so "TBSP " and "tbsp" compare equal. */
function normalizeUnitTag(raw: string | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * US-290: cheap missing-ingredient count for a planner cell.
 *
 * Two paths:
 *   1. If `recipe.recipe_ingredients` is populated (US-281), defer to
 *      `computeRecipeShortfall`'s row count so the badge stays in sync
 *      with the dialog.
 *   2. Otherwise, fall back to `food_ids` and count entries that resolve
 *      to a pantry food with quantity ≤ 0 (or that have no pantry match
 *      at all). This keeps the badge useful for legacy recipes that
 *      haven't been migrated to structured ingredients.
 *
 * Returns 0 when nothing is missing, including for recipes with no
 * ingredient data at all (so the chip stays hidden).
 */
export function countMissingForRecipe(
  recipe: Pick<Recipe, "food_ids" | "recipe_ingredients">,
  foods: Food[],
  onList?: readonly GroceryItem[],
): number {
  if (recipe.recipe_ingredients && recipe.recipe_ingredients.length > 0) {
    return computeRecipeShortfall(recipe as Recipe, foods, onList).length;
  }

  const foodIds = recipe.food_ids ?? [];
  if (foodIds.length === 0) return 0;

  let missing = 0;
  for (const foodId of foodIds) {
    const matched = foods.find((f) => f.id === foodId);
    if (!matched) {
      missing++;
      continue;
    }
    if ((matched.quantity ?? 0) <= 0) missing++;
  }
  return missing;
}
