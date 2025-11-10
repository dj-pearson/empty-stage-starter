/**
 * Budget Calculator Engine
 * Core calculation logic using USDA food cost data
 */

import {
  BudgetCalculatorInput,
  BudgetCalculation,
  USDAFoodPlanLevel,
  BudgetMealSuggestion,
} from '@/types/budgetCalculator';
import {
  getPersonMonthlyCost,
  getStateCostAdjustment,
  getDietaryRestrictionMultiplier,
  COMPARISON_COSTS,
  SIMPLIFIED_MONTHLY_COSTS,
} from './usdaData';

/**
 * Main budget calculation function
 */
export function calculateBudget(input: BudgetCalculatorInput): BudgetCalculation {
  const { familySize, adults, children, state, dietaryRestrictions } = input;

  // Determine recommended USDA plan level (moderate for most families)
  const recommendedPlanLevel: USDAFoodPlanLevel = 'moderate';

  // Calculate base monthly costs for all plan levels
  const baseCosts = calculateBaseCosts(adults, children);

  // Apply regional adjustment
  const stateMultiplier = getStateCostAdjustment(state);

  // Apply dietary restriction multiplier
  const dietMultiplier = getDietaryRestrictionMultiplier(dietaryRestrictions);

  // Calculate final monthly budgets for each plan level
  const thriftyPlanBudget = baseCosts.thrifty * stateMultiplier * dietMultiplier;
  const lowCostPlanBudget = baseCosts.low_cost * stateMultiplier * dietMultiplier;
  const moderatePlanBudget = baseCosts.moderate * stateMultiplier * dietMultiplier;
  const liberalPlanBudget = baseCosts.liberal * stateMultiplier * dietMultiplier;

  // Recommended budget is the moderate plan
  const recommendedMonthlyBudget = moderatePlanBudget;

  // Calculate per-meal and per-person costs
  const mealsPerMonth = familySize * 3 * 30; // 3 meals/day * 30 days
  const costPerMeal = recommendedMonthlyBudget / mealsPerMonth;
  const costPerPersonPerDay = recommendedMonthlyBudget / familySize / 30;
  const costPerPersonPerWeek = costPerPersonPerDay * 7;

  // Calculate savings vs alternatives
  const mealKitMonthlyCost =
    familySize * COMPARISON_COSTS.mealKitPerPersonPerMeal * 30; // Assume 1 meal/day
  const vsMealKitsSavings = mealKitMonthlyCost - recommendedMonthlyBudget;

  const diningOutMonthlyCost =
    familySize * COMPARISON_COSTS.averageDiningOutPerPersonPerMeal * 30; // Assume 1 meal/day
  const vsDiningOutSavings = diningOutMonthlyCost - recommendedMonthlyBudget;

  // Annual savings
  const annualSavings = vsMealKitsSavings * 12;

  // Weekly breakdown (estimates)
  const weeklyBudget = recommendedMonthlyBudget / 4.33; // Average weeks per month
  const weeklyBreakdown = {
    groceries: weeklyBudget * 0.70, // 70% on main groceries
    mealPrep: weeklyBudget * 0.15, // 15% on meal prep items
    snacks: weeklyBudget * 0.10, // 10% on snacks
    beverages: weeklyBudget * 0.05, // 5% on beverages
  };

  // Generate personalized tips
  const budgetTips = generateBudgetTips(input, recommendedMonthlyBudget);
  const wasteReductionTips = generateWasteReductionTips();
  const mealPrepTips = generateMealPrepTips(familySize);

  return {
    recommendedMonthlyBudget: Math.round(recommendedMonthlyBudget * 100) / 100,
    thriftyPlanBudget: Math.round(thriftyPlanBudget * 100) / 100,
    lowCostPlanBudget: Math.round(lowCostPlanBudget * 100) / 100,
    moderatePlanBudget: Math.round(moderatePlanBudget * 100) / 100,
    liberalPlanBudget: Math.round(liberalPlanBudget * 100) / 100,
    costPerMeal: Math.round(costPerMeal * 100) / 100,
    costPerPersonPerDay: Math.round(costPerPersonPerDay * 100) / 100,
    costPerPersonPerWeek: Math.round(costPerPersonPerWeek * 100) / 100,
    usdaPlanLevel: recommendedPlanLevel,
    vsMealKitsSavings: Math.round(vsMealKitsSavings * 100) / 100,
    vsDiningOutSavings: Math.round(vsDiningOutSavings * 100) / 100,
    annualSavings: Math.round(annualSavings * 100) / 100,
    weeklyBreakdown,
    budgetTips,
    wasteReductionTips,
    mealPrepTips,
  };
}

