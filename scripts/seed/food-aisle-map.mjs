/**
 * USDA SR Legacy food_category -> EatPal (category, aisle), by hand.
 *
 * US-794: USDA publishes a food category ("Fruits and Fruit Juices") but
 * never a supermarket aisle -- that mapping only a person can supply. This
 * file is that mapping: one line per USDA category id (1-28, SR Legacy),
 * no logic, hand-editable. AC 3 of the story treats this as a first pass
 * that gets corrected by hand over time; correct it here, not in the seed
 * builder (Task 2) that consumes it.
 *
 * FIX ROUND 3 (US-794 fix 4): `aisle` was rewritten from the ten web
 * display strings ("Produce", "Meat & Seafood", ...) to the iOS app's own
 * vocabulary. That reversal is the important part of this file's history:
 * `default_aisle_section` is read by exactly one client -- the shipped iOS
 * app, in `SmartProductService.swift` (`apply(catalog:fallbackName:)`),
 * which parses the column as `GroceryAisle(rawValue:)` against the
 * 33-case enum in `ios/EatPal/EatPal/Models/GroceryAisle.swift`, whose raw
 * values are lowercase snake_case. Every one of the original ten web
 * strings returns nil there, so the live App Store build silently ignored
 * every aisle this file ever seeded and fell back to guessing from the
 * food's name instead -- the exact "every family sees the same aisle"
 * guarantee this table exists to provide, false on the only client that
 * reads it. The web app reads `default_aisle_section` nowhere but the
 * generated Supabase types file, so there is no competing consumer to
 * satisfy. The 33 valid values, copied from the enum so a typo here is
 * visibly wrong rather than silently nil on iOS:
 *   produce, bakery, bread, meat_deli, seafood, dairy, eggs, refrigerated,
 *   frozen_meals, frozen_veg, frozen_treats, canned, dry_soups, pasta,
 *   rice_grains, condiments, baking, breakfast, snacks, crackers, candy,
 *   beverages, alcohol, ethnic_mexican, ethnic_asian, ethnic_european,
 *   household, paper_goods, cleaning, personal_care, baby, pet, other.
 *
 * Vocabulary reused, not invented:
 * - `category` values are exactly the app's `FoodCategory` union
 *   (src/types/index.ts): protein | carb | dairy | fruit | vegetable | snack.
 *   Left alone by fix round 3 -- iOS and web agree on this union, so
 *   nothing about it needed to change; only `aisle` was wrong.
 * - `aisle` values are exactly the 33 iOS `GroceryAisle` rawValues above.
 *
 * Categories where the iOS enum is richer than one USDA category id can
 * express in a single {category, aisle} row (each documented per-row
 * below, with the real SR Legacy row counts that decided it):
 * - Dairy and Egg Products (1): 291 SR Legacy rows, only 29 (10%) are eggs
 *   -- the rest is milk/cheese/yogurt/cream/butter. The category-level
 *   default is `dairy` (also correct in a real store: eggs are commonly
 *   shelved in or beside the dairy case). AISLE_OVERRIDES below reclaims
 *   the 10% for the dedicated `eggs` rawValue when the description itself
 *   says "Egg" -- see that constant's own comment for why this one
 *   category gets an override and the other 19 mapped categories don't.
 * - Cereal Grains and Pasta (20): 181 rows, 127 grains (rice, wheat,
 *   oats, ...) vs 44 pasta (macaroni, spaghetti, noodles, ...). The
 *   category-level default is `rice_grains` (majority); AISLE_OVERRIDES
 *   sends the pasta rows to the dedicated `pasta` rawValue instead.
 * - Spices and Herbs (2): no dedicated spice aisle exists in the iOS
 *   enum. Filed under `baking`, the closest real-world neighbor (most US
 *   grocery stores rack spices in or beside the baking aisle).
 * - Fats and Oils (4): no dedicated oil aisle; filed under `condiments`,
 *   where oil and vinegar are typically shelved together with dressings.
 * - Soups, Sauces, and Gravies (6): filed under `canned` -- most SR
 *   Legacy rows in this category are canned soup; `condiments` would fit
 *   the sauce/gravy minority better but the category can only pick one.
 * - Nut and Seed Products (12): filed under `snacks`, where a US grocery
 *   store shelves nuts and seeds for eating out of hand.
 * - Legumes and Legume Products (16): dry and canned beans/lentils both
 *   exist; filed under `canned` since canned beans are the more common
 *   family-grocery form and this is the aisle the "black beans" /
 *   "kidney beans" staples land in.
 * - Baked Products (18): filed under `bakery` (cookies, cakes, muffins,
 *   pastries) rather than the more specific `bread`, since the category
 *   includes both and `bakery` is the broader umbrella; unlike categories
 *   1 and 20, no override was added here because the brief did not call
 *   out a bread/bakery split and a `bread` vs `bakery` name-prefix rule
 *   would be far less reliable than "starts with Egg" or a pasta-shape
 *   word list (loaves, rolls and biscuits are described a dozen
 *   inconsistent ways).
 * - Sweets (19): filed under `candy`, the closest single iOS value, even
 *   though the category also includes puddings, frostings and syrups.
 * - Meals, Entrees, and Side Dishes (22): most SR Legacy entries in this
 *   group are frozen entrees; filed under `frozen_meals`.
 *
 * Excluded categories (no place in a shared family grocery catalog):
 * - Fast Foods (21): restaurant-style/branded-adjacent entries ("Kentucky
 *   Fried Chicken, ..."), not shelf items with an aisle.
 * - American Indian/Alaska Native Foods (24), Restaurant Foods (25),
 *   Branded Food Products Database (26, a separate database), Quality
 *   Control Materials (27, lab reference standards), Alcoholic Beverages
 *   (28) -- excluded per the brief.
 */

