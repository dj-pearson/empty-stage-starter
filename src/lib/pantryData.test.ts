import { describe, it, expect } from 'vitest';
import {
  computeUniqueKidAllergens,
  computeCategoryCounts,
  computeStockStats,
  filterAndSortFoods,
  groupFoodsByCategory,
  computeStockBuckets,
  filterByFit,
  computeSafeRunningLow,
  type PantryFilters,
} from './pantryData';
import { getKidFoodFit, summarizeKidFits, type ItemFit } from './kidFit';
import type { Food, FoodCategory, Kid } from '@/types';

const food = (id: string, over: Partial<Food> = {}): Food =>
  ({
    id,
    name: id,
    category: 'protein',
    is_safe: false,
    is_try_bite: false,
    quantity: 5,
    ...over,
  }) as Food;
const kid = (id: string, over: Partial<Kid> = {}): Kid =>
  ({ id, name: id, allergens: [], ...over }) as unknown as Kid;

const ALL: PantryFilters = { search: '', category: 'all', stock: 'all', sortBy: 'name' };

describe('pantryData (US-553 AC2)', () => {
  it('computeUniqueKidAllergens dedupes across kids', () => {
    const kids = [
      kid('a', { allergens: ['peanut', 'egg'] }),
      kid('b', { allergens: ['egg', 'milk'] }),
    ];
    expect(computeUniqueKidAllergens(kids).sort()).toEqual(['egg', 'milk', 'peanut']);
    expect(computeUniqueKidAllergens([kid('c')])).toEqual([]);
  });

  it('computeCategoryCounts tallies per category with an all bucket', () => {
    const foods = [
      food('a', { category: 'protein' }),
      food('b', { category: 'fruit' }),
      food('c', { category: 'protein' }),
    ];
    const counts = computeCategoryCounts(foods);
    expect(counts.all).toBe(3);
    expect(counts.protein).toBe(2);
    expect(counts.fruit).toBe(1);
    expect(counts.snack).toBe(0);
  });

  it('computeStockStats counts low/out stock and safe/try-bite flags', () => {
    const foods = [
      food('a', { quantity: 0 }), // out
      food('b', { quantity: 1 }), // low (<= 2)
      food('c', { quantity: 10, is_safe: true }),
      food('d', { quantity: undefined, is_try_bite: true }), // out (0)
    ];
    expect(computeStockStats(foods)).toEqual({
      lowStock: 1,
      outOfStock: 2,
      safeCount: 1,
      tryBiteCount: 1,
    });
  });

  it('filterAndSortFoods filters by search, category, and stock', () => {
    const foods = [
      food('apple', { category: 'fruit', quantity: 0 }),
      food('apricot', { category: 'fruit', quantity: 1 }),
      food('beef', { category: 'protein', quantity: 10 }),
    ];
    expect(filterAndSortFoods(foods, { ...ALL, search: 'ap' }).map((f) => f.name)).toEqual([
      'apple',
      'apricot',
    ]);
    expect(filterAndSortFoods(foods, { ...ALL, category: 'protein' }).map((f) => f.name)).toEqual([
      'beef',
    ]);
    expect(filterAndSortFoods(foods, { ...ALL, stock: 'out-of-stock' }).map((f) => f.name)).toEqual(
      ['apple']
    );
    expect(filterAndSortFoods(foods, { ...ALL, stock: 'low-stock' }).map((f) => f.name)).toEqual([
      'apricot',
    ]);
  });

  it('filterAndSortFoods sorts by name, low-stock, and recent without mutating input', () => {
    const foods = [
      food('beef', { quantity: 5 }),
      food('apple', { quantity: 1 }),
      food('carrot', { quantity: 3 }),
    ];
    const original = [...foods];
    expect(filterAndSortFoods(foods, { ...ALL, sortBy: 'name' }).map((f) => f.name)).toEqual([
      'apple',
      'beef',
      'carrot',
    ]);
    expect(filterAndSortFoods(foods, { ...ALL, sortBy: 'low-stock' }).map((f) => f.name)).toEqual([
      'apple',
      'carrot',
      'beef',
    ]);
    expect(filterAndSortFoods(foods, { ...ALL, sortBy: 'recent' }).map((f) => f.name)).toEqual([
      'carrot',
      'apple',
      'beef',
    ]);
    expect(foods).toEqual(original); // input untouched
  });

  it('filterAndSortFoods drops malformed rows', () => {
    const foods = [food('ok'), { id: 'x' } as unknown as Food];
    expect(filterAndSortFoods(foods, ALL).map((f) => f.name)).toEqual(['ok']);
  });

  it('groupFoodsByCategory buckets into the fixed order with empty arrays', () => {
    const foods = [food('a', { category: 'protein' }), food('b', { category: 'snack' })];
    const groups = groupFoodsByCategory(foods);
    expect(groups.protein.map((f) => f.name)).toEqual(['a']);
    expect(groups.snack.map((f) => f.name)).toEqual(['b']);
    expect(groups.fruit).toEqual([]);
  });

  it('filterAndSortFoods: low-stock, out-of-stock and needs-restock', () => {
    const foods = [
      food('out', { quantity: 0 }),
      food('low', { quantity: 2 }),
      food('half', { quantity: 0.5 }),
      food('ok', { quantity: 3 }),
    ];
    const names = (stock: PantryFilters['stock']) =>
      filterAndSortFoods(foods, { ...ALL, stock }).map((f) => f.name);
    expect(names('low-stock')).toEqual(['half', 'low']);
    expect(names('out-of-stock')).toEqual(['out']);
    expect(names('needs-restock')).toEqual(['half', 'low', 'out']);
  });
});

