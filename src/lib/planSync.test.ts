import { describe, it, expect } from 'vitest';
import { planRegenerationFromPlan } from './groceryData';
import { generateGroceryList } from './mealPlanner';
import type { Food, GroceryItem, PlanEntry } from '@/types';

/**
 * US-713: "sync from meal plan" has to persist and has to be idempotent.
 *
 * Before this, the handler ended in setGroceryItems -- local state only, so the
 * list looked right until a reload and never reached a partner's phone -- and
 * it preserved rows using `is_manual`, which was never a database column. Rows
 * loaded from the server always had it undefined, so every hand-added item was
 * swept away on each sync.
 */

const food = (id: string, name: string, quantity = 0): Food =>
  ({ id, name, quantity, unit: 'servings', category: 'protein', aisle: 'Meat' }) as Food;

const entry = (id: string, date: string, foodId: string): PlanEntry =>
  ({ id, kid_id: 'k1', date, meal_slot: 'dinner', food_id: foodId, result: null }) as PlanEntry;

const row = (over: Partial<GroceryItem> & { id: string; name: string }): GroceryItem =>
  ({
    quantity: 1,
    unit: 'servings',
    checked: false,
    category: 'protein',
    ...over,
  }) as GroceryItem;

const WEEK = { from: '2026-09-07', to: '2026-09-13' };

describe('generateGroceryList shopping window (US-713)', () => {
  const foods = [food('f1', 'Chicken'), food('f2', 'Rice')];

  it('ignores plan entries outside the window', () => {
    const entries = [
      entry('e1', '2026-09-08', 'f1'), // inside
      entry('e2', '2026-11-20', 'f2'), // 10 weeks out, inside the 120-day context
    ];
    const out = generateGroceryList(entries, foods, WEEK);
    expect(out.map((r) => r.name)).toEqual(['Chicken']);
  });

  it('still takes every entry when no window is given', () => {
    const entries = [entry('e1', '2026-09-08', 'f1'), entry('e2', '2026-11-20', 'f2')];
    expect(generateGroceryList(entries, foods).map((r) => r.name).sort()).toEqual([
      'Chicken',
      'Rice',
    ]);
  });

  it('includes the first and last day of the window', () => {
    const entries = [entry('e1', WEEK.from, 'f1'), entry('e2', WEEK.to, 'f2')];
    expect(generateGroceryList(entries, foods, WEEK)).toHaveLength(2);
  });

  it('tolerates a date that carries a time component', () => {
    const entries = [entry('e1', '2026-09-08T18:30:00Z', 'f1')];
    expect(generateGroceryList(entries, foods, WEEK)).toHaveLength(1);
  });

  it('marks rows auto_generated and names the earliest contributing entry', () => {
    const entries = [
      entry('e-late', '2026-09-11', 'f1'),
      entry('e-early', '2026-09-08', 'f1'),
    ];
    const [out] = generateGroceryList(entries, foods, WEEK);
    expect(out.auto_generated).toBe(true);
    expect(out.source_plan_entry_id).toBe('e-early');
    expect(out.quantity).toBe(2); // two dinners, nothing in stock
  });

  it('subtracts what is already in the pantry', () => {
    const entries = [entry('e1', '2026-09-08', 'f1'), entry('e2', '2026-09-09', 'f1')];
    const [out] = generateGroceryList(entries, [food('f1', 'Chicken', 1)], WEEK);
    expect(out.quantity).toBe(1);
  });
});

