/**
 * Recipe Templates for 5-Day Meal Plan Generator
 * Curated family-friendly recipes with picky eater considerations
 */

import {
  GeneratedMeal,
  Ingredient,
  DietaryRestriction,
  Allergy,
  PickyEaterLevel,
  CookingSkillLevel,
  KitchenEquipment,
} from '@/types/mealPlanGenerator';

export interface RecipeTemplate {
  id: string;
  name: string;
  description: string;
  prepTime: number; // minutes
  cookTime: number; // minutes
  servings: number; // base servings, will be scaled
  difficulty: 'easy' | 'medium' | 'hard';
  category: 'quick' | 'batch_cook' | 'slow_cooker' | 'one_pot' | 'family_favorite';

  // Suitability filters
  pickyEaterFriendly: PickyEaterLevel[]; // which picky eater levels this is good for
  dietaryRestrictions: DietaryRestriction[]; // compatible diets
  avoidAllergies: Allergy[]; // what allergies this avoids
  requiredEquipment: KitchenEquipment[];
  skillLevel: CookingSkillLevel[];

  // Recipe content
  ingredients: Omit<Ingredient, 'estimatedCost'>[]; // costs will be calculated later
  instructions: string[];

  // Why it works for picky eaters
  whyItWorks: string;
  kidFriendlyTips: string[];
  leftoverIdeas?: string[];

  // Tags for filtering
  tags: string[];

  // Base cost estimate (for 4 servings)
  baseCost: number;
}

