/**
 * Meal Plan Generator Algorithm
 * Generates personalized 5-day meal plans based on family needs
 */

import { v4 as uuidv4 } from 'uuid';
import {
  MealPlanInput,
  MealPlanResult,
  GeneratedMeal,
  GroceryList,
  GroceryItem,
  Ingredient,
  GroceryCategory,
} from '@/types/mealPlanGenerator';
import { filterRecipes, RECIPE_TEMPLATES, RecipeTemplate } from './recipeTemplates';

// Ingredient cost estimates (per unit, in dollars)
const INGREDIENT_COSTS: Record<string, number> = {
  // Proteins
  'Chicken breast': 3.5,
  'Chicken breasts': 3.5,
  'Chicken thighs': 2.5,
  'Ground beef': 4.0,
  'Ground beef or turkey': 3.5,
  'Salmon fillets': 12.0,

  // Dairy
  'Milk': 0.25,
  'Eggs': 0.25,
  'Cheddar cheese': 0.5,
  'Shredded cheese': 0.4,
  'Mozzarella cheese': 0.4,
  'Parmesan cheese': 0.6,
  'Butter': 0.3,
  'Sour cream': 0.15,
  'Heavy cream': 0.4,

  // Produce
  'Potatoes': 0.5,
  'Broccoli florets': 0.4,
  'Cherry tomatoes': 0.3,
  'Tomatoes': 0.5,
  'Lettuce': 0.2,
  'Zucchini': 0.75,
  'Bell pepper': 1.0,
  'Onion': 0.5,
  'Garlic': 0.1,
  'Fruit': 0.5,
  'Coleslaw': 1.5,

  // Pantry
  'Breadcrumbs': 0.15,
  'Elbow macaroni': 0.1,
  'Penne pasta': 0.1,
  'Long grain rice': 0.1,
  'White rice': 0.1,
  'Olive oil': 0.2,
  'Vegetable oil': 0.15,
  'Pancake mix': 0.15,
  'Brown sugar': 0.05,

  // Canned/Frozen
  'Butternut squash puree': 1.5,
  'Frozen mixed vegetables': 0.5,
  'Frozen stir-fry vegetables': 0.5,
  'Kidney beans': 0.8,
  'Diced tomatoes': 0.9,
  'Tomato sauce': 0.8,
  'Chicken broth': 0.5,
  'Vegetable broth': 0.5,
  'Cream of chicken soup': 1.2,

  // Condiments/Sauces
  'BBQ sauce': 0.15,
  'Teriyaki sauce': 0.15,
  'Soy sauce': 0.1,
  'Taco seasoning': 0.5,
  'Salsa': 0.2,
  'Maple syrup': 0.3,
  'Honey': 0.2,
  'Apple cider vinegar': 0.1,

  // Spices (typically minimal cost)
  'Salt': 0.01,
  'Garlic powder': 0.05,
  'Onion powder': 0.05,
  'Italian seasoning': 0.05,
  'Chili powder': 0.05,
  'Cumin': 0.05,
  'Ginger': 0.05,
  'Sesame seeds': 0.1,

  // Bakery
  'Flour tortillas': 0.3,
  'Hamburger buns': 0.3,

  // Default for unknown ingredients
  DEFAULT: 1.0,
};

/**
 * Generate a complete 5-day meal plan
 */
export function generateMealPlan(input: MealPlanInput, sessionId: string): MealPlanResult {
  // Filter recipes based on input criteria
  const suitableRecipes = filterRecipes({
    pickyEaterLevel: input.pickyEaterLevel,
    dietaryRestrictions: input.dietaryRestrictions,
    allergies: input.allergies,
    maxCookTime: input.cookingTimeAvailable,
    skillLevel: input.cookingSkillLevel,
    availableEquipment: input.kitchenEquipment,
  });

  if (suitableRecipes.length === 0) {
    throw new Error(
      'No suitable recipes found. Try relaxing some constraints (longer cooking time, different skill level, etc.).'
    );
  }

  // Select 5 meals ensuring variety
  const selectedRecipes = selectDiverseMeals(suitableRecipes, 5);

  // Generate meal objects for each day
  const meals: GeneratedMeal[] = selectedRecipes.map((recipe, index) =>
    generateMealFromRecipe(recipe, index + 1, input.familySize)
  );

  // Generate consolidated grocery list
  const groceryList = generateGroceryList(meals);

  // Calculate summary statistics
  const totalPrepTime = meals.reduce((sum, meal) => sum + meal.totalTime, 0);
  const totalEstimatedCost = groceryList.totalEstimatedCost;
  const averageCostPerMeal = totalEstimatedCost / meals.length;
  const averageTimePerMeal = totalPrepTime / meals.length;

  // Generate personalized tips
  const prepAheadTips = generatePrepAheadTips(meals);
  const timeSavingTips = generateTimeSavingTips(input);
  const budgetTips = generateBudgetTips(totalEstimatedCost, input.familySize);
  const pickyEaterTips = generatePickyEaterTips(input.pickyEaterLevel);

  return {
    sessionId,
    meals,
    groceryList,
    totalPrepTime,
    totalEstimatedCost,
    averageCostPerMeal,
    averageTimePerMeal,
    prepAheadTips,
    timeSavingTips,
    budgetTips,
    pickyEaterTips,
    appliedFilters: {
      dietaryRestrictions: input.dietaryRestrictions,
      allergies: input.allergies,
      pickyEaterLevel: input.pickyEaterLevel,
      maxCookingTime: input.cookingTimeAvailable,
    },
  };
}

