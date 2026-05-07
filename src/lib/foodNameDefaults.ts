import type { FoodCategory } from '@/types';

/**
 * US-288 / US-279 port: catalog of "if the user types this product name,
 * default the unit + qty to this" rules. Mirrors `ios/EatPal/EatPal/Utilities/
 * UnitInference.swift` so cross-platform pantry quick-adds default to the same
 * shape (eggs → dozen, milk → gal, rice → bag).
 *
 * Used by `pantryQuickAddParser` when the user types a bare name with no
 * explicit qty/unit. Returns `null` when no rule matches — caller falls back
 * to the keyword classifier defaults ("count", 1).
 *
 * Order matters: more specific entries come first ("ice cream" before
 * generic "cream") so substring matching picks the right rule.
 */

export interface FoodNameDefault {
  unit: string;
  quantity: number;
  /** Optional category hint when the name strongly implies one. */
  category?: FoodCategory;
}

const RULES: { keywords: string[]; def: FoodNameDefault }[] = [
  // Eggs almost always sold by the dozen.
  { keywords: ['egg ', 'eggs'], def: { unit: 'dozen', quantity: 1, category: 'protein' } },

  // Dairy beverages → gallon for milk, half-gallon for cream.
  {
    keywords: ['whole milk', 'skim milk', 'almond milk', 'oat milk', 'soy milk', 'coconut milk drink'],
    def: { unit: 'gal', quantity: 1, category: 'dairy' },
  },
  { keywords: ['milk'], def: { unit: 'gal', quantity: 1, category: 'dairy' } },
  { keywords: ['heavy cream', 'half and half', 'half-and-half'], def: { unit: 'pt', quantity: 1, category: 'dairy' } },
  { keywords: ['yogurt'], def: { unit: 'oz', quantity: 32, category: 'dairy' } },
  { keywords: ['cottage cheese', 'ricotta'], def: { unit: 'oz', quantity: 16, category: 'dairy' } },
  { keywords: ['sour cream'], def: { unit: 'oz', quantity: 16, category: 'dairy' } },

  // Cheeses by package.
  { keywords: ['sliced cheese', 'shredded cheese'], def: { unit: 'pack', quantity: 1, category: 'dairy' } },
  { keywords: ['block cheese', 'cheddar', 'mozzarella', 'parmesan'], def: { unit: 'oz', quantity: 8, category: 'dairy' } },

  // Nut butters / preserves before "butter" so "peanut butter" doesn't match
  // the more generic dairy-butter rule (substring match, first-match-wins).
  { keywords: ['peanut butter', 'almond butter', 'jam', 'jelly', 'preserves'], def: { unit: 'jar', quantity: 1 } },

  // Butter.
  { keywords: ['butter'], def: { unit: 'lb', quantity: 1, category: 'dairy' } },

  // Proteins by weight.
  { keywords: ['ground beef', 'ground turkey', 'ground pork', 'ground chicken'], def: { unit: 'lb', quantity: 1, category: 'protein' } },
  { keywords: ['chicken breast', 'chicken thigh', 'chicken leg'], def: { unit: 'lb', quantity: 2, category: 'protein' } },
  { keywords: ['chicken wing'], def: { unit: 'lb', quantity: 2, category: 'protein' } },
  { keywords: ['bacon'], def: { unit: 'pack', quantity: 1, category: 'protein' } },
  { keywords: ['sausage', 'hot dog', 'bratwurst'], def: { unit: 'pack', quantity: 1, category: 'protein' } },
  { keywords: ['salmon', 'tuna steak', 'cod', 'tilapia', 'halibut'], def: { unit: 'lb', quantity: 1, category: 'protein' } },
  { keywords: ['shrimp'], def: { unit: 'lb', quantity: 1, category: 'protein' } },
  { keywords: ['steak', 'ribeye', 'sirloin'], def: { unit: 'lb', quantity: 1, category: 'protein' } },

  // Bread + bakery.
  { keywords: ['bread', 'loaf'], def: { unit: 'loaf', quantity: 1, category: 'carb' } },
  { keywords: ['bagel'], def: { unit: 'pack', quantity: 1, category: 'carb' } },
  { keywords: ['english muffin', 'tortilla', 'pita'], def: { unit: 'pack', quantity: 1, category: 'carb' } },

  // Pantry staples.
  { keywords: ['rice'], def: { unit: 'bag', quantity: 1, category: 'carb' } },
  { keywords: ['flour', 'sugar'], def: { unit: 'lb', quantity: 5, category: 'carb' } },
  { keywords: ['pasta', 'spaghetti', 'penne', 'macaroni', 'lasagna noodle'], def: { unit: 'box', quantity: 1, category: 'carb' } },
  { keywords: ['oats', 'oatmeal', 'cereal', 'granola'], def: { unit: 'box', quantity: 1, category: 'carb' } },
  { keywords: ['coffee beans', 'ground coffee', 'coffee'], def: { unit: 'bag', quantity: 1 } },
  { keywords: ['tea'], def: { unit: 'box', quantity: 1 } },
  { keywords: ['honey', 'maple syrup', 'syrup', 'olive oil', 'vegetable oil', 'canola oil'], def: { unit: 'bottle', quantity: 1 } },
  { keywords: ['soy sauce', 'vinegar', 'ketchup', 'mustard', 'mayonnaise', 'mayo', 'hot sauce', 'salsa'], def: { unit: 'bottle', quantity: 1 } },

  // Canned goods.
  { keywords: ['canned tomato', 'diced tomato', 'crushed tomato', 'tomato sauce', 'tomato paste'], def: { unit: 'can', quantity: 2 } },
  { keywords: ['black bean', 'kidney bean', 'chickpea', 'garbanzo', 'pinto bean', 'white bean', 'refried bean'], def: { unit: 'can', quantity: 2 } },
  { keywords: ['chicken stock', 'beef stock', 'vegetable stock', 'broth'], def: { unit: 'can', quantity: 2 } },
  { keywords: ['coconut milk'], def: { unit: 'can', quantity: 1 } },
  { keywords: ['tuna can'], def: { unit: 'can', quantity: 2, category: 'protein' } },

  // Beverages.
  { keywords: ['water bottle', 'sparkling water', 'soda', 'soft drink'], def: { unit: 'pack', quantity: 1 } },
  { keywords: ['juice'], def: { unit: 'bottle', quantity: 1 } },
  { keywords: ['beer'], def: { unit: 'pack', quantity: 1 } },
  { keywords: ['wine'], def: { unit: 'bottle', quantity: 1 } },

  // Snacks.
  { keywords: ['chip', 'cracker', 'pretzel', 'popcorn'], def: { unit: 'bag', quantity: 1, category: 'snack' } },
  { keywords: ['cookie'], def: { unit: 'pack', quantity: 1, category: 'snack' } },
  { keywords: ['candy bar', 'chocolate bar'], def: { unit: 'pack', quantity: 1, category: 'snack' } },

  // Frozen.
  { keywords: ['frozen pizza'], def: { unit: 'box', quantity: 1 } },
  { keywords: ['ice cream'], def: { unit: 'pt', quantity: 1, category: 'snack' } },
  { keywords: ['frozen vegetable', 'frozen fruit', 'frozen berry'], def: { unit: 'bag', quantity: 1 } },

  // Produce — most "by count" but a few exceptions.
  { keywords: ['banana'], def: { unit: 'count', quantity: 6, category: 'fruit' } },
  { keywords: ['apple', 'orange', 'lemon', 'lime', 'pear', 'peach', 'plum'], def: { unit: 'count', quantity: 4, category: 'fruit' } },
  { keywords: ['potato', 'onion', 'garlic'], def: { unit: 'lb', quantity: 2, category: 'vegetable' } },
  { keywords: ['lettuce', 'spinach', 'kale', 'arugula'], def: { unit: 'bunch', quantity: 1, category: 'vegetable' } },
  { keywords: ['tomato'], def: { unit: 'count', quantity: 4, category: 'vegetable' } },
  { keywords: ['bell pepper', 'cucumber', 'zucchini', 'eggplant'], def: { unit: 'count', quantity: 2, category: 'vegetable' } },
];

/**
 * Look up a default unit + quantity for a product name. Substring match is
 * lower-cased; the first matching rule wins.
 */
export function inferFoodNameDefault(name: string): FoodNameDefault | null {
  const needle = name.toLowerCase().trim();
  if (!needle) return null;
  for (const { keywords, def } of RULES) {
    for (const kw of keywords) {
      if (needle.includes(kw)) return def;
    }
  }
  return null;
}
