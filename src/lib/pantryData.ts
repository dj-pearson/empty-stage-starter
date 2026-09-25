import type { Food, Kid } from '@/types';
import {
  PANTRY_DISPLAY_ORDER,
  getStockStatus,
  toDisplayCategory,
  type SortOption,
} from '@/components/pantry/pantryConstants';
import { fitGroup, type ItemFit } from '@/lib/kidFit';

/** `needs-restock` is low OR out: the one filter behind "what do I buy". */
export type StockFilter = 'all' | 'low-stock' | 'out-of-stock' | 'needs-restock';

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

/**
 * Count of foods per display category, plus an `all` bucket with the total.
 * A category outside CATEGORY_ORDER (the column is free text; iOS, CSV import
 * and catalog rows can write anything) counts under `other`, so the per-chip
 * counts always add up to `all`.
 */
export function computeCategoryCounts(foods: Food[]): Record<string, number> {
  const counts: Record<string, number> = { all: foods.length };
  for (const cat of PANTRY_DISPLAY_ORDER) counts[cat] = 0;
  for (const f of foods) {
    const key = toDisplayCategory(f?.category);
    counts[key] = (counts[key] ?? 0) + 1;
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
    const matchesCategory = category === 'all' || toDisplayCategory(food.category) === category;
    const status = getStockStatus(food.quantity);
    const matchesStock =
      stock === 'all' ||
      (stock === 'low-stock' && status === 'low') ||
      (stock === 'out-of-stock' && status === 'out') ||
      (stock === 'needs-restock' && (status === 'low' || status === 'out'));
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
        const ai = PANTRY_DISPLAY_ORDER.indexOf(toDisplayCategory(a.category));
        const bi = PANTRY_DISPLAY_ORDER.indexOf(toDisplayCategory(b.category));
        return ai - bi || a.name.localeCompare(b.name);
      });
      break;
    case 'recent':
      result = [...result].reverse();
      break;
  }
  return result;
}

/**
 * Bucket foods into the fixed display order (empty arrays kept for each).
 * Unknown categories land in `other` rather than vanishing: this used to drop
 * any row whose category was not one of the six, so a food imported as
 * "frozen" was in the pantry count and on no shelf.
 */
export function groupFoodsByCategory(foods: Food[]): Record<string, Food[]> {
  const groups: Record<string, Food[]> = {};
  for (const cat of PANTRY_DISPLAY_ORDER) {
    groups[cat] = [];
  }
  for (const food of foods) {
    if (!food) continue;
    groups[toDisplayCategory(food.category)].push(food);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Stock buckets
// ---------------------------------------------------------------------------

export interface StockBuckets {
  low: Food[];
  out: Food[];
  /** No count and no history: never tracked, not "ran out". */
  untracked: Food[];
}

export interface StockBucketOptions {
  /**
   * Whether the household has ever counted this food: a ledger balance, a
   * restock in the grocery history, or similar. Supplied by the caller so this
   * stays pure.
   */
  isTracked: (food: Food) => boolean;
}

/**
 * Split the pantry into low, out and untracked.
 *
 * getStockStatus reads a missing quantity as "out", which is right for one
 * card but wrong for a summary: a new household's 30 starter foods have no
 * quantity at all, and telling that parent "30 items out of stock" is noise
 * they learn to ignore. A food with no count (0 or none) that nothing has ever
 * tracked is `untracked`; once it has been counted, reaching zero is `out`.
 * getStockStatus itself is unchanged (mobile parity, foodFilters.test.ts).
 */
export function computeStockBuckets(foods: Food[], opts: StockBucketOptions): StockBuckets {
  const low: Food[] = [];
  const out: Food[] = [];
  const untracked: Food[] = [];
  for (const food of foods) {
    if (!food) continue;
    const status = getStockStatus(food.quantity);
    if (status === 'ok') continue;
    const noCount = food.quantity == null || food.quantity === 0;
    if (noCount && !opts.isTracked(food)) {
      untracked.push(food);
    } else if (status === 'out') {
      out.push(food);
    } else {
      low.push(food);
    }
  }
  return { low, out, untracked };
}

// ---------------------------------------------------------------------------
// Kid fit
// ---------------------------------------------------------------------------

export type FitFilter = 'all' | 'eats' | 'trying' | 'avoid';

/**
 * Filter by how the food fits the kids in view (see kidFit.ts).
 *
 * - eats: fitGroup is `safe` (safe or go-to for every kid, allergens checked).
 * - trying: fitGroup is `trying`.
 * - avoid: at least one kid is allergic to it or dislikes it.
 *
 * A food with no entry in `fitByFoodId` is only kept under `all`: without a
 * fit there is nothing to say it is safe, and never guessing safe is the rule.
 */
export function filterByFit(
  foods: Food[],
  fitByFoodId: ReadonlyMap<string, ItemFit>,
  filter: FitFilter,
): Food[] {
  if (filter === 'all') return foods;
  return foods.filter((food) => {
    const fit = food ? fitByFoodId.get(food.id) : undefined;
    if (!fit) return false;
    switch (filter) {
      case 'eats':
        return fitGroup(fit) === 'safe';
      case 'trying':
        return fitGroup(fit) === 'trying';
      case 'avoid':
        return fit.allergenKids.length > 0 || fit.dislikeKids.length > 0;
    }
    return false;
  });
}

export interface SafeRunningLowOptions {
  /**
   * When given, a food with no count that was never tracked is left out, for
   * the same reason computeStockBuckets calls it untracked rather than out.
   */
  isTracked?: (food: Food) => boolean;
}

/**
 * The foods a kid actually eats that are low or out, most urgent first: the
 * shortest forecast (days until run-out) leads, foods without a forecast
 * follow, and quantity then name break ties. "Actually eats" is safe for
 * every kid in view or a named go-to for at least one.
 */
export function computeSafeRunningLow(
  foods: Food[],
  fitByFoodId: ReadonlyMap<string, ItemFit>,
  forecastDays?: ReadonlyMap<string, number>,
  opts: SafeRunningLowOptions = {},
): Food[] {
  const picked = foods.filter((food) => {
    if (!food) return false;
    const fit = fitByFoodId.get(food.id);
    if (!fit || !(fit.safeForAll || fit.goToKids.length > 0)) return false;
    const status = getStockStatus(food.quantity);
    if (status === 'ok') return false;
    if (opts.isTracked && (food.quantity == null || food.quantity === 0) && !opts.isTracked(food)) {
      return false;
    }
    return true;
  });
  const days = (f: Food) => {
    const d = forecastDays?.get(f.id);
    return typeof d === 'number' && Number.isFinite(d) ? d : Number.POSITIVE_INFINITY;
  };
  return picked.sort((a, b) => {
    const da = days(a);
    const db = days(b);
    if (da !== db) return da < db ? -1 : 1;
    const qa = a.quantity ?? 0;
    const qb = b.quantity ?? 0;
    if (qa !== qb) return qa - qb;
    return a.name.localeCompare(b.name);
  });
}