describe('pantryData: unknown categories bucket under other', () => {
  const odd = [
    food('a', { category: 'other' as FoodCategory }),
    food('b', { category: 'frozen' as FoodCategory }),
    food('c', { category: 'fruit' }),
  ];

  it('groupFoodsByCategory puts other and frozen under other', () => {
    const groups = groupFoodsByCategory(odd);
    expect(groups.other.map((f) => f.name)).toEqual(['a', 'b']);
    expect(groups.fruit.map((f) => f.name)).toEqual(['c']);
    expect(Object.keys(groups)).not.toContain('frozen');
  });

  it('computeCategoryCounts adds up to all', () => {
    const counts = computeCategoryCounts(odd);
    expect(counts.other).toBe(2);
    expect(counts.fruit).toBe(1);
    expect(counts.all).toBe(3);
    expect(counts.frozen).toBeUndefined();
  });

  it('filterAndSortFoods keeps them, and the other filter finds both', () => {
    expect(filterAndSortFoods(odd, ALL).map((f) => f.name)).toEqual(['a', 'b', 'c']);
    expect(filterAndSortFoods(odd, { ...ALL, category: 'other' }).map((f) => f.name)).toEqual([
      'a',
      'b',
    ]);
    expect(
      filterAndSortFoods(odd, { ...ALL, sortBy: 'category' }).map((f) => f.name)
    ).toEqual(['c', 'a', 'b']);
  });
});

describe('pantryData: computeStockBuckets', () => {
  it('30 starter rows with no quantity and no history are untracked, not out', () => {
    const starters = Array.from({ length: 30 }, (_, i) => food(`s${i}`, { quantity: undefined }));
    const buckets = computeStockBuckets(starters, { isTracked: () => false });
    expect(buckets.untracked).toHaveLength(30);
    expect(buckets.out).toEqual([]);
    expect(buckets.low).toEqual([]);
  });

  it('a tracked food at zero is out; low and ok are unaffected by tracking', () => {
    const foods = [
      food('ranOut', { quantity: 0 }),
      food('never', { quantity: 0 }),
      food('low', { quantity: 1 }),
      food('ok', { quantity: 9 }),
    ];
    const tracked = new Set(['ranOut']);
    const buckets = computeStockBuckets(foods, { isTracked: (f) => tracked.has(f.id) });
    expect(buckets.out.map((f) => f.id)).toEqual(['ranOut']);
    expect(buckets.untracked.map((f) => f.id)).toEqual(['never']);
    expect(buckets.low.map((f) => f.id)).toEqual(['low']);
  });
});

