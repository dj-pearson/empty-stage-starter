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
import { z } from 'zod';
import type { GroceryItem, PlanEntry, Kid, Food, FoodCategory } from '@/types';
import { logger } from '@/lib/logger';

type Row = Record<string, unknown>;

function asArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value as string[];
  return undefined;
}

// ---------------------------------------------------------------------------
// US-536: Zod validation at the Supabase data boundary.
//
// Every load / insert / realtime row is safe-parsed against a schema before it
// is normalized into typed state. Rows missing the load-bearing fields (an id
// to dedup by, the NOT NULL columns the UI reads) are DROPPED and logged rather
// than `as unknown as`-asserted into state, where they would later throw on a
// `.map()`/dedup or render as `undefined`. Schemas `.passthrough()` unknown
// columns so a new DB column never rejects an otherwise-valid row.
// ---------------------------------------------------------------------------

const nonEmpty = z.string().min(1);

// Schemas require only the load-bearing fields the normalizer can't synthesize:
// an `id` to dedup by (universal), a `name` for named entities (NOT NULL in the
// DB, rendering-critical), and `kid_id` for a plan entry (its association).
// Everything else (category, is_safe, date, arrays, …) is defaulted/coerced by
// the normalizer, so it stays out of the schema to avoid dropping valid rows.
const foodRowSchema = z.object({ id: nonEmpty, name: z.string() }).passthrough();
const kidRowSchema = z.object({ id: nonEmpty, name: z.string() }).passthrough();
const planEntryRowSchema = z.object({ id: nonEmpty, kid_id: nonEmpty }).passthrough();
const groceryItemRowSchema = z.object({ id: nonEmpty, name: z.string() }).passthrough();

/** Validate a raw row, then normalize it — or null (logged) if it's invalid. */
function safeParseRow<T>(
  row: Row,
  schema: z.ZodTypeAny,
  normalize: (r: Row) => T,
  label: string,
): T | null {
  const parsed = schema.safeParse(row);
  if (!parsed.success) {
    logger.warn(`Dropping invalid ${label} row from Supabase`, parsed.error.issues);
    return null;
  }
  return normalize(row);
}

/** Validated parse of an array of raw rows — invalid rows are dropped + logged. */
function parseRows<T>(
  rows: unknown[],
  schema: z.ZodTypeAny,
  normalize: (r: Row) => T,
  label: string,
): T[] {
  const out: T[] = [];
  for (const row of rows) {
    const parsed = safeParseRow(row as Row, schema, normalize, label);
    if (parsed !== null) out.push(parsed);
  }
  return out;
}

export const parseFoodRow = (row: Row): Food | null => safeParseRow(row, foodRowSchema, normalizeFoodFromDB, 'food');
export const parseKidRow = (row: Row): Kid | null => safeParseRow(row, kidRowSchema, normalizeKidFromDB, 'kid');
export const parsePlanEntryRow = (row: Row): PlanEntry | null => safeParseRow(row, planEntryRowSchema, normalizePlanEntryFromDB, 'plan_entry');
export const parseGroceryItemRow = (row: Row): GroceryItem | null => safeParseRow(row, groceryItemRowSchema, normalizeGroceryItemFromDB, 'grocery_item');

export const parseFoodRows = (rows: unknown[]): Food[] => parseRows(rows, foodRowSchema, normalizeFoodFromDB, 'food');
export const parseKidRows = (rows: unknown[]): Kid[] => parseRows(rows, kidRowSchema, normalizeKidFromDB, 'kid');
export const parsePlanEntryRows = (rows: unknown[]): PlanEntry[] => parseRows(rows, planEntryRowSchema, normalizePlanEntryFromDB, 'plan_entry');
export const parseGroceryItemRows = (rows: unknown[]): GroceryItem[] => parseRows(rows, groceryItemRowSchema, normalizeGroceryItemFromDB, 'grocery_item');

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

export function normalizeFoodFromDB(row: Row): Food {
  // foods is snake_case in both DB and client; this guarantees a consistent
  // shape across the load / insert / realtime paths (US-534): the two flags are
  // real booleans (never null), category has a default, and allergens is either
  // an array or absent so `.allergens?.map()` never throws on a realtime row.
  const quantity = Number(row.quantity);
  return {
    ...(row as unknown as Food),
    is_safe: row.is_safe === true,
    is_try_bite: row.is_try_bite === true,
    category: (row.category as FoodCategory) ?? ('snack' as FoodCategory),
    allergens: asArray(row.allergens),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
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
