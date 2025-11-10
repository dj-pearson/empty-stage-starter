/**
 * Type definitions for Grocery Budget Calculator
 */

export type USDAFoodPlanLevel = 'thrifty' | 'low_cost' | 'moderate' | 'liberal';

export type DietaryRestriction =
  | 'vegetarian'
  | 'vegan'
  | 'gluten_free'
  | 'dairy_free'
  | 'nut_free'
  | 'halal'
  | 'kosher';

export interface BudgetCalculatorInput {
  familySize: number;
  adults: number;
  children: number;
  zipCode?: string;
  state?: string;
  dietaryRestrictions: DietaryRestriction[];
}

export interface BudgetCalculation {
  // Monthly budgets
  recommendedMonthlyBudget: number;
  thriftyPlanBudget: number;
  lowCostPlanBudget: number;
  moderatePlanBudget: number;
  liberalPlanBudget: number;

  // Per meal/person costs
  costPerMeal: number;
  costPerPersonPerDay: number;
  costPerPersonPerWeek: number;

  // USDA plan level used
  usdaPlanLevel: USDAFoodPlanLevel;

  // Comparisons
  vsMealKitsSavings: number;
  vsDiningOutSavings: number;
  annualSavings: number;

  // Breakdowns
  weeklyBreakdown: {
    groceries: number;
    mealPrep: number;
    snacks: number;
    beverages: number;
  };

  // Tips and recommendations
  budgetTips: string[];
  wasteReductionTips: string[];
  mealPrepTips: string[];
}

export interface BudgetResult extends BudgetCalculation {
  sessionId: string;
  calculationId?: string;
  // Budget-friendly meal suggestions
  recommendedMeals: BudgetMealSuggestion[];
}

export interface BudgetMealSuggestion {
  name: string;
  costPerServing: number;
  prepTime: number;
  ingredients: string[];
  servings: number;
  totalCost: number;
  category: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

export interface BudgetEmailCaptureData {
  email: string;
  name: string;
  acceptsMarketing: boolean;
}

export interface BudgetAnalyticsEvent {
  toolName: 'budget_calculator';
  sessionId: string;
  calculationId?: string;
  eventType: BudgetEventType;
  eventData?: Record<string, unknown>;
  timeOnPageSeconds?: number;
  deviceType?: string;
  abTestVariant?: string;
}

export type BudgetEventType =
  | 'calculator_viewed'
  | 'calculator_started'
  | 'calculation_completed'
  | 'results_viewed'
  | 'email_modal_opened'
  | 'email_captured'
  | 'meal_plan_downloaded'
  | 'shared'
  | 'trial_clicked'
  | 'calculator_abandoned';

// Database record types
export interface BudgetCalculationRecord {
  id: string;
  created_at: string;
  family_size: number;
  adults: number;
  children: number;
  zip_code?: string;
  state?: string;
  dietary_restrictions: DietaryRestriction[];
  recommended_monthly_budget: number;
  cost_per_meal: number;
  cost_per_person_per_day: number;
  usda_plan_level: USDAFoodPlanLevel;
  vs_meal_kits_savings?: number;
  vs_dining_out_savings?: number;
  annual_savings?: number;
  email?: string;
  name?: string;
  session_id: string;
  email_captured: boolean;
  meal_plan_downloaded: boolean;
  trial_started: boolean;
}

export interface BudgetLeadRecord {
  id: string;
  email: string;
  name?: string;
  budget_calculation_id: string;
  family_size: number;
  monthly_budget: number;
  referral_code: string;
  trial_started: boolean;
  created_at: string;
}