/**
 * Select diverse meals from available recipes
 */
function selectDiverseMeals(recipes: RecipeTemplate[], count: number): RecipeTemplate[] {
  if (recipes.length <= count) {
    return recipes;
  }

  const selected: RecipeTemplate[] = [];
  const usedCategories: Set<string> = new Set();

  // First pass: select one from each category
  const categories = ['quick', 'batch_cook', 'slow_cooker', 'one_pot', 'family_favorite'];

  for (const category of categories) {
    if (selected.length >= count) break;

    const categoryRecipes = recipes.filter(
      (r) => r.category === category && !selected.includes(r)
    );
    if (categoryRecipes.length > 0) {
      const randomRecipe = categoryRecipes[Math.floor(Math.random() * categoryRecipes.length)];
      selected.push(randomRecipe);
      usedCategories.add(category);
    }
  }

  // Second pass: fill remaining slots with variety
  while (selected.length < count && selected.length < recipes.length) {
    const remaining = recipes.filter((r) => !selected.includes(r));
    if (remaining.length === 0) break;

    const randomRecipe = remaining[Math.floor(Math.random() * remaining.length)];
    selected.push(randomRecipe);
  }

  return selected;
}

/**
 * Generate a meal object from a recipe template
 */
function generateMealFromRecipe(
  recipe: RecipeTemplate,
  day: number,
  familySize: number
): GeneratedMeal {
  // Scale ingredients based on family size
  const scaleFactor = familySize / recipe.servings;

  const scaledIngredients: Ingredient[] = recipe.ingredients.map((ing) => {
    const scaledAmount = ing.amount * scaleFactor;
    const roundedAmount = Math.round(scaledAmount * 10) / 10; // Round to 1 decimal

    return {
      ...ing,
      amount: roundedAmount,
      estimatedCost: estimateIngredientCost(ing.name, roundedAmount),
    };
  });

  const estimatedCost = scaledIngredients.reduce((sum, ing) => sum + (ing.estimatedCost || 0), 0);

  return {
    id: uuidv4(),
    day,
    name: recipe.name,
    description: recipe.description,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    totalTime: recipe.prepTime + recipe.cookTime,
    servings: familySize,
    difficulty: recipe.difficulty,
    ingredients: scaledIngredients,
    instructions: recipe.instructions,
    whyItWorks: recipe.whyItWorks,
    kidFriendlyTips: recipe.kidFriendlyTips,
    leftoverIdeas: recipe.leftoverIdeas,
    estimatedCost: Math.round(estimatedCost * 100) / 100,
    tags: recipe.tags,
    category: recipe.category,
  };
}

/**
 * Estimate the cost of an ingredient
 */
function estimateIngredientCost(name: string, amount: number): number {
  const unitCost = INGREDIENT_COSTS[name] || INGREDIENT_COSTS.DEFAULT;
  return Math.round(unitCost * amount * 100) / 100;
}

/**
 * Generate consolidated grocery list from all meals
 */
function generateGroceryList(meals: GeneratedMeal[]): GroceryList {
  const ingredientMap: Map<string, GroceryItem> = new Map();

  // Consolidate ingredients from all meals
  meals.forEach((meal) => {
    meal.ingredients.forEach((ing) => {
      const key = `${ing.name.toLowerCase()}_${ing.unit}`;

      if (ingredientMap.has(key)) {
        const existing = ingredientMap.get(key)!;
        existing.amount += ing.amount;
        existing.estimatedCost += ing.estimatedCost || 0;
        existing.usedInMeals.push(meal.day);
      } else {
        ingredientMap.set(key, {
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          category: ing.category,
          estimatedCost: ing.estimatedCost || 0,
          usedInMeals: [meal.day],
          optional: false,
        });
      }
    });
  });

  const items = Array.from(ingredientMap.values()).map((item) => ({
    ...item,
    amount: Math.round(item.amount * 10) / 10,
    estimatedCost: Math.round(item.estimatedCost * 100) / 100,
  }));

  // Organize by category
  const organizedByCategory: Record<GroceryCategory, GroceryItem[]> = {
    produce: [],
    meat_seafood: [],
    dairy: [],
    bakery: [],
    pantry: [],
    frozen: [],
    canned: [],
    condiments: [],
    spices: [],
    beverages: [],
  };

  items.forEach((item) => {
    organizedByCategory[item.category].push(item);
  });

  // Organize by store aisle (typical grocery store layout)
  const organizedByStore = [
    { aisle: 'Produce', items: organizedByCategory.produce },
    { aisle: 'Meat & Seafood', items: organizedByCategory.meat_seafood },
    { aisle: 'Dairy', items: organizedByCategory.dairy },
    { aisle: 'Frozen Foods', items: organizedByCategory.frozen },
    { aisle: 'Bakery', items: organizedByCategory.bakery },
    { aisle: 'Canned Goods', items: organizedByCategory.canned },
    { aisle: 'Pantry/Dry Goods', items: organizedByCategory.pantry },
    { aisle: 'Condiments & Sauces', items: organizedByCategory.condiments },
    { aisle: 'Spices', items: organizedByCategory.spices },
    { aisle: 'Beverages', items: organizedByCategory.beverages },
  ].filter((section) => section.items.length > 0);

  const totalEstimatedCost = items.reduce((sum, item) => sum + item.estimatedCost, 0);

  return {
    items,
    totalEstimatedCost: Math.round(totalEstimatedCost * 100) / 100,
    organizedByCategory,
    organizedByStore,
  };
}

