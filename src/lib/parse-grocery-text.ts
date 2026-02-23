import type { FoodCategory } from '@/types';

export interface ParsedGroceryItem {
  name: string;
  quantity: number;
  unit: string;
  category: FoodCategory;
}

// Keyword dictionaries for category inference
const CATEGORY_KEYWORDS: Record<FoodCategory, string[]> = {
  protein: [
    'chicken', 'beef', 'pork', 'turkey', 'salmon', 'tuna', 'shrimp', 'fish',
    'steak', 'ground beef', 'bacon', 'sausage', 'ham', 'lamb', 'tofu', 'tempeh',
    'eggs', 'egg', 'meatball', 'hot dog', 'deli', 'jerky', 'bison', 'venison',
    'tilapia', 'cod', 'crab', 'lobster', 'scallop', 'clam', 'mussel', 'anchov',
  ],
  dairy: [
    'milk', 'cheese', 'yogurt', 'butter', 'cream', 'sour cream', 'cottage cheese',
    'mozzarella', 'cheddar', 'parmesan', 'ricotta', 'cream cheese', 'whipping cream',
    'half and half', 'half & half', 'ice cream', 'gelato', 'kefir', 'ghee',
  ],
  fruit: [
    'apple', 'banana', 'orange', 'grape', 'strawberr', 'blueberr', 'raspberr',
    'blackberr', 'mango', 'pineapple', 'watermelon', 'cantaloupe', 'honeydew',
    'peach', 'pear', 'plum', 'cherry', 'kiwi', 'lemon', 'lime', 'avocado',
    'coconut', 'pomegranate', 'fig', 'date', 'papaya', 'guava', 'clementine',
    'tangerine', 'grapefruit', 'nectarine', 'apricot', 'cranberr', 'melon',
  ],
  vegetable: [
    'broccoli', 'carrot', 'spinach', 'kale', 'lettuce', 'tomato', 'cucumber',
    'pepper', 'onion', 'garlic', 'potato', 'sweet potato', 'corn', 'pea',
    'green bean', 'celery', 'mushroom', 'zucchini', 'squash', 'cauliflower',
    'asparagus', 'artichoke', 'beet', 'cabbage', 'brussels sprout', 'eggplant',
    'radish', 'turnip', 'leek', 'arugula', 'chard', 'collard', 'bok choy',
    'jalapeno', 'salad', 'romaine', 'cilantro', 'parsley', 'basil', 'dill',
    'ginger', 'scallion', 'shallot',
  ],
  carb: [
    'bread', 'rice', 'pasta', 'noodle', 'tortilla', 'bagel', 'roll', 'bun',
    'cereal', 'oat', 'oatmeal', 'granola', 'flour', 'cracker', 'chip',
    'pita', 'wrap', 'couscous', 'quinoa', 'barley', 'farro', 'pancake mix',
    'waffle', 'english muffin', 'croissant', 'biscuit', 'cornbread',
    'pizza dough', 'pie crust', 'breadcrumb', 'pretzel', 'popcorn',
  ],
  snack: [
    'cookie', 'candy', 'chocolate', 'gummy', 'snack bar', 'granola bar',
    'fruit snack', 'pudding', 'jello', 'trail mix', 'nut', 'almond',
    'peanut butter', 'jelly', 'jam', 'honey', 'syrup', 'sugar', 'salt',
    'pepper', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'ranch',
    'salsa', 'hummus', 'dressing', 'sauce', 'oil', 'vinegar', 'soy sauce',
    'juice', 'soda', 'water', 'coffee', 'tea', 'sparkling', 'kombucha',
  ],
};

// Unit synonyms normalized to standard units
const UNIT_MAP: Record<string, string> = {
  lb: 'lbs', lbs: 'lbs', pound: 'lbs', pounds: 'lbs',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  g: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  gal: 'gal', gallon: 'gal', gallons: 'gal',
  qt: 'qt', quart: 'qt', quarts: 'qt',
  pt: 'pt', pint: 'pt', pints: 'pt',
  cup: 'cups', cups: 'cups',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  l: 'L', liter: 'L', liters: 'L', litre: 'L', litres: 'L',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml',
  bunch: 'bunch', bunches: 'bunch',
  bag: 'bags', bags: 'bags',
  box: 'boxes', boxes: 'boxes',
  can: 'cans', cans: 'cans',
  jar: 'jars', jars: 'jars',
  bottle: 'bottles', bottles: 'bottles',
  pack: 'packs', packs: 'packs', package: 'packs', packages: 'packs', pkg: 'packs',
  dozen: 'dozen', doz: 'dozen',
  ct: 'ct', count: 'ct',
  head: 'head', heads: 'head',
  loaf: 'loaves', loaves: 'loaves',
  stick: 'sticks', sticks: 'sticks',
  slice: 'slices', slices: 'slices',
  piece: 'pieces', pieces: 'pieces', pc: 'pieces', pcs: 'pieces',
  container: 'containers', containers: 'containers', tub: 'containers', tubs: 'containers',
  carton: 'cartons', cartons: 'cartons',
};

