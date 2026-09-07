/**
 * Types for build-food-seed.mjs (US-794). See food-aisle-map.d.mts for why
 * these declarations exist rather than the script being TypeScript.
 */

import type { AisleMapping, AisleOverride, FoodCategory, GroceryAisleRawValue } from './food-aisle-map.d.mts';

/** A row of USDA `food.csv`, as parsed. */
export interface UsdaFood {
  fdc_id: string;
  data_type: string;
  description: string;
  food_category_id: string;
}

/** A row of USDA `food_nutrient.csv`, narrowed to the columns the seed reads. */
export interface UsdaNutrient {
  fdc_id: string;
  nutrient_id: string;
  amount: string;
}

/** A catalog insert, shaped for `grocery_product_catalog`. */
export interface SeedRow {
  name: string;
  name_normalized: string;
  default_category: FoodCategory;
  default_aisle_section: GroceryAisleRawValue;
  kind: 'generic';
  source: 'usda';
  source_ref: string;
  verification: 'verified';
  calories_kcal_100: number;
  protein_g_100: number | null;
  carbs_g_100: number | null;
  fat_g_100: number | null;
  fiber_g_100: number | null;
  sugar_g_100: number | null;
  sodium_mg_100: number | null;
  times_added: number;
  [column: string]: unknown;
}

/** Why a USDA row did not make it into the seed. Auditable on purpose. */
export interface DroppedRow {
  fdc_id: string;
  description: string;
  reason: string;
}

export interface BuildSeedInput {
  foods: UsdaFood[];
  nutrients: UsdaNutrient[];
  categoryAisle: Record<string, AisleMapping>;
  excluded: Set<string>;
  aisleOverrides?: AisleOverride[];
}

export interface BuildSeedResult {
  rows: SeedRow[];
  dropped: DroppedRow[];
}

export declare function buildSeed(input: BuildSeedInput): BuildSeedResult;

/** The stable key a food is deduped and later matched on. */
export declare function normalizeName(description: string): string;

/** What a parent sees. Strips preparation state, keeps anything that changes the food. */
export declare function displayName(description: string): string;

/** Descriptions that are laboratory cuts rather than groceries. */
export declare const LAB_SPEAK_PATTERNS: readonly { test: (description: string) => boolean }[] | readonly RegExp[];

/** Manufacturer names USDA inlines into otherwise generic descriptions. */
export declare const BRAND_NAMES: readonly string[];

/** Foods that bypass the qualifier-clause cap because families actually buy them. */
export declare const STAPLE_PATTERNS: readonly {
  test: (description: string) => boolean;
  categoryOverride?: string;
}[];