/**
 * Calculate base monthly costs for all USDA plan levels
 */
function calculateBaseCosts(
  adults: number,
  children: number
): Record<USDAFoodPlanLevel, number> {
  const costs: Record<USDAFoodPlanLevel, number> = {
    thrifty: 0,
    low_cost: 0,
    moderate: 0,
    liberal: 0,
  };

  // Add adult costs (assume average adult age 35)
  const adultAge = 35;
  costs.thrifty += adults * getPersonMonthlyCost(adultAge, 'thrifty');
  costs.low_cost += adults * getPersonMonthlyCost(adultAge, 'low_cost');
  costs.moderate += adults * getPersonMonthlyCost(adultAge, 'moderate');
  costs.liberal += adults * getPersonMonthlyCost(adultAge, 'liberal');

  // Add children costs (assume average child age 8 if no specific ages)
  const childAge = 8;
  costs.thrifty += children * getPersonMonthlyCost(childAge, 'thrifty');
  costs.low_cost += children * getPersonMonthlyCost(childAge, 'low_cost');
  costs.moderate += children * getPersonMonthlyCost(childAge, 'moderate');
  costs.liberal += children * getPersonMonthlyCost(childAge, 'liberal');

  return costs;
}

/**
 * Generate personalized budget tips
 */
function generateBudgetTips(
  input: BudgetCalculatorInput,
  monthlyBudget: number
): string[] {
  const tips: string[] = [];
  const { familySize, dietaryRestrictions, state } = input;

  // Weekly budget tip
  const weeklyBudget = Math.round((monthlyBudget / 4.33) * 100) / 100;
  tips.push(
    `Aim for a weekly grocery budget of $${weeklyBudget} (approximately ${Math.round(
      weeklyBudget / familySize
    )} per person).`
  );

  // Meal planning tip
  tips.push(
    'Plan meals for the week before shopping to avoid impulse purchases and reduce food waste by up to 30%.'
  );

  // Bulk buying tip
  if (familySize >= 4) {
    tips.push(
      'Buy staples like rice, pasta, beans, and frozen vegetables in bulk to save 15-25% on per-unit costs.'
    );
  }

  // Seasonal produce tip
  tips.push(
    'Choose seasonal produce - it\'s typically 20-40% cheaper and more nutritious than out-of-season options.'
  );

  // Store brands tip
  tips.push(
    'Opt for store brands over name brands for items like milk, eggs, pasta, and canned goods - they\'re often 25-30% cheaper with similar quality.'
  );

  // Dietary restriction tips
  if (dietaryRestrictions.includes('vegetarian') || dietaryRestrictions.includes('vegan')) {
    tips.push(
      'Focus on plant-based proteins like beans, lentils, and tofu - they\'re 50-75% cheaper than meat while providing excellent nutrition.'
    );
  }

  if (dietaryRestrictions.includes('gluten_free')) {
    tips.push(
      'Make gluten-free staples from scratch (like rice flour baked goods) to save 40-60% compared to pre-packaged gluten-free products.'
    );
  }

  // Regional tips
  if (state === 'HI' || state === 'AK') {
    tips.push(
      'Consider buying non-perishable items in bulk online to offset higher local grocery costs in your region.'
    );
  }

  // Freezer tip
  tips.push(
    'Use your freezer strategically - freeze bread, meat, and prepared meals to take advantage of sales and reduce waste.'
  );

  return tips;
}

/**
 * Generate waste reduction tips
 */
