import type { FoodCategory } from '@/types';
import { ingredientMatchKey, sumQuantities } from '@/lib/groceryMerge';

export interface ParsedGroceryItem {
  name: string;
  quantity: number;
  unit: string;
  category: FoodCategory;
  /**
   * US-590: package size recovered from "1 (14.5 oz) can diced tomatoes" or
   * "1 15-ounce can black beans". Previously discarded, which turned a
   * specific "one 14.5oz can" into an ambiguous "1 can".
   */
  packageSize?: { quantity: number; unit: string };
}

/**
 * Keyword dictionaries for category inference.
 *
 * US-591: matching is whole-word (with optional plural/`y` suffix), not raw
 * substring, and the flattened rule list is tried longest-keyword-first so the
 * most specific rule wins. Before this, `includes()` filed "graham crackers"
 * under protein (substring "ham"), "peanut butter" under dairy (substring
 * "butter", checked before snack) and "hamburger buns" under protein.
 */
const CATEGORY_KEYWORDS: Record<FoodCategory, string[]> = {
  protein: [
    'chicken',
    'beef',
    'pork',
    'turkey',
    'salmon',
    'tuna',
    'shrimp',
    'fish',
    'steak',
    'ground beef',
    'bacon',
    'sausage',
    'ham',
    'lamb',
    'tofu',
    'tempeh',
    'eggs',
    'egg',
    'meatball',
    'hot dog',
    'deli',
    'jerky',
    'bison',
    'venison',
    'tilapia',
    'cod',
    'crab',
    'lobster',
    'scallop',
    'clam',
    'mussel',
    'anchov',
  ],
  dairy: [
    // Closed compounds need their own entry: word-boundary matching correctly
    // refuses to see "milk" inside "buttermilk" (which is what stops "ham"
    // matching "graham"), so the compound itself must be listed.
    'buttermilk',
    'milk',
    'cheese',
    'yogurt',
    'butter',
    'cream',
    'sour cream',
    'cottage cheese',
    'mozzarella',
    'cheddar',
    'parmesan',
    'ricotta',
    'cream cheese',
    'whipping cream',
    'half and half',
    'half & half',
    'ice cream',
    'gelato',
    'kefir',
    'ghee',
  ],
  fruit: [
    'apple',
    'banana',
    'orange',
    'grape',
    'strawberr',
    'blueberr',
    'raspberr',
    'blackberr',
    'mango',
    'pineapple',
    'watermelon',
    'cantaloupe',
    'honeydew',
    'peach',
    'pear',
    'plum',
    'cherry',
    'kiwi',
    'lemon',
    'lime',
    'avocado',
    'coconut',
    'pomegranate',
    'fig',
    'date',
    'papaya',
    'guava',
    'clementine',
    'tangerine',
    'grapefruit',
    'nectarine',
    'apricot',
    'cranberr',
    'melon',
  ],
  vegetable: [
    'broccoli',
    'carrot',
    'spinach',
    'kale',
    'lettuce',
    'tomato',
    'cucumber',
    'pepper',
    'bell pepper',
    'onion',
    'garlic',
    'potato',
    'sweet potato',
    'corn',
    'pea',
    'green bean',
    'celery',
    'mushroom',
    'zucchini',
    'squash',
    'cauliflower',
    'asparagus',
    'artichoke',
    'beet',
    'cabbage',
    'brussels sprout',
    'eggplant',
    'radish',
    'turnip',
    'leek',
    'arugula',
    'chard',
    'collard',
    'bok choy',
    'jalapeno',
    'salad',
    'romaine',
    'cilantro',
    'parsley',
    'basil',
    'dill',
    'ginger',
    'scallion',
    'shallot',
  ],
  carb: [
    'bread',
    'rice',
    'pasta',
    'noodle',
    'tortilla',
    'bagel',
    'roll',
    'bun',
    'cereal',
    'oat',
    'oatmeal',
    'granola',
    'flour',
    'cracker',
    'chip',
    'pita',
    'wrap',
    'couscous',
    'quinoa',
    'barley',
    'farro',
    'pancake mix',
    'waffle',
    'english muffin',
    'croissant',
    'biscuit',
    'cornbread',
    'pizza dough',
    'pie crust',
    'breadcrumb',
    'pretzel',
    'popcorn',
    // Closed compounds — see the dairy note above.
    'flatbread',
    'sourdough',
    'cornmeal',
  ],
  snack: [
    'cookie',
    'candy',
    'chocolate',
    'gummy',
    'snack bar',
    'granola bar',
    'fruit snack',
    'pudding',
    'jello',
    'trail mix',
    'nut',
    'almond',
    'peanut butter',
    'almond butter',
    'jelly',
    'jam',
    'honey',
    'syrup',
    'sugar',
    'salt',
    'ketchup',
    'mustard',
    'mayo',
    'mayonnaise',
    'ranch',
    'salsa',
    'hummus',
    'dressing',
    'sauce',
    'oil',
    'vinegar',
    'soy sauce',
    'juice',
    'soda',
    'water',
    'coffee',
    'tea',
    'sparkling',
    'kombucha',
    // US-591: seasoning phrasings that must beat the bare "pepper" vegetable
    // rule, so "salt and pepper to taste" isn't filed as produce.
    'salt and pepper',
    'black pepper',
    'ground pepper',
    'peppercorn',
    'spice',
    'seasoning',
  ],
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Flat, longest-keyword-first rule list. Length ordering is what makes
 * "peanut butter" beat "butter" and "ground beef" beat "beef" without needing
 * a hand-maintained priority column.
 */
const CATEGORY_RULES: Array<{ re: RegExp; category: FoodCategory }> = (() => {
  const flat: Array<{ kw: string; category: FoodCategory }> = [];
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) flat.push({ kw, category: category as FoodCategory });
  }
  flat.sort((a, b) => b.kw.length - a.kw.length);
  return flat.map(({ kw, category }) => ({
    // `(?:^|[^a-z])` + `(?![a-z])` gives word-boundary behaviour that also
    // rejects "graham"/"hamburger" for the keyword "ham". The optional
    // suffix group lets stems like "strawberr" match strawberry/strawberries.
    re: new RegExp(`(?:^|[^a-z])${escapeRegExp(kw)}(?:s|es|ies|y)?(?![a-z])`, 'i'),
    category,
  }));
})();

