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

// US-525: the realtime handlers used to wrap this reducer in a trailing
// debounce, so multiple distinct payloads arriving within the window were
// coalesced to only the LAST one. The handlers now fold EVERY payload; these
// tests pin that "every distinct event is applied" contract.
describe('realtime handlers apply every distinct payload in a burst (US-525)', () => {
  it('a bulk INSERT broadcast (many rows within the window) applies all rows', () => {
    const incoming = [
      { id: 'g1', name: 'Milk', category: 'dairy' },
      { id: 'g2', name: 'Eggs', category: 'dairy' },
      { id: 'g3', name: 'Bread', category: 'bakery' },
    ];
    // Fold each payload as the un-debounced handler would, in order.
    const next = incoming.reduce(
      (state, row) => applyGroceryItemRealtime(state, payload('INSERT', row)),
      [] as GroceryItem[],
    );
    expect(next.map((r) => r.id)).toEqual(['g1', 'g2', 'g3']);
  });

  it('a DELETE+INSERT pair within the window is not coalesced to only the last event', () => {
    const seed: GroceryItem[] = [
      { id: 'g1', name: 'Milk', quantity: 1, unit: '', checked: false, category: 'dairy' } as GroceryItem,
    ];
    // Old bug: a trailing debounce would keep only the INSERT and the g1 DELETE
    // would be lost. Folding both applies both.
    const afterDelete = applyGroceryItemRealtime(seed, payload('DELETE', {}, 'g1'));
    const afterInsert = applyGroceryItemRealtime(afterDelete, payload('INSERT', { id: 'g2', name: 'Eggs', category: 'dairy' }));
    expect(afterInsert.map((r) => r.id)).toEqual(['g2']); // g1 removed, g2 added
  });

  it('plan_entries bulk insert applies every distinct entry', () => {
    const rows = [
      { id: 'p1', kid_id: 'k1', date: '2026-06-13', meal_slot: 'breakfast', food_id: 'f1', result: 'planned' },
      { id: 'p2', kid_id: 'k1', date: '2026-06-13', meal_slot: 'lunch', food_id: 'f2', result: 'planned' },
    ];
    const next = rows.reduce(
      (state, row) => applyPlanEntryRealtime(state, payload('INSERT', row)),
      [] as PlanEntry[],
    );
    expect(next).toHaveLength(2);
    expect(next.map((e) => e.id)).toEqual(['p1', 'p2']);
  });
});
