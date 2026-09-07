/**
 * Types for food-aisle-map.mjs (US-794).
 *
 * The script is plain ESM so it runs under bare `node` with no build step, but
 * `src/lib/foodAisleMap.test.ts` imports it and the tests ARE typechecked. With
 * no declarations TypeScript resolves the module and types every export as
 * `unknown`, so `Object.entries(CATEGORY_AISLE)` yields `unknown` values and
 * every `v.category` is a TS2339 — which is how this branch first put the
 * typecheck ratchet 31 errors over its baseline.
 *
 * Keep these signatures in step with the .mjs by hand. They are small and they
 * are checked by the tests that import them.
 */

/** The app's food category union, from src/types/index.ts. */
export type FoodCategory = 'protein' | 'carb' | 'dairy' | 'fruit' | 'vegetable' | 'snack';

/**
 * A `GroceryAisle` rawValue from ios/EatPal/EatPal/Models/GroceryAisle.swift.
 * The live iOS build parses `default_aisle_section` with `GroceryAisle(rawValue:)`,
 * so anything not in this union is silently ignored on the App Store build.
 */
export type GroceryAisleRawValue =
  | 'produce' | 'bakery' | 'bread' | 'meat_deli' | 'seafood' | 'dairy' | 'eggs'
  | 'refrigerated' | 'frozen_meals' | 'frozen_veg' | 'frozen_treats' | 'canned'
  | 'dry_soups' | 'pasta' | 'rice_grains' | 'condiments' | 'baking' | 'breakfast'
  | 'snacks' | 'crackers' | 'candy' | 'beverages' | 'alcohol'
  | 'ethnic_mexican' | 'ethnic_asian' | 'ethnic_european'
  | 'household' | 'paper_goods' | 'cleaning' | 'personal_care'
  | 'baby' | 'pet' | 'other';

export interface AisleMapping {
  category: FoodCategory;
  aisle: GroceryAisleRawValue;
}

/** Keyed by USDA `food_category_id` as a string. */
export declare const CATEGORY_AISLE: Record<string, AisleMapping>;

/** USDA category ids the seed drops entirely. */
export declare const EXCLUDED_CATEGORIES: Set<string>;

/**
 * Per-description escapes from a category's default aisle, checked in order.
 * `categoryId` narrows which rows the `test` is even offered.
 */
export interface AisleOverride {
  categoryId: string;
  test: (description: string) => boolean;
  aisle: GroceryAisleRawValue;
}

export declare const AISLE_OVERRIDES: AisleOverride[];