export const RECIPE_TEMPLATES: RecipeTemplate[] = [
  // ==========================================
  // SUPER PICKY EATER FRIENDLY (Beige & Simple)
  // ==========================================
  {
    id: 'chicken_nuggets_sheet_pan',
    name: 'Homemade Chicken Nuggets with Fries',
    description: 'Crispy baked chicken nuggets and golden fries - a guaranteed hit',
    prepTime: 15,
    cookTime: 25,
    servings: 4,
    difficulty: 'easy',
    category: 'family_favorite',
    pickyEaterFriendly: ['severe', 'moderate', 'mild', 'none'],
    dietaryRestrictions: [],
    avoidAllergies: ['peanuts', 'tree_nuts', 'fish', 'shellfish', 'soy'],
    requiredEquipment: [],
    skillLevel: ['beginner', 'intermediate', 'advanced'],
    baseCost: 12.0,
    ingredients: [
      { name: 'Chicken breast', amount: 1.5, unit: 'lbs', category: 'meat_seafood' },
      { name: 'Breadcrumbs', amount: 1, unit: 'cup', category: 'pantry' },
      { name: 'Eggs', amount: 2, unit: 'whole', category: 'dairy' },
      { name: 'Potatoes', amount: 4, unit: 'medium', category: 'produce' },
      { name: 'Olive oil', amount: 3, unit: 'tbsp', category: 'pantry' },
      { name: 'Salt', amount: 1, unit: 'tsp', category: 'spices' },
      { name: 'Garlic powder', amount: 0.5, unit: 'tsp', category: 'spices' },
    ],
    instructions: [
      'Preheat oven to 425°F. Line a large baking sheet with parchment paper.',
      'Cut chicken into nugget-sized pieces. Cut potatoes into fries.',
      'Set up breading station: beaten eggs in one bowl, breadcrumbs mixed with salt and garlic powder in another.',
      'Dip chicken pieces in egg, then breadcrumbs. Place on one side of baking sheet.',
      'Toss potato fries with olive oil and salt. Arrange on other side of baking sheet.',
      'Bake for 20-25 minutes, flipping halfway, until chicken is cooked through and fries are golden.',
      'Let cool slightly before serving with ketchup or favorite dipping sauce.',
    ],
    whyItWorks: 'Familiar "safe" foods in a healthier homemade version. Kids love the hands-on dipping sauce experience.',
    kidFriendlyTips: [
      'Let kids help with breading - it\'s fun and builds investment',
      'Cut nuggets small for little hands',
      'Serve with multiple dipping sauces to encourage exploration',
    ],
    leftoverIdeas: [
      'Chicken nugget wraps for lunch',
      'Reheat fries in air fryer for crispy results',
    ],
    tags: ['beige food', 'kid approved', 'sheet pan', 'make ahead'],
  },

  {
    id: 'mac_and_cheese_veggie_sneaky',
    name: 'Creamy Mac and Cheese (with Hidden Veggies)',
    description: 'Classic comfort food with pureed butternut squash for extra nutrition',
    prepTime: 10,
    cookTime: 20,
    servings: 4,
    difficulty: 'easy',
    category: 'family_favorite',
    pickyEaterFriendly: ['severe', 'moderate', 'mild', 'none'],
    dietaryRestrictions: ['vegetarian'],
    avoidAllergies: ['peanuts', 'tree_nuts', 'fish', 'shellfish', 'soy', 'eggs'],
    requiredEquipment: [],
    skillLevel: ['beginner', 'intermediate', 'advanced'],
    baseCost: 8.0,
    ingredients: [
      { name: 'Elbow macaroni', amount: 1, unit: 'lb', category: 'pantry' },
      { name: 'Cheddar cheese', amount: 2, unit: 'cups', category: 'dairy' },
      { name: 'Milk', amount: 2, unit: 'cups', category: 'dairy' },
      { name: 'Butter', amount: 2, unit: 'tbsp', category: 'dairy' },
      { name: 'Butternut squash puree', amount: 1, unit: 'cup', category: 'frozen' },
      { name: 'Salt', amount: 0.5, unit: 'tsp', category: 'spices' },
      { name: 'Garlic powder', amount: 0.25, unit: 'tsp', category: 'spices' },
    ],
    instructions: [
      'Cook macaroni according to package directions. Drain and return to pot.',
      'In same pot, add butter and melt over medium heat.',
      'Add milk, butternut squash puree, salt, and garlic powder. Stir until smooth and warm.',
      'Add shredded cheese gradually, stirring until melted and creamy.',
      'Mix in cooked macaroni until well coated.',
      'Serve immediately while hot and creamy.',
    ],
    whyItWorks: 'Butternut squash blends seamlessly into the cheese sauce, adding vitamins and fiber without changing the familiar taste or color much.',
    kidFriendlyTips: [
      'The squash makes it extra creamy without being noticed',
      'Top with breadcrumbs and broil for 2 minutes for a crispy top',
      'Add cooked peas if your child tolerates green',
    ],
    leftoverIdeas: [
      'Mac and cheese muffins (bake in muffin tin)',
      'Add to soup for heartier texture',
    ],
    tags: ['comfort food', 'hidden veggies', 'one pot', 'vegetarian'],
  },

  // ==========================================
  // MODERATE PICKY EATER FRIENDLY
  // ==========================================
  {
    id: 'build_your_own_tacos',
    name: 'Build-Your-Own Taco Night',
    description: 'Fun interactive dinner where everyone customizes their own tacos',
    prepTime: 15,
    cookTime: 15,
    servings: 4,
    difficulty: 'easy',
    category: 'family_favorite',
    pickyEaterFriendly: ['moderate', 'mild', 'none'],
    dietaryRestrictions: [],
    avoidAllergies: ['peanuts', 'tree_nuts', 'fish', 'shellfish', 'eggs', 'soy'],
    requiredEquipment: [],
    skillLevel: ['beginner', 'intermediate', 'advanced'],
    baseCost: 14.0,
    ingredients: [
      { name: 'Ground beef or turkey', amount: 1, unit: 'lb', category: 'meat_seafood' },
      { name: 'Taco seasoning', amount: 1, unit: 'packet', category: 'spices' },
      { name: 'Flour tortillas', amount: 8, unit: 'count', category: 'bakery' },
      { name: 'Shredded cheese', amount: 1, unit: 'cup', category: 'dairy' },
      { name: 'Lettuce', amount: 2, unit: 'cups', category: 'produce' },
      { name: 'Tomatoes', amount: 2, unit: 'medium', category: 'produce' },
      { name: 'Sour cream', amount: 0.5, unit: 'cup', category: 'dairy' },
      { name: 'Salsa', amount: 1, unit: 'cup', category: 'condiments' },
    ],
    instructions: [
      'Brown ground meat in a large skillet over medium-high heat, breaking it up as it cooks.',
      'Drain excess fat, then add taco seasoning and water according to package directions.',
      'Simmer for 5 minutes until sauce thickens.',
      'Warm tortillas in microwave for 30 seconds wrapped in damp paper towel.',
      'Chop lettuce and dice tomatoes.',
      'Set out all toppings in separate bowls: meat, cheese, lettuce, tomatoes, sour cream, salsa.',
      'Let everyone build their own tacos with their preferred toppings.',
    ],
    whyItWorks: 'Giving control over what goes in the taco empowers picky eaters. They can start with just meat and cheese, then gradually try new toppings.',
    kidFriendlyTips: [
      'Start with minimal toppings and add more as they\'re comfortable',
      'Try a "taco taste test" where trying one new topping earns a reward',
      'Make it fun with taco-building competitions',
    ],
    leftoverIdeas: [
      'Taco salad for lunch',
      'Taco meat freezes well for quick future dinners',
    ],
    tags: ['interactive', 'customizable', 'quick', 'freezer friendly'],
  },

  {
    id: 'slow_cooker_chicken_rice',
    name: 'Slow Cooker Chicken and Rice',
    description: 'Set it and forget it - tender chicken with fluffy rice',
    prepTime: 10,
    cookTime: 240,
    servings: 6,
    difficulty: 'easy',
    category: 'slow_cooker',
    pickyEaterFriendly: ['moderate', 'mild', 'none'],
    dietaryRestrictions: [],
    avoidAllergies: ['peanuts', 'tree_nuts', 'fish', 'shellfish', 'eggs', 'soy'],
    requiredEquipment: ['slow_cooker'],
    skillLevel: ['beginner', 'intermediate', 'advanced'],
    baseCost: 16.0,
    ingredients: [
      { name: 'Chicken breasts', amount: 2, unit: 'lbs', category: 'meat_seafood' },
      { name: 'Long grain rice', amount: 1.5, unit: 'cups', category: 'pantry' },
      { name: 'Chicken broth', amount: 3, unit: 'cups', category: 'canned' },
      { name: 'Cream of chicken soup', amount: 1, unit: 'can', category: 'canned' },
      { name: 'Frozen mixed vegetables', amount: 2, unit: 'cups', category: 'frozen' },
      { name: 'Onion powder', amount: 1, unit: 'tsp', category: 'spices' },
      { name: 'Garlic powder', amount: 1, unit: 'tsp', category: 'spices' },
    ],
    instructions: [
      'Spray slow cooker with non-stick spray.',
      'Place chicken breasts in bottom of slow cooker.',
      'In a bowl, mix rice, chicken broth, cream of chicken soup, onion powder, and garlic powder.',
      'Pour rice mixture over chicken.',
      'Cover and cook on low for 4 hours.',
      'In last 30 minutes, add frozen vegetables on top.',
      'Shred chicken with two forks before serving, mixing it with the rice.',
    ],
    whyItWorks: 'Minimal prep, maximum flavor. The mild taste and soft texture appeals to texture-sensitive kids.',
    kidFriendlyTips: [
      'Pick out veggies for very picky eaters, or serve them on the side',
      'The chicken is so tender it shreds easily',
      'Great for busy weeknight with almost no hands-on time',
    ],
    leftoverIdeas: [
      'Chicken and rice soup (add more broth)',
      'Stuffed peppers with the leftover mixture',
    ],
    tags: ['slow cooker', 'hands off', 'batch cook', 'freezer friendly'],
  },

  // ==========================================
  // ADVENTUROUS / LOW PICKY EATER
  // ==========================================
  {
    id: 'sheet_pan_teriyaki_salmon',
    name: 'Sheet Pan Teriyaki Salmon and Broccoli',
    description: 'Healthy, colorful dinner with sweet-savory glaze',
    prepTime: 10,
    cookTime: 20,
    servings: 4,
    difficulty: 'easy',
    category: 'quick',
    pickyEaterFriendly: ['mild', 'none'],
    dietaryRestrictions: [],
    avoidAllergies: ['peanuts', 'tree_nuts', 'eggs', 'milk', 'wheat'],
    requiredEquipment: [],
    skillLevel: ['beginner', 'intermediate', 'advanced'],
    baseCost: 22.0,
    ingredients: [
      { name: 'Salmon fillets', amount: 1.5, unit: 'lbs', category: 'meat_seafood' },
      { name: 'Broccoli florets', amount: 4, unit: 'cups', category: 'produce' },
      { name: 'Teriyaki sauce', amount: 0.5, unit: 'cup', category: 'condiments' },
      { name: 'Honey', amount: 2, unit: 'tbsp', category: 'condiments' },
      { name: 'Garlic', amount: 2, unit: 'cloves', category: 'produce' },
      { name: 'Sesame seeds', amount: 1, unit: 'tbsp', category: 'spices' },
      { name: 'White rice', amount: 2, unit: 'cups', category: 'pantry' },
    ],
    instructions: [
      'Preheat oven to 400°F. Cook rice according to package directions.',
      'Line a baking sheet with parchment paper.',
      'Place salmon fillets and broccoli florets on the sheet.',
      'In a small bowl, mix teriyaki sauce, honey, and minced garlic.',
      'Brush salmon generously with teriyaki mixture.',
      'Roast for 15-18 minutes until salmon flakes easily with a fork.',
      'Sprinkle with sesame seeds and serve over rice.',
    ],
    whyItWorks: 'Sweet teriyaki sauce makes vegetables and fish more appealing. Minimal cleanup with sheet pan cooking.',
    kidFriendlyTips: [
      'Let kids sprinkle sesame seeds as their "job"',
      'Serve extra teriyaki on the side for dipping',
      'Start with small portions of broccoli, praising each bite',
    ],
    leftoverIdeas: [
      'Salmon fried rice the next day',
      'Flake salmon over salad for lunch',
    ],
    tags: ['sheet pan', 'healthy', 'omega 3', 'quick'],
  },

  {
    id: 'one_pot_pasta_primavera',
    name: 'One-Pot Creamy Pasta Primavera',
    description: 'Colorful vegetable pasta that cooks all in one pot',
    prepTime: 10,
    cookTime: 15,
    servings: 4,
    difficulty: 'easy',
    category: 'one_pot',
    pickyEaterFriendly: ['mild', 'none'],
    dietaryRestrictions: ['vegetarian'],
    avoidAllergies: ['peanuts', 'tree_nuts', 'fish', 'shellfish', 'eggs', 'soy'],
    requiredEquipment: [],
    skillLevel: ['beginner', 'intermediate', 'advanced'],
    baseCost: 12.0,
    ingredients: [
      { name: 'Penne pasta', amount: 1, unit: 'lb', category: 'pantry' },
      { name: 'Cherry tomatoes', amount: 2, unit: 'cups', category: 'produce' },
      { name: 'Zucchini', amount: 2, unit: 'medium', category: 'produce' },
      { name: 'Bell pepper', amount: 1, unit: 'whole', category: 'produce' },
      { name: 'Garlic', amount: 3, unit: 'cloves', category: 'produce' },
      { name: 'Heavy cream', amount: 1, unit: 'cup', category: 'dairy' },
      { name: 'Parmesan cheese', amount: 1, unit: 'cup', category: 'dairy' },
      { name: 'Vegetable broth', amount: 3, unit: 'cups', category: 'canned' },
      { name: 'Italian seasoning', amount: 1, unit: 'tsp', category: 'spices' },
    ],
    instructions: [
      'In a large pot, combine pasta, cherry tomatoes, diced zucchini, diced bell pepper, minced garlic, and broth.',
      'Bring to a boil, then reduce to simmer. Cook 12-15 minutes, stirring occasionally, until pasta is tender.',
      'Stir in heavy cream, Parmesan cheese, and Italian seasoning.',
      'Cook 2 more minutes until creamy and cheese is melted.',
      'Season with salt and pepper to taste. Serve immediately.',
    ],
    whyItWorks: 'Vegetables cook right into the pasta, breaking down and blending into the creamy sauce. Colors make it visually appealing.',
    kidFriendlyTips: [
      'Dice vegetables very small for picky eaters',
      'Add more cheese for hesitant veggie eaters',
      'Let it cool slightly - creamy pasta is easier to eat when not piping hot',
    ],
    leftoverIdeas: [
      'Bake leftovers with mozzarella on top for pasta bake',
      'Great cold as pasta salad',
    ],
    tags: ['one pot', 'vegetarian', 'colorful', 'quick'],
  },

  // ==========================================
  // BATCH COOKING / MAKE AHEAD
  // ==========================================
  {
    id: 'slow_cooker_pulled_chicken',
    name: 'Slow Cooker BBQ Pulled Chicken',
    description: 'Tender shredded chicken perfect for sandwiches, bowls, or wraps',
    prepTime: 5,
    cookTime: 360,
    servings: 8,
    difficulty: 'easy',
    category: 'batch_cook',
    pickyEaterFriendly: ['severe', 'moderate', 'mild', 'none'],
    dietaryRestrictions: [],
    avoidAllergies: ['peanuts', 'tree_nuts', 'fish', 'shellfish', 'eggs', 'milk', 'soy'],
    requiredEquipment: ['slow_cooker'],
    skillLevel: ['beginner', 'intermediate', 'advanced'],
    baseCost: 18.0,
    ingredients: [
      { name: 'Chicken breasts', amount: 3, unit: 'lbs', category: 'meat_seafood' },
      { name: 'BBQ sauce', amount: 2, unit: 'cups', category: 'condiments' },
      { name: 'Apple cider vinegar', amount: 0.25, unit: 'cup', category: 'condiments' },
      { name: 'Brown sugar', amount: 2, unit: 'tbsp', category: 'pantry' },
      { name: 'Hamburger buns', amount: 8, unit: 'count', category: 'bakery' },
      { name: 'Coleslaw', amount: 2, unit: 'cups', category: 'produce' },
    ],
    instructions: [
      'Place chicken breasts in slow cooker.',
      'In a bowl, mix BBQ sauce, apple cider vinegar, and brown sugar.',
      'Pour sauce over chicken.',
      'Cook on low for 6 hours or high for 3-4 hours.',
      'Shred chicken with two forks right in the slow cooker.',
      'Mix shredded chicken with sauce.',
      'Serve on buns with coleslaw on top or on the side.',
    ],
    whyItWorks: 'Makes a huge batch that freezes beautifully. Sweet BBQ sauce appeals to kids, and they can customize toppings.',
    kidFriendlyTips: [
      'Serve sauce on the side for sauce-sensitive kids',
      'Try in lettuce wraps for no-bread option',
      'Freeze individual portions for quick lunches',
    ],
    leftoverIdeas: [
      'BBQ chicken pizza',
      'Quesadillas with cheese',
      'Over baked potatoes',
    ],
    tags: ['slow cooker', 'batch cook', 'freezer friendly', 'versatile'],
  },

  {
    id: 'instant_pot_chili',
    name: 'Family-Friendly Instant Pot Chili',
    description: 'Hearty, mildly spiced chili ready in under 30 minutes',
    prepTime: 10,
    cookTime: 20,
    servings: 8,
    difficulty: 'easy',
    category: 'batch_cook',
    pickyEaterFriendly: ['moderate', 'mild', 'none'],
    dietaryRestrictions: [],
    avoidAllergies: ['peanuts', 'tree_nuts', 'fish', 'shellfish', 'eggs', 'milk', 'soy'],
    requiredEquipment: ['instant_pot'],
    skillLevel: ['beginner', 'intermediate', 'advanced'],
    baseCost: 16.0,
    ingredients: [
      { name: 'Ground beef', amount: 2, unit: 'lbs', category: 'meat_seafood' },
      { name: 'Kidney beans', amount: 2, unit: 'cans', category: 'canned' },
      { name: 'Diced tomatoes', amount: 2, unit: 'cans', category: 'canned' },
      { name: 'Tomato sauce', amount: 1, unit: 'can', category: 'canned' },
      { name: 'Onion', amount: 1, unit: 'large', category: 'produce' },
      { name: 'Chili powder', amount: 2, unit: 'tbsp', category: 'spices' },
      { name: 'Cumin', amount: 1, unit: 'tsp', category: 'spices' },
      { name: 'Cheddar cheese', amount: 1, unit: 'cup', category: 'dairy' },
      { name: 'Sour cream', amount: 0.5, unit: 'cup', category: 'dairy' },
    ],
    instructions: [
      'Set Instant Pot to sauté mode. Brown ground beef with diced onion until meat is cooked through.',
      'Drain excess fat.',
      'Add drained beans, diced tomatoes, tomato sauce, chili powder, and cumin. Stir to combine.',
      'Close lid and set to high pressure for 10 minutes.',
      'Natural release for 10 minutes, then quick release remaining pressure.',
      'Serve with shredded cheese and sour cream on top.',
    ],
    whyItWorks: 'Mild enough for kids, customizable toppings, and makes enough to freeze for easy future dinners.',
    kidFriendlyTips: [
      'Reduce chili powder for very sensitive palates',
      'Serve over rice or pasta for picky eaters',
      'Top with cheese to make it more familiar',
    ],
    leftoverIdeas: [
      'Chili cheese fries',
      'Chili dogs',
      'Freezes perfectly for up to 3 months',
    ],
    tags: ['instant pot', 'batch cook', 'freezer friendly', 'comfort food'],
  },

  // ==========================================
  // QUICK WEEKNIGHT MEALS
  // ==========================================
  {
    id: 'stir_fry_chicken_veggies',
    name: '15-Minute Chicken Stir-Fry',
    description: 'Quick and colorful stir-fry with simple flavors',
    prepTime: 10,
    cookTime: 10,
    servings: 4,
    difficulty: 'easy',
    category: 'quick',
    pickyEaterFriendly: ['mild', 'none'],
    dietaryRestrictions: [],
    avoidAllergies: ['peanuts', 'tree_nuts', 'fish', 'shellfish', 'eggs', 'milk'],
    requiredEquipment: [],
    skillLevel: ['beginner', 'intermediate', 'advanced'],
    baseCost: 15.0,
    ingredients: [
      { name: 'Chicken breast', amount: 1, unit: 'lb', category: 'meat_seafood' },
      { name: 'Frozen stir-fry vegetables', amount: 4, unit: 'cups', category: 'frozen' },
      { name: 'Soy sauce', amount: 0.25, unit: 'cup', category: 'condiments' },
      { name: 'Honey', amount: 2, unit: 'tbsp', category: 'condiments' },
      { name: 'Garlic', amount: 2, unit: 'cloves', category: 'produce' },
      { name: 'Ginger', amount: 1, unit: 'tsp', category: 'spices' },
      { name: 'White rice', amount: 2, unit: 'cups', category: 'pantry' },
      { name: 'Vegetable oil', amount: 2, unit: 'tbsp', category: 'pantry' },
    ],
    instructions: [
      'Cook rice according to package directions.',
      'Cut chicken into bite-sized pieces.',
      'In a small bowl, mix soy sauce, honey, minced garlic, and ginger.',
      'Heat oil in a large skillet or wok over high heat.',
      'Add chicken and cook 5 minutes until golden.',
      'Add frozen vegetables and sauce. Stir-fry 5 minutes until veggies are tender-crisp.',
      'Serve over rice.',
    ],
    whyItWorks: 'Sweet honey-soy sauce appeals to kids. Using frozen veggies makes it super quick.',
    kidFriendlyTips: [
      'Choose mild stir-fry mix without strange vegetables',
      'Cut chicken extra small for little ones',
      'Extra sauce on the side for dipping',
    ],
    leftoverIdeas: [
      'Fried rice tomorrow night',
      'Wrap in tortilla for lunch',
    ],
    tags: ['quick', '15 minute', 'weeknight', 'one pan'],
  },

  {
    id: 'breakfast_for_dinner',
    name: 'Breakfast for Dinner: Pancakes and Scrambled Eggs',
    description: 'Fun twist on dinner with favorite breakfast foods',
    prepTime: 10,
    cookTime: 15,
    servings: 4,
    difficulty: 'easy',
    category: 'quick',
    pickyEaterFriendly: ['severe', 'moderate', 'mild', 'none'],
    dietaryRestrictions: ['vegetarian'],
    avoidAllergies: ['peanuts', 'tree_nuts', 'fish', 'shellfish', 'soy'],
    requiredEquipment: [],
    skillLevel: ['beginner', 'intermediate', 'advanced'],
    baseCost: 10.0,
    ingredients: [
      { name: 'Pancake mix', amount: 2, unit: 'cups', category: 'pantry' },
      { name: 'Milk', amount: 1.5, unit: 'cups', category: 'dairy' },
      { name: 'Eggs', amount: 8, unit: 'whole', category: 'dairy' },
      { name: 'Butter', amount: 3, unit: 'tbsp', category: 'dairy' },
      { name: 'Maple syrup', amount: 0.5, unit: 'cup', category: 'condiments' },
      { name: 'Fruit', amount: 2, unit: 'cups', category: 'produce' },
    ],
    instructions: [
      'Mix pancake batter according to package directions.',
      'Heat griddle or large skillet over medium heat with butter.',
      'Pour batter to make 4-inch pancakes. Cook until bubbles form, then flip.',
      'Meanwhile, whisk eggs with a splash of milk, salt, and pepper.',
      'In another pan, scramble eggs over medium-low heat until fluffy.',
      'Serve pancakes with syrup and fruit, scrambled eggs on the side.',
    ],
    whyItWorks: 'Kids love "rules broken" - breakfast for dinner is exciting! Both are familiar, safe foods.',
    kidFriendlyTips: [
      'Let kids help pour batter or whisk eggs',
      'Make pancakes into fun shapes',
      'Add chocolate chips to some pancakes for a treat',
    ],
    leftoverIdeas: [
      'Freeze pancakes for quick breakfasts',
      'Egg sandwich for lunch',
    ],
    tags: ['breakfast for dinner', 'kid favorite', 'quick', 'fun'],
  },
];