describe('pantryData: kid fit', () => {
  const ava = kid('ava', { name: 'Ava', allergens: [] });
  const leo = kid('leo', { name: 'Leo', allergens: ['Peanuts'], disliked_foods: ['Broccoli'] });
  const kids = [ava, leo];

  function fitsFor(foods: Food[], forKids: Kid[] = kids): Map<string, ItemFit> {
    const map = new Map<string, ItemFit>();
    for (const f of foods) {
      map.set(
        f.id,
        summarizeKidFits(forKids.map((k) => ({ kid: k, fit: getKidFoodFit(k, f, new Map()) })))
      );
    }
    return map;
  }

  const pb = food('pb', { name: 'Peanut Butter', is_safe: true, allergens: ['peanut'] });
  const apple = food('apple', { name: 'Apple', is_safe: true, allergens: [] });
  const peas = food('peas', { name: 'Peas', is_try_bite: true, allergens: [] });
  const broc = food('broc', { name: 'Broccoli', is_safe: true, allergens: [] });
  const foods = [pb, apple, peas, broc];

  it('a kid allergic to "Peanuts" puts a food tagged "peanut" in avoid', () => {
    const fits = fitsFor(foods);
    expect(filterByFit(foods, fits, 'avoid').map((f) => f.id)).toEqual(['pb', 'broc']);
    expect(filterByFit(foods, fits, 'eats').map((f) => f.id)).toEqual(['apple']);
    expect(filterByFit(foods, fits, 'trying').map((f) => f.id)).toEqual(['peas']);
    expect(filterByFit(foods, fits, 'all')).toHaveLength(4);
  });

  it('a food with no fit entry is only kept under all', () => {
    const fits = fitsFor([apple]);
    expect(filterByFit(foods, fits, 'eats').map((f) => f.id)).toEqual(['apple']);
    expect(filterByFit(foods, fits, 'avoid')).toEqual([]);
  });

  it('computeSafeRunningLow orders by forecast days, then quantity', () => {
    const goTo = kid('ava', { name: 'Ava', allergens: [], always_eats_foods: ['Yogurt'] });
    const rows = [
      food('apple', { name: 'Apple', is_safe: true, quantity: 2 }),
      food('milk', { name: 'Milk', is_safe: true, quantity: 1 }),
      food('bread', { name: 'Bread', is_safe: true, quantity: 0 }),
      food('yogurt', { name: 'Yogurt', is_safe: false, quantity: 1 }),
      food('cheese', { name: 'Cheese', is_safe: true, quantity: 8 }), // ok stock
      food('peas', { name: 'Peas', is_try_bite: true, quantity: 1 }), // not safe
    ];
    const fits = fitsFor(rows, [goTo]);
    const forecast = new Map([
      ['apple', 1],
      ['yogurt', 4],
    ]);
    expect(computeSafeRunningLow(rows, fits, forecast).map((f) => f.id)).toEqual([
      'apple',
      'yogurt',
      'bread',
      'milk',
    ]);
    expect(computeSafeRunningLow(rows, fits).map((f) => f.id)).toEqual([
      'bread',
      'milk',
      'yogurt',
      'apple',
    ]);
    // An untracked zero is left out when the caller says what is tracked.
    expect(
      computeSafeRunningLow(rows, fits, undefined, { isTracked: () => false }).map((f) => f.id)
    ).toEqual(['milk', 'yogurt', 'apple']);
  });
});