describe('planRegenerationFromPlan (US-713)', () => {
  const generated = [
    { name: 'Chicken', quantity: 2, unit: 'servings', source_plan_entry_id: 'e1' },
    { name: 'Rice', quantity: 1, unit: 'servings', source_plan_entry_id: 'e2' },
  ];

  it('adds every generated row to an empty list', () => {
    const plan = planRegenerationFromPlan({ existing: [], generated, selectedListId: 'L1' });
    expect(plan.additions.map((a) => a.name)).toEqual(['Chicken', 'Rice']);
    expect(plan.retireIds).toEqual([]);
  });

  it('stamps the list, the auto flag and the source entry on each addition', () => {
    const plan = planRegenerationFromPlan({ existing: [], generated, selectedListId: 'L1' });
    expect(plan.additions[0]).toMatchObject({
      grocery_list_id: 'L1',
      auto_generated: true,
      source_plan_entry_id: 'e1',
      added_via: 'meal_plan_sync',
    });
  });

  it('is idempotent: a second run for the same week changes nothing', () => {
    const first = planRegenerationFromPlan({ existing: [], generated, selectedListId: 'L1' });

    // What the list looks like after the first sync persisted.
    const afterFirst = first.additions.map((a, i) =>
      row({
        id: `new${i}`,
        name: a.name,
        quantity: a.quantity,
        grocery_list_id: 'L1',
        auto_generated: true,
        added_via: 'meal_plan_sync',
        source_plan_entry_id: a.source_plan_entry_id ?? undefined,
      }),
    );

    const second = planRegenerationFromPlan({
      existing: afterFirst,
      generated,
      selectedListId: 'L1',
    });
    expect(second.additions).toEqual([]);
    expect(second.retireIds).toEqual([]);
  });

  it('retires an auto-generated row the plan no longer calls for', () => {
    const existing = [
      row({ id: 'a', name: 'Chicken', grocery_list_id: 'L1', auto_generated: true, source_plan_entry_id: 'e1' }),
      row({ id: 'b', name: 'Broccoli', grocery_list_id: 'L1', auto_generated: true, source_plan_entry_id: 'e9' }),
    ];
    const plan = planRegenerationFromPlan({ existing, generated, selectedListId: 'L1' });
    expect(plan.retireIds).toEqual(['b']);
    expect(plan.additions.map((a) => a.name)).toEqual(['Rice']);
  });

  it('keeps a hand-added row even when it is unchecked (the is_manual bug)', () => {
    const existing = [row({ id: 'h', name: 'Coffee', grocery_list_id: 'L1' })];
    const plan = planRegenerationFromPlan({ existing, generated, selectedListId: 'L1' });
    expect(plan.retireIds).toEqual([]);
    expect(plan.preservedCount).toBe(1);
  });

  it('never retires a row that has already been bought', () => {
    const existing = [
      row({ id: 'c', name: 'Broccoli', grocery_list_id: 'L1', auto_generated: true, checked: true, source_plan_entry_id: 'e9' }),
    ];
    const plan = planRegenerationFromPlan({ existing, generated, selectedListId: 'L1' });
    expect(plan.retireIds).toEqual([]);
    expect(plan.preservedCount).toBe(1);
  });

  it('does not re-add something the user already put on the list by hand', () => {
    const existing = [row({ id: 'h', name: 'chicken', grocery_list_id: 'L1' })];
    const plan = planRegenerationFromPlan({ existing, generated, selectedListId: 'L1' });
    expect(plan.additions.map((a) => a.name)).toEqual(['Rice']);
  });

  it('never retires a smart-restock row, which shares the auto_generated flag', () => {
    // 20251010221000's auto_add_restock_items sets auto_generated = true, and
    // its column comment still says the flag means "added by restock system".
    // Retiring on that flag alone would eat the user's restock suggestions.
    const existing = [
      row({
        id: 'r',
        name: 'Broccoli',
        grocery_list_id: 'L1',
        auto_generated: true,
        restock_reason: 'running low',
      }),
    ];
    const plan = planRegenerationFromPlan({ existing, generated, selectedListId: 'L1' });
    expect(plan.retireIds).toEqual([]);
    expect(plan.preservedCount).toBe(1);
  });

  it('leaves other lists completely alone', () => {
    const existing = [
      row({ id: 'x', name: 'Broccoli', grocery_list_id: 'L2', auto_generated: true, source_plan_entry_id: 'e9' }),
      row({ id: 'y', name: 'Chicken', grocery_list_id: null as unknown as string, auto_generated: true, source_plan_entry_id: 'e1' }),
    ];
    const plan = planRegenerationFromPlan({ existing, generated, selectedListId: 'L1' });
    expect(plan.retireIds).toEqual([]);
    expect(plan.preservedCount).toBe(0);
    expect(plan.additions).toHaveLength(2);
  });

  it('treats the unnamed list as a list of its own', () => {
    const existing = [row({ id: 'z', name: 'Chicken', auto_generated: true, source_plan_entry_id: 'e1' })];
    const plan = planRegenerationFromPlan({ existing, generated, selectedListId: null });
    expect(plan.retireIds).toEqual([]);
    expect(plan.additions.map((a) => a.name)).toEqual(['Rice']);
  });

  it('end to end: generate then plan twice is stable', () => {
    const foods = [food('f1', 'Chicken'), food('f2', 'Rice')];
    const entries = [entry('e1', '2026-09-08', 'f1'), entry('e2', '2026-09-09', 'f2')];

    const gen = generateGroceryList(entries, foods, WEEK);
    const first = planRegenerationFromPlan({ existing: [], generated: gen, selectedListId: 'L1' });
    expect(first.additions).toHaveLength(2);

    const persisted = first.additions.map((a, i) =>
      row({
        id: `p${i}`,
        name: a.name,
        quantity: a.quantity,
        grocery_list_id: 'L1',
        auto_generated: true,
        added_via: 'meal_plan_sync',
        source_plan_entry_id: a.source_plan_entry_id ?? undefined,
      }),
    );

    const regen = generateGroceryList(entries, foods, WEEK);
    const second = planRegenerationFromPlan({
      existing: persisted,
      generated: regen,
      selectedListId: 'L1',
    });
    expect(second.additions).toEqual([]);
    expect(second.retireIds).toEqual([]);
  });
});
