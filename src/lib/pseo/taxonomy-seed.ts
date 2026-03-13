/**
 * pSEO Taxonomy Seed Data
 *
 * Contains all dimension values from Phase 1 taxonomy.
 * Used to populate the pseo_taxonomy table and drive page generation.
 */

import type { TaxonomySeedItem } from '@/types/pseo';

// ─── DIMENSION 1: SAFE FOODS ───────────────────────────────────────────────────

export const SAFE_FOODS: TaxonomySeedItem[] = [
  // Tier 1 — Highest Search Volume + Conversion Intent (22 foods)
  { dimension: 'safe_food', slug: 'chicken-nuggets', display_name: 'Chicken Nuggets', tier: 1, category: 'Protein', sort_order: 1 },
  { dimension: 'safe_food', slug: 'mac-and-cheese', display_name: 'Mac and Cheese', tier: 1, category: 'Carb/Dairy', sort_order: 2 },
  { dimension: 'safe_food', slug: 'plain-pasta', display_name: 'Plain Pasta (no sauce)', tier: 1, category: 'Carb', sort_order: 3 },
  { dimension: 'safe_food', slug: 'pizza', display_name: 'Plain Cheese Pizza', tier: 1, category: 'Mixed', sort_order: 4 },
  { dimension: 'safe_food', slug: 'grilled-cheese', display_name: 'Grilled Cheese', tier: 1, category: 'Carb/Dairy', sort_order: 5 },
  { dimension: 'safe_food', slug: 'hot-dogs', display_name: 'Hot Dogs', tier: 1, category: 'Protein', sort_order: 6 },
  { dimension: 'safe_food', slug: 'french-fries', display_name: 'French Fries', tier: 1, category: 'Carb/Veg', sort_order: 7 },
  { dimension: 'safe_food', slug: 'white-bread', display_name: 'White Bread / Toast', tier: 1, category: 'Carb', sort_order: 8 },
  { dimension: 'safe_food', slug: 'peanut-butter', display_name: 'Peanut Butter (on crackers/bread)', tier: 1, category: 'Protein', sort_order: 9 },
  { dimension: 'safe_food', slug: 'applesauce', display_name: 'Applesauce', tier: 1, category: 'Fruit', sort_order: 10 },
  { dimension: 'safe_food', slug: 'bananas', display_name: 'Bananas', tier: 1, category: 'Fruit', sort_order: 11 },
  { dimension: 'safe_food', slug: 'cheese', display_name: 'Cheese (sliced/cubed)', tier: 1, category: 'Dairy', sort_order: 12 },
  { dimension: 'safe_food', slug: 'crackers', display_name: 'Crackers (Goldfish, Ritz, etc.)', tier: 1, category: 'Carb', sort_order: 13 },
  { dimension: 'safe_food', slug: 'yogurt', display_name: 'Yogurt (plain or vanilla)', tier: 1, category: 'Dairy', sort_order: 14 },
  { dimension: 'safe_food', slug: 'scrambled-eggs', display_name: 'Scrambled Eggs', tier: 1, category: 'Protein', sort_order: 15 },
  { dimension: 'safe_food', slug: 'pancakes', display_name: 'Pancakes / Waffles', tier: 1, category: 'Carb', sort_order: 16 },
  { dimension: 'safe_food', slug: 'quesadilla', display_name: 'Cheese Quesadilla', tier: 1, category: 'Carb/Dairy', sort_order: 17 },
  { dimension: 'safe_food', slug: 'cereal', display_name: 'Dry Cereal', tier: 1, category: 'Carb', sort_order: 18 },
  { dimension: 'safe_food', slug: 'apple-slices', display_name: 'Apple Slices', tier: 1, category: 'Fruit', sort_order: 19 },
  { dimension: 'safe_food', slug: 'rice', display_name: 'Plain White Rice', tier: 1, category: 'Carb', sort_order: 20 },
  { dimension: 'safe_food', slug: 'butter-noodles', display_name: 'Butter Noodles', tier: 1, category: 'Carb', sort_order: 21 },
  { dimension: 'safe_food', slug: 'pb-and-j', display_name: 'PB&J Sandwich', tier: 1, category: 'Mixed', sort_order: 22 },

  // Tier 2 — Moderate Volume, Strong Intent (18 foods)
  { dimension: 'safe_food', slug: 'chicken-tenders', display_name: 'Chicken Tenders', tier: 2, category: 'Protein', sort_order: 23 },
  { dimension: 'safe_food', slug: 'meatballs', display_name: 'Meatballs (plain)', tier: 2, category: 'Protein', sort_order: 24 },
  { dimension: 'safe_food', slug: 'corn', display_name: 'Corn (plain / off the cob)', tier: 2, category: 'Veg', sort_order: 25 },
  { dimension: 'safe_food', slug: 'carrots-raw', display_name: 'Raw Carrots', tier: 2, category: 'Veg', sort_order: 26 },
  { dimension: 'safe_food', slug: 'cucumber', display_name: 'Cucumber Slices', tier: 2, category: 'Veg', sort_order: 27 },
  { dimension: 'safe_food', slug: 'string-cheese', display_name: 'String Cheese', tier: 2, category: 'Dairy', sort_order: 28 },
  { dimension: 'safe_food', slug: 'milk', display_name: 'Milk', tier: 2, category: 'Dairy', sort_order: 29 },
  { dimension: 'safe_food', slug: 'goldfish-crackers', display_name: 'Goldfish Crackers', tier: 2, category: 'Carb', sort_order: 30 },
  { dimension: 'safe_food', slug: 'saltine-crackers', display_name: 'Saltine Crackers', tier: 2, category: 'Carb', sort_order: 31 },
  { dimension: 'safe_food', slug: 'plain-hamburger', display_name: 'Plain Hamburger (no toppings)', tier: 2, category: 'Protein', sort_order: 32 },
  { dimension: 'safe_food', slug: 'fish-sticks', display_name: 'Fish Sticks', tier: 2, category: 'Protein', sort_order: 33 },
  { dimension: 'safe_food', slug: 'frozen-waffles', display_name: 'Frozen Waffles', tier: 2, category: 'Carb', sort_order: 34 },
  { dimension: 'safe_food', slug: 'oatmeal-plain', display_name: 'Plain Oatmeal', tier: 2, category: 'Carb', sort_order: 35 },
  { dimension: 'safe_food', slug: 'plain-chicken-breast', display_name: 'Plain Baked Chicken Breast', tier: 2, category: 'Protein', sort_order: 36 },
  { dimension: 'safe_food', slug: 'mashed-potatoes', display_name: 'Mashed Potatoes (plain)', tier: 2, category: 'Veg/Carb', sort_order: 37 },
  { dimension: 'safe_food', slug: 'grapes', display_name: 'Grapes', tier: 2, category: 'Fruit', sort_order: 38 },
  { dimension: 'safe_food', slug: 'strawberries', display_name: 'Strawberries', tier: 2, category: 'Fruit', sort_order: 39 },
  { dimension: 'safe_food', slug: 'watermelon', display_name: 'Watermelon', tier: 2, category: 'Fruit', sort_order: 40 },

  // Tier 3 — Lower Volume, High Specificity (12 foods)
  { dimension: 'safe_food', slug: 'plain-toast', display_name: 'Plain Toast (dry)', tier: 3, category: 'Carb', sort_order: 41 },
  { dimension: 'safe_food', slug: 'raisins', display_name: 'Raisins', tier: 3, category: 'Fruit', sort_order: 42 },
  { dimension: 'safe_food', slug: 'pear', display_name: 'Pear (peeled)', tier: 3, category: 'Fruit', sort_order: 43 },
  { dimension: 'safe_food', slug: 'mandarin-oranges', display_name: 'Mandarin Orange Slices', tier: 3, category: 'Fruit', sort_order: 44 },
  { dimension: 'safe_food', slug: 'plain-bagel', display_name: 'Plain Bagel', tier: 3, category: 'Carb', sort_order: 45 },
  { dimension: 'safe_food', slug: 'cream-cheese', display_name: 'Cream Cheese', tier: 3, category: 'Dairy', sort_order: 46 },
  { dimension: 'safe_food', slug: 'hummus', display_name: 'Hummus', tier: 3, category: 'Protein', sort_order: 47 },
  { dimension: 'safe_food', slug: 'edamame', display_name: 'Edamame', tier: 3, category: 'Protein/Veg', sort_order: 48 },
  { dimension: 'safe_food', slug: 'plain-rice-cakes', display_name: 'Plain Rice Cakes', tier: 3, category: 'Carb', sort_order: 49 },
  { dimension: 'safe_food', slug: 'vanilla-ice-cream', display_name: 'Vanilla Ice Cream', tier: 3, category: 'Dairy', sort_order: 50 },
  { dimension: 'safe_food', slug: 'vanilla-pudding', display_name: 'Vanilla Pudding', tier: 3, category: 'Dairy', sort_order: 51 },
  { dimension: 'safe_food', slug: 'bread-rolls', display_name: 'Plain Dinner Rolls', tier: 3, category: 'Carb', sort_order: 52 },
];

