import type { FoodCategory } from '@/types';

const SUGGESTIONS: Array<{ match: RegExp; units: string[]; category?: FoodCategory }> = [
  { match: /\b(milk|cream|half\s*&\s*half|half\s*and\s*half|buttermilk)\b/i,
    units: ['gal', '½ gal', 'qt', 'pt', 'L'], category: 'dairy' },
  { match: /\b(juice|lemonade|kombucha|soda|sparkling|tea|coffee)\b/i,
    units: ['bottles', 'gal', 'qt', 'L', 'cans'], category: 'snack' },
  { match: /\b(water)\b/i, units: ['bottles', 'gal', 'case'], category: 'snack' },
  { match: /\b(yogurt|sour cream|cottage cheese|ricotta|cream cheese)\b/i,
    units: ['containers', 'oz', 'lbs'], category: 'dairy' },
  { match: /\b(cheese|mozzarella|cheddar|parmesan|gouda|feta|brie)\b/i,
    units: ['oz', 'lbs', 'blocks', 'slices'], category: 'dairy' },
  { match: /\b(butter|ghee)\b/i, units: ['sticks', 'lbs', 'oz'], category: 'dairy' },
  { match: /\b(egg|eggs)\b/i, units: ['dozen', 'ct'], category: 'protein' },
  { match: /\b(chicken|beef|pork|turkey|lamb|bison|venison|steak|ground|sausage|bacon|ham|hot dog|meatball)\b/i,
    units: ['lbs', 'oz', 'packs'], category: 'protein' },
  { match: /\b(salmon|tuna|shrimp|fish|tilapia|cod|crab|lobster|scallop|clam|mussel)\b/i,
    units: ['lbs', 'oz', 'fillets'], category: 'protein' },
  { match: /\b(tofu|tempeh)\b/i, units: ['blocks', 'oz'], category: 'protein' },
  { match: /\b(apple|banana|orange|pear|peach|plum|mango|kiwi|lemon|lime|avocado|nectarine|apricot|clementine|tangerine|grapefruit)\b/i,
    units: ['ct', 'lbs', 'bag'], category: 'fruit' },
  { match: /\b(grape|strawberr|blueberr|raspberr|blackberr|cranberr|cherry|cherries)\b/i,
    units: ['containers', 'lbs', 'pints'], category: 'fruit' },
  { match: /\b(watermelon|cantaloupe|honeydew|pineapple|papaya)\b/i,
    units: ['ct'], category: 'fruit' },
  { match: /\b(bread|bagel|roll|bun|pita|tortilla|wrap|croissant|biscuit|english muffin|loaf)\b/i,
    units: ['loaves', 'packs', 'ct'], category: 'carb' },
  { match: /\b(rice|pasta|noodle|quinoa|couscous|barley|farro|oat|oatmeal|cereal|granola|flour)\b/i,
    units: ['boxes', 'bags', 'lbs', 'oz'], category: 'carb' },
  { match: /\b(cracker|chip|pretzel|popcorn)\b/i,
    units: ['bags', 'boxes', 'oz'], category: 'carb' },
  { match: /\b(potato|sweet potato|onion|garlic|carrot|celery)\b/i,
    units: ['lbs', 'bag', 'ct', 'bunch'], category: 'vegetable' },
  { match: /\b(lettuce|spinach|kale|arugula|romaine|cabbage|chard|collard|bok choy|salad)\b/i,
    units: ['head', 'bag', 'oz'], category: 'vegetable' },
  { match: /\b(broccoli|cauliflower|brussels sprout|asparagus|green bean|pea|corn|zucchini|squash|eggplant|artichoke|beet|radish|turnip|leek|mushroom)\b/i,
    units: ['lbs', 'bag', 'ct', 'bunch'], category: 'vegetable' },
  { match: /\b(tomato|cucumber|pepper)\b/i,
    units: ['ct', 'lbs', 'bag'], category: 'vegetable' },
  { match: /\b(cilantro|parsley|basil|dill|mint|rosemary|thyme|sage|oregano|chive|scallion|shallot|ginger)\b/i,
    units: ['bunch', 'oz'], category: 'vegetable' },
  { match: /\b(almond|cashew|walnut|pecan|peanut|pistachio|macadamia|hazelnut|mixed nut|trail mix)\b/i,
    units: ['bags', 'oz', 'lbs'], category: 'snack' },
  { match: /\b(cookie|candy|chocolate|gummy|snack bar|granola bar|fruit snack|pudding|jello|ice cream|gelato)\b/i,
    units: ['boxes', 'bags', 'ct'], category: 'snack' },
  { match: /\b(peanut butter|almond butter|jelly|jam|honey|syrup|ketchup|mustard|mayo|mayonnaise|ranch|dressing|salsa|hummus|sauce|vinegar|soy sauce|oil)\b/i,
    units: ['jars', 'bottles', 'oz'], category: 'snack' },
  { match: /\b(salt|pepper|sugar|spice|seasoning)\b/i,
    units: ['containers', 'oz', 'lbs'], category: 'snack' },
];

const DEFAULT_UNITS = ['ct', 'lbs', 'oz', 'packs', 'bags', 'boxes', 'bottles', 'cans', 'jars', 'bunch'];

export function suggestUnits(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return DEFAULT_UNITS.slice(0, 6);
  const hit = SUGGESTIONS.find(s => s.match.test(trimmed));
  return hit ? hit.units : DEFAULT_UNITS.slice(0, 6);
}

export function suggestCategory(name: string): FoodCategory | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const hit = SUGGESTIONS.find(s => s.match.test(trimmed));
  return hit?.category ?? null;
}

export const ALL_UNIT_OPTIONS = [
  'ct', 'lbs', 'oz', 'g', 'kg',
  'gal', '½ gal', 'qt', 'pt', 'cups', 'L', 'ml',
  'dozen', 'packs', 'bags', 'boxes', 'bottles', 'cans', 'jars',
  'bunch', 'head', 'loaves', 'sticks', 'slices', 'blocks', 'fillets',
  'containers', 'cartons',
] as const;

export const CATEGORIES: Array<{ key: FoodCategory; label: string; emoji: string }> = [
  { key: 'protein', label: 'Protein', emoji: '🥩' },
  { key: 'carb', label: 'Carbs', emoji: '🍞' },
  { key: 'dairy', label: 'Dairy', emoji: '🥛' },
  { key: 'fruit', label: 'Fruit', emoji: '🍎' },
  { key: 'vegetable', label: 'Veggies', emoji: '🥦' },
  { key: 'snack', label: 'Snacks', emoji: '🍫' },
];
