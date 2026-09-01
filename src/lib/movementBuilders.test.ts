/**
 * US-672: the arithmetic that decides what the ledger records.
 *
 * Criterion 6 asks for correction delta arithmetic, checkout crediting and
 * duplicate-submit idempotency. The first and third are settled here, in a pure
 * test with no mocks; the crediting half needs the context and lives in
 * InventoryContext.append.test.tsx.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCorrectionMovement,
  buildPurchaseMovement,
  buildWasteMovement,
  partitionMovements,
  resolveGroceryItemId,
  isSkipped,
  type MovementItem,
  type MovementResult,
} from './movementBuilders';

const COMMON = { householdId: 'hh-1', userId: 'user-1' };

/** A pantry item held in grams and displayed in kilograms. */
const FLOUR: MovementItem = { id: 'flour', unit: 'kg', canonical_unit: 'g' };
/** Held and displayed in the same unit, the simple case. */
const EGGS: MovementItem = { id: 'eggs', unit: 'count', canonical_unit: 'count' };
/** The production shape: an opaque display unit over a count balance. */
const SERVINGS: MovementItem = { id: 'soup', unit: 'servings', canonical_unit: 'count' };

/** Assert a movement was built and return it narrowed. */
function built(r: MovementResult) {
  if (isSkipped(r)) throw new Error(`expected a movement, got skipped: ${r.reason}`);
  return r;
}

/** Assert a movement was refused and return it narrowed. */
function refused(r: MovementResult) {
  if (!isSkipped(r)) throw new Error(`expected skipped, got a movement with delta ${r.delta}`);
  return r;
}

describe('buildCorrectionMovement: delta is new minus current', () => {
  it('records an increase as a positive delta', () => {
    const m = built(buildCorrectionMovement({ ...COMMON, id: 'm1', item: EGGS, currentQuantity: 4, newQuantity: 7 }));
    expect(m.delta).toBe(3);
    expect(m.reason).toBe('correction');
    expect(m.canonical_unit).toBe('count');
  });

  it('records a decrease as a negative delta', () => {
    const m = built(buildCorrectionMovement({ ...COMMON, id: 'm1', item: EGGS, currentQuantity: 7, newQuantity: 4 }));
    expect(m.delta).toBe(-3);
  });

  it('converts the CHANGE into the canonical unit, not the endpoints', () => {
    // 1 kg -> 3 kg is a 2 kg change, which is 2000 g. Converting the endpoints
    // and subtracting would give the same answer here but rounds twice, and the
    // recorded display_quantity would no longer be the change the parent made.
    const m = built(buildCorrectionMovement({ ...COMMON, id: 'm1', item: FLOUR, currentQuantity: 1, newQuantity: 3 }));
    expect(m.delta).toBe(2000);
    expect(m.canonical_unit).toBe('g');
    expect(m.display_quantity).toBe(2);
    expect(m.display_unit).toBe('kg');
  });

  it('treats an absent current quantity as zero', () => {
    // normalizeFoodFromDB collapses 0 and unset alike to undefined.
    const m = built(buildCorrectionMovement({
      ...COMMON, id: 'm1', item: EGGS,
      currentQuantity: undefined as unknown as number, newQuantity: 5,
    }));
    expect(m.delta).toBe(5);
  });

  it('refuses to record an edit that changed nothing', () => {
    // The table refuses it too: CHECK (delta <> 0).
    const r = refused(buildCorrectionMovement({ ...COMMON, id: 'm1', item: EGGS, currentQuantity: 4, newQuantity: 4 }));
    expect(r.reason).toMatch(/nothing changed/);
    expect(r.itemId).toBe('eggs');
  });

  it('refuses rather than guessing when the unit cannot be converted', () => {
    const opaqueOverMass: MovementItem = { id: 'x', unit: 'servings', canonical_unit: 'g' };
    const r = refused(buildCorrectionMovement({ ...COMMON, id: 'm1', item: opaqueOverMass, currentQuantity: 1, newQuantity: 3 }));
    expect(r.reason).toMatch(/servings/);
  });

  it('handles the opaque-unit-over-count shape that dominates production', () => {
    const m = built(buildCorrectionMovement({ ...COMMON, id: 'm1', item: SERVINGS, currentQuantity: 2, newQuantity: 5 }));
    expect(m.delta).toBe(3);
    expect(m.display_unit).toBe('servings');
  });

  it('rejects a non-finite new quantity', () => {
    expect(refused(buildCorrectionMovement({ ...COMMON, id: 'm1', item: EGGS, currentQuantity: 1, newQuantity: Number.NaN })).reason)
      .toMatch(/not a finite number/);
  });
});

