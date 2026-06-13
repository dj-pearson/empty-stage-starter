/**
 * DB-row -> client-entity normalizers for Grocery / Plan / Kids (US-333).
 *
 * The `grocery_items`, `plan_entries`, and `kids` types are already snake_case
 * (they mirror the DB columns), so unlike recipes there is no case mapping to
 * do. What these helpers guarantee is a CONSISTENT client shape regardless of
 * whether a row arrived via the initial `.select()` load, an insert's
 * `.select()`, or a realtime `postgres_changes` payload:
 *
 *  - array columns are always arrays (null/undefined -> []), so downstream
 *    `.map()/.some()/.filter()` calls never throw on a realtime row;
 *  - key client defaults are applied (e.g. grocery `checked` is a real boolean,
 *    `quantity` is a positive number).
 *
 * Applying the SAME normalizer on both the load path and the realtime handler
 * is what removes the "shape drift" a second device used to see.
 */
import type { GroceryItem, PlanEntry, Kid, FoodCategory } from '@/types';

type Row = Record<string, unknown>;

function asArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value as string[];
  return undefined;
}

export function normalizeGroceryItemFromDB(row: Row): GroceryItem {
  const quantity = Number(row.quantity);
  return {
    ...(row as unknown as GroceryItem),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    unit: typeof row.unit === 'string' ? row.unit : '',
    checked: row.checked === true,
    category: (row.category as FoodCategory) ?? ('snack' as FoodCategory),
  };
}

export function normalizePlanEntryFromDB(row: Row): PlanEntry {
  // plan_entries is all scalar — a faithful typed passthrough is enough, but
  // routing it through here keeps the load and realtime paths identical.
  return { ...(row as unknown as PlanEntry) };
}

const KID_ARRAY_FIELDS = [
  'allergens',
  'favorite_foods',
  'texture_preferences',
  'texture_dislikes',
  'flavor_preferences',
  'dietary_restrictions',
  'health_goals',
  'helpful_strategies',
  'disliked_foods',
  'always_eats_foods',
] as const;

export function normalizeKidFromDB(row: Row): Kid {
  const out = { ...(row as unknown as Kid) } as Kid & Record<string, unknown>;
  for (const field of KID_ARRAY_FIELDS) {
    const coerced = asArray(row[field]);
    if (coerced) out[field] = coerced;
    else if (row[field] == null) delete out[field];
  }
  return out;
}
