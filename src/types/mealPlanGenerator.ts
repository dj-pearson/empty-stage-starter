/**
 * Type definitions for 5-Day Meal Plan Generator
 */

export type PickyEaterLevel = 'none' | 'mild' | 'moderate' | 'severe';
export type CookingSkillLevel = 'beginner' | 'intermediate' | 'advanced';

export type DietaryRestriction =
  | 'vegetarian'
  | 'vegan'
  | 'gluten_free'
  | 'dairy_free'
  | 'nut_free'
  | 'egg_free'
  | 'soy_free'
  | 'halal'
  | 'kosher'
  | 'low_carb'
  | 'keto';

export type Allergy = 'peanuts' | 'tree_nuts' | 'milk' | 'eggs' | 'wheat' | 'soy' | 'fish' | 'shellfish';

export type KitchenEquipment =
  | 'slow_cooker'
  | 'instant_pot'
  | 'air_fryer'
  | 'food_processor'
  | 'blender'
  | 'stand_mixer'
  | 'rice_cooker'
  | 'grill';

export interface MealPlanInput {
  familySize: number;
  adults: number;
  children: number;
  childrenAges: number[];
  dietaryRestrictions: DietaryRestriction[];
  allergies: Allergy[];
  pickyEaterLevel: PickyEaterLevel;
  cookingTimeAvailable: number; // minutes per day
  cookingSkillLevel: CookingSkillLevel;
  kitchenEquipment: KitchenEquipment[];
}

export interface GeneratedMeal {
  id: string;
  day: number; // 1-5
  name: string;
  description: string;
  prepTime: number; // minutes
  cookTime: number; // minutes
  totalTime: number; // minutes
  servings: number;
  difficulty: 'easy' | 'medium' | 'hard';

  // Recipe details
  ingredients: Ingredient[];
  instructions: string[];

  // Nutrition (optional)
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;

  // Why it works
  whyItWorks: string;
  kidFriendlyTips: string[];

  // Leftover suggestions
  leftoverIdeas?: string[];

  // Cost estimate
  estimatedCost: number;

  // Tags
  tags: string[];
  category: 'quick' | 'batch_cook' | 'slow_cooker' | 'one_pot' | 'family_favorite';
}

export interface Ingredient {
  name: string;
  amount: number;
  unit: string;
  category: GroceryCategory;
  estimatedCost?: number;
}

export type GroceryCategory =
  | 'produce'
  | 'meat_seafood'
  | 'dairy'
  | 'bakery'
  | 'pantry'
  | 'frozen'
  | 'canned'
  | 'condiments'
  | 'spices'
  | 'beverages';

export interface GroceryList {
  items: GroceryItem[];
  totalEstimatedCost: number;
  organizedByCategory: Record<GroceryCategory, GroceryItem[]>;
  organizedByStore: {
    aisle: string;
    items: GroceryItem[];
  }[];
}

export interface GroceryItem {
  name: string;
  amount: number;
  unit: string;
  category: GroceryCategory;
  estimatedCost: number;
  usedInMeals: number[]; // Which days/meals
  optional: boolean;
}

export interface MealPlanResult {
  sessionId: string;
  generationId?: string;
  meals: GeneratedMeal[];
  groceryList: GroceryList;

  // Summary stats
  totalPrepTime: number;
  totalEstimatedCost: number;
  averageCostPerMeal: number;
  averageTimePerMeal: number;

  // Tips
  prepAheadTips: string[];
  timeSavingTips: string[];
  budgetTips: string[];
  pickyEaterTips: string[];

  // Customization applied
  appliedFilters: {
    dietaryRestrictions: DietaryRestriction[];
    allergies: Allergy[];
    pickyEaterLevel: PickyEaterLevel;
    maxCookingTime: number;
  };
}

export interface MealPlanEmailCaptureData {
  email: string;
  name: string;
  acceptsMarketing: boolean;
}

export interface MealPlanAnalyticsEvent {
  toolName: 'meal_plan_generator';
  sessionId: string;
  generationId?: string;
  eventType: MealPlanEventType;
  eventData?: Record<string, unknown>;
  timeOnPageSeconds?: number;
  deviceType?: string;
  abTestVariant?: string;
}

export type MealPlanEventType =
  | 'generator_viewed'
  | 'generator_started'
  | 'generation_completed'
  | 'results_viewed'
  | 'email_modal_opened'
  | 'email_captured'
  | 'full_plan_downloaded'
  | 'grocery_list_downloaded'
  | 'shared'
  | 'trial_clicked'
  | 'meal_rated'
  | 'generator_abandoned';

// Database record types
export interface MealPlanGenerationRecord {
  id: string;
  created_at: string;
  family_size: number;
  adults: number;
  children: number;
  children_ages: number[];
  dietary_restrictions: DietaryRestriction[];
  allergies: Allergy[];
  picky_eater_level: PickyEaterLevel;
  cooking_time_available: number;
  cooking_skill_level: CookingSkillLevel;
  kitchen_equipment: KitchenEquipment[];
  meal_plan: GeneratedMeal[];
  grocery_list: GroceryList;
  total_estimated_cost: number;
  total_prep_time: number;
  email?: string;
  name?: string;
  session_id: string;
  email_captured: boolean;
  full_plan_downloaded: boolean;
  trial_started: boolean;
  rating?: number;
  feedback?: string;
}

export interface MealPlanLeadRecord {
  id: string;
  email: string;
  name?: string;
  meal_plan_generation_id: string;
  family_size: number;
  picky_eater_level: PickyEaterLevel;
  referral_code: string;
  trial_started: boolean;
  created_at: string;
}