describe('buildPurchaseMovement: a checked row credits the pantry', () => {
  const row = {
    id: 'grocery-row-1',
    name: 'Flour',
    quantity: 2,
    unit: 'kg',
    price_per_unit: 1.7,
    currency: 'USD',
  };

  it('credits the canonical quantity and keeps what was entered', () => {
    const m = built(buildPurchaseMovement({ ...COMMON, item: FLOUR, groceryItem: row }));
    expect(m.delta).toBe(2000);
    expect(m.canonical_unit).toBe('g');
    expect(m.display_quantity).toBe(2);
    expect(m.display_unit).toBe('kg');
    expect(m.reason).toBe('purchase');
  });

  it('carries the grocery_item ref so the purchase is explainable and reversible', () => {
    const m = built(buildPurchaseMovement({ ...COMMON, item: FLOUR, groceryItem: row }));
    expect(m.ref_type).toBe('grocery_item');
    expect(m.ref_id).toBe('grocery-row-1');
  });

  it('records the price with its currency', () => {
    const m = built(buildPurchaseMovement({ ...COMMON, item: FLOUR, groceryItem: row }));
    expect(m.unit_price).toBe(1.7);
    expect(m.currency).toBe('USD');
  });

  it('buys in the unit the list used, not the unit the pantry holds', () => {
    // A parent buys "3 lb" of something the pantry displays in kg.
    const m = built(buildPurchaseMovement({
      ...COMMON, item: FLOUR,
      groceryItem: { id: 'g2', name: 'Flour', quantity: 3, unit: 'lb' },
    }));
    expect(m.delta).toBeCloseTo(1360.776, 3);
    expect(m.display_quantity).toBe(3);
    expect(m.display_unit).toBe('lb');
  });

  it('treats a missing quantity as one', () => {
    const m = built(buildPurchaseMovement({
      ...COMMON, item: EGGS, groceryItem: { id: 'g3', name: 'Eggs', unit: 'count' },
    }));
    expect(m.delta).toBe(1);
  });

  it('always credits, even if a negative quantity reaches it', () => {
    const m = built(buildPurchaseMovement({
      ...COMMON, item: EGGS, groceryItem: { id: 'g4', name: 'Eggs', quantity: -6, unit: 'count' },
    }));
    expect(m.delta).toBe(6);
  });
});

describe('duplicate submits (criteria 5 and 6)', () => {
  const row = { id: 'grocery-row-1', name: 'Eggs', quantity: 6, unit: 'count' };

  it('derives the movement id from the grocery row, so a second submit collides', () => {
    const first = built(buildPurchaseMovement({ ...COMMON, item: EGGS, groceryItem: row }));
    const second = built(buildPurchaseMovement({ ...COMMON, item: EGGS, groceryItem: row }));
    // Same id => the second insert hits the primary key instead of crediting
    // the pantry a second time. A fresh uuid per call would double-count a
    // double-tapped checkout.
    expect(first.id).toBe('grocery-row-1');
    expect(second.id).toBe(first.id);
    expect(second).toEqual(first);
  });

  it('is byte-identical across rebuilds, so a replayed queue cannot drift', () => {
    const runs = [1, 2, 3].map(() => buildPurchaseMovement({ ...COMMON, item: FLOUR, groceryItem: { ...row, unit: 'kg', quantity: 2 } }));
    expect(new Set(runs.map((r) => JSON.stringify(r))).size).toBe(1);
  });

  it('still lets a caller pin its own id for an offline retry', () => {
    const m = built(buildPurchaseMovement({ ...COMMON, id: 'queued-id', item: EGGS, groceryItem: row }));
    expect(m.id).toBe('queued-id');
  });
});

describe('buildWasteMovement', () => {
  it('always debits, whichever sign it is handed', () => {
    expect(built(buildWasteMovement({ ...COMMON, id: 'm1', item: EGGS, quantity: 3 })).delta).toBe(-3);
    expect(built(buildWasteMovement({ ...COMMON, id: 'm1', item: EGGS, quantity: -3 })).delta).toBe(-3);
  });

  it('is its own reason, not a correction', () => {
    // "We wasted it" and "I had miscounted" are different facts; US-681
    // reports the first.
    expect(built(buildWasteMovement({ ...COMMON, id: 'm1', item: EGGS, quantity: 3 })).reason).toBe('waste');
  });

  it('converts into the canonical unit', () => {
    const m = built(buildWasteMovement({ ...COMMON, id: 'm1', item: FLOUR, quantity: 0.5 }));
    expect(m.delta).toBe(-500);
    expect(m.display_quantity).toBe(-0.5);
  });

  it('refuses to record throwing out nothing', () => {
    expect(refused(buildWasteMovement({ ...COMMON, id: 'm1', item: EGGS, quantity: 0 })).reason)
      .toMatch(/nothing changed/);
  });
});