// Fraction map
const FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

function inferCategory(name: string): FoodCategory {
  const lower = name.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return category as FoodCategory;
    }
  }
  return 'snack'; // default fallback
}

function normalizeUnit(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return UNIT_MAP[lower] ?? raw.trim();
}

/**
 * Parse a quantity string that may contain fractions, unicode fractions, or "Nx" multiplier format.
 * Returns the numeric value, or 1 if unparseable.
 */
function parseQuantity(raw: string): number {
  const trimmed = raw.trim();

  // Unicode fraction alone (e.g. "½")
  if (FRACTIONS[trimmed] !== undefined) {
    return FRACTIONS[trimmed];
  }

  // Integer + unicode fraction (e.g. "1½")
  const unicodeFracMatch = trimmed.match(/^(\d+)\s*([\u00BC-\u00BE\u2150-\u215E])$/);
  if (unicodeFracMatch) {
    return parseInt(unicodeFracMatch[1]) + (FRACTIONS[unicodeFracMatch[2]] ?? 0);
  }

  // Text fraction "1/2", "3/4", possibly with whole number "1 1/2"
  const textFracMatch = trimmed.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (textFracMatch) {
    const whole = textFracMatch[1] ? parseInt(textFracMatch[1]) : 0;
    const numer = parseInt(textFracMatch[2]);
    const denom = parseInt(textFracMatch[3]);
    return denom > 0 ? whole + numer / denom : whole;
  }

  // Plain number (integer or decimal)
  const num = parseFloat(trimmed);
  if (!isNaN(num) && num > 0) return num;

  return 1;
}

// Regex to extract quantity + unit + name from a single line
// Handles: "2 lbs chicken", "3x Milk", "½ gallon milk", "chicken breast", "2 (12oz) cans tomatoes"
// Alternation order matters: most specific patterns first (whole+fraction before plain digit)
const QUANTITY_REGEX = /^(?:(\d+\s+\d+\/\d+|\d+[\u00BC-\u00BE\u2150-\u215E]|\d+\s*\/\s*\d+|[\u00BC-\u00BE\u2150-\u215E]|\d+\.?\d*)\s*[xX]?\s*)?(?:\([\d.]+\s*\w+\)\s*)?(\b(?:lbs?|pounds?|oz|ounces?|g|grams?|kg|kilos?|kilograms?|gal(?:lon)?s?|qt|quarts?|pt|pints?|cups?|tbsp|tablespoons?|tsp|teaspoons?|l|liters?|litres?|ml|milliliters?|bunch(?:es)?|bags?|box(?:es)?|cans?|jars?|bottles?|packs?|packages?|pkg|dozen|doz|ct|count|heads?|loaf|loaves|sticks?|slices?|pieces?|pc|pcs|containers?|tubs?|cartons?)\b)?\s*(.+)/i;

function parseLine(line: string): ParsedGroceryItem | null {
  // Clean the line: remove leading bullets, numbers, checkboxes
  let cleaned = line
    .replace(/^[\s]*[-•*▪▸►◆☐☑✓✔✗✘\u2022\u2023\u25E6\u2043\u2219]+\s*/, '') // bullets
    .replace(/^[\s]*\d+[\.\)]\s*/, '') // numbered: "1. " or "1) "
    .replace(/^\[[ xX]?\]\s*/, '') // checkboxes: "[ ] " or "[x] "
    .trim();

  if (!cleaned || cleaned.length < 2) return null;

  const match = cleaned.match(QUANTITY_REGEX);
  if (!match) return null;

  const rawQty = match[1] || '';
  const rawUnit = match[2] || '';
  const rawName = match[3] || cleaned;

  const name = rawName.trim();
  if (!name) return null;

  return {
    name,
    quantity: rawQty ? parseQuantity(rawQty) : 1,
    unit: rawUnit ? normalizeUnit(rawUnit) : '',
    category: inferCategory(name),
  };
}

/**
 * Parse a freeform grocery text into structured items.
 * Supports: bulleted lists, numbered lists, comma-separated, one-per-line.
 */
export function parseGroceryText(text: string): ParsedGroceryItem[] {
  if (!text || !text.trim()) return [];

  const trimmed = text.trim();

  // Detect if comma-separated (single line with commas, no newlines or very few)
  const newlineCount = (trimmed.match(/\n/g) || []).length;
  const commaCount = (trimmed.match(/,/g) || []).length;
  const isCommaSeparated = commaCount >= 2 && newlineCount === 0;

  let lines: string[];

  if (isCommaSeparated) {
    lines = trimmed.split(',').map(s => s.trim());
  } else {
    lines = trimmed.split(/\n/).map(s => s.trim());
  }

  const items: ParsedGroceryItem[] = [];
  const seenNames = new Set<string>();

  for (const line of lines) {
    if (!line) continue;
    const parsed = parseLine(line);
    if (parsed) {
      const key = parsed.name.toLowerCase();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        items.push(parsed);
      }
    }
  }

  return items;
}