/**
 * Unit synonyms → canonical form.
 *
 * US-583: canonical is the SINGULAR noun, matching iOS
 * `IngredientTextParser.unitTokens` and `UnitInference`. The parser used to
 * emit plurals ("lbs", "cans") while the pantry stored singulars, and
 * `unitNormalize` only understood the latter — so two quantities of the same
 * unit compared as `incomparable` and never stacked.
 */
const UNIT_MAP: Record<string, string> = {
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  'fl oz': 'fl oz',
  floz: 'fl oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  g: 'g',
  gram: 'g',
  grams: 'g',
  gm: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  mg: 'mg',
  milligram: 'mg',
  milligrams: 'mg',
  gal: 'gal',
  gallon: 'gal',
  gallons: 'gal',
  qt: 'qt',
  quart: 'qt',
  quarts: 'qt',
  pt: 'pt',
  pint: 'pt',
  pints: 'pt',
  cup: 'cup',
  cups: 'cup',
  c: 'cup',
  tbsp: 'tbsp',
  tbsps: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbs: 'tbsp',
  tbl: 'tbsp',
  tsp: 'tsp',
  tsps: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  t: 'tsp',
  l: 'l',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  bunch: 'bunch',
  bunches: 'bunch',
  bag: 'bag',
  bags: 'bag',
  box: 'box',
  boxes: 'box',
  can: 'can',
  cans: 'can',
  jar: 'jar',
  jars: 'jar',
  bottle: 'bottle',
  bottles: 'bottle',
  pack: 'pack',
  packs: 'pack',
  package: 'pack',
  packages: 'pack',
  pkg: 'pack',
  pkgs: 'pack',
  dozen: 'dozen',
  doz: 'dozen',
  ct: 'ct',
  count: 'ct',
  head: 'head',
  heads: 'head',
  loaf: 'loaf',
  loaves: 'loaf',
  stick: 'stick',
  sticks: 'stick',
  slice: 'slice',
  slices: 'slice',
  piece: 'piece',
  pieces: 'piece',
  pc: 'piece',
  pcs: 'piece',
  container: 'container',
  containers: 'container',
  tub: 'container',
  tubs: 'container',
  carton: 'carton',
  cartons: 'carton',
  // US-590: recipe-scale units the old regex had no entry for, so "2 cloves
  // garlic" left "cloves" stuck on the front of the ingredient name.
  clove: 'clove',
  cloves: 'clove',
  stalk: 'stalk',
  stalks: 'stalk',
  sprig: 'sprig',
  sprigs: 'sprig',
  pinch: 'pinch',
  pinches: 'pinch',
  dash: 'dash',
  dashes: 'dash',
  drop: 'drop',
  drops: 'drop',
  block: 'block',
  blocks: 'block',
  fillet: 'fillet',
  fillets: 'fillet',
  filet: 'fillet',
  filets: 'fillet',
};

