/**
 * Pantry -> grocery list: what a low-stock food becomes on the list, and
 * whether it is already there.
 *
 * Pure. The write goes through GroceryContext.mergeGroceryItems, which keys
 * rows on ingredientMatchKey, so "is it on the list" here uses the same key:
 * a pantry "Eggs" and a list "egg" are the same row to the merge, and would be
 * a false "not on list" if this module compared names any other way.
 */
import type { Food, GroceryItem } from '@/types';
import { LOW_STOCK_THRESHOLD } from '@/components/pantry/pantryConstants';
import { resolveFood, type CatalogEntry } from '@/lib/effectiveFood';
import { ingredientMatchKey, type GroceryAddInput } from '@/lib/groceryMerge';

/** A pantry "unit" that is not a shopping unit. */
const NON_SHOPPING_UNITS = new Set(['', 'servings', 'serving']);

/**
 * The grocery row for a food that is running low: enough to get back above
 * the low-stock line (at least 1), in the food's own unit when it has a real
 * one. Name, category and aisle come from the catalog when the food is linked
 * to one, like every other list path (US-795).
 */
export function pantryToGroceryInput(food: Food, catalog: CatalogEntry | null): GroceryAddInput {
  const effective = resolveFood(food, catalog);
  const qty = typeof food.quantity === 'number' && Number.isFinite(food.quantity) ? food.quantity : 0;
  const quantity = Math.max(1, LOW_STOCK_THRESHOLD + 1 - qty);
  const rawUnit = (food.unit ?? '').trim();
  const unit = NON_SHOPPING_UNITS.has(rawUnit.toLowerCase()) ? '' : rawUnit;
  return {
    name: effective.name,
    quantity,
    unit,
    category: effective.category,
    aisle: effective.aisle ?? null,
    added_via: 'pantry',
  };
}

/** The merge key of every unchecked row: what an add would stack onto. */
export function buildOnListKeySet(
  groceryItems: ReadonlyArray<Pick<GroceryItem, 'name' | 'checked'>>,
): Set<string> {
  const keys = new Set<string>();
  for (const item of groceryItems) {
    if (!item || item.checked || !item.name) continue;
    const key = ingredientMatchKey(item.name);
    if (key) keys.add(key);
  }
  return keys;
}

/** Whether an unchecked list row already covers this food. */
export function isOnList(onListKeys: ReadonlySet<string>, food: Pick<Food, 'name'>): boolean {
  if (!food?.name) return false;
  const key = ingredientMatchKey(food.name);
  return key.length > 0 && onListKeys.has(key);
}
