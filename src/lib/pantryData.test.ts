import { describe, it, expect } from 'vitest';
import {
  computeUniqueKidAllergens,
  computeCategoryCounts,
  computeStockStats,
  filterAndSortFoods,
  groupFoodsByCategory,
  type PantryFilters,
} from './pantryData';
import type { Food, Kid } from '@/types';

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
});
