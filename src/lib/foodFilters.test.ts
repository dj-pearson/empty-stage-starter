import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FOOD_FILTERS,
  foodStock,
  activeFoodFilterCount,
  filterAndSortFoods,
  categoryCounts,
  stockCounts,
  groupByCategory,
  type FoodFilters,
  type FilterableFood,
} from './foodFilters';

const make = (f: Partial<FilterableFood>): FilterableFood => ({ name: 'Item', ...f });

const filters = (overrides: Partial<FoodFilters>): FoodFilters => ({
  ...DEFAULT_FOOD_FILTERS,
  ...overrides,
});

describe('foodStock', () => {
  it('classifies out / low / ok', () => {
    expect(foodStock(0)).toBe('out');
    expect(foodStock(null)).toBe('out');
    expect(foodStock(2)).toBe('low');
    expect(foodStock(5)).toBe('ok');
  });
});

describe('activeFoodFilterCount', () => {
  it('counts category + non-all stock', () => {
    expect(activeFoodFilterCount(DEFAULT_FOOD_FILTERS)).toBe(0);
    expect(activeFoodFilterCount(filters({ category: 'dairy', stock: 'low' }))).toBe(2);
  });
});

describe('filterAndSortFoods', () => {
  const foods: FilterableFood[] = [
    make({ name: 'Milk', category: 'dairy', quantity: 1 }),
    make({ name: 'Cheddar', category: 'dairy', quantity: 5 }),
    make({ name: 'Apple', category: 'fruit', quantity: 0 }),
    make({ name: 'Chicken', category: 'protein', quantity: 3 }),
  ];

  it('filters by category', () => {
    const out = filterAndSortFoods(foods, filters({ category: 'dairy' }));
    expect(out.map((f) => f.name).sort()).toEqual(['Cheddar', 'Milk']);
  });

  it('filters by stock level', () => {
    expect(filterAndSortFoods(foods, filters({ stock: 'out' })).map((f) => f.name)).toEqual([
      'Apple',
    ]);
    expect(filterAndSortFoods(foods, filters({ stock: 'low' })).map((f) => f.name)).toEqual([
      'Milk',
    ]);
  });

  it('sorts by name and by stock ascending', () => {
    expect(filterAndSortFoods(foods, filters({ sortBy: 'name' })).map((f) => f.name)).toEqual([
      'Apple',
      'Cheddar',
      'Chicken',
      'Milk',
    ]);
    expect(filterAndSortFoods(foods, filters({ sortBy: 'stock-asc' }))[0].name).toBe('Apple');
  });

  it('relevance-ranks when searching', () => {
    const out = filterAndSortFoods(foods, filters({ search: 'chick' }));
    expect(out.map((f) => f.name)).toEqual(['Chicken']);
  });
});

describe('counts', () => {
  const foods: FilterableFood[] = [
    make({ name: 'Milk', category: 'dairy', quantity: 1 }),
    make({ name: 'Apple', category: 'fruit', quantity: 0 }),
    make({ name: 'Chicken', category: 'protein', quantity: 3 }),
  ];
  it('categoryCounts totals per category + all', () => {
    const c = categoryCounts(foods);
    expect(c.all).toBe(3);
    expect(c.dairy).toBe(1);
    expect(c.protein).toBe(1);
    expect(c.snack).toBe(0);
  });
  it('stockCounts tallies low/out', () => {
    expect(stockCounts(foods)).toEqual({ all: 3, low: 1, out: 1 });
  });
});

describe('groupByCategory', () => {
  it('buckets in canonical order and omits empties', () => {
    const foods: FilterableFood[] = [
      make({ name: 'Apple', category: 'fruit' }),
      make({ name: 'Milk', category: 'dairy' }),
      make({ name: 'Chicken', category: 'protein' }),
      make({ name: 'Weird', category: 'unknown-cat' }),
    ];
    const groups = groupByCategory(foods);
    expect(groups.map((g) => g.category)).toEqual(['protein', 'dairy', 'fruit', 'other']);
    expect(groups.find((g) => g.category === 'other')?.items[0].name).toBe('Weird');
  });
});
