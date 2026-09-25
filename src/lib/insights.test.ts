import { describe, it, expect } from 'vitest';
import {
  buildFoodById,
  checkUpcomingAllergens,
  computeGroupBalance,
  computeKidRepeats,
  kidWindowEntries,
  rankEasyAdds,
} from './insights';
import { buildResultIndex } from './kidFit';
import { addIsoDays } from './date-utils';
import type { Food, FoodCategory, Kid, MealResult, MealSlot, PlanEntry, Recipe } from '@/types';

const TODAY = '2026-06-30';
const daysAgo = (n: number) => addIsoDays(TODAY, -n);

function food(id: string, over: Partial<Food> = {}): Food {
  return { id, name: id, category: 'protein', is_safe: false, is_try_bite: false, allergens: [], quantity: 0, ...over };
}

/** A food whose category column holds free text, as an import can leave it. */
function freeTextFood(id: string, category: string): Food {
  const base = food(id);
  return Object.assign(base, { category: category as FoodCategory });
}

function kid(id: string, over: Partial<Kid> = {}): Kid {
  return { id, name: id, allergens: [], ...over };
}

let seq = 0;
function entry(over: Partial<PlanEntry> & { food_id: string }): PlanEntry {
  seq += 1;
  const result: MealResult = over.result === undefined ? 'ate' : over.result;
  const meal_slot: MealSlot = over.meal_slot ?? 'dinner';
  return { id: `e${seq}`, kid_id: 'k1', date: daysAgo(1), recipe_id: null, ...over, meal_slot, result };
}

describe('computeGroupBalance', () => {
  const foods = [
    food('broccoli', { category: 'vegetable' }),
    food('peas', { category: 'vegetable' }),
    food('apple', { category: 'fruit' }),
    food('chips', { category: 'snack' }),
    freeTextFood('mystery', 'Condiments'),
  ];

  it('counts only logged results inside [today-27, today]', () => {
    const planEntries = [
      entry({ food_id: 'broccoli', result: 'ate', date: addIsoDays(TODAY, 2) }), // future plan
      entry({ food_id: 'broccoli', result: null, date: daysAgo(2) }), // not logged
      entry({ food_id: 'apple', result: 'ate', date: daysAgo(40) }), // outside window
    ];
    const b = computeGroupBalance({ kid: kid('k1'), foods, planEntries, todayIso: TODAY });
    const veg = b.groups.find((g) => g.group === 'vegetable');
    expect(veg).toEqual({ group: 'vegetable', offered: 0, accepted: 0, lastAcceptedIso: null });
    expect(b.groups.find((g) => g.group === 'fruit')?.offered).toBe(0);
    expect(b.loggedCount).toBe(0);
  });

  it('counts a refused-only food as offered but not accepted', () => {
    const planEntries = [
      entry({ food_id: 'peas', result: 'refused', date: daysAgo(3) }),
      entry({ food_id: 'broccoli', result: 'tasted', date: daysAgo(5) }),
      entry({ food_id: 'broccoli', result: 'ate', date: daysAgo(2) }),
    ];
    const b = computeGroupBalance({ kid: kid('k1'), foods, planEntries, todayIso: TODAY });
    expect(b.groups.find((g) => g.group === 'vegetable')).toEqual({
      group: 'vegetable',
      offered: 2,
      accepted: 1,
      lastAcceptedIso: daysAgo(2),
    });
  });

  it('keeps snack out of the balance groups and buckets free text into otherCount', () => {
    const planEntries = [
      entry({ food_id: 'chips', result: 'ate' }),
      entry({ food_id: 'mystery', result: 'ate' }),
    ];
    const b = computeGroupBalance({ kid: kid('k1'), foods, planEntries, todayIso: TODAY });
    expect(b.groups.map((g) => g.group)).toEqual(['protein', 'carb', 'dairy', 'fruit', 'vegetable']);
    expect(b.groups.every((g) => g.offered === 0)).toBe(true);
    expect(b.otherCount).toBe(1);
  });

  it('ignores a sibling and lists thin groups with never-offered first', () => {
    const planEntries = [
      entry({ food_id: 'peas', result: 'refused', date: daysAgo(3) }), // offered, not accepted
      entry({ food_id: 'apple', result: 'ate', date: daysAgo(20) }), // accepted, but > 14 days ago
      entry({ food_id: 'broccoli', result: 'ate', kid_id: 'k2' }),
    ];
    const b = computeGroupBalance({ kid: kid('k1'), foods, planEntries, todayIso: TODAY });
    expect(b.thinGroups.slice(0, 3)).toEqual(['protein', 'carb', 'dairy']);
    expect(b.thinGroups).toContain('vegetable');
    expect(b.thinGroups).toContain('fruit');
  });
});

