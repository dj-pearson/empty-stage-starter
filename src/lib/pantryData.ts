import type { Food, Kid } from '@/types';
import {
  CATEGORY_ORDER,
  getStockStatus,
  type SortOption,
} from '@/components/pantry/pantryConstants';

export type StockFilter = 'all' | 'low-stock' | 'out-of-stock';

export interface PantryFilters {
  search: string;
  category: string;
  stock: StockFilter;
  sortBy: SortOption;
}

export interface StockStats {
  lowStock: number;
  outOfStock: number;
  safeCount: number;
  tryBiteCount: number;
}

/**
 * Pure derivations for the Pantry page (US-553 AC2) — extracted out of the JSX
 * so the data logic is unit-tested and the heavy render subtrees can memoize on
 * these stable outputs. Mirrors the `computeInsights` (US-540) extraction style.
 */

/** Distinct allergens declared across the household's kids. */
export function computeUniqueKidAllergens(kids: Kid[]): string[] {
  const all = kids.reduce<string[]>((acc, kid) => {
    if (kid.allergens) return [...acc, ...kid.allergens];
    return acc;
  }, []);
  return [...new Set(all)];
}

/** Count of foods per category, plus an `all` bucket with the total. */
export function computeCategoryCounts(foods: Food[]): Record<string, number> {
  const counts: Record<string, number> = { all: foods.length };
  for (const cat of CATEGORY_ORDER) {
    counts[cat] = foods.filter((f) => f.category === cat).length;
  }
  return counts;
}

/** Low/out-of-stock and safe/try-bite tallies for the stats bar. */
export function computeStockStats(foods: Food[]): StockStats {
  let lowStock = 0;
  let outOfStock = 0;
  let safeCount = 0;
  let tryBiteCount = 0;
  for (const f of foods) {
    const status = getStockStatus(f.quantity);
    if (status === 'low') lowStock++;
    if (status === 'out') outOfStock++;
    if (f.is_safe) safeCount++;
    if (f.is_try_bite) tryBiteCount++;
  }
  return { lowStock, outOfStock, safeCount, tryBiteCount };
}

/** Apply search/category/stock filters and the selected sort. Non-mutating. */
export function filterAndSortFoods(foods: Food[], filters: PantryFilters): Food[] {
  const { search, category, stock, sortBy } = filters;
  const needle = search.toLowerCase();

  let result = foods.filter((food) => {
    if (!food || !food.name) return false;
    const matchesSearch = food.name.toLowerCase().includes(needle);
    const matchesCategory = category === 'all' || food.category === category;
    const matchesStock =
      stock === 'all' ||
      (stock === 'low-stock' && getStockStatus(food.quantity) === 'low') ||
      (stock === 'out-of-stock' && getStockStatus(food.quantity) === 'out');
    return matchesSearch && matchesCategory && matchesStock;
  });

  switch (sortBy) {
    case 'name':
      result = [...result].sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'low-stock':
      result = [...result].sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0));
      break;
    case 'category':
      result = [...result].sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.category);
        const bi = CATEGORY_ORDER.indexOf(b.category);
        return ai - bi || a.name.localeCompare(b.name);
      });
      break;
    case 'recent':
      result = [...result].reverse();
      break;
  }
  return result;
}

/** Bucket foods into the fixed category order (empty arrays kept for each). */
export function groupFoodsByCategory(foods: Food[]): Record<string, Food[]> {
  const groups: Record<string, Food[]> = {};
  for (const cat of CATEGORY_ORDER) {
    groups[cat] = [];
  }
  for (const food of foods) {
    if (groups[food.category]) {
      groups[food.category].push(food);
    }
  }
  return groups;
}