// ─── DIMENSION 2: AGE GROUPS ────────────────────────────────────────────────────

export const AGE_GROUPS: TaxonomySeedItem[] = [
  { dimension: 'age_group', slug: 'toddler', display_name: 'Toddler', tier: 1, category: '18 months - 3 years', sort_order: 1 },
  { dimension: 'age_group', slug: 'preschooler', display_name: 'Preschooler', tier: 1, category: '3 - 5 years', sort_order: 2 },
  { dimension: 'age_group', slug: 'early-elementary', display_name: 'Early Elementary', tier: 1, category: '6 - 8 years', sort_order: 3 },
  { dimension: 'age_group', slug: 'tween', display_name: 'Tween', tier: 1, category: '9 - 12 years', sort_order: 4 },
];

// ─── DIMENSION 3: FEEDING CHALLENGES ────────────────────────────────────────────

export const FEEDING_CHALLENGES: TaxonomySeedItem[] = [
  // Tier 1
  { dimension: 'feeding_challenge', slug: 'texture-sensitivity', display_name: 'Texture Sensitivity', tier: 1, category: 'Sensory', sort_order: 1 },
  { dimension: 'feeding_challenge', slug: 'limited-repertoire', display_name: 'Limited Food Repertoire', tier: 1, category: 'Volume', sort_order: 2 },
  { dimension: 'feeding_challenge', slug: 'food-neophobia', display_name: 'Food Neophobia', tier: 1, category: 'Fear', sort_order: 3 },
  { dimension: 'feeding_challenge', slug: 'mealtime-battles', display_name: 'Mealtime Battles & Anxiety', tier: 1, category: 'Behavioral', sort_order: 4 },
  { dimension: 'feeding_challenge', slug: 'arfid', display_name: 'ARFID', tier: 1, category: 'Clinical', sort_order: 5 },
  { dimension: 'feeding_challenge', slug: 'sensory-processing', display_name: 'Sensory Processing Differences', tier: 1, category: 'Sensory', sort_order: 6 },
  // Tier 2
  { dimension: 'feeding_challenge', slug: 'color-refusal', display_name: 'Color-Based Refusal', tier: 2, category: 'Visual', sort_order: 7 },
  { dimension: 'feeding_challenge', slug: 'brand-dependency', display_name: 'Brand Dependency', tier: 2, category: 'Behavioral', sort_order: 8 },
  { dimension: 'feeding_challenge', slug: 'food-jag', display_name: 'Food Jag / Neophobia Regression', tier: 2, category: 'Regression', sort_order: 9 },
  { dimension: 'feeding_challenge', slug: 'mixed-foods-refusal', display_name: 'Mixed / Touching Foods Refusal', tier: 2, category: 'Sensory', sort_order: 10 },
];

