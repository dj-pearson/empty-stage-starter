import type { Database } from '@/integrations/supabase/types';

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
 * this builder owns (user_id, household_id) or the database owns (id,
 * created_at, updated_at).
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
  checked?: boolean;
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
] as const satisfies ReadonlyArray<keyof GroceryRowDraft & keyof GroceryItemInsert>;

export function buildGroceryRow(
  draft: GroceryRowDraft,
  ctx: GroceryRowContext
): GroceryItemInsert {
  const row: GroceryItemInsert = {
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
