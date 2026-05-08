/**
 * Sibling Meal Finder adapter (US-295).
 *
 * Bridges the app's domain types (Food, Kid, Recipe) to the pure
 * `siblingConstraintSolver` module so the solver stays dependency-free
 * and unit-testable on its own.
 */

import type { Food, Kid, Recipe } from '@/types';
import {
  solveSiblingMeals,
  topSiblingSolutions,
  type SolverFood,
  type SolverHistoryEntry,
  type SolverKid,
  type SolverOptions,
  type SolverRecipe,
  type SolverResult,
} from '@/lib/siblingConstraintSolver';

function parsePrepMinutes(recipe: Recipe): number {
  if (typeof recipe.total_time_minutes === 'number' && recipe.total_time_minutes > 0) {
    return recipe.total_time_minutes;
  }
  const text = recipe.prepTime ?? recipe.cookTime ?? '';
  const match = text.match(/(\d+)/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 0;
}

export function foodToSolverFood(f: Food): SolverFood {
  return {
    id: f.id,
    name: f.name,
    category: f.category,
    allergens: f.allergens ?? [],
  };
}

export function kidToSolverKid(k: Kid): SolverKid {
  return {
    id: k.id,
    name: k.name,
    allergens: k.allergens ?? [],
    dietaryRestrictions: k.dietary_restrictions ?? [],
    dislikedFoods: k.disliked_foods ?? [],
    favoriteFoods: k.favorite_foods ?? [],
    alwaysEatsFoods: k.always_eats_foods ?? [],
  };
}

export function recipeToSolverRecipe(r: Recipe, foodById: Map<string, Food>): SolverRecipe {
  const ingredients = r.recipe_ingredients ?? [];
  const idsFromIngredients = ingredients
    .map((i) => i.food_id)
    .filter((x): x is string => typeof x === 'string');
  const foodIds = idsFromIngredients.length > 0 ? idsFromIngredients : (r.food_ids ?? []);
  const foods: SolverFood[] = foodIds.map((id) => {
    const f = foodById.get(id);
    if (!f) {
      return { id, name: 'Unknown ingredient', allergens: [], category: undefined };
    }
    return foodToSolverFood(f);
  });
  return {
    id: r.id,
    name: r.name,
    imageUrl: r.image_url ?? null,
    prepMinutes: parsePrepMinutes(r),
    foodIds,
    foods,
  };
}

export interface FindArgs {
  recipes: Recipe[];
  foods: Food[];
  kids: Kid[];
  selectedKidIds: string[];
  history: SolverHistoryEntry[];
  options?: SolverOptions;
}

/**
 * Run the solver against the user's library. If `selectedKidIds` is empty,
 * the solver runs against ALL kids - a single-kid pick is effectively the
 * scalar constraint case so the solver still works.
 */
export function findSiblingMeals(args: FindArgs): SolverResult[] {
  const foodById = new Map<string, Food>(args.foods.map((f) => [f.id, f]));
  const pantry: SolverFood[] = args.foods.map(foodToSolverFood);
  const selectedKids = args.selectedKidIds.length
    ? args.kids.filter((k) => args.selectedKidIds.includes(k.id))
    : args.kids;
  const kids: SolverKid[] = selectedKids.map(kidToSolverKid);
  const recipes: SolverRecipe[] = args.recipes.map((r) => recipeToSolverRecipe(r, foodById));

  return solveSiblingMeals({ recipes, pantry, kids, history: args.history }, args.options ?? {});
}

export function topSiblingMeals(args: FindArgs, limit = 5): SolverResult[] {
  const foodById = new Map<string, Food>(args.foods.map((f) => [f.id, f]));
  const pantry: SolverFood[] = args.foods.map(foodToSolverFood);
  const selectedKids = args.selectedKidIds.length
    ? args.kids.filter((k) => args.selectedKidIds.includes(k.id))
    : args.kids;
  const kids: SolverKid[] = selectedKids.map(kidToSolverKid);
  const recipes: SolverRecipe[] = args.recipes.map((r) => recipeToSolverRecipe(r, foodById));
  return topSiblingSolutions(
    { recipes, pantry, kids, history: args.history },
    args.options ?? {},
    limit
  );
}

export type { SolverResult, SolverHistoryEntry } from '@/lib/siblingConstraintSolver';