// ─── DIMENSION 4: MEAL OCCASIONS ────────────────────────────────────────────────

export const MEAL_OCCASIONS: TaxonomySeedItem[] = [
  // Tier 1
  { dimension: 'meal_occasion', slug: 'weeknight-dinner', display_name: 'Weeknight Dinner', tier: 1, category: 'Daily', sort_order: 1 },
  { dimension: 'meal_occasion', slug: 'school-lunch', display_name: 'School / Daycare Lunch', tier: 1, category: 'Daily', sort_order: 2 },
  { dimension: 'meal_occasion', slug: 'breakfast', display_name: 'Breakfast', tier: 1, category: 'Daily', sort_order: 3 },
  { dimension: 'meal_occasion', slug: 'snack', display_name: 'Snacks & Between-Meals', tier: 1, category: 'Daily', sort_order: 4 },
  // Tier 2
  { dimension: 'meal_occasion', slug: 'holiday-meals', display_name: 'Holiday & Special Occasion', tier: 2, category: 'Event', sort_order: 5 },
  { dimension: 'meal_occasion', slug: 'restaurant', display_name: 'Restaurant Dining', tier: 2, category: 'Event', sort_order: 6 },
  { dimension: 'meal_occasion', slug: 'birthday-party', display_name: 'Birthday Parties', tier: 2, category: 'Event', sort_order: 7 },
];

// ─── DIMENSION 5: DIETARY RESTRICTIONS ──────────────────────────────────────────

export const DIETARY_RESTRICTIONS: TaxonomySeedItem[] = [
  { dimension: 'dietary_restriction', slug: 'no-restrictions', display_name: 'No Dietary Restrictions', tier: 1, category: 'Default', sort_order: 1 },
  { dimension: 'dietary_restriction', slug: 'gluten-free', display_name: 'Gluten-Free', tier: 1, category: 'Allergy', sort_order: 2 },
  { dimension: 'dietary_restriction', slug: 'dairy-free', display_name: 'Dairy-Free', tier: 1, category: 'Allergy', sort_order: 3 },
  { dimension: 'dietary_restriction', slug: 'nut-free', display_name: 'Nut-Free', tier: 1, category: 'Allergy', sort_order: 4 },
  { dimension: 'dietary_restriction', slug: 'egg-free', display_name: 'Egg-Free', tier: 2, category: 'Allergy', sort_order: 5 },
  { dimension: 'dietary_restriction', slug: 'top8-free', display_name: 'Top 8 Allergen-Free', tier: 2, category: 'Allergy', sort_order: 6 },
];

