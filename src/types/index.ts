export type FoodCategory = "protein" | "carb" | "dairy" | "fruit" | "vegetable" | "snack";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack1" | "snack2" | "try_bite";

export type MealResult = "ate" | "tasted" | "refused" | null;

export interface Food {
  id: string;
  name: string;
  category: FoodCategory;
  is_safe: boolean;
  is_try_bite: boolean;
  allergens?: string[];
  aisle?: string;
  quantity?: number;
  unit?: string;
  servings_per_container?: number;
  package_quantity?: string;
}

export interface Kid {
  id: string;
  name: string;
  age?: number;
  date_of_birth?: string;
  notes?: string;
  allergens?: string[];
  profile_picture_url?: string;
  favorite_foods?: string[];
  pickiness_level?: string;
  profile_completed?: boolean;
  texture_preferences?: string[];
  texture_dislikes?: string[];
  flavor_preferences?: string[];
  dietary_restrictions?: string[];
  health_goals?: string[];
  new_food_willingness?: string;
  eating_behavior?: string;
  helpful_strategies?: string[];
  disliked_foods?: string[];
  always_eats_foods?: string[];
}

export interface PlanEntry {
  id: string;
  kid_id: string;
  date: string;
  meal_slot: MealSlot;
  food_id: string;
  result: MealResult;
  notes?: string;
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  checked: boolean;
  source_plan_entry_id?: string;
  category: FoodCategory;
  aisle?: string;
}

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  food_ids: string[];
  category?: FoodCategory;
  instructions?: string;
  prepTime?: string;
  cookTime?: string;
  servings?: string;
  additionalIngredients?: string;
  tips?: string;
}