describe('price and currency travel together', () => {
  const base = { ...COMMON, item: FLOUR };

  it('drops a price with no currency', () => {
    const m = built(buildPurchaseMovement({
      ...base, groceryItem: { id: 'g', name: 'Flour', quantity: 1, unit: 'kg', price_per_unit: 2.5 },
    }));
    expect(m.unit_price).toBeNull();
    expect(m.currency).toBeNull();
  });

  it('drops a currency with no price', () => {
    const m = built(buildPurchaseMovement({
      ...base, groceryItem: { id: 'g', name: 'Flour', quantity: 1, unit: 'kg', currency: 'USD' },
    }));
    expect(m.currency).toBeNull();
  });

  it('drops a negative price rather than storing a refund as a purchase', () => {
    const m = built(buildPurchaseMovement({
      ...base, groceryItem: { id: 'g', name: 'Flour', quantity: 1, unit: 'kg', price_per_unit: -3, currency: 'USD' },
    }));
    expect(m.unit_price).toBeNull();
  });

  it('keeps a zero price, which is a real thing that happens', () => {
    const m = built(buildPurchaseMovement({
      ...base, groceryItem: { id: 'g', name: 'Flour', quantity: 1, unit: 'kg', price_per_unit: 0, currency: 'USD' },
    }));
    expect(m.unit_price).toBe(0);
    expect(m.currency).toBe('USD');
  });
});

describe('required fields', () => {
  it('refuses without a household, a user or an item', () => {
    expect(refused(buildCorrectionMovement({ householdId: '', userId: 'u', id: 'm', item: EGGS, currentQuantity: 1, newQuantity: 2 })).reason).toMatch(/householdId/);
    expect(refused(buildCorrectionMovement({ householdId: 'h', userId: '', id: 'm', item: EGGS, currentQuantity: 1, newQuantity: 2 })).reason).toMatch(/userId/);
    expect(refused(buildCorrectionMovement({ ...COMMON, id: 'm', item: { id: '' }, currentQuantity: 1, newQuantity: 2 })).reason).toMatch(/item\.id/);
  });

  it('refuses a purchase with no grocery row id', () => {
    expect(refused(buildPurchaseMovement({ ...COMMON, item: EGGS, groceryItem: { id: '', name: 'x' } })).reason)
      .toMatch(/grocery item id/);
  });
});

describe('partitionMovements', () => {
  it('separates what can be recorded from what cannot', () => {
    const results = [
      buildCorrectionMovement({ ...COMMON, id: 'a', item: EGGS, currentQuantity: 1, newQuantity: 2 }),
      buildCorrectionMovement({ ...COMMON, id: 'b', item: EGGS, currentQuantity: 2, newQuantity: 2 }),
      buildCorrectionMovement({ ...COMMON, id: 'c', item: FLOUR, currentQuantity: 0, newQuantity: 1 }),
    ];
    const { movements, skipped } = partitionMovements(results);
    // One item lacking a conversion must not fail the whole action, and must
    // not vanish either.
    expect(movements.map((m) => m.id)).toEqual(['a', 'c']);
    expect(skipped).toHaveLength(1);
  });

  it('handles an empty list', () => {
    expect(partitionMovements([])).toEqual({ movements: [], skipped: [] });
  });
});

describe('resolveGroceryItemId', () => {
  const items = [{ id: 'flour', name: 'Flour', unit: 'kg' }, { id: 'eggs', name: 'Eggs' }] as MovementItem[];

  it('prefers the resolved item_id the catalog work populates', () => {
    expect(resolveGroceryItemId({ id: 'g', name: 'Anything', item_id: 'flour' }, items)).toBe('flour');
  });

  it('falls back to the same lowercased name match the legacy checkout uses', () => {
    // Parity is the point: while both paths can run, a ledger that credited a
    // different item than the legacy write would be worse than one that
    // reproduces its mistakes.
    expect(resolveGroceryItemId({ id: 'g', name: 'FLOUR' }, items)).toBe('flour');
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(resolveGroceryItemId({ id: 'g', name: 'Saffron' }, items)).toBeNull();
    expect(resolveGroceryItemId({ id: 'g' }, items)).toBeNull();
  });
});

describe('purity', () => {
  it('does not mutate its inputs', () => {
    const item = { ...FLOUR };
    const groceryItem = { id: 'g', name: 'Flour', quantity: 2, unit: 'kg', price_per_unit: 1, currency: 'USD' };
    const snapshot = JSON.stringify({ item, groceryItem });
    buildPurchaseMovement({ ...COMMON, item, groceryItem });
    buildCorrectionMovement({ ...COMMON, id: 'm', item, currentQuantity: 1, newQuantity: 2 });
    expect(JSON.stringify({ item, groceryItem })).toBe(snapshot);
  });
});
