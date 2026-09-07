import { describe, it, expect } from 'vitest';
import { CATEGORY_AISLE, EXCLUDED_CATEGORIES, AISLE_OVERRIDES } from '../../scripts/seed/food-aisle-map.mjs';

/** The 28 USDA SR Legacy category ids. Every one is either mapped or excluded. */
const USDA_CATEGORY_IDS = Array.from({ length: 28 }, (_, i) => String(i + 1));

/** The app's six-value FoodCategory union (src/types/index.ts). Unchanged by fix round 3. */
const FOOD_CATEGORIES = new Set(['protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack']);

/**
 * The 33 rawValues of ios/EatPal/EatPal/Models/GroceryAisle.swift, copied
 * here (not imported -- there is no cross-language import) so a typo in
 * food-aisle-map.mjs fails this test instead of silently returning nil
 * from `GroceryAisle(rawValue:)` on the shipped iOS app, which is exactly
 * the bug fix round 3 exists to catch.
 */
const IOS_GROCERY_AISLE_RAW_VALUES = new Set([
  'produce', 'bakery', 'bread', 'meat_deli', 'seafood', 'dairy', 'eggs',
  'refrigerated', 'frozen_meals', 'frozen_veg', 'frozen_treats', 'canned',
  'dry_soups', 'pasta', 'rice_grains', 'condiments', 'baking', 'breakfast',
  'snacks', 'crackers', 'candy', 'beverages', 'alcohol', 'ethnic_mexican',
  'ethnic_asian', 'ethnic_european', 'household', 'paper_goods', 'cleaning',
  'personal_care', 'baby', 'pet', 'other',
]);

describe('USDA category to aisle map', () => {
  it('accounts for every USDA category, either mapped or excluded', () => {
    for (const id of USDA_CATEGORY_IDS) {
      const decided = Object.hasOwn(CATEGORY_AISLE, id) || EXCLUDED_CATEGORIES.has(id);
      expect(decided, `category ${id} is neither mapped nor excluded`).toBe(true);
    }
  });

  it('never both maps and excludes the same category', () => {
    for (const id of Object.keys(CATEGORY_AISLE)) {
      expect(EXCLUDED_CATEGORIES.has(id), `category ${id} is both mapped and excluded`).toBe(false);
    }
  });

  it('gives every mapped category a category in the app union and an aisle that is a real iOS GroceryAisle rawValue', () => {
    // toBeTruthy() alone would pass for 'Protein' or 'Aisle 5' -- this
    // asserts membership in the exact sets those columns are allowed to
    // hold, so a typo or a stale web-string aisle fails loudly here
    // instead of returning nil from GroceryAisle(rawValue:) on iOS.
    for (const [id, v] of Object.entries(CATEGORY_AISLE)) {
      expect(FOOD_CATEGORIES.has(v.category), `category ${id} has category "${v.category}", not in the FoodCategory union`).toBe(true);
      expect(IOS_GROCERY_AISLE_RAW_VALUES.has(v.aisle), `category ${id} has aisle "${v.aisle}", not a valid iOS GroceryAisle rawValue`).toBe(true);
    }
  });

  it('gives every AISLE_OVERRIDES entry a valid iOS rawValue and a category id that is actually mapped', () => {
    for (const o of AISLE_OVERRIDES) {
      expect(Object.hasOwn(CATEGORY_AISLE, o.categoryId), `override targets category ${o.categoryId}, which is not in CATEGORY_AISLE`).toBe(true);
      expect(IOS_GROCERY_AISLE_RAW_VALUES.has(o.aisle), `override for category ${o.categoryId} has aisle "${o.aisle}", not a valid iOS GroceryAisle rawValue`).toBe(true);
    }
  });

  it('excludes the categories that are not family groceries', () => {
    // Restaurant Foods, Branded (a separate database), Quality Control
    // Materials (lab reference standards) and Alcoholic Beverages have no
    // place in a shared catalog a parent shops from.
    for (const id of ['25', '26', '27', '28']) {
      expect(EXCLUDED_CATEGORIES.has(id), `category ${id} should be excluded`).toBe(true);
    }
  });
});