/** @type {Record<string, {category: string, aisle: string}>} */
export const CATEGORY_AISLE = {
  '1': { category: 'dairy', aisle: 'dairy' }, // Dairy and Egg Products (see AISLE_OVERRIDES for the eggs split)
  '2': { category: 'snack', aisle: 'baking' }, // Spices and Herbs -- no dedicated spice aisle in the iOS enum
  '3': { category: 'snack', aisle: 'baby' }, // Baby Foods
  '4': { category: 'snack', aisle: 'condiments' }, // Fats and Oils
  '5': { category: 'protein', aisle: 'meat_deli' }, // Poultry Products
  '6': { category: 'snack', aisle: 'canned' }, // Soups, Sauces, and Gravies -- mostly canned soup
  '7': { category: 'protein', aisle: 'meat_deli' }, // Sausages and Luncheon Meats
  '8': { category: 'carb', aisle: 'breakfast' }, // Breakfast Cereals
  '9': { category: 'fruit', aisle: 'produce' }, // Fruits and Fruit Juices
  '10': { category: 'protein', aisle: 'meat_deli' }, // Pork Products
  '11': { category: 'vegetable', aisle: 'produce' }, // Vegetables and Vegetable Products
  '12': { category: 'snack', aisle: 'snacks' }, // Nut and Seed Products
  '13': { category: 'protein', aisle: 'meat_deli' }, // Beef Products
  '14': { category: 'snack', aisle: 'beverages' }, // Beverages
  '15': { category: 'protein', aisle: 'seafood' }, // Finfish and Shellfish Products
  '16': { category: 'protein', aisle: 'canned' }, // Legumes and Legume Products -- canned beans, the common family form
  '17': { category: 'protein', aisle: 'meat_deli' }, // Lamb, Veal, and Game Products
  '18': { category: 'carb', aisle: 'bakery' }, // Baked Products
  '19': { category: 'snack', aisle: 'candy' }, // Sweets
  '20': { category: 'carb', aisle: 'rice_grains' }, // Cereal Grains and Pasta (see AISLE_OVERRIDES for the pasta split)
  // 21: Fast Foods -- excluded, see header.
  '22': { category: 'snack', aisle: 'frozen_meals' }, // Meals, Entrees, and Side Dishes
  '23': { category: 'snack', aisle: 'snacks' }, // Snacks
  // 24: American Indian/Alaska Native Foods -- excluded, see header.
  // 25: Restaurant Foods -- excluded, see header.
  // 26: Branded Food Products Database -- excluded, see header.
  // 27: Quality Control Materials -- excluded, see header.
  // 28: Alcoholic Beverages -- excluded, see header.
};

/** @type {Set<string>} */
export const EXCLUDED_CATEGORIES = new Set(['21', '24', '25', '26', '27', '28']);

/**
 * A description-prefix override that refines CATEGORY_AISLE's per-category
 * default for the two USDA categories that mix two food types the iOS
 * enum splits into different aisles -- see the header comment above for
 * the row counts behind each one. `buildSeed` (build-food-seed.mjs)
 * applies these, in order, to a food already resolved to a `categoryId`,
 * before falling back to `CATEGORY_AISLE[categoryId].aisle`. Deliberately
 * limited to these two categories: every other one of the 20 mapped
 * categories is a reasonable single aisle on its own (see the per-row
 * comments above for the ones that are still a compromise but not split),
 * and a name-prefix rule is only as good as how consistently USDA's
 * descriptions start -- "Egg" and the pasta-shape words below are
 * reliable; most other splits (e.g. bread vs. the rest of Baked Products)
 * are not.
 *
 * @type {Array<{categoryId: string, test: (description: string) => boolean, aisle: string}>}
 */
export const AISLE_OVERRIDES = [
  {
    categoryId: '1', // Dairy and Egg Products
    test: (d) => /^Egg\b/i.test(d),
    aisle: 'eggs',
  },
  {
    categoryId: '20', // Cereal Grains and Pasta
    test: (d) => /^(Macaroni|Noodles?|Pasta|Spaghetti|Lasagna|Ravioli|Vermicelli|Couscous)\b/i.test(d),
    aisle: 'pasta',
  },
];