// ─── ALL TAXONOMY DATA ──────────────────────────────────────────────────────────

export const ALL_TAXONOMY_ITEMS: TaxonomySeedItem[] = [
  ...SAFE_FOODS,
  ...AGE_GROUPS,
  ...FEEDING_CHALLENGES,
  ...MEAL_OCCASIONS,
  ...DIETARY_RESTRICTIONS,
];

// ─── COMBINATION MATRIX ─────────────────────────────────────────────────────────

export interface CombinationConfig {
  pageType: string;
  dimensions: string[];
  tierFilter?: Record<string, number[]>;
  estimatedPages: number;
  priority: number;
}

export const COMBINATION_MATRIX: CombinationConfig[] = [
  {
    pageType: 'FOOD_CHAINING_GUIDE',
    dimensions: ['safe_food'],
    estimatedPages: 52,
    priority: 1,
  },
  {
    pageType: 'CHALLENGE_MEAL_OCCASION',
    dimensions: ['feeding_challenge', 'meal_occasion'],
    estimatedPages: 70,
    priority: 2,
  },
  {
    pageType: 'FOOD_CHAINING_AGE_COMBO',
    dimensions: ['safe_food', 'age_group'],
    tierFilter: { safe_food: [1] },
    estimatedPages: 88,
    priority: 3,
  },
  {
    pageType: 'AGE_MEAL_OCCASION',
    dimensions: ['age_group', 'meal_occasion'],
    estimatedPages: 28,
    priority: 4,
  },
  {
    pageType: 'FOOD_CHALLENGE_COMBO',
    dimensions: ['safe_food', 'feeding_challenge'],
    estimatedPages: 520,
    priority: 5,
  },
  {
    pageType: 'FOOD_DIETARY_RESTRICTION',
    dimensions: ['safe_food', 'dietary_restriction'],
    tierFilter: { safe_food: [1], dietary_restriction: [1, 2] },
    estimatedPages: 110,
    priority: 6,
  },
  {
    pageType: 'CHALLENGE_LANDING',
    dimensions: ['feeding_challenge'],
    estimatedPages: 10,
    priority: 7,
  },
  {
    pageType: 'AGE_GROUP_LANDING',
    dimensions: ['age_group'],
    estimatedPages: 4,
    priority: 8,
  },
  {
    pageType: 'MEAL_OCCASION_LANDING',
    dimensions: ['meal_occasion'],
    estimatedPages: 7,
    priority: 9,
  },
];

/**
 * Calculate total estimated pages across all combinations
 */
export function getTotalEstimatedPages(): number {
  return COMBINATION_MATRIX.reduce((sum, c) => sum + c.estimatedPages, 0);
}

/**
 * Generate all combinations for a given page type config.
 * Returns an array of dimension value combinations to generate.
 */
export function generateCombinations(
  config: CombinationConfig,
  taxonomyItems: TaxonomySeedItem[]
): Record<string, string>[] {
  const dimensionValues: Record<string, TaxonomySeedItem[]> = {};

  for (const dim of config.dimensions) {
    let items = taxonomyItems.filter(item => item.dimension === dim);
    if (config.tierFilter && config.tierFilter[dim]) {
      items = items.filter(item => config.tierFilter![dim].includes(item.tier));
    }
    // Exclude 'no-restrictions' from dietary restriction combinations
    if (dim === 'dietary_restriction') {
      items = items.filter(item => item.slug !== 'no-restrictions');
    }
    dimensionValues[dim] = items;
  }

  const dimensions = config.dimensions;
  if (dimensions.length === 1) {
    return dimensionValues[dimensions[0]].map(item => ({
      [dimensions[0]]: item.slug,
    }));
  }

  if (dimensions.length === 2) {
    const combos: Record<string, string>[] = [];
    for (const a of dimensionValues[dimensions[0]]) {
      for (const b of dimensionValues[dimensions[1]]) {
        combos.push({
          [dimensions[0]]: a.slug,
          [dimensions[1]]: b.slug,
        });
      }
    }
    return combos;
  }

  if (dimensions.length === 3) {
    const combos: Record<string, string>[] = [];
    for (const a of dimensionValues[dimensions[0]]) {
      for (const b of dimensionValues[dimensions[1]]) {
        for (const c of dimensionValues[dimensions[2]]) {
          combos.push({
            [dimensions[0]]: a.slug,
            [dimensions[1]]: b.slug,
            [dimensions[2]]: c.slug,
          });
        }
      }
    }
    return combos;
  }

  return [];
}
