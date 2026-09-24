import type { Food, GroceryItem, Kid, Recipe } from '@/types';
import type { GroceryAddInput } from '@/lib/groceryMerge';
import { computeRecipeShortfall } from '@/lib/recipeShortfall';
import { findAllergenConflicts, type AllergenConflict } from '@/lib/kidFit';
import { allergenConflictsForNames, matchPantryFood, type ParsedIngredientRow } from './groceryInputSchemas';

/**
 * One ingredient in the "add a recipe to the list" review, whichever way the
 * recipe arrived (the household's own recipes, a URL, a photo).
 */
export interface RecipeImportRow {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  /** Unset when nothing knows; the row builder infers one from the name. */
  category?: string;
  notes?: string;
  /** True when the pantry and the list do not already cover it. */
  missing: boolean;
  /** Kids this ingredient is an allergen for. Non-empty rows start unselected. */
  conflicts: AllergenConflict<Pick<Kid, 'id' | 'name' | 'allergens'>>[];
}

type KidLike = Pick<Kid, 'id' | 'name' | 'allergens'>;

function conflictsFor(food: Food | undefined, kids: readonly KidLike[], foodById: ReadonlyMap<string, Food>) {
  return food ? findAllergenConflicts(kids, [food.id], foodById) : [];
}

/**
 * The rows for one of the household's recipes. Structured ingredients go
 * through computeRecipeShortfall (the same arithmetic as the "needs N" chip),
 * so a row is `missing` exactly when that count includes it, and its quantity
 * is what is still short rather than the whole amount. A legacy recipe with
 * only food_ids counts a food as missing when the pantry holds none of it.
 */
export function rowsFromSavedRecipe(
  recipe: Recipe,
  foods: Food[],
  onList: readonly GroceryItem[],
  kids: readonly KidLike[],
): RecipeImportRow[] {
  const foodById = new Map(foods.map((f) => [f.id, f]));
  const ingredients = [...(recipe.recipe_ingredients ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  if (ingredients.length > 0) {
    const shortfall = new Map(computeRecipeShortfall(recipe, foods, onList).map((s) => [s.ingredient.id, s]));
    return ingredients
      .filter((ing) => (ing.name ?? '').trim())
      .map((ing) => {
        const food = (ing.food_id ? foodById.get(ing.food_id) : undefined) ?? matchPantryFood(ing.name, foods);
        const short = shortfall.get(ing.id);
        const whole = typeof ing.quantity === 'number' && ing.quantity > 0 ? ing.quantity : 1;
        const quantity = short && short.comparable && short.needed > 0 ? short.needed : whole;
        return {
          key: ing.id,
          name: ing.name.trim(),
          quantity,
          unit: ing.unit ?? '',
          category: food?.category,
          notes: ing.optional_notes ?? undefined,
          missing: Boolean(short),
          conflicts: conflictsFor(food, kids, foodById),
        };
      });
  }

  const listed = new Set(onList.filter((g) => !g.checked).map((g) => g.name.trim().toLowerCase()));
  const rows: RecipeImportRow[] = [];
  for (const id of recipe.food_ids ?? []) {
    const food = foodById.get(id);
    // An id with no pantry food has no name to show or add.
    if (!food) continue;
    rows.push({
      key: food.id,
      name: food.name,
      quantity: 1,
      unit: food.unit ?? '',
      category: food.category,
      missing: (food.quantity ?? 0) <= 0 && !listed.has(food.name.trim().toLowerCase()),
      conflicts: conflictsFor(food, kids, foodById),
    });
  }
  return rows;
}

/** Rows from a parsed URL or photo. Everything counts as missing. */
export function rowsFromParsedIngredients(
  ingredients: readonly ParsedIngredientRow[],
  foods: readonly Food[],
  kids: readonly KidLike[],
): RecipeImportRow[] {
  const conflicts = allergenConflictsForNames(
    ingredients.map((i) => i.name),
    foods,
    kids,
  );
  return ingredients.map((ing, index) => ({
    key: `parsed-${index}`,
    name: ing.name,
    quantity: ing.quantity,
    unit: ing.unit,
    category: ing.category,
    notes: ing.notes,
    missing: true,
    conflicts: conflicts.get(index) ?? [],
  }));
}

/** Preselection: what is missing, minus anything a kid is allergic to. */
export function defaultSelection(rows: readonly RecipeImportRow[]): Set<string> {
  return new Set(rows.filter((r) => r.missing && r.conflicts.length === 0).map((r) => r.key));
}

export function rowsToGroceryAdds(
  rows: readonly RecipeImportRow[],
  selected: ReadonlySet<string>,
  sourceRecipeId?: string,
): GroceryAddInput[] {
  return rows
    .filter((r) => selected.has(r.key))
    .map((r) => ({
      name: r.name,
      quantity: r.quantity,
      unit: r.unit,
      ...(r.category ? { category: r.category } : {}),
      ...(r.notes ? { notes: r.notes } : {}),
      added_via: 'recipe_import',
      ...(sourceRecipeId ? { source_recipe_id: sourceRecipeId } : {}),
    }));
}
