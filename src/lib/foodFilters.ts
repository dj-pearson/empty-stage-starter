/**
 * Pure, dependency-free pantry (foods) search + filter + sort + grouping for
 * the mobile Pantry screen. A mobile-safe sibling of the web-only
 * `src/lib/pantryData.ts` (which transitively imports `lucide-react` via
 * `pantryConstants` and therefore can't be bundled by Metro). Kept under `src/`
 * for Vitest + typecheck coverage. Search relevance comes from `mobileSearch`.
 */
import { searchRank } from './mobileSearch';

export type FoodStock = 'out' | 'low' | 'ok';
export type StockFilter = 'all' | 'low' | 'out';
export type FoodSort = 'name' | 'stock-asc' | 'category';

/** Canonical category order, matching the web `CATEGORY_ORDER`. */
export const FOOD_CATEGORY_ORDER = [
  'protein',
  'carb',
  'dairy',
  'fruit',
  'vegetable',
  'snack',
] as const;

export const LOW_STOCK_THRESHOLD = 2;

export function foodStock(quantity: number | null | undefined): FoodStock {
  const qty = quantity ?? 0;
  if (qty <= 0) return 'out';
  if (qty <= LOW_STOCK_THRESHOLD) return 'low';
  return 'ok';
}

export interface FoodFilters {
  search: string;
  category: string | null;
  stock: StockFilter;
  sortBy: FoodSort;
}

export const DEFAULT_FOOD_FILTERS: FoodFilters = {
  search: '',
  category: null,
  stock: 'all',
  sortBy: 'name',
};

/** Minimum shape the filters need; the screen row type is a superset. */
export interface FilterableFood {
  name: string;
  category?: string | null;
  quantity?: number | null;
}

/** Count of active facet filters (excludes free-text search), for a badge. */
export function activeFoodFilterCount(filters: FoodFilters): number {
  let n = 0;
  if (filters.category) n++;
  if (filters.stock !== 'all') n++;
  return n;
}

function categoryRank(category: string | null | undefined): number {
  const idx = FOOD_CATEGORY_ORDER.indexOf((category ?? '') as (typeof FOOD_CATEGORY_ORDER)[number]);
  return idx === -1 ? FOOD_CATEGORY_ORDER.length : idx;
}

function applySort<T extends FilterableFood>(foods: T[], sortBy: FoodSort): T[] {
  const list = [...foods];
  switch (sortBy) {
    case 'stock-asc':
      return list.sort(
        (a, b) => (a.quantity ?? 0) - (b.quantity ?? 0) || a.name.localeCompare(b.name)
      );
    case 'category':
      return list.sort(
        (a, b) =>
          categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name)
      );
    case 'name':
    default:
      return list.sort((a, b) => a.name.localeCompare(b.name));
  }
}

/**
 * Search, facet-filter, then sort. When a search query is present results are
 * relevance-ranked and `sortBy` is ignored; otherwise `sortBy` applies.
 */
export function filterAndSortFoods<T extends FilterableFood>(
  foods: T[],
  filters: FoodFilters
): T[] {
  const hasSearch = filters.search.trim().length > 0;

  let result = searchRank(foods, filters.search, (f) => [{ value: f.name, weight: 3 }]);

  result = result.filter((f) => {
    if (filters.category && (f.category ?? null) !== filters.category) return false;
    if (filters.stock === 'low' && foodStock(f.quantity) !== 'low') return false;
    if (filters.stock === 'out' && foodStock(f.quantity) !== 'out') return false;
    return true;
  });

  if (!hasSearch) result = applySort(result, filters.sortBy);
  return result;
}

/** Foods per category plus an `all` total. */
export function categoryCounts<T extends FilterableFood>(foods: T[]): Record<string, number> {
  const counts: Record<string, number> = { all: foods.length };
  for (const cat of FOOD_CATEGORY_ORDER) counts[cat] = 0;
  for (const f of foods) {
    if (f.category && counts[f.category] !== undefined) counts[f.category]++;
  }
  return counts;
}

/** Low / out tallies for filter chips. */
export function stockCounts<T extends FilterableFood>(
  foods: T[]
): { all: number; low: number; out: number } {
  let low = 0;
  let out = 0;
  for (const f of foods) {
    const s = foodStock(f.quantity);
    if (s === 'low') low++;
    else if (s === 'out') out++;
  }
  return { all: foods.length, low, out };
}

/**
 * Bucket foods into category sections in canonical order, preserving the input
 * order within each section (so an upstream sort/relevance rank is respected).
 * Empty sections are omitted. Unknown categories collect under `other`.
 */
export function groupByCategory<T extends FilterableFood>(
  foods: T[]
): Array<{ category: string; items: T[] }> {
  const buckets = new Map<string, T[]>();
  for (const f of foods) {
    const key =
      f.category && FOOD_CATEGORY_ORDER.includes(f.category as (typeof FOOD_CATEGORY_ORDER)[number])
        ? f.category
        : 'other';
    const bucket = buckets.get(key);
    if (bucket) bucket.push(f);
    else buckets.set(key, [f]);
  }
  const ordered: Array<{ category: string; items: T[] }> = [];
  for (const cat of FOOD_CATEGORY_ORDER) {
    const items = buckets.get(cat);
    if (items && items.length) ordered.push({ category: cat, items });
  }
  const other = buckets.get('other');
  if (other && other.length) ordered.push({ category: 'other', items: other });
  return ordered;
}
