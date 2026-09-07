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
 * Vocabulary reused, not invented:
 * - `category` values are exactly the app's `FoodCategory` union
 *   (src/types/index.ts): protein | carb | dairy | fruit | vegetable | snack.
 *   USDA's 28 categories don't map cleanly onto 6 buckets -- several rows
 *   below (spices, fats/oils, soups/sauces, beverages, sweets, "meals") land
 *   on `snack` as the closest existing catch-all, matching the precedent in
 *   src/lib/groceryAisle.ts (suggestCategory), which already sends oil,
 *   sauce, candy, soda, etc. to `snack` rather than inventing a new bucket.
 * - `aisle` values are exactly the 10 aisle names already used to organize a
 *   generated grocery list by store layout in
 *   src/lib/mealPlanGenerator/mealPlanGenerator.ts (`organizedByStore`):
 *   Produce, Meat & Seafood, Dairy, Frozen Foods, Bakery, Canned Goods,
 *   Pantry/Dry Goods, Condiments & Sauces, Spices, Beverages. The local dev
 *   `grocery_product_catalog.default_aisle_section` table is empty (US-793
 *   migration hasn't been seeded), so there was no live data to read there;
 *   the mealPlanGenerator list is the only aisle vocabulary the app actually
 *   ships today, so every row below reuses one of those 10 strings.
 *
 * Categories with no clean single-aisle answer (documented per-row below):
 * - Baby Foods (3): kept per the brief -- this is a child-nutrition app --
 *   filed under Pantry/Dry Goods (formula, cereal, jarred purees are shelf
 *   stable; there is no dedicated baby aisle in the app's vocabulary).
 * - Legumes and Legume Products (16): dry and canned beans/lentils both
 *   exist; filed under Pantry/Dry Goods as the more general non-perishable
 *   aisle.
 * - Meals, Entrees, and Side Dishes (22): mixed-macro prepared dishes with
 *   no single category; filed under `snack` (catch-all) / Frozen Foods
 *   (most SR Legacy entries in this group are frozen entrees).
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
  '1': { category: 'dairy', aisle: 'Dairy' }, // Dairy and Egg Products
  '2': { category: 'snack', aisle: 'Spices' }, // Spices and Herbs
  '3': { category: 'snack', aisle: 'Pantry/Dry Goods' }, // Baby Foods
  '4': { category: 'snack', aisle: 'Condiments & Sauces' }, // Fats and Oils
  '5': { category: 'protein', aisle: 'Meat & Seafood' }, // Poultry Products
  '6': { category: 'snack', aisle: 'Canned Goods' }, // Soups, Sauces, and Gravies
  '7': { category: 'protein', aisle: 'Meat & Seafood' }, // Sausages and Luncheon Meats
  '8': { category: 'carb', aisle: 'Pantry/Dry Goods' }, // Breakfast Cereals
  '9': { category: 'fruit', aisle: 'Produce' }, // Fruits and Fruit Juices
  '10': { category: 'protein', aisle: 'Meat & Seafood' }, // Pork Products
  '11': { category: 'vegetable', aisle: 'Produce' }, // Vegetables and Vegetable Products
  '12': { category: 'snack', aisle: 'Pantry/Dry Goods' }, // Nut and Seed Products
  '13': { category: 'protein', aisle: 'Meat & Seafood' }, // Beef Products
  '14': { category: 'snack', aisle: 'Beverages' }, // Beverages
  '15': { category: 'protein', aisle: 'Meat & Seafood' }, // Finfish and Shellfish Products
  '16': { category: 'protein', aisle: 'Pantry/Dry Goods' }, // Legumes and Legume Products
  '17': { category: 'protein', aisle: 'Meat & Seafood' }, // Lamb, Veal, and Game Products
  '18': { category: 'carb', aisle: 'Bakery' }, // Baked Products
  '19': { category: 'snack', aisle: 'Pantry/Dry Goods' }, // Sweets
  '20': { category: 'carb', aisle: 'Pantry/Dry Goods' }, // Cereal Grains and Pasta
  // 21: Fast Foods -- excluded, see header.
  '22': { category: 'snack', aisle: 'Frozen Foods' }, // Meals, Entrees, and Side Dishes
  '23': { category: 'snack', aisle: 'Pantry/Dry Goods' }, // Snacks
  // 24: American Indian/Alaska Native Foods -- excluded, see header.
  // 25: Restaurant Foods -- excluded, see header.
  // 26: Branded Food Products Database -- excluded, see header.
  // 27: Quality Control Materials -- excluded, see header.
  // 28: Alcoholic Beverages -- excluded, see header.
};

/** @type {Set<string>} */
export const EXCLUDED_CATEGORIES = new Set(['21', '24', '25', '26', '27', '28']);
