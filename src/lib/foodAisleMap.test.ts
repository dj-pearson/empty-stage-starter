import { describe, it, expect } from 'vitest';
import { CATEGORY_AISLE, EXCLUDED_CATEGORIES } from '../../scripts/seed/food-aisle-map.mjs';

/** The 28 USDA SR Legacy category ids. Every one is either mapped or excluded. */
const USDA_CATEGORY_IDS = Array.from({ length: 28 }, (_, i) => String(i + 1));

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

  it('gives every mapped category a non-empty category and aisle', () => {
    for (const [id, v] of Object.entries(CATEGORY_AISLE)) {
      expect(v.category, `category ${id} has no category`).toBeTruthy();
      expect(v.aisle, `category ${id} has no aisle`).toBeTruthy();
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
