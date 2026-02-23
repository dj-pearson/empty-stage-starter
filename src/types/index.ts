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
  profile_last_reviewed?: string;
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
  weight_kg?: number;
  height_cm?: number;
}

export interface PlanEntry {
  id: string;
  kid_id: string;
  date: string;
  meal_slot: MealSlot;
  food_id: string;
  result: MealResult;
  notes?: string;
  food_attempt_id?: string;
  recipe_id?: string;
  is_primary_dish?: boolean;
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
  // Phase 1 additions
  grocery_list_id?: string;
  photo_url?: string;
  notes?: string;
  brand_preference?: string;
  barcode?: string;
  source_recipe_id?: string;
  added_by_user_id?: string;
  added_via?: 'manual' | 'voice' | 'recipe' | 'restock' | 'barcode' | 'plan' | 'import';
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
  assigned_kid_ids?: string[]; // Multi-child assignment
  // Phase 1 additions
  image_url?: string;
  source_url?: string;
  source_type?: 'website' | 'photo' | 'manual' | 'imported';
  tags?: string[];
  rating?: number;
  times_made?: number;
  last_made_date?: string;
  total_time_minutes?: number;
  difficulty_level?: 'easy' | 'medium' | 'hard';
  kid_friendly_score?: number;
  is_favorite?: boolean;
  created_at?: string;
  recipe_ingredients?: RecipeIngredient[];
  nutrition_info?: {
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    fiber_g?: number;
    calcium_mg?: number;
    iron_mg?: number;
  };
}

export interface GroceryList {
  id: string;
  user_id: string;
  household_id?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_default: boolean;
  store_name?: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  food_id?: string;
  ingredient_name: string;
  quantity?: number;
  unit?: string;
  preparation_notes?: string;
  is_optional: boolean;
  section?: string;
  sort_order: number;
  created_at: string;
}

export interface RecipeCollection {
  id: string;
  user_id: string;
  household_id?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ShoppingSession {
  id: string;
  household_id: string;
  user_id: string;
  grocery_list_id?: string;
  store_name?: string;
  store_location?: string;
  started_at: string;
  ended_at?: string;
  is_active: boolean;
  total_items?: number;
  checked_items?: number;
  estimated_total?: number;
  actual_total?: number;
  created_at: string;
}

export interface NutritionData {
  name: string;
  calories: number;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fiber_g?: string;
  calcium_mg?: string;
  iron_mg?: string;
}
