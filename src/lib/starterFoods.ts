import type { Food } from "@/types";
import { ACQUIRED_FOOD_IS_SAFE } from "@/lib/foodSafetyDefault";

/**
 * The foods a signed-out (local) app starts with, and what resetAllData puts
 * back. AppContext seeds from this list; there is no second copy.
 *
 * Nothing here is marked safe (US-803). Whether a child eats a food is the
 * parent's answer, and a starter list that answered it for them told every new
 * family that nuggets and goldfish were safe before anyone had said so. The
 * parent marks what their child eats with the same safe/try/none choice as any
 * other food. The five try bites stay: "we are working on it" is not a claim
 * that the food is safe.
 *
 * Allergens are the canonical words from supabase/functions/_shared/allergens.ts
 * ("milk", "wheat", "egg", "peanut", "soy", "sesame", "fish"), so a starter
 * food is caught by the same allergen check as anything else in the pantry. A
 * starter food with no allergens is one that does not typically carry any.
 */
export const STARTER_FOODS: readonly Omit<Food, "id">[] = [
  { name: "Chicken Nuggets", category: "protein", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: false, allergens: ["wheat", "soy"] },
  { name: "Mac & Cheese", category: "carb", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: false, allergens: ["wheat", "milk"] },
  { name: "Pizza", category: "carb", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: false, allergens: ["wheat", "milk"] },
  { name: "Yogurt", category: "dairy", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: false, allergens: ["milk"] },
  { name: "Apple Slices", category: "fruit", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: false, allergens: [] },
  { name: "Banana", category: "fruit", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: false, allergens: [] },
  { name: "Goldfish Crackers", category: "snack", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: false, allergens: ["wheat", "milk"] },
  { name: "String Cheese", category: "dairy", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: false, allergens: ["milk"] },
  { name: "Grapes", category: "fruit", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: false, allergens: [] },
  { name: "Carrots", category: "vegetable", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: false, allergens: [] },
  { name: "Broccoli", category: "vegetable", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: true, allergens: [] },
  { name: "Strawberries", category: "fruit", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: true, allergens: [] },
  { name: "Hummus", category: "protein", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: true, allergens: ["sesame"] },
  { name: "Avocado", category: "vegetable", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: true, allergens: [] },
  { name: "Turkey Slices", category: "protein", is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: true, allergens: [] },
];

/** A fresh copy of the starter list with new ids, allergen arrays included, so
 *  an edit to one seeded food can never reach the shared constant. */
export function seedStarterFoods(makeId: () => string): Food[] {
  return STARTER_FOODS.map((f) => ({ ...f, allergens: [...(f.allergens ?? [])], id: makeId() }));
}
