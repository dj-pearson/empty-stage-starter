import { describe, it, expect } from 'vitest';
import { pantryToGroceryInput, buildOnListKeySet, isOnList } from './pantryGrocery';
import type { CatalogEntry } from './effectiveFood';
import { planGroceryMerge } from './groceryMerge';
import type { Food, GroceryItem } from '@/types';

const food = (over: Partial<Food> = {}): Food => ({
  id: 'f1',
  name: 'Milk',
  category: 'dairy',
  is_safe: true,
  is_try_bite: false,
  ...over,
});

const row = (name: string, checked = false): Pick<GroceryItem, 'name' | 'checked'> => ({ name, checked });

describe('pantryToGroceryInput', () => {
  it('drops a servings unit and tops up past the low-stock line', () => {
    const input = pantryToGroceryInput(food({ quantity: 1, unit: 'servings' }), null);
    expect(input).toMatchObject({ name: 'Milk', quantity: 2, unit: '', category: 'dairy', added_via: 'pantry' });
  });

  it('asks for 3 when the food is at 0 or has no quantity', () => {
    expect(pantryToGroceryInput(food({ quantity: 0, unit: 'gallon' }), null)).toMatchObject({
      quantity: 3,
      unit: 'gallon',
    });
    expect(pantryToGroceryInput(food({ quantity: undefined }), null).quantity).toBe(3);
  });

  it('never asks for less than 1, even above the line', () => {
    expect(pantryToGroceryInput(food({ quantity: 12, unit: 'oz' }), null).quantity).toBe(1);
  });

  it('keeps a fractional remainder honest', () => {
    expect(pantryToGroceryInput(food({ quantity: 0.5 }), null).quantity).toBe(2.5);
  });

  it('takes name, category and aisle from a linked catalog row', () => {
    const catalog: CatalogEntry = {
      id: 'c1',
      name: 'Whole Milk',
      default_category: 'dairy',
      default_aisle_section: 'dairy',
      verification: 'verified',
    };
    const input = pantryToGroceryInput(food({ canonical_id: 'c1', aisle: 'Fridge' }), catalog);
    expect(input.name).toBe('Whole Milk');
    expect(input.category).toBe('dairy');
    expect(input.aisle).toBeTruthy();
  });

  it('falls back to the food aisle, or null', () => {
    expect(pantryToGroceryInput(food({ aisle: 'Fridge' }), null).aisle).toBe('Fridge');
    expect(pantryToGroceryInput(food(), null).aisle).toBeNull();
  });
});

describe('buildOnListKeySet / isOnList', () => {
  it('matches the way the merge does (plural, case, word order)', () => {
    const keys = buildOnListKeySet([row('egg'), row('Beef Ground')]);
    expect(isOnList(keys, { name: 'Eggs' })).toBe(true);
    expect(isOnList(keys, { name: 'ground beef' })).toBe(true);
    expect(isOnList(keys, { name: 'Milk' })).toBe(false);
  });

  it('a checked row does not count as on the list', () => {
    const keys = buildOnListKeySet([row('Milk', true)]);
    expect(isOnList(keys, { name: 'Milk' })).toBe(false);
  });

  it('ignores rows and foods with no name', () => {
    const keys = buildOnListKeySet([row(''), row('Bread')]);
    expect(keys.size).toBe(1);
    expect(isOnList(keys, { name: '' })).toBe(false);
  });
});

/**
 * The real merge, not a mock: what the pantry sends is what
 * GroceryContext.mergeGroceryItems hands to planGroceryMerge, and the "on list"
 * badge has to agree with what that merge then does with it.
 */
describe('pantry -> planGroceryMerge (integration)', () => {
  it('a food the badge calls "on list" stacks onto that row instead of inserting', () => {
    const existing = [{ id: 'g1', name: 'egg', quantity: 1, unit: '', checked: false, grocery_list_id: null }];
    const eggs = food({ id: 'f2', name: 'Eggs', category: 'protein', quantity: 0, unit: 'servings' });

    expect(isOnList(buildOnListKeySet(existing), eggs)).toBe(true);

    const plan = planGroceryMerge([pantryToGroceryInput(eggs, null)], existing, { defaultListId: 'list-1' });
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({ id: 'g1', quantity: 4 });
  });

  it('a food the badge calls "not on list" becomes one insert tagged as a pantry add', () => {
    const existing = [{ id: 'g1', name: 'Milk', quantity: 1, unit: 'gallon', checked: true, grocery_list_id: null }];
    const milk = food({ quantity: 1, unit: 'gallon' });

    expect(isOnList(buildOnListKeySet(existing), milk)).toBe(false);

    const plan = planGroceryMerge([pantryToGroceryInput(milk, null)], existing, { defaultListId: 'list-1' });
    expect(plan.updates).toHaveLength(0);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]).toMatchObject({ name: 'Milk', quantity: 2, unit: 'gallon', added_via: 'pantry' });
  });
});
