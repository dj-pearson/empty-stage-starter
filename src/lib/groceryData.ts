import type { FoodCategory, GroceryItem } from '@/types';

/**
 * Pure derivations for the Grocery page (US-553 AC2) — extracted out of the JSX
 * so the data logic is unit-tested and the heavy list subtree can memoize on
 * stable outputs. Mirrors the `computeInsights` (US-540) extraction style.
 */

export type GroupBy = 'category' | 'aisle';

export const CATEGORY_LABELS: Record<FoodCategory, string> = {
  protein: 'Protein',
  carb: 'Carbs',
  dairy: 'Dairy',
  fruit: 'Fruits',
  vegetable: 'Vegetables',
  snack: 'Snacks',
};

export const CATEGORY_ICONS: Record<FoodCategory, string> = {
  protein: '🥩',
  carb: '🍞',
  dairy: '🧀',
  fruit: '🍎',
  vegetable: '🥦',
  snack: '🍿',
};

export const OTHER_CATEGORY_LABEL = 'Other';

// Grocery item categories are now free-text (grocery_items.category was relaxed
// to allow values like "other" / aisle-derived labels), so a direct
// CATEGORY_LABELS[item.category] lookup can be undefined and crash the render.
// Resolve to the friendly label when known, otherwise fall back to "Other".
export function categoryLabel(category: string | null | undefined): string {
  if (category && category in CATEGORY_LABELS) {
    return CATEGORY_LABELS[category as FoodCategory];
  }
  return OTHER_CATEGORY_LABEL;
}

/** Restrict items to a selected list, or return all when none is selected. */
export function filterItemsByList(
  items: GroceryItem[],
  selectedListId: string | null
): GroceryItem[] {
  return selectedListId ? items.filter((item) => item.grocery_list_id === selectedListId) : items;
}

export interface SplitItems {
  active: GroceryItem[];
  purchased: GroceryItem[];
}

/** Split into active (unchecked) and purchased (checked) items. */
export function splitByChecked(items: GroceryItem[]): SplitItems {
  return {
    active: items.filter((i) => !i.checked),
    purchased: items.filter((i) => i.checked),
  };
}

/** Percent of items purchased, rounded; 0 when the list is empty. */
export function computeProgressPercent(total: number, purchased: number): number {
  return total > 0 ? Math.round((purchased / total) * 100) : 0;
}

/** Encouragement message keyed off the progress percentage. */
export function milestoneMessage(progressPercent: number): string {
  if (progressPercent >= 100) return 'Shopping complete!';
  if (progressPercent >= 75) return 'Almost done!';
  if (progressPercent >= 50) return 'Halfway there!';
  if (progressPercent >= 25) return 'Great start!';
  return '';
}

/**
 * Bucket items by friendly category label or by aisle. Free-text/unknown
 * categories fall into "Other"; missing aisles fall into "Uncategorized".
 */
export function groupItems(items: GroceryItem[], groupBy: GroupBy): Record<string, GroceryItem[]> {
  const groups: Record<string, GroceryItem[]> = {};
  if (groupBy === 'category') {
    items.forEach((item) => {
      const label = categoryLabel(item.category);
      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });
  } else {
    items.forEach((item) => {
      const aisle = item.aisle || 'Uncategorized';
      if (!groups[aisle]) groups[aisle] = [];
      groups[aisle].push(item);
    });
  }
  return groups;
}

export type VirtualRow =
  | { type: 'header'; group: string; count: number }
  | { type: 'item'; item: GroceryItem; group: string };

/** Flatten grouped items into virtualizable rows (header row per non-empty group). */
export function flattenGroupedRows(grouped: Record<string, GroceryItem[]>): VirtualRow[] {
  const rows: VirtualRow[] = [];
  for (const [group, items] of Object.entries(grouped)) {
    if (items.length === 0) continue;
    rows.push({ type: 'header', group, count: items.length });
    for (const item of items) {
      rows.push({ type: 'item', item, group });
    }
  }
  return rows;
}

// --- Plan sync (US-713) -----------------------------------------------------

