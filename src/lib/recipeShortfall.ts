/**
 * US-284: shortfall detector for the "missing ingredient" bulk-add flow.
 *
 * Compares a recipe's structured ingredients (US-281, hydrated as
 * `recipe.recipe_ingredients`) against the current pantry foods and
 * returns one row per ingredient that the household doesn't have on
 * hand in sufficient quantity.
 *
 * v1 unit handling is conservative: when both sides report the same
 * (case-insensitive, trimmed) unit string, we do straight numeric
 * subtraction. When units differ — or when one side is missing — we
 * mark the row `comparable: false` and treat the on-hand contribution
 * as zero so the user is reminded to verify before submitting. The
 * full unit normalization layer (US-287) replaces the comparable check
 * with a proper convert + compare and removes the conservative bias.
 *
 * Pantry-match strategy:
 *   1. If ingredient.food_id is set, look up by id.
 *   2. Otherwise, lowercased trimmed name match against `foods.name`.
 *   3. No match → treated as "not in pantry" (full quantity is short).
 */

import type { Recipe, RecipeIngredient, Food } from "@/types";

export type Shortfall = {
  ingredient: RecipeIngredient;
  /** Quantity the recipe needs (defaults to 1 when ingredient has no qty). */
  needed: number;
  /** Recipe-side unit; null when missing. */
  neededUnit: string | null;
  /** Quantity already on hand from the matched pantry food. */
  onHand: number;
  /** Pantry-side unit; null when missing or no match. */
  onHandUnit: string | null;
  /** The matched pantry food, or null if there is none. */
  matchedFood: Food | null;
  /**
   * True when the on-hand contribution was subtracted from the needed
   * quantity (units matched). False when units mismatched or were
   * absent — caller should still surface the row but treat it as
   * "verify before adding to grocery".
   */
  comparable: boolean;
};

/**
 * Compute the ingredients-needed-but-not-on-hand list for a recipe.
 * Returns rows in `sort_order` to match the recipe's display order.
 */
export function computeRecipeShortfall(
  recipe: Recipe,
  foods: Food[]
): Shortfall[] {
  const ingredients = recipe.recipe_ingredients ?? [];
  if (ingredients.length === 0) return [];

  const sorted = ingredients
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const shortfalls: Shortfall[] = [];

  for (const ing of sorted) {
    // Skip ingredients without a usable name (defensive — DB has NOT NULL
    // on `name`, but legacy rows may have empty strings).
    const name = (ing.name ?? "").trim();
    if (!name) continue;

    const needed = typeof ing.quantity === "number" && ing.quantity > 0
      ? ing.quantity
      : 1;
    const neededUnit = normalizeUnitTag(ing.unit ?? null);

    const matchedFood =
      (ing.food_id && foods.find((f) => f.id === ing.food_id)) ||
      foods.find((f) => f.name.trim().toLowerCase() === name.toLowerCase()) ||
      null;

    if (!matchedFood) {
      shortfalls.push({
        ingredient: ing,
        needed,
        neededUnit,
        onHand: 0,
        onHandUnit: null,
        matchedFood: null,
        comparable: false,
      });
      continue;
    }

    const onHand = matchedFood.quantity ?? 0;
    const onHandUnit = normalizeUnitTag(matchedFood.unit ?? null);

    // Same unit (or both side missing units) → arithmetic comparison.
    const comparable =
      (neededUnit ?? "") === (onHandUnit ?? "");

    if (!comparable) {
      shortfalls.push({
        ingredient: ing,
        needed,
        neededUnit,
        onHand,
        onHandUnit,
        matchedFood,
        comparable: false,
      });
      continue;
    }

    if (onHand >= needed) {
      // Fully covered, no shortfall row.
      continue;
    }

    shortfalls.push({
      ingredient: ing,
      needed: needed - onHand,
      neededUnit,
      onHand,
      onHandUnit,
      matchedFood,
      comparable: true,
    });
  }

  return shortfalls;
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
  foods: Food[]
): number {
  if (recipe.recipe_ingredients && recipe.recipe_ingredients.length > 0) {
    return computeRecipeShortfall(recipe as Recipe, foods).length;
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
