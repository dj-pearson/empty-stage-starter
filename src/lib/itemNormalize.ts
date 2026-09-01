/**
 * US-657: one normalized form for an item name, so every module compares the
 * same thing.
 *
 * The problem this exists to end: every seam between recipes, meal plan,
 * grocery and pantry currently matches on a lowercased string, and each one
 * lowercases slightly differently. AppState.moveCheckedToPantry compares
 * `name.lowercased()` raw, GroceryGeneratorService de-duplicates on its own
 * key, and ShortfallCalculator goes through IngredientNameMatcher. So
 * "chicken breast", "chicken breasts" and "2 lb boneless skinless chicken
 * breasts" are three items to the app and one item to the parent.
 *
 * `normalizeItemText` is the single reduction those all move onto, and the
 * value stored in `item_aliases.normalized_text`.
 *
 * Pure by construction: no I/O, no clock, no Supabase import. Its behaviour is
 * pinned by fixtures the Swift mirror reads too (US-660), the same way
 * exposureLadder.ts and ExposureLadderPolicy.swift are held together.
 *
 * Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md
 */

/**
 * Measurement and packaging words that carry no identity. "2 cloves garlic"
 * and "garlic" are the same item; the clove is how it was counted, not what
 * it is.
 *
 * Shared with `ingredientMatchKey` in groceryMerge.ts, which had this list
 * first. It lives here now so the two cannot drift apart -- the thing this
 * whole epic is about.
 */
export const UNIT_NOISE: ReadonlySet<string> = new Set<string>([
  'lb', 'lbs', 'pound', 'pounds',
  'oz', 'ounce', 'ounces',
  'g', 'gram', 'grams',
  'kg', 'kilo', 'kilogram', 'kilograms',
  'ml', 'l', 'liter', 'litre', 'liters', 'litres',
  'tsp', 'teaspoon', 'teaspoons',
  'tbsp', 'tablespoon', 'tablespoons',
  'cup', 'cups',
  'pt', 'pint', 'pints',
  'qt', 'quart', 'quarts',
  'gal', 'gallon',
  'clove', 'cloves',
  'can', 'cans',
  'jar', 'jars',
  'bag', 'bags',
  'box', 'boxes',
  'package', 'packages', 'pkg',
  'piece', 'pieces', 'pc', 'pcs',
  'slice', 'slices',
  'bunch', 'bunches',
  'head', 'heads',
  'stick', 'sticks',
  'dozen',
  'pack', 'packs',
  'container', 'containers',
  'bottle', 'bottles',
  'stalk', 'stalks',
  'sprig', 'sprigs',
]);

/**
 * Preparation and state words that describe how an item was handled rather
 * than what it is. Stripping these is what collapses "2 lb boneless skinless
 * chicken breasts" onto "chicken breast".
 *
 * Deliberately NARROW, and deliberately excludes variety words. "red onion"
 * must stay distinct from "onion" and "almond milk" from "milk", because those
 * are different things to buy. Only add a word here when the item it qualifies
 * is genuinely the same item.
 *
 * KNOWN TENSION, flagged in US-657: 'fresh' and 'frozen' are treated as state,
 * so frozen peas and fresh peas normalize together. That is right for recipe
 * matching and arguably wrong for a pantry, where they sit in different places
 * and expire on different timescales. Revisit if the aisle assignment on a
 * merged item starts looking wrong.
 */
export const PREP_QUALIFIERS: ReadonlySet<string> = new Set<string>([
  // Knife work. What you did to it, not what it is.
  'chopped', 'diced', 'minced', 'peeled', 'trimmed',
  'finely', 'roughly', 'thinly',
  // Recipe-sheet noise.
  'optional', 'divided',
  // State and sourcing named by US-657.
  'fresh', 'freshly', 'frozen', 'organic',
  'boneless', 'skinless',
]);

/*
 * Words deliberately NOT in that list, because each names a different product
 * rather than a different preparation of the same one:
 *
 *   ground     ground beef is not beef. groceryMerge's own doc comment uses
 *              "Ground Beef 80/20" -> "beef ground" as the key that must hold.
 *   shredded   shredded cheese and a block of cheese are separate purchases.
 *   grated, crushed, sliced   same reasoning.
 *   dried      dried oregano is not fresh oregano. Note this pairs with
 *              'fresh' being stripped: "fresh basil" -> "basil" while
 *              "dried basil" -> "basil dried", so the two stay apart, which
 *              is the behaviour we want.
 *   canned     canned tomatoes are not tomatoes.
 *   raw, cooked   different things to have in a kitchen.
 *   large, medium, small   size can be part of a product name.
 */

/**
 * Connectives that appear in ingredient lines and name nothing.
 * "peeled and diced potatoes" should reduce to the same thing as "potatoes".
 */
export const STOPWORDS: ReadonlySet<string> = new Set<string>([
  'and', 'or', 'of', 'the', 'a', 'an', 'with', 'to', 'for', 'plus',
]);

/** True for pure numbers, fractions, ratios ("80/20"), and percentages. */
export function isNumericToken(tok: string): boolean {
  return /^\d+([./]\d+)?%?$/.test(tok) || /^\d*[¼½¾⅓⅔⅛]+$/.test(tok);
}

/** Crude singulariser — enough to align "eggs"/"egg", "tomatoes"/"tomato". */
export function singularize(word: string): string {
  if (word.length <= 3 || word.endsWith('ss')) return word;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** Lowercase, drop parentheticals, turn punctuation into spaces, collapse runs. */
function clean(raw: string): string {
  return (raw ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s%/¼½¾⅓⅔⅛]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reduce a raw item or ingredient string to its stable normalized form.
 *
 * Tokens are sorted, so word order cannot split one item into two:
 * "beef, ground" and "ground beef" reduce alike. The output is a lookup key,
 * not display text — nothing renders it to a parent.
 *
 *   "Chicken Breast"                      -> "breast chicken"
 *   "chicken breasts"                     -> "breast chicken"
 *   "2 lb boneless skinless chicken breasts" -> "breast chicken"
 *   "red onion"                           -> "onion red"   (kept distinct)
 *
 * Never returns empty for non-empty input: a string that is entirely units or
 * qualifiers ("2 cups", "chopped") keeps its cleaned original rather than
 * collapsing to "", which would make every such row collide on one alias.
 */
export function normalizeItemText(raw: string): string {
  const cleaned = clean(raw);
  if (!cleaned) return '';

  const tokens = cleaned
    .split(' ')
    .filter((t) => t.length > 0)
    .filter((t) => !isNumericToken(t))
    .filter((t) => !UNIT_NOISE.has(t))
    .filter((t) => !PREP_QUALIFIERS.has(t))
    .filter((t) => !STOPWORDS.has(t))
    .map(singularize)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return cleaned;
  return tokens.sort().join(' ');
}