/** Stamped on every row a meal-plan sync creates, so a later sync can find
 *  its own rows and leave everyone else's alone. */
export const MEAL_PLAN_SYNC = 'meal_plan_sync' as const;

/** The subset of a generated row this planner needs. */
export interface GeneratedRow {
  name: string;
  quantity: number;
  unit?: string;
  category?: string;
  aisle?: string;
  source_plan_entry_id?: string;
}

export interface RegenerationPlan {
  /** Auto-generated, unchecked rows the plan no longer calls for. */
  retireIds: string[];
  /** Rows to hand to addGroceryItemsMerged, already stamped for the list. */
  additions: Array<{
    name: string;
    quantity: number;
    unit?: string;
    category?: string;
    aisle?: string;
    grocery_list_id?: string | null;
    auto_generated: true;
    source_plan_entry_id?: string | null;
    added_via: typeof MEAL_PLAN_SYNC;
  }>;
  /** Rows left exactly as they are: hand-added, or already bought. */
  preservedCount: number;
}

/**
 * Work out what a "sync from meal plan" should change, without touching state.
 *
 * The shape that makes this idempotent: a generated row already sitting on the
 * list as an unchecked auto-generated row is neither new nor stale, so it is
 * left alone rather than deleted and re-inserted. Running the sync twice for
 * the same week is therefore a no-op -- no duplicate rows, no doubled
 * quantities, and no realtime churn on a partner's phone.
 *
 * US-713 also replaces the old `is_manual` filter. `is_manual` was never a
 * column: it existed only on a local interface, so it was undefined on every
 * row loaded from the server and the filter preserved nothing but checked rows.
 * Hand-added items were being swept away on every sync. `auto_generated` is
 * persisted, so the inverse test is the one that actually holds.
 *
 * `auto_generated` alone is NOT enough to decide what a sync may retire. The
 * smart-restock RPC (20251010221000) sets the same flag -- its column comment
 * still reads "True if item was auto-added by restock system" -- so retiring on
 * that flag alone would sweep away a user's restock suggestions on every sync.
 * A row is regenerable only when it also carries a plan-sync fingerprint:
 * source_plan_entry_id, or added_via = 'meal_plan_sync'.
 */
/** True only for rows a previous meal-plan sync created. */
function isPlanSyncRow(item: GroceryItem): boolean {
  return Boolean(item.source_plan_entry_id) || item.added_via === MEAL_PLAN_SYNC;
}

export function planRegenerationFromPlan(args: {
  existing: GroceryItem[];
  generated: GeneratedRow[];
  selectedListId: string | null;
}): RegenerationPlan {
  const { existing, generated, selectedListId } = args;
  const key = (name: string) => name.trim().toLowerCase();

  const sameList = (item: GroceryItem) =>
    (item.grocery_list_id ?? null) === (selectedListId ?? null);
  const inSelectedList = existing.filter(sameList);

  // Hand-added rows, restock suggestions and anything already bought are
  // untouchable. Only rows this sync itself created may be retired.
  const preserved = inSelectedList.filter(
    (item) => !item.auto_generated || item.checked || !isPlanSyncRow(item),
  );
  const preservedNames = new Set(preserved.map((item) => key(item.name)));

  const generatedNames = new Set(generated.map((row) => key(row.name)));

  const regenerable = inSelectedList.filter(
    (item) => item.auto_generated && !item.checked && isPlanSyncRow(item),
  );
  const retireIds = regenerable
    .filter((item) => !generatedNames.has(key(item.name)))
    .map((item) => item.id);
  const keptNames = new Set(
    regenerable.filter((item) => generatedNames.has(key(item.name))).map((item) => key(item.name)),
  );

  const additions = generated
    .filter((row) => !preservedNames.has(key(row.name)) && !keptNames.has(key(row.name)))
    .map((row) => ({
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      category: row.category,
      aisle: row.aisle,
      grocery_list_id: selectedListId ?? undefined,
      auto_generated: true as const,
      source_plan_entry_id: row.source_plan_entry_id ?? undefined,
      added_via: MEAL_PLAN_SYNC,
    }));

  return { retireIds, additions, preservedCount: preserved.length };
}
