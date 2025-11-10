/**
 * USDA Food Plan Cost Data (2024)
 * Based on official USDA food plans - updated monthly
 * Source: https://www.fns.usda.gov/cnpp/usda-food-plans-cost-food-reports-monthly-reports
 */

import { USDAFoodPlanLevel } from '@/types/budgetCalculator';

// Monthly costs by age group and plan level (in dollars)
export const USDA_MONTHLY_COSTS = {
  // Children
  child_1_year: {
    thrifty: 111.20,
    low_cost: 145.50,
    moderate: 171.10,
    liberal: 208.20,
  },
  child_2_3_years: {
    thrifty: 125.70,
    low_cost: 161.20,
    moderate: 196.00,
    liberal: 238.40,
  },
  child_4_5_years: {
    thrifty: 134.80,
    low_cost: 169.00,
    moderate: 209.90,
    liberal: 254.90,
  },
  child_6_8_years: {
    thrifty: 169.10,
    low_cost: 230.90,
    moderate: 279.60,
    liberal: 330.20,
  },
  child_9_11_years: {
    thrifty: 194.10,
    low_cost: 259.50,
    moderate: 328.80,
    liberal: 382.00,
  },

  // Teenagers
  teen_12_13_years: {
    thrifty: 207.60,
    low_cost: 288.80,
    moderate: 357.60,
    liberal: 425.00,
  },
  teen_14_18_years_male: {
    thrifty: 216.30,
    low_cost: 304.30,
    moderate: 380.10,
    liberal: 450.90,
  },
  teen_14_18_years_female: {
    thrifty: 206.70,
    low_cost: 262.60,
    moderate: 320.20,
    liberal: 395.40,
  },

  // Adults
  adult_19_50_years_male: {
    thrifty: 240.60,
    low_cost: 311.10,
    moderate: 389.20,
    liberal: 478.40,
  },
  adult_19_50_years_female: {
    thrifty: 214.70,
    low_cost: 271.40,
    moderate: 332.70,
    liberal: 428.40,
  },
  adult_51_70_years_male: {
    thrifty: 229.80,
    low_cost: 297.00,
    moderate: 371.70,
    liberal: 450.30,
  },
  adult_51_70_years_female: {
    thrifty: 212.10,
    low_cost: 267.80,
    moderate: 327.50,
    liberal: 398.80,
  },
  adult_71_plus_years_male: {
    thrifty: 221.20,
    low_cost: 287.80,
    moderate: 355.50,
    liberal: 426.90,
  },
  adult_71_plus_years_female: {
    thrifty: 200.30,
    low_cost: 254.70,
    moderate: 315.70,
    liberal: 381.50,
  },
};

// Average costs for simplified calculations
export const SIMPLIFIED_MONTHLY_COSTS = {
  adult: {
    thrifty: 227.00,
    low_cost: 291.00,
    moderate: 363.00,
    liberal: 446.00,
  },
  child_0_5: {
    thrifty: 125.00,
    low_cost: 159.00,
    moderate: 192.00,
    liberal: 234.00,
  },
  child_6_11: {
    thrifty: 182.00,
    low_cost: 245.00,
    moderate: 304.00,
    liberal: 356.00,
  },
  teen_12_18: {
    thrifty: 210.00,
    low_cost: 285.00,
    moderate: 353.00,
    liberal: 418.00,
  },
};

// Multipliers for dietary restrictions (increase cost)
export const DIETARY_RESTRICTION_MULTIPLIERS = {
  vegetarian: 0.95, // Slightly cheaper
  vegan: 1.05, // Slightly more expensive
  gluten_free: 1.25, // Significantly more expensive
  dairy_free: 1.10,
  nut_free: 1.00, // No change
  halal: 1.05,
  kosher: 1.15,
};

// Regional cost adjustments by state
export const STATE_COST_ADJUSTMENTS: Record<string, number> = {
  // High cost states
  HI: 1.50,
  AK: 1.45,
  CA: 1.20,
  NY: 1.18,
  MA: 1.15,
  CT: 1.12,
  NJ: 1.12,
  MD: 1.10,
  WA: 1.10,
  NH: 1.08,

  // Medium cost states (default ~1.0)
  IL: 1.02,
  CO: 1.05,
  OR: 1.08,
  FL: 0.98,
  VA: 1.03,
  TX: 0.95,

  // Low cost states
  MS: 0.85,
  AR: 0.87,
  OK: 0.88,
  AL: 0.89,
  TN: 0.90,
  KS: 0.91,
  MO: 0.92,
  IN: 0.93,
  IA: 0.93,
  OH: 0.94,

  // Default for unlisted states
  DEFAULT: 1.00,
};

/**
 * Get monthly cost for a person based on age
 */
export function getPersonMonthlyCost(
  age: number,
  planLevel: USDAFoodPlanLevel
): number {
  if (age < 2) {
    return SIMPLIFIED_MONTHLY_COSTS.child_0_5[planLevel];
  } else if (age <= 5) {
    return SIMPLIFIED_MONTHLY_COSTS.child_0_5[planLevel];
  } else if (age <= 11) {
    return SIMPLIFIED_MONTHLY_COSTS.child_6_11[planLevel];
  } else if (age <= 18) {
    return SIMPLIFIED_MONTHLY_COSTS.teen_12_18[planLevel];
  } else {
    return SIMPLIFIED_MONTHLY_COSTS.adult[planLevel];
  }
}

/**
 * Get cost adjustment for state
 */
export function getStateCostAdjustment(state?: string): number {
  if (!state) return STATE_COST_ADJUSTMENTS.DEFAULT;
  return STATE_COST_ADJUSTMENTS[state.toUpperCase()] || STATE_COST_ADJUSTMENTS.DEFAULT;
}

/**
 * Get cost multiplier for dietary restrictions
 */
export function getDietaryRestrictionMultiplier(restrictions: string[]): number {
  if (restrictions.length === 0) return 1.0;

  // Take the maximum multiplier if multiple restrictions
  const multipliers = restrictions.map(
    restriction => DIETARY_RESTRICTION_MULTIPLIERS[restriction as keyof typeof DIETARY_RESTRICTION_MULTIPLIERS] || 1.0
  );

  return Math.max(...multipliers);
}

/**
 * Comparison costs (averages for reference)
 */
export const COMPARISON_COSTS = {
  // Meal kit services (per person, per meal)
  mealKitPerPersonPerMeal: 12.50,

  // Dining out (per person, per meal)
  fastFoodPerPersonPerMeal: 9.00,
  casualDiningPerPersonPerMeal: 15.00,
  fineDiningPerPersonPerMeal: 35.00,

  // Average dining out (mix of fast food and casual)
  averageDiningOutPerPersonPerMeal: 12.00,

  // Food waste average
  averageFoodWastePercentage: 0.30, // 30% of food is wasted
};