function generateWasteReductionTips(): string[] {
  return [
    'Store produce properly - keep leafy greens in breathable bags, herbs in water, and tomatoes at room temperature.',
    'Practice FIFO (First In, First Out) - organize your fridge and pantry so older items are used before newer ones.',
    'Repurpose leftovers creatively - yesterday\'s roasted chicken becomes today\'s chicken salad or tomorrow\'s soup.',
    'Freeze overripe bananas for smoothies, wilting herbs in olive oil for cooking, and excess bread for breadcrumbs.',
    'Use vegetable scraps (onion peels, carrot tops, celery leaves) to make homemade stock - it\'s free and nutritious.',
    'Monitor portion sizes - cooking less reduces waste. You can always make more if needed.',
    'Check your fridge before shopping - knowing what you have prevents duplicate purchases and waste.',
  ];
}

/**
 * Generate meal prep tips
 */
function generateMealPrepTips(familySize: number): string[] {
  const tips: string[] = [];

  tips.push(
    'Dedicate 2-3 hours on Sunday to batch cook proteins, grains, and chop vegetables for the week ahead.'
  );

  tips.push(
    'Cook once, eat twice (or more) - double your recipes and freeze half for quick future meals.'
  );

  if (familySize >= 4) {
    tips.push(
      'Invest in a slow cooker or Instant Pot - they make hands-off cooking easy and are perfect for large batches.'
    );
  }

  tips.push(
    'Prep versatile ingredients - grilled chicken, cooked rice, and roasted vegetables can be mixed and matched for different meals.'
  );

  tips.push(
    'Use themed nights (Taco Tuesday, Pasta Thursday) to simplify planning and shopping while keeping variety.'
  );

  tips.push(
    'Wash and portion fresh fruit and vegetables right after shopping - prepped produce is more likely to be eaten.'
  );

  tips.push(
    'Keep a running grocery list on your phone or fridge - add items as you run out to make shopping more efficient.'
  );

  return tips;
}

/**
 * Generate budget-friendly meal suggestions
 */