/**
 * Filter recipes by various criteria
 */
export function filterRecipes(params: {
  pickyEaterLevel: PickyEaterLevel;
  dietaryRestrictions: DietaryRestriction[];
  allergies: Allergy[];
  maxCookTime: number;
  skillLevel: CookingSkillLevel;
  availableEquipment: KitchenEquipment[];
}): RecipeTemplate[] {
  const {
    pickyEaterLevel,
    dietaryRestrictions,
    allergies,
    maxCookTime,
    skillLevel,
    availableEquipment,
  } = params;

  return RECIPE_TEMPLATES.filter((recipe) => {
    // Check picky eater compatibility
    if (!recipe.pickyEaterFriendly.includes(pickyEaterLevel)) {
      return false;
    }

    // Check dietary restrictions (recipe must be compatible with ALL restrictions)
    if (dietaryRestrictions.length > 0) {
      const isCompatible = dietaryRestrictions.every((restriction) =>
        recipe.dietaryRestrictions.includes(restriction)
      );
      if (!isCompatible) {
        return false;
      }
    }

    // Check allergies (recipe must avoid ALL specified allergies)
    if (allergies.length > 0) {
      const avoidsAllAllergies = allergies.every((allergy) =>
        recipe.avoidAllergies.includes(allergy)
      );
      if (!avoidsAllAllergies) {
        return false;
      }
    }

    // Check cooking time (prep + cook time)
    const totalTime = recipe.prepTime + recipe.cookTime;
    if (totalTime > maxCookTime) {
      return false;
    }

    // Check skill level
    if (!recipe.skillLevel.includes(skillLevel)) {
      return false;
    }

    // Check required equipment
    const hasAllEquipment = recipe.requiredEquipment.every((equipment) =>
      availableEquipment.includes(equipment)
    );
    if (!hasAllEquipment && recipe.requiredEquipment.length > 0) {
      return false;
    }

    return true;
  });
}
