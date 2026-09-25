import type { Database } from '@/integrations/supabase/types';
import { generateId } from '@/lib/utils';

/**
 * One place that turns a draft item into a grocery_items insert (US-777).
 *
 * There were three hand-written field allowlists on the way into this table --
 * one in addGroceryItem, one in addGroceryItemsMerged, one in the merge plan --
 * and each was a place a new column could be silently dropped. That is not
 * hypothetical: US-713 had to restore grocery_list_id, auto_generated and
 * source_plan_entry_id after plan-generated rows landed on no list and could
 * not be told apart from hand-added ones, and US-714 had to restore
 * brand_preference, barcode, priority and price_per_unit after every add that
 * went through the merge path dropped what the dialog had collected. Both were
 * the same bug arriving twice through different doors.
 *
 * The two paths were STILL out of step when this landed: addGroceryItem carried
 * neither priority, price_per_unit nor added_by_user_id, so setting a priority
 * on a single add lost it while the same field survived a bulk add.
 *
 * Typed as the generated Insert row, so an unknown column is a compile error
 * rather than a value PostgREST quietly discards, and a missing required one is
 * a compile error rather than a runtime rejection.
 */

export type GroceryItemInsert = Database['public']['Tables']['grocery_items']['Insert'];

/**
 * What a caller may supply. Everything the table accepts except the columns
 * this builder owns (id, user_id, household_id) or the database owns
 * (created_at, updated_at).
 */
export interface GroceryRowDraft {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
  notes?: string | null;
  aisle?: string | null;
  aisle_section?: string | null;
  grocery_list_id?: string | null;
  added_via?: string | null;
  added_by_user_id?: string | null;
  brand_preference?: string | null;
  barcode?: string | null;
  priority?: string | null;
  price_per_unit?: number | null;
  currency?: string | null;
  photo_url?: string | null;
  item_id?: string | null;
  restock_reason?: string | null;
  source_recipe_id?: string | null;
  source_plan_entry_id?: string | null;
  auto_generated?: boolean | null;
  /** Item 16: a receipt already credited this row; checkout must not again. */
  pantry_credited_at?: string | null;
  /** A restored row keeps the checked state it had. New rows default to false. */
  checked?: boolean;
}

/**
 * A draft that may name its own id. Undo re-inserts a deleted row under the id
 * it had, so a queued delete and the restore address the same row. Omitted,
 * the builder mints one; either way the row always leaves here with a client
 * id (US-823).
 *
 * A separate type rather than a field on GroceryRowDraft, so the test that
 * requires every passthrough column to be set does not also demand an id.
 */
export interface GroceryRowDraftWithId extends GroceryRowDraft {
  id?: string;
}

export interface GroceryRowContext {
  userId: string;
  householdId: string;
  /** Used only when the draft carries no category of its own. */
  inferCategory: (name: string) => string;
}

/** Optional columns copied straight through when the draft supplies a value. */
const PASSTHROUGH_KEYS = [
  'aisle_section',
  'grocery_list_id',
  'added_via',
  'brand_preference',
  'barcode',
  'priority',
  'price_per_unit',
  'currency',
  'photo_url',
  'item_id',
  'restock_reason',
  'source_recipe_id',
  'source_plan_entry_id',
  'auto_generated',
  'pantry_credited_at',
] as const satisfies ReadonlyArray<keyof GroceryRowDraft & keyof GroceryItemInsert>;

/**
 * US-823: the id is generated here rather than left to the database.
 *
 * `grocery_items.id` is `UUID PRIMARY KEY DEFAULT gen_random_uuid()`, so
 * sending one is additive -- an older iOS build that omits it still gets a
 * server id, and no migration is involved. What it buys is an offline INSERT.
 * While the database owned the id, a queued insert would replay under an id the
 * optimistic row on screen did not have and come back over realtime as a second
 * row, which is why inserts were the one write the web queue refused. With the
 * client naming the row, the optimistic row and the server row are the same
 * row, a replay is recognisable, and a duplicate replay is a primary-key
 * violation the executor can read as "already done".
 *
 * generateId() is crypto.randomUUID where it exists and an RFC4122-v4-shaped
 * fallback where it does not (US-549), so the value always satisfies the
 * column's type.
 */
export function buildGroceryRow(
  draft: GroceryRowDraftWithId,
  ctx: GroceryRowContext
): GroceryItemInsert {
  const row: GroceryItemInsert = {
    // An empty string is not an id; fall back rather than send one.
    id: draft.id || generateId(),
    name: draft.name,
    // `?? 1` rather than `|| 1`: a legitimate 0 (a row zeroed before removal)
    // should not silently become 1.
    quantity: draft.quantity ?? 1,
    unit: draft.unit ?? '',
    category: draft.category || ctx.inferCategory(draft.name),
    notes: draft.notes ?? null,
    aisle: draft.aisle ?? null,
    user_id: ctx.userId,
    household_id: ctx.householdId,
    checked: draft.checked ?? false,
    // Defaulted here rather than at one call site, which is why a single add
    // used to lose the attribution a bulk add kept.
    added_by_user_id: draft.added_by_user_id ?? ctx.userId,
  };

  for (const key of PASSTHROUGH_KEYS) {
    const value = draft[key];
    // Omit undefined and null so the column keeps its database default; an
    // explicit false or 0 is a real value and is kept.
    if (value !== undefined && value !== null) {
      (row as Record<string, unknown>)[key] = value;
    }
  }

  return row;
}

/** The columns a caller can set, exported so a test can assert none is missed. */
export const GROCERY_DRAFT_PASSTHROUGH_KEYS: ReadonlyArray<string> = PASSTHROUGH_KEYS;