export function generateBudgetMealSuggestions(
  familySize: number,
  dietaryRestrictions: string[]
): BudgetMealSuggestion[] {
  const suggestions: BudgetMealSuggestion[] = [];

  const isVegetarian =
    dietaryRestrictions.includes('vegetarian') || dietaryRestrictions.includes('vegan');
  const isVegan = dietaryRestrictions.includes('vegan');
  const isGlutenFree = dietaryRestrictions.includes('gluten_free');

  // Breakfast suggestions
  if (!isGlutenFree) {
    suggestions.push({
      name: 'Overnight Oats with Fruit',
      costPerServing: 0.75,
      prepTime: 5,
      servings: familySize,
      totalCost: 0.75 * familySize,
      category: 'breakfast',
      ingredients: [
        'Rolled oats',
        'Milk or plant milk',
        'Banana',
        'Cinnamon',
        'Honey or maple syrup',
      ],
    });
  }

  if (!isVegan) {
    suggestions.push({
      name: 'Scrambled Eggs with Toast',
      costPerServing: 1.2,
      prepTime: 10,
      servings: familySize,
      totalCost: 1.2 * familySize,
      category: 'breakfast',
      ingredients: ['Eggs', 'Whole wheat bread', 'Butter', 'Salt', 'Pepper'],
    });
  }

  // Lunch suggestions
  suggestions.push({
    name: 'Black Bean and Rice Bowl',
    costPerServing: 1.5,
    prepTime: 25,
    servings: familySize,
    totalCost: 1.5 * familySize,
    category: 'lunch',
    ingredients: [
      'Canned black beans',
      'Brown rice',
      'Salsa',
      'Corn',
      'Avocado',
      'Lime',
    ],
  });

  if (!isVegetarian) {
    suggestions.push({
      name: 'Chicken and Vegetable Stir Fry',
      costPerServing: 3.5,
      prepTime: 20,
      servings: familySize,
      totalCost: 3.5 * familySize,
      category: 'lunch',
      ingredients: [
        'Chicken breast',
        'Mixed frozen vegetables',
        'Rice',
        'Soy sauce',
        'Garlic',
        'Ginger',
      ],
    });
  }

  // Dinner suggestions
  if (!isGlutenFree && !isVegetarian) {
    suggestions.push({
      name: 'Spaghetti with Meat Sauce',
      costPerServing: 2.25,
      prepTime: 30,
      servings: familySize,
      totalCost: 2.25 * familySize,
      category: 'dinner',
      ingredients: [
        'Spaghetti pasta',
        'Ground beef',
        'Canned tomatoes',
        'Onion',
        'Garlic',
        'Italian seasoning',
      ],
    });
  }

  suggestions.push({
    name: 'Vegetable and Lentil Soup',
    costPerServing: 1.75,
    prepTime: 40,
    servings: familySize,
    totalCost: 1.75 * familySize,
    category: 'dinner',
    ingredients: [
      'Dried lentils',
      'Carrots',
      'Celery',
      'Onion',
      'Vegetable broth',
      'Canned tomatoes',
      'Spices',
    ],
  });

  if (!isVegetarian) {
    suggestions.push({
      name: 'Sheet Pan Chicken and Vegetables',
      costPerServing: 3.25,
      prepTime: 15,
      servings: familySize,
      totalCost: 3.25 * familySize,
      category: 'dinner',
      ingredients: [
        'Chicken thighs',
        'Potatoes',
        'Broccoli',
        'Olive oil',
        'Garlic powder',
        'Paprika',
      ],
    });

    suggestions.push({
      name: 'Beef and Bean Chili',
      costPerServing: 2.5,
      prepTime: 45,
      servings: familySize,
      totalCost: 2.5 * familySize,
      category: 'dinner',
      ingredients: [
        'Ground beef',
        'Canned kidney beans',
        'Canned tomatoes',
        'Onion',
        'Chili powder',
        'Cumin',
      ],
    });
  }

  suggestions.push({
    name: 'Vegetable Fried Rice',
    costPerServing: 1.5,
    prepTime: 20,
    servings: familySize,
    totalCost: 1.5 * familySize,
    category: 'dinner',
    ingredients: [
      'Cooked rice',
      'Mixed frozen vegetables',
      isVegan ? 'Oil' : 'Eggs',
      'Soy sauce',
      'Garlic',
      'Green onions',
    ],
  });

  if (!isGlutenFree) {
    suggestions.push({
      name: 'Homemade Pizza',
      costPerServing: 2.0,
      prepTime: 30,
      servings: familySize,
      totalCost: 2.0 * familySize,
      category: 'dinner',
      ingredients: [
        'Pizza dough',
        'Tomato sauce',
        isVegan ? 'Vegetables' : 'Mozzarella cheese',
        'Olive oil',
        'Oregano',
      ],
    });
  }

  // Snack suggestions
  suggestions.push({
    name: 'Homemade Hummus with Vegetables',
    costPerServing: 0.8,
    prepTime: 10,
    servings: familySize,
    totalCost: 0.8 * familySize,
    category: 'snack',
    ingredients: ['Canned chickpeas', 'Tahini', 'Lemon', 'Garlic', 'Carrots', 'Celery'],
  });

  if (!isVegan) {
    suggestions.push({
      name: 'Yogurt Parfait',
      costPerServing: 1.25,
      prepTime: 5,
      servings: familySize,
      totalCost: 1.25 * familySize,
      category: 'snack',
      ingredients: ['Plain yogurt', 'Granola', 'Berries', 'Honey'],
    });
  }

  suggestions.push({
    name: 'Apple Slices with Peanut Butter',
    costPerServing: 0.6,
    prepTime: 5,
    servings: familySize,
    totalCost: 0.6 * familySize,
    category: 'snack',
    ingredients: ['Apples', 'Peanut butter'],
  });

  // Return top 8-10 suggestions sorted by cost per serving
  return suggestions.sort((a, b) => a.costPerServing - b.costPerServing).slice(0, 10);
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Calculate savings percentage
 */
export function calculateSavingsPercentage(original: number, savings: number): number {
  if (original <= 0) return 0;
  return Math.round((savings / original) * 100);
}