/**
 * Generate prep-ahead tips
 */
function generatePrepAheadTips(meals: GeneratedMeal[]): string[] {
  const tips: string[] = [];

  const hasBatchCook = meals.some((m) => m.category === 'batch_cook');
  const hasSlowCooker = meals.some((m) => m.category === 'slow_cooker');

  if (hasBatchCook) {
    tips.push(
      'Cook your batch cooking meals on Sunday - they make multiple servings and freeze beautifully.'
    );
  }

  if (hasSlowCooker) {
    tips.push(
      'Prep slow cooker meals the night before. Store ingredients in the slow cooker insert in the fridge, then just turn it on in the morning.'
    );
  }

  tips.push('Wash and chop all vegetables when you unpack groceries to save time during the week.');
  tips.push('Marinate proteins the night before for maximum flavor with minimal effort.');
  tips.push('Pre-measure dry ingredients and store in labeled containers for quick access.');

  return tips;
}

/**
 * Generate time-saving tips
 */
function generateTimeSavingTips(input: MealPlanInput): string[] {
  const tips: string[] = [];

  tips.push('Use frozen vegetables - they\'re pre-washed, pre-chopped, and just as nutritious.');
  tips.push('Cook double batches of rice, pasta, or grains and refrigerate half for quick meals later.');
  tips.push('Keep your most-used ingredients at eye level for faster meal prep.');

  if (input.kitchenEquipment.includes('instant_pot')) {
    tips.push('Your Instant Pot can cook rice while you\'re preparing other parts of the meal.');
  }

  if (input.kitchenEquipment.includes('air_fryer')) {
    tips.push('The air fryer is perfect for reheating leftovers - they taste freshly made!');
  }

  if (input.children > 0) {
    tips.push('Give kids age-appropriate tasks (washing produce, tearing lettuce) to involve them and save time.');
  }

  return tips;
}

/**
 * Generate budget tips
 */
function generateBudgetTips(totalCost: number, familySize: number): string[] {
  const tips: string[] = [];
  const perPersonPerMeal = totalCost / (familySize * 5);

  tips.push(
    `Your cost per person per meal is approximately $${perPersonPerMeal.toFixed(2)} - much less than dining out!`
  );
  tips.push('Buy proteins on sale and freeze immediately for use later in the week.');
  tips.push('Store brands often have identical quality to name brands at 30% less cost.');
  tips.push('Check your pantry before shopping to avoid buying duplicates.');
  tips.push('Frozen fruits and vegetables are cheaper and reduce waste since you use only what you need.');

  return tips;
}

/**
 * Generate picky eater tips
 */
function generatePickyEaterTips(level: string): string[] {
  const tips: string[] = [];

  if (level === 'severe') {
    tips.push('Start with one new food at a time, presented alongside familiar safe foods.');
    tips.push('No pressure rule: Offer new foods without requiring your child to eat them.');
    tips.push('It can take 10-15 exposures before a child accepts a new food - keep offering!');
    tips.push('Let kids see YOU enjoying the food first to model positive behavior.');
  } else if (level === 'moderate') {
    tips.push('Use the "one bite rule" - just one taste is a victory.');
    tips.push('Make meals interactive - build-your-own formats give kids control and confidence.');
    tips.push('Pair new foods with familiar favorites to reduce anxiety.');
    tips.push('Celebrate small wins and focus on progress, not perfection.');
  } else {
    tips.push('Involve kids in meal planning - they\'re more likely to eat what they helped choose.');
    tips.push('Try "food adventures" where the family tries one new recipe together each week.');
    tips.push('Use descriptive language - "crunchy," "sweet," "colorful" - to build food vocabulary.');
  }

  return tips;
}
