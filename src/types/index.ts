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
}

export interface Kid {
  id: string;
  name: string;
  age?: number;
  notes?: string;
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
}