/** Unicode vulgar fractions → decimal. */
const FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

/**
 * Word-form numbers. Speech-to-text and hand-typed lists both produce these
 * ("a dozen eggs", "two pounds of chicken").
 */
const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  half: 0.5,
  quarter: 0.25,
};

/**
 * Descriptor words stripped from the front of a name so the grocery list shows
 * the noun rather than the preparation. Mirrors iOS
 * `IngredientTextParser.leadingFillers`, plus the connectives the web parser
 * left behind ("1 head of lettuce" → "of lettuce").
 */
const LEADING_FILLERS = new Set<string>([
  'of',
  'the',
  'whole',
  'fresh',
  'freshly',
  'ripe',
  'raw',
  'cooked',
  'large',
  'small',
  'medium',
  'extra',
  'x-large',
  'xl',
  'jumbo',
  'organic',
  'free-range',
  'free',
  'range',
  'boneless',
  'skinless',
  'lean',
  'frozen',
  'thawed',
  'canned',
  'dried',
  'chopped',
  'diced',
  'minced',
  'sliced',
  'shredded',
  'grated',
  // NOTE: "ground" is deliberately NOT a filler. iOS strips it, but doing so
  // turns "ground beef" into "beef" and "ground coffee" into "coffee" — the
  // word is load-bearing in a grocery name far more often than it is noise.
  'crushed',
  'peeled',
  'halved',
  'quartered',
  'softened',
  'melted',
  'cubed',
  'julienned',
]);

function inferCategory(name: string): FoodCategory {
  const lower = name.toLowerCase();
  for (const { re, category } of CATEGORY_RULES) {
    if (re.test(lower)) return category;
  }
  return 'snack';
}

function normalizeUnitToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Case-sensitive cooking convention: bare "T" is tablespoon, "t" teaspoon.
  if (trimmed === 'T') return 'tbsp';
  const lower = trimmed.toLowerCase().replace(/\.$/, '');
  return UNIT_MAP[lower] ?? null;
}

/**
 * Consume a leading quantity from `tokens`, mutating it.
 *
 * US-590: ported from iOS `IngredientTextParser.extractQuantity` so both
 * platforms agree. Handles plain integers/decimals, unicode fractions,
 * ASCII fractions, mixed numbers ("1 1/2" → 1.5), word numbers, and ranges
 * ("2-3", "2 to 3", en/em dashes) which are AVERAGED. A `<n>-<word>` token
 * ("15-ounce") is a package-size descriptor, not a range endpoint.
 */
