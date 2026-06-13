import { describe, it, expect } from 'vitest';
import { applyGroceryItemRealtime } from './GroceryContext';
import { applyPlanEntryRealtime } from './PlanContext';
import { applyKidRealtime } from './KidsContext';
import type { GroceryItem, PlanEntry, Kid } from '@/types';

// deno-lint-ignore no-explicit-any
const payload = (eventType: string, newRow: Record<string, unknown>, oldId = 'x'): any => ({
  eventType,
  new: newRow,
  old: { id: oldId },
});

describe('applyGroceryItemRealtime (US-333)', () => {
  it('normalizes a raw snake_case INSERT (checked boolean, quantity, unit)', () => {
    const next = applyGroceryItemRealtime(
      [],
      payload('INSERT', { id: 'g1', name: 'Milk', quantity: '2', unit: null, checked: null, category: 'dairy' }),
    );
    expect(next).toHaveLength(1);
    expect(next[0].checked).toBe(false); // null -> false
    expect(next[0].quantity).toBe(2); // "2" -> 2
    expect(next[0].unit).toBe(''); // null -> ''
    expect(next[0].category).toBe('dairy');
  });

  it('dedupes by id (INSERT for an existing optimistic row updates in place)', () => {
    const seed: GroceryItem[] = [
      { id: 'g1', name: 'Milk', quantity: 1, unit: '', checked: false, category: 'dairy' } as GroceryItem,
    ];
    const next = applyGroceryItemRealtime(seed, payload('INSERT', { id: 'g1', name: 'Milk 2%', quantity: 1, category: 'dairy' }));
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe('Milk 2%');
  });

  it('removes on DELETE', () => {
    const seed = [{ id: 'g1', name: 'Milk', quantity: 1, unit: '', checked: false, category: 'dairy' } as GroceryItem];
    expect(applyGroceryItemRealtime(seed, payload('DELETE', {}, 'g1'))).toHaveLength(0);
  });
});

describe('applyPlanEntryRealtime (US-333)', () => {
  it('inserts a normalized entry and dedupes by id', () => {
    const row = { id: 'p1', kid_id: 'k1', date: '2026-06-13', meal_slot: 'dinner', food_id: 'f1', result: 'planned' };
    const inserted = applyPlanEntryRealtime([], payload('INSERT', row));
    expect(inserted).toHaveLength(1);
    expect(inserted[0].kid_id).toBe('k1');
    const updated = applyPlanEntryRealtime(inserted, payload('UPDATE', { ...row, result: 'ate' }));
    expect(updated).toHaveLength(1);
    expect((updated[0] as PlanEntry).result).toBe('ate');
  });
});

describe('applyKidRealtime (US-333)', () => {
  it('coerces null array fields to arrays / drops them, normalizes shape', () => {
    const next = applyKidRealtime(
      [],
      payload('INSERT', { id: 'k1', name: 'Sam', allergens: null, favorite_foods: ['pizza'] }),
    );
    expect(next).toHaveLength(1);
    const kid = next[0] as Kid;
    expect(kid.allergens).toBeUndefined(); // null dropped (optional)
    expect(kid.favorite_foods).toEqual(['pizza']);
  });

  it('dedupes by id on a second INSERT/UPDATE', () => {
    const seed = applyKidRealtime([], payload('INSERT', { id: 'k1', name: 'Sam' }));
    const next = applyKidRealtime(seed, payload('UPDATE', { id: 'k1', name: 'Samuel' }));
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe('Samuel');
  });
});
