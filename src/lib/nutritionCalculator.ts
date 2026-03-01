import type { Food, Recipe } from "@/types";

export interface CalculatedNutrition {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  /** Number of foods that had nutrition data */
  foodsWithData: number;
  /** Total number of foods in the recipe */
  totalFoods: number;
  /** True if some foods are missing nutrition data */
  isPartial: boolean;
}

/**
 * Calculate aggregate nutrition for a recipe based on its food ingredients.
 * Returns null if no foods have nutrition data.
 */
export function calculateRecipeNutrition(
  recipe: Recipe,
  foods: Food[]
): CalculatedNutrition | null {
  const recipeFoods = recipe.food_ids
    .map((id) => foods.find((f) => f.id === id))
    .filter(Boolean) as Food[];

  if (recipeFoods.length === 0) return null;

  const foodsWithNutrition = recipeFoods.filter(
    (f) => f.nutrition_info && Object.values(f.nutrition_info).some((v) => v != null)
  );

  if (foodsWithNutrition.length === 0) return null;

  const totals: CalculatedNutrition = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    foodsWithData: foodsWithNutrition.length,
    totalFoods: recipeFoods.length,
    isPartial: foodsWithNutrition.length < recipeFoods.length,
  };

  for (const food of foodsWithNutrition) {
    const n = food.nutrition_info!;
    totals.calories += n.calories ?? 0;
    totals.protein_g += n.protein_g ?? 0;
    totals.carbs_g += n.carbs_g ?? 0;
    totals.fat_g += n.fat_g ?? 0;
    totals.fiber_g += n.fiber_g ?? 0;
  }

  return totals;
}

/**
 * Get per-serving nutrition from total nutrition.
 */
export function perServingNutrition(
  total: CalculatedNutrition,
  servings: number
): Omit<CalculatedNutrition, "foodsWithData" | "totalFoods" | "isPartial"> & {
  foodsWithData: number;
  totalFoods: number;
  isPartial: boolean;
} {
  if (servings <= 0) servings = 1;
  return {
    calories: Math.round(total.calories / servings),
    protein_g: Math.round((total.protein_g / servings) * 10) / 10,
    carbs_g: Math.round((total.carbs_g / servings) * 10) / 10,
    fat_g: Math.round((total.fat_g / servings) * 10) / 10,
    fiber_g: Math.round((total.fiber_g / servings) * 10) / 10,
    foodsWithData: total.foodsWithData,
    totalFoods: total.totalFoods,
    isPartial: total.isPartial,
  };
}
