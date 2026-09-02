import { describe, it, expect } from 'vitest';
import { planGroceryMerge } from './groceryMerge';
import { filterItemsByList } from './groceryData';
import type { GroceryItem } from '@/types';

/**
 * US-714: an item has to land on the list the shopper is looking at, and a
 * merge must not reach across lists to do it.
 */

const existing = (
  id: string,
  name: string,
  grocery_list_id: string | null,
  quantity = 1,
) => ({ id, name, quantity, unit: 'gal', checked: false, grocery_list_id });

const item = (over: Partial<GroceryItem> & { id: string; name: string }): GroceryItem =>
  ({ quantity: 1, unit: '', checked: false, category: 'dairy', ...over }) as GroceryItem;

describe('planGroceryMerge list scoping (US-714)', () => {
  it('does not bump list A when milk is added to list B', () => {
    const plan = planGroceryMerge(
      [{ name: 'Milk', quantity: 1, unit: 'gal', grocery_list_id: 'B' }],
      [existing('a1', 'Milk', 'A', 2)],
      { targetListId: 'B' },
    );
    expect(plan.updates).toEqual([]);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0].grocery_list_id).toBe('B');
  });

  it('still merges into a row on the same list', () => {
    const plan = planGroceryMerge(
      [{ name: 'Milk', quantity: 1, unit: 'gal', grocery_list_id: 'B' }],
      [existing('b1', 'Milk', 'B', 2)],
      { targetListId: 'B' },
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].id).toBe('b1');
    expect(plan.updates[0].quantity).toBe(3);
  });

  it('treats a null list id as the default list when adding to the default', () => {
    const plan = planGroceryMerge(
      [{ name: 'Milk', quantity: 1, unit: 'gal' }],
      [existing('legacy', 'Milk', null, 2)],
      { targetListId: 'DEFAULT', defaultListId: 'DEFAULT' },
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.updates[0].id).toBe('legacy');
  });

  it('does not merge a legacy null-list row into a named list', () => {
    const plan = planGroceryMerge(
      [{ name: 'Milk', quantity: 1, unit: 'gal', grocery_list_id: 'B' }],
      [existing('legacy', 'Milk', null, 2)],
      { targetListId: 'B', defaultListId: 'DEFAULT' },
    );
    expect(plan.updates).toEqual([]);
    expect(plan.inserts).toHaveLength(1);
  });

  it('scopes with no options at all: everything is the default list', () => {
    const plan = planGroceryMerge(
      [{ name: 'Milk', quantity: 1 }],
      [existing('n1', 'Milk', null, 2)],
    );
    expect(plan.updates).toHaveLength(1);
  });
});

describe('planGroceryMerge passes metadata through to the insert (US-714)', () => {
  it('keeps every field the caller stamped, not just the six it used to list', () => {
    const plan = planGroceryMerge(
      [
        {
          name: 'Milk',
          quantity: 1,
          unit: 'gal',
          category: 'dairy',
          aisle: 'Dairy',
          notes: 'skim',
          grocery_list_id: 'B',
          auto_generated: true,
          source_plan_entry_id: 'e1',
          added_via: 'meal_plan_sync',
          brand_preference: 'Store brand',
          barcode: '012345',
          priority: 'high',
          price_per_unit: 3.5,
        },
      ],
      [],
      { targetListId: 'B' },
    );
    expect(plan.inserts[0]).toMatchObject({
      grocery_list_id: 'B',
      auto_generated: true,
      source_plan_entry_id: 'e1',
      added_via: 'meal_plan_sync',
      brand_preference: 'Store brand',
      barcode: '012345',
      priority: 'high',
      price_per_unit: 3.5,
      notes: 'skim',
      aisle: 'Dairy',
      category: 'dairy',
    });
  });
});

describe('filterItemsByList default-list handling (US-714)', () => {
  const rows = [
    item({ id: 'legacy', name: 'Bread' }), // null grocery_list_id
    item({ id: 'onA', name: 'Milk', grocery_list_id: 'A' }),
    item({ id: 'onB', name: 'Eggs', grocery_list_id: 'B' }),
  ];

  it('shows legacy null-list rows under the default list', () => {
    expect(filterItemsByList(rows, 'A', 'A').map((r) => r.id)).toEqual(['legacy', 'onA']);
  });

  it('hides legacy rows under a non-default list', () => {
    expect(filterItemsByList(rows, 'B', 'A').map((r) => r.id)).toEqual(['onB']);
  });

  it('hides legacy rows when the default is unknown', () => {
    // Previous behaviour, preserved: with no default resolved yet a strict
    // match is the only safe answer.
    expect(filterItemsByList(rows, 'A').map((r) => r.id)).toEqual(['onA']);
  });

  it('returns everything when no list is selected', () => {
    expect(filterItemsByList(rows, null, 'A')).toHaveLength(3);
  });
});