function extractQuantity(tokens: string[]): {
  quantity: number | null;
  packageSize?: { quantity: number; unit: string };
} {
  const collected: number[] = [];
  let sawRangeSeparator = false;
  let packageSize: { quantity: number; unit: string } | undefined;

  const parseSingle = (tok: string): number | null => {
    if (FRACTIONS[tok] !== undefined) return FRACTIONS[tok];
    // "1½"
    const mixedUnicode = tok.match(/^(\d+)\s*([¼-¾⅐-⅞])$/);
    if (mixedUnicode) return parseInt(mixedUnicode[1], 10) + (FRACTIONS[mixedUnicode[2]] ?? 0);
    // "1/2"
    const frac = tok.match(/^(\d+)\/(\d+)$/);
    if (frac) {
      const den = parseInt(frac[2], 10);
      return den > 0 ? parseInt(frac[1], 10) / den : null;
    }
    if (/^\d+(\.\d+)?$/.test(tok)) return parseFloat(tok);
    return null;
  };

  while (tokens.length > 0) {
    const tok = tokens[0];

    // "15-ounce" / "8-oz": a hyphenated size descriptor. Record it as the
    // package size and stop consuming quantity tokens.
    const sizeDescriptor = tok.match(/^(\d+(?:\.\d+)?)-([a-z]+)$/i);
    if (sizeDescriptor && collected.length > 0) {
      const unit = normalizeUnitToken(sizeDescriptor[2]);
      if (unit) packageSize = { quantity: parseFloat(sizeDescriptor[1]), unit };
      tokens.shift();
      break;
    }

    // Range separator between two numbers: "2-3", "2–3".
    const dashRange = tok.match(/^(\d+(?:\.\d+)?)[-–—](\d+(?:\.\d+)?)$/);
    if (dashRange && collected.length === 0) {
      collected.push(parseFloat(dashRange[1]), parseFloat(dashRange[2]));
      sawRangeSeparator = true;
      tokens.shift();
      continue;
    }

    // "2 to 3"
    if (collected.length > 0 && tok.toLowerCase() === 'to' && tokens.length > 1) {
      const next = parseSingle(tokens[1]);
      if (next !== null) {
        sawRangeSeparator = true;
        tokens.shift();
        continue;
      }
      break;
    }

    // Bare "-" / "–" acting as a range separator between separate tokens.
    if (collected.length > 0 && /^[-–—]$/.test(tok)) {
      sawRangeSeparator = true;
      tokens.shift();
      continue;
    }

    // "3x Milk" — multiplier glued to the number.
    const gluedMultiplier = tok.match(/^(\d+(?:\.\d+)?)[xX]$/);
    if (gluedMultiplier && collected.length === 0) {
      collected.push(parseFloat(gluedMultiplier[1]));
      tokens.shift();
      continue;
    }

    const value = parseSingle(tok);
    if (value !== null) {
      collected.push(value);
      tokens.shift();
      // "3x Milk" — trailing multiplier marker.
      if (tokens.length > 0 && /^[xX]$/.test(tokens[0])) tokens.shift();
      continue;
    }

    // Word number, but only as the very first token so "half and half" and
    // "a la mode" style names aren't eaten mid-line.
    if (collected.length === 0 && NUMBER_WORDS[tok.toLowerCase()] !== undefined) {
      collected.push(NUMBER_WORDS[tok.toLowerCase()]);
      tokens.shift();
      continue;
    }

    break;
  }

  if (collected.length === 0) return { quantity: null, packageSize };

  // Average a genuine range; sum a mixed number ("1 1/2" → 1.5).
  const quantity =
    sawRangeSeparator && collected.length === 2
      ? (collected[0] + collected[1]) / 2
      : collected.reduce((a, b) => a + b, 0);

  return { quantity, packageSize };
}

/** Pull a leading unit token (including two-word "fl oz") off `tokens`. */
function extractUnit(tokens: string[]): string {
  if (tokens.length === 0) return '';
  if (tokens.length >= 2) {
    const two = normalizeUnitToken(`${tokens[0]} ${tokens[1]}`);
    if (two) {
      tokens.splice(0, 2);
      return two;
    }
  }
  const one = normalizeUnitToken(tokens[0]);
  if (one) {
    tokens.shift();
    return one;
  }
  return '';
}

function stripLeadingFillers(tokens: string[]): void {
  while (tokens.length > 1 && LEADING_FILLERS.has(tokens[0].toLowerCase())) {
    tokens.shift();
  }
}

