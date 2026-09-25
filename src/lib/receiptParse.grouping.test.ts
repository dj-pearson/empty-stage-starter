import { describe, it, expect } from 'vitest';
import {
  acceptedRowsToFoods,
  parseResponseToReviewRows,
  topUpUnits,
  unitsMismatch,
  type ParseResponse,
  type ReviewRow,
} from './receiptParse';
import type { Food } from '@/types';

const line = (parsedName: string, qty: number, unit: string, confidence = 0.9) => ({
  rawText: parsedName.toUpperCase(),
  parsedName,
  qty,
  unit,
  unitPrice: 1,
  lineTotal: qty,
  category: 'fruit',
  confidence,
});

const receipt = (...lineItems: ReturnType<typeof line>[]): ParseResponse => ({
  merchant: 'Corner Shop',
  purchasedAt: null,
  currency: 'USD',
  lineItems,
});

const food = (id: string, name: string, unit?: string): Food => ({
  id,
  name,
  category: 'fruit',
  is_safe: false,
  is_try_bite: false,
  quantity: 6,
  unit,
});

describe('acceptedRowsToFoods groups new foods', () => {
  it('two "Bananas" lines make one new food with the quantities summed', () => {
    const rows = parseResponseToReviewRows(receipt(line('Bananas', 1, 'lb'), line('bananas ', 2.5, 'lbs')), []);
    const { creates } = acceptedRowsToFoods(rows);
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({ name: 'Bananas', quantity: 3.5, unit: 'lb', is_safe: false });
  });

  it('keeps lines apart when their units cannot be added', () => {
    const rows = parseResponseToReviewRows(receipt(line('Bananas', 2, 'lb'), line('Bananas', 3, 'ea')), []);
    const { creates } = acceptedRowsToFoods(rows);
    expect(creates.map((c) => [c.quantity, c.unit])).toEqual([
      [2, 'lb'],
      [3, 'ea'],
    ]);
  });
});

describe('unitMismatch', () => {
  it('flags a line sold in a different unit from the pantry food and leaves it unticked', () => {
    const rows = parseResponseToReviewRows(receipt(line('Bananas', 2, 'lb'), line('Apples', 4, 'each')), [
      food('f-banana', 'Bananas', 'count'),
      food('f-apple', 'Apples', 'ct'),
    ]);
    const bananas = rows.find((r) => r.parsedName === 'Bananas')!;
    const apples = rows.find((r) => r.parsedName === 'Apples')!;

    expect(bananas).toMatchObject({ matchedFoodId: 'f-banana', unitMismatch: true, accept: false });
    // "each" and "ct" are both a count.
    expect(apples).toMatchObject({ matchedFoodId: 'f-apple', unitMismatch: false, accept: true });

    // Nothing is added to the mismatched food until the parent ticks it.
    expect(acceptedRowsToFoods(rows).updates).toEqual([{ foodId: 'f-apple', quantityDelta: 4 }]);
  });

  it('an unstated unit on either side is not a mismatch', () => {
    expect(unitsMismatch('', 'lb')).toBe(false);
    expect(unitsMismatch('lb', undefined)).toBe(false);
    expect(unitsMismatch('Lbs.', 'pound')).toBe(false);
    expect(unitsMismatch('gal', 'half-gal')).toBe(true);
  });

  it('an unmatched line never carries the flag', () => {
    const rows = parseResponseToReviewRows(receipt(line('Kiwi', 1, 'lb')), [food('f-milk', 'Milk', 'gal')]);
    expect(rows[0].unitMismatch).toBe(false);
  });
});

describe('topUpUnits', () => {
  it('names the unit each top-up was bought in', () => {
    const base = parseResponseToReviewRows(receipt(line('Milk', 1, '')), [])[0];
    const rows: ReviewRow[] = [
      { ...base, uid: 'a', matchedFoodId: 'f-milk', unit: '' },
      { ...base, uid: 'b', matchedFoodId: 'f-milk', unit: 'gal' },
      { ...base, uid: 'c', matchedFoodId: 'f-eggs', unit: '' },
      { ...base, uid: 'd', matchedFoodId: 'f-skip', unit: 'lb', accept: false },
    ];
    expect(Object.fromEntries(topUpUnits(rows))).toEqual({ 'f-milk': 'gal', 'f-eggs': null });
  });
});