describe('checkUpcomingAllergens', () => {
  const foods = [food('pb', { name: 'Peanut butter', allergens: ['en:peanuts'] }), food('rice', { category: 'carb' })];
  const foodById = buildFoodById(foods);
  const planned = [
    entry({ food_id: 'pb', result: null, date: addIsoDays(TODAY, 2), meal_slot: 'lunch' }),
    entry({ food_id: 'rice', result: null, date: addIsoDays(TODAY, 3) }),
  ];

  it("returns 'unknown-list' when allergens are undefined", () => {
    const k = kid('k1', { allergens: undefined });
    expect(checkUpcomingAllergens({ kid: k, foodById, planEntries: planned, todayIso: TODAY }).status).toBe(
      'unknown-list',
    );
  });

  it("returns 'none-recorded' for an empty list", () => {
    expect(checkUpcomingAllergens({ kid: kid('k1'), foodById, planEntries: planned, todayIso: TODAY }).status).toBe(
      'none-recorded',
    );
  });

  it("matches a kid's 'peanuts' against a food's 'en:peanuts'", () => {
    const k = kid('k1', { allergens: ['peanuts'] });
    const check = checkUpcomingAllergens({ kid: k, foodById, planEntries: planned, todayIso: TODAY });
    expect(check.status).toBe('hits');
    expect(check.hits).toEqual([
      { foodId: 'pb', foodName: 'Peanut butter', date: addIsoDays(TODAY, 2), mealSlot: 'lunch', allergen: 'peanuts' },
    ]);
  });

  it("is 'clear' only when everything resolved, and 'partial' otherwise", () => {
    const k = kid('k1', { allergens: ['sesame'] });
    expect(checkUpcomingAllergens({ kid: k, foodById, planEntries: planned, todayIso: TODAY }).status).toBe('clear');
    const withGhost = [...planned, entry({ food_id: 'deleted-food', result: null, date: addIsoDays(TODAY, 1) })];
    const check = checkUpcomingAllergens({ kid: k, foodById, planEntries: withGhost, todayIso: TODAY });
    expect(check.status).toBe('partial');
    expect(check.uncheckedCount).toBe(1);
  });

  it('ignores past entries and entries beyond the look-ahead', () => {
    const k = kid('k1', { allergens: ['peanuts'] });
    const outside = [
      entry({ food_id: 'pb', date: daysAgo(1) }),
      entry({ food_id: 'pb', result: null, date: addIsoDays(TODAY, 14) }),
    ];
    expect(checkUpcomingAllergens({ kid: k, foodById, planEntries: outside, todayIso: TODAY }).status).toBe('clear');
  });
});

describe('rankEasyAdds', () => {
  it('drops allergen and disliked foods and puts an in-stock, tasted-before food first', () => {
    const k = kid('k1', { allergens: ['milk'], disliked_foods: ['Peas'] });
    const foods = [
      food('cheese-veg', { name: 'Cheesy veg', category: 'vegetable', allergens: ['milk'], quantity: 4 }),
      food('peas', { name: 'Peas', category: 'vegetable', quantity: 4 }),
      food('kale', { name: 'Kale', category: 'vegetable', is_try_bite: true, quantity: 0 }),
      food('carrot', { name: 'Carrot', category: 'vegetable', quantity: 3 }),
      food('corn', { name: 'Corn', category: 'vegetable', quantity: 0 }),
      food('apple', { name: 'Apple', category: 'fruit', quantity: 3 }),
    ];
    const entries = [
      entry({ food_id: 'carrot', result: 'tasted', date: daysAgo(4) }),
      entry({ food_id: 'corn', result: 'ate', date: addIsoDays(TODAY, 1) }), // future: not "accepted before"
    ];
    const windowed = kidWindowEntries({ kid: k, planEntries: entries, todayIso: TODAY });
    const resultIndex = buildResultIndex(windowed, k.id, addIsoDays(TODAY, 1));
    const adds = rankEasyAdds({
      kid: k,
      group: 'vegetable',
      foods,
      resultIndex,
      onListKeys: new Set(['corn']),
    });
    expect(adds.map((a) => a.food.id)).toEqual(['carrot', 'kale', 'corn']);
    expect(adds[0]).toMatchObject({ availability: 'pantry', acceptedBefore: true });
    expect(adds[1].availability).toBe('none');
    expect(adds[2]).toMatchObject({ availability: 'onList', acceptedBefore: false });
  });
});

describe('computeKidRepeats', () => {
  const recipes: Pick<Recipe, 'id' | 'name'>[] = [{ id: 'r1', name: 'Mac and cheese' }];
  const foods = [food('pasta', { name: 'Pasta', category: 'carb' })];

  it("ignores a sibling's entries", () => {
    const sibling = [1, 2, 3, 4].map((d) =>
      entry({ food_id: 'pasta', recipe_id: 'r1', kid_id: 'k2', date: daysAgo(d) }),
    );
    const mine = [1, 2, 3, 4].map((d) => entry({ food_id: 'pasta', recipe_id: 'r1', date: daysAgo(d) }));
    expect(computeKidRepeats({ kid: kid('k1'), planEntries: sibling, recipes, foods, todayIso: TODAY })).toEqual({
      meals: [],
      ingredients: [],
    });
    const repeats = computeKidRepeats({ kid: kid('k1'), planEntries: mine, recipes, foods, todayIso: TODAY });
    expect(repeats.meals.map((m) => [m.name, m.shortWindowCount])).toEqual([['Mac and cheese', 4]]);
    expect(repeats.ingredients.map((i) => i.name)).toEqual(['Pasta']);
  });

  it('leaves out a food that is safe for this kid, and drops unnamed items', () => {
    const safeFoods = [food('pasta', { name: 'Pasta', is_safe: true })];
    const rows = [1, 2, 3].flatMap((d) => [
      entry({ food_id: 'pasta', date: daysAgo(d) }),
      entry({ food_id: 'ghost', recipe_id: 'gone', date: daysAgo(d), meal_slot: 'lunch' }),
    ]);
    const repeats = computeKidRepeats({ kid: kid('k1'), planEntries: rows, recipes, foods: safeFoods, todayIso: TODAY });
    expect(repeats).toEqual({ meals: [], ingredients: [] });
  });
});
