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
