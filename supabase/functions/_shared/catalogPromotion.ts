// US-797: decide whether a barcode lookup should promote to a
// grocery_product_catalog row, and what that row should contain.
//
// Pure function, no network and no database. lookup-barcode/index.ts calls a
// provider (Open Food Facts, USDA, or FoodRepo), and when nobody has scanned
// this barcode before, the app wants the result to become a shared catalog
// row so the next family that scans it finds it already there. This module
// is only the decision of what that row looks like -- Task 2 wires it into
// lookup-barcode/index.ts and performs the actual insert.
//
// Two judgement calls live here, both because getting them wrong writes bad
// rows that outlive this function:
//
// 1. Calorie units. Open Food Facts' `energy_value` carries whatever unit the
//    product declared -- frequently kilojoules -- while `energy-kcal_100g` is
//    a field OFF has already resolved to kcal. lookup-barcode/index.ts:118
//    reads `nutriments.energy_value || nutriments['energy-kcal_100g']`, which
//    means a 500 kcal/100g biscuit can arrive here as 2100. This module never
//    reads an unconfirmed-unit energy value; see `energyValueUnconfirmedUnit`
//    below and toCatalogRow's use of only `caloriesKcal100`.
//
// 2. Range sanity. The catalog's calories_kcal_100 column has a CHECK of
//    0-900 (900 kcal/100g is pure fat, the physical maximum), and the macro
//    columns are bounded 0-100 g/100g. A value outside that range is a unit
//    error or a bad scrape, never a food, so it is DROPPED here -- never
//    clamped, and never used as a reason to discard the rest of the row.
//    The database CHECK constraint (gpc_nutrition_sane,
//    20260906000000_canonical_food_catalog.sql) is the second line of
//    defence for this, not the first; this function is. Sodium is bounded
//    tighter here (0-40000 mg/100g) than the database CHECK allows
//    (0-100000): ~40000 mg/100g is roughly pure table salt, the physical
//    ceiling for a food, while 100000 is the column's own back-compat
//    limit and is not itself evidence anything up to it is plausible.
//
// name_normalized must match the shipped iOS normalizer,
// ProductNameNormalizer.normalize in
// ios/EatPal/EatPal/Models/SmartProduct.swift: lowercase, trim, collapse
// whitespace runs, PUNCTUATION PRESERVED. The catalog's UNIQUE index is on
// this column and the live App Store build upserts against it, so a more
// aggressive normalizer here (stripping punctuation/ampersands, which is the
// obvious instinct for a "name normalizer") would promote a row the app can
// never find by name -- the exact bug this project already shipped once and
// had to fix across 2,119 rows.
//
// verification is always 'unverified'. A database trigger
// (gpc_guard_verification) is the actual enforcement -- only an admin (or a
// trusted null-auth.uid() context) may set 'verified' -- but this function
// must never even attempt anything else: a third-party scrape is not a
// checked fact.

/** Which external provider produced the lookup this function is deciding on. */
export type LookupSource = 'openfoodfacts' | 'usda' | 'foodrepo';

/**
 * US-808: how a catalog row's provenance is named to a user.
 *
 * The licence travels with the data. Open Food Facts and FoodRepo are ODbL,
 * which obliges attribution wherever the data is shown, and a row promoted
 * into `grocery_product_catalog` is still their data. Returning such a row as
 * "Community Catalog" erased that: the client resolves its attribution notice
 * from this string (src/lib/dataSources.ts), so an erased source rendered no
 * notice at all.
 *
 * Keys are the values gpc_source_check allows on the column. 'user' and
 * 'admin' are ours and are absent deliberately -- they fall through to the
 * catalog's own name. src/lib/dataSources.ts holds the web's copy of this map;
 * src/lib/dataSources.test.ts pins the two in agreement.
 */
const CATALOG_SOURCE_LABELS: Record<string, string> = {
  openfoodfacts: 'Open Food Facts',
  usda: 'USDA FoodData Central',
  foodrepo: 'FoodRepo',
};

export const OWN_CATALOG_LABEL = 'Community Catalog';

/** The display name for a `grocery_product_catalog.source` value. */
export function catalogSourceLabel(source?: string | null): string {
  if (!source) return OWN_CATALOG_LABEL;
  return CATALOG_SOURCE_LABELS[source] ?? OWN_CATALOG_LABEL;
}

/**
 * The input to toCatalogRow. Deliberately flat rather than mirroring each
 * provider's raw response shape (Open Food Facts' `nutriments`, USDA's
 * `foodNutrients` array, FoodRepo's `nutrients`) -- Task 2 is responsible for
 * pulling the right field out of whichever provider answered. The one field
 * this module insists on keeping separate is calories, split into a
 * confirmed-kcal field and an unconfirmed-unit one, because collapsing them
 * before this function sees them is exactly the bug being fixed.
 */