/** Strip bullets, "1.", "1)", "[ ]" / "[x]" list markers. */
function stripListMarkers(line: string): string {
  return (
    line
      .replace(/^[\s]*[-•*▪▸►◆☐☑✓✔✗✘•‣◦⁃∙]+\s*/, '')
      // \s+ (not \s*) so we don't eat the integer part of "1.5 lb chicken"
      .replace(/^[\s]*\d+[.)]\s+/, '')
      .replace(/^\[[ xX]?\]\s*/, '')
      .trim()
  );
}

/**
 * Pull `(14.5 oz)` style package sizes out of a line and drop every other
 * parenthetical (", (thinly sliced)", "(optional)").
 */
function extractParentheticals(line: string): {
  rest: string;
  packageSize?: { quantity: number; unit: string };
} {
  let packageSize: { quantity: number; unit: string } | undefined;
  const rest = line.replace(/\(([^)]*)\)/g, (_full, inner: string) => {
    if (!packageSize) {
      const m = String(inner)
        .trim()
        .match(/^(\d+(?:\.\d+)?|[¼-¾⅐-⅞])\s*-?\s*([a-zA-Z][a-zA-Z. ]*)$/);
      if (m) {
        const qty = FRACTIONS[m[1]] ?? parseFloat(m[1]);
        const unit = normalizeUnitToken(m[2]);
        if (unit && Number.isFinite(qty)) packageSize = { quantity: qty, unit };
      }
    }
    return ' ';
  });
  return { rest, packageSize };
}

function parseLine(line: string): ParsedGroceryItem | null {
  const cleaned = stripListMarkers(line);
  if (!cleaned || cleaned.length < 2) return null;

  const { rest, packageSize: parenSize } = extractParentheticals(cleaned);

  // Everything after the first comma is a preparation descriptor, not part of
  // the item ("2 cloves garlic, minced"). Item-level comma splitting already
  // happened in parseGroceryText, so a comma here is always a descriptor.
  const beforeComma = rest.split(',')[0].trim();
  const working = (beforeComma || rest).trim();
  if (!working) return null;

  const tokens = working.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const { quantity, packageSize: descriptorSize } = extractQuantity(tokens);
  stripLeadingFillers(tokens);
  const unit = extractUnit(tokens);
  stripLeadingFillers(tokens);

  const name = tokens.join(' ').trim();
  if (!name) return null;

  return {
    name,
    // US-590: a parsed 0 stays 0 — it used to be coerced to 1, inventing an
    // item the source text explicitly said there was none of.
    quantity: quantity ?? 1,
    unit,
    category: inferCategory(name),
    ...((parenSize ?? descriptorSize) ? { packageSize: parenSize ?? descriptorSize } : {}),
  };
}

/**
 * Parse freeform grocery text into structured items.
 * Supports bulleted lists, numbered lists, comma-separated, one-per-line.
 *
 * US-589: repeated items are SUMMED, not dropped. The previous `seenNames`
 * guard silently discarded the second mention, so "1/2 cup milk" + "2 tbsp
 * milk" yielded a single 0.5-cup line and lost the tablespoons entirely.
 */
export function parseGroceryText(text: string): ParsedGroceryItem[] {
  if (!text || !text.trim()) return [];

  const trimmed = text.trim();

  const newlineCount = (trimmed.match(/\n/g) || []).length;
  const commaCount = (trimmed.match(/,/g) || []).length;
  const isCommaSeparated = commaCount >= 2 && newlineCount === 0;

  const lines = isCommaSeparated
    ? trimmed.split(',').map((s) => s.trim())
    : trimmed.split(/\n/).map((s) => s.trim());

  const order: string[] = [];
  const groups = new Map<string, ParsedGroceryItem[]>();

  for (const line of lines) {
    if (!line) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    const key = ingredientMatchKey(parsed.name) || parsed.name.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(parsed);
  }

  return order.map((key) => {
    const group = groups.get(key)!;
    const first = group[0];
    if (group.length === 1) return first;
    const summed = sumQuantities(group.map((g) => ({ quantity: g.quantity, unit: g.unit })));
    return {
      ...first,
      quantity: summed.quantity,
      unit: summed.unit,
      packageSize: group.find((g) => g.packageSize)?.packageSize,
    };
  });
}
