/**
 * US-795: the single place that decides which of a household's own food row
 * and its linked shared-catalog entry (`grocery_product_catalog`, via the
 * nullable `foods.canonical_id`) a screen should show.
 *
 * Every screen that did this arithmetic itself is exactly how this codebase
 * ended up with three grocery insert paths and two calendar implementations.
 * `resolveFood` is the only place that merges the two; callers read
 * `EffectiveFood` and never touch `Food` + `CatalogEntry` fields directly.
 */
import type { Food, FoodCategory } from '@/types';

/** Shape of a joined row from `grocery_product_catalog`. Kept local to this
 * module (rather than imported from generated Supabase types) so Tasks 2/3
 * can pass a plain object without depending on the full DB row shape. */
export interface CatalogEntry {
  id: string;
  name: string;
  default_category: string | null;
  default_aisle_section: string | null;
  verification: string;
}

/**
 * The merged view a screen renders. Deliberately NOT `Food & CatalogEntry`:
 * household-only state (is_safe, is_try_bite, quantity, ...) must never be
 * reachable through the catalog side of the merge, because a wrong is_safe
 * is a child eating something they react to. Only the display fields that
 * are genuinely shared (name, category, aisle) get resolved here; everything
 * else stays on the original `Food` the caller already has.
 */
export interface EffectiveFood {
  id: string;
  name: string;
  category: FoodCategory;
  aisle: string | undefined;
  aisleRaw: string | null;
  isCanonical: boolean;
  isVerified: boolean;
}

const FOOD_CATEGORIES: readonly FoodCategory[] = ['protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack'];

function isFoodCategory(value: string | null): value is FoodCategory {
  if (value === null) return false;
  return (FOOD_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Human-readable aisle section name, copied verbatim from the `displayName`
 * switch in `ios/EatPal/EatPal/Models/GroceryAisle.swift` so web and iOS say
 * the same words for the same aisle. Do not add wording here without also
 * checking that file — a plausible-sounding guess defeats the whole point of
 * this mapping.
 *
 * Exported (visibility only, not a behavior change) so
 * `effectiveFoodUsage.test.ts` can diff it against the Swift enum directly
 * instead of carrying its own hand-copied 33-entry list that could drift the
 * same way this map could.
 */
export const AISLE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  produce: 'Produce',
  bakery: 'Bakery',
  bread: 'Bread',
  meat_deli: 'Meat & Deli',
  seafood: 'Seafood',
  dairy: 'Dairy',
  eggs: 'Eggs',
  refrigerated: 'Refrigerated',
  frozen_meals: 'Frozen Meals',
  frozen_veg: 'Frozen Vegetables',
  frozen_treats: 'Frozen Treats',
  canned: 'Canned Goods',
  dry_soups: 'Dry Soups & Mixes',
  pasta: 'Pasta',
  rice_grains: 'Rice & Grains',
  condiments: 'Condiments & Sauces',
  baking: 'Baking',
  breakfast: 'Breakfast',
  snacks: 'Snacks',
  crackers: 'Crackers',
  candy: 'Candy',
  beverages: 'Beverages',
  alcohol: 'Beer & Wine',
  ethnic_mexican: 'Mexican',
  ethnic_asian: 'Asian',
  ethnic_european: 'European',
  household: 'Household',
  paper_goods: 'Paper Goods',
  cleaning: 'Cleaning',
  personal_care: 'Personal Care',
  baby: 'Baby',
  pet: 'Pet',
  other: 'Other',
};

/**
 * Maps a `GroceryAisle` rawValue (e.g. `meat_deli`) to its display text
 * (e.g. `Meat & Deli`). Returns `undefined` for `null`/`undefined` input and
 * for any string that is not one of the 33 known rawValues — including a web
 * display string like `Produce`, which is not itself a rawValue and must not
 * be echoed back as if it were already resolved.
 */
export function aisleDisplayName(rawValue: string | null | undefined): string | undefined {
  if (rawValue === null || rawValue === undefined) return undefined;
  return Object.prototype.hasOwnProperty.call(AISLE_DISPLAY_NAMES, rawValue)
    ? AISLE_DISPLAY_NAMES[rawValue]
    : undefined;
}

/**
 * Resolves the display-facing fields for a food, given its optional linked
 * catalog entry.
 *
 * When `catalog` is present, name/category/aisle prefer the catalog's
 * values, falling back to the household row's when a catalog field is null.
 * Preferring the catalog's name is safe (not a silent rename) because
 * US-796's matcher only links a pair on an EXACT normalized-name or barcode
 * match — a linked pair already agrees on the name, so taking the catalog's
 * spelling is casing/punctuation normalisation, not a rename.
 *
 * `is_safe`, `is_try_bite`, `quantity`, and every other household-only field
 * are deliberately absent from `EffectiveFood` and are never read from
 * `catalog` — the catalog table has no such column, and a screen that needs
 * that state should keep reading it off the original `Food`.
 */
export function resolveFood(food: Food, catalog?: CatalogEntry | null): EffectiveFood {
  if (!catalog) {
    return {
      id: food.id,
      name: food.name,
      category: food.category,
      aisle: food.aisle,
      aisleRaw: null,
      isCanonical: false,
      isVerified: false,
    };
  }

  const category = isFoodCategory(catalog.default_category) ? catalog.default_category : food.category;
  const aisleRaw = catalog.default_aisle_section;
  // `default_aisle_section` is a plain, unconstrained string all the way down
  // (no CHECK in the DB, no enum on the write path — see
  // ios/EatPal/EatPal/Models/GroceryItem.swift, where aisleSection is a bare
  // String? and only aisleSectionEnum does the enum conversion). A value that
  // doesn't map to a known aisle is effectively no value, so it falls back to
  // the household's own aisle exactly like a null does — a linked food must
  // never show a blanker aisle than it did before it was linked.
  const mapped = aisleDisplayName(aisleRaw);
  const aisle = mapped ?? food.aisle;

  // An empty `catalog.name` is, like an unmapped aisle or an invalid
  // category above, effectively no value -- fall back to the household's own
  // name rather than blanking it. Nothing constrains this column to be
  // non-empty either.
  const name = catalog.name || food.name;

  return {
    id: food.id,
    name,
    category,
    aisle,
    aisleRaw,
    isCanonical: true,
    isVerified: catalog.verification === 'verified',
  };
}