export interface BarcodeLookupResult {
  /** Which provider this result came from. */
  source: LookupSource;
  /** Product name as the provider returned it. No name means no row. */
  name?: string | null;
  brand?: string | null;
  allergens?: string[] | null;
  /**
   * Energy per 100 g/ml, in kcal, that the caller has already confirmed is
   * in that unit -- e.g. Open Food Facts' `energy-kcal_100g`, FoodRepo's
   * `energy_kcal` (named for the unit), or a USDA nutrient the caller has
   * resolved to kcal. This is the ONLY calorie field toCatalogRow reads.
   */
  caloriesKcal100?: number | null;
  /**
   * Open Food Facts' `energy_value`: whatever unit the product declared,
   * often kilojoules. Carried through the type so callers and tests can be
   * explicit about the fact that it exists and is NOT a fallback -- see the
   * module comment. toCatalogRow never reads this field for calories.
   */
  energyValueUnconfirmedUnit?: number | null;
  proteinG100?: number | null;
  carbsG100?: number | null;
  fatG100?: number | null;
  fiberG100?: number | null;
  sugarG100?: number | null;
  sodiumMg100?: number | null;
  /**
   * The semantically GENERIC form of the product name -- Open Food Facts'
   * `generic_name` ("macaroni and cheese" for "Kraft Macaroni & Cheese
   * Dinner"), when the provider supplies one. This is the ONLY field
   * toCatalogRow uses to look for a `kind = 'generic'` parent row.
   *
   * It is deliberately NOT `name`. `grocery_product_catalog_name_uq` is a
   * UNIQUE index on name_normalized with no WHERE clause -- every row in
   * the table, generic or branded, competes for the same normalized name.
   * A branded product's own name is usually specific enough
   * ("kraft mac & cheese dinner") that it will never collide with a
   * generic row's name_normalized ("macaroni and cheese"). Matching a
   * parent on the branded row's OWN name_normalized instead would mean:
   * whenever that exact match succeeds, inserting this row with the same
   * name_normalized is guaranteed to violate that unique index -- the
   * promotion the match just found would always destroy itself. No
   * generic name, or no exact match against one, means no parent -- a
   * fine outcome, never resolved by fuzzy matching.
   */
  genericName?: string | null;
  /**
   * Best-guess FoodCategory rawValue (ios/EatPal/EatPal/Models/Food.swift:
   * 'protein' | 'carb' | 'dairy' | 'fruit' | 'vegetable' | 'snack'), coarse
   * and derived from scraped provider data -- part of why the row stays
   * 'unverified'. A value outside that set is dropped, not guessed at
   * further; see toCatalogRow.
   */
  category?: string | null;
  /**
   * Best-guess GroceryAisle rawValue
   * (ios/EatPal/EatPal/Models/GroceryAisle.swift), e.g. 'meat_deli'. Same
   * validation rule as category: unknown values are dropped. A bad guess
   * here does not crash the shipped app (SmartProductService falls back to
   * GroceryAisle.classify(name) when this column is null), but a value
   * outside the app's known set is silently ignored, not a safe pass-
   * through, so it is worth dropping explicitly rather than trusting it.
   */
  aisleSection?: string | null;
}

/**
 * The subset of grocery_product_catalog's Insert shape a barcode promotion
 * writes. Mirrors the columns added in
 * supabase/migrations/20260906000000_canonical_food_catalog.sql and the base
 * columns from 20260505000000_smart_product_catalog.sql.
 */
export interface CatalogInsert {
  name: string;
  name_normalized: string;
  barcode: string;
  kind: 'branded';
  source: LookupSource;
  source_ref: string;
  verification: 'unverified';
  brand: string | null;
  allergens: string[] | null;
  calories_kcal_100: number | null;
  protein_g_100: number | null;
  carbs_g_100: number | null;
  fat_g_100: number | null;
  fiber_g_100: number | null;
  sugar_g_100: number | null;
  sodium_mg_100: number | null;
  default_category: string | null;
  default_aisle_section: string | null;
}

/**
 * FoodCategory rawValues (ios/EatPal/EatPal/Models/Food.swift). Lowercase --
 * NOT the Title Case buckets lookup-barcode/index.ts derives internally
 * ('Protein', 'Carb', ...) while building the client-facing response;
 * callers must map to this set before calling toCatalogRow.
 */
const KNOWN_FOOD_CATEGORIES = new Set([
  'protein',
  'carb',
  'dairy',
  'fruit',
  'vegetable',
  'snack',
]);

/**
 * GroceryAisle rawValues (ios/EatPal/EatPal/Models/GroceryAisle.swift).
 */
const KNOWN_GROCERY_AISLES = new Set([
  'produce',
  'bakery',
  'bread',
  'meat_deli',
  'seafood',
  'dairy',
  'eggs',
  'refrigerated',
  'frozen_meals',
  'frozen_veg',
  'frozen_treats',
  'canned',
  'dry_soups',
  'pasta',
  'rice_grains',
  'condiments',
  'baking',
  'breakfast',
  'snacks',
  'crackers',
  'candy',
  'beverages',
  'alcohol',
  'ethnic_mexican',
  'ethnic_asian',
  'ethnic_european',
  'household',
  'paper_goods',
  'cleaning',
  'personal_care',
  'baby',
  'pet',
  'other',
]);

/**
 * Matches the shipped iOS ProductNameNormalizer.normalize
 * (ios/EatPal/EatPal/Models/SmartProduct.swift): lowercase, trim, collapse
 * internal whitespace runs to a single space. Punctuation and the ampersand
 * are preserved on purpose -- see the module comment for why stripping them
 * would be a bug, not an improvement.
 */
export function normalizeProductName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Drops a nutrition value that falls outside [min, max] instead of clamping
 * it -- an out-of-range value is a unit error or a bad scrape, not a food
 * that happens to have an extreme number. Keeping it out of the row (rather
 * than clamping to the boundary) means we never assert a fabricated fact
 * like "900 kcal/100g" for a product that is actually unmeasured.
 */
function sanitizeInRange(
  value: number | null | undefined,
  min: number,
  max: number
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

/**
 * Decides the catalog row a barcode lookup should promote to, or null if the
 * input cannot make a sound row.
 *
 * Returns null when:
 * - there is no barcode (nothing to key the promotion on), or
 * - there is no usable name (normalizeProductName collapses to empty), or
 * - every nutrition field is missing or out of range -- a row with a name
 *   and a barcode but zero nutrition facts is not what "promote to the
 *   catalog" means here.
 *
 * Never invents or clamps a value it cannot support, and never sets
 * verification to anything but 'unverified' -- see the module comment.
 */
export function toCatalogRow(
  input: BarcodeLookupResult,
  barcode: string
): CatalogInsert | null {
  const trimmedBarcode = barcode.trim();
  if (!trimmedBarcode) return null;

  const rawName = (input.name ?? '').trim();
  if (!rawName) return null;

  const nameNormalized = normalizeProductName(rawName);
  if (!nameNormalized) return null;

  // Calories: ONLY the confirmed-kcal field. energyValueUnconfirmedUnit is
  // never read here -- see the module comment on why.
  const caloriesKcal100 = sanitizeInRange(input.caloriesKcal100, 0, 900);
  const proteinG100 = sanitizeInRange(input.proteinG100, 0, 100);
  const carbsG100 = sanitizeInRange(input.carbsG100, 0, 100);
  const fatG100 = sanitizeInRange(input.fatG100, 0, 100);
  const fiberG100 = sanitizeInRange(input.fiberG100, 0, 100);
  const sugarG100 = sanitizeInRange(input.sugarG100, 0, 100);
  // 40000, not the column's 0-100000 CHECK -- see the module comment.
  const sodiumMg100 = sanitizeInRange(input.sodiumMg100, 0, 40000);

  const hasUsableNutrition = [
    caloriesKcal100,
    proteinG100,
    carbsG100,
    fatG100,
    fiberG100,
    sugarG100,
    sodiumMg100,
  ].some((value) => value !== null);

  if (!hasUsableNutrition) return null;

  const brand = input.brand?.trim() || null;
  const allergens =
    input.allergens && input.allergens.length > 0 ? [...input.allergens] : null;

  // Coarse first guesses, dropped rather than trusted if they are not one
  // of the app's own known values -- see the field comments on
  // BarcodeLookupResult. Every other row already in the catalog (the
  // US-794 generic seed) carries both columns; leaving them null on every
  // promoted row would make branded promotions the one shape in the table
  // the shipped quick-add can't prefill from.
  const defaultCategory =
    input.category && KNOWN_FOOD_CATEGORIES.has(input.category) ? input.category : null;
  const defaultAisleSection =
    input.aisleSection && KNOWN_GROCERY_AISLES.has(input.aisleSection)
      ? input.aisleSection
      : null;

  return {
    name: rawName,
    name_normalized: nameNormalized,
    barcode: trimmedBarcode,
    kind: 'branded',
    source: input.source,
    source_ref: trimmedBarcode,
    default_category: defaultCategory,
    default_aisle_section: defaultAisleSection,
    // Hard-coded, not derived from input -- see the module comment. Only an
    // admin (via the gpc_guard_verification trigger) may ever move a row off
    // 'unverified'; a promotion must never try.
    verification: 'unverified',
    brand,
    allergens,
    calories_kcal_100: caloriesKcal100,
    protein_g_100: proteinG100,
    carbs_g_100: carbsG100,
    fat_g_100: fatG100,
    fiber_g_100: fiberG100,
    sugar_g_100: sugarG100,
    sodium_mg_100: sodiumMg100,
  };
}
