import { describe, it, expect } from 'vitest';
import { acceptedRowsToFoods, receiptLinePrice, topUpPrices, type ReviewRow } from './receiptParse';

/** Item 22: a receipt line's price travels into the pantry with its currency. */
function row(over: Partial<ReviewRow> & Pick<ReviewRow, 'uid' | 'parsedName'>): ReviewRow {
  return {
    rawText: over.parsedName,
    qty: 1,
    unit: '',
    unitPrice: 0,
    lineTotal: 0,
    category: 'fruit',
    confidence: 0.9,
    accept: true,
    matchedFoodId: null,
    ...over,
  };
}

describe('receiptLinePrice', () => {
  it('prefers the unit price the parser read', () => {
    expect(receiptLinePrice({ unitPrice: 0.59, lineTotal: 1.77, qty: 3 })).toBe(0.59);
  });

  it('divides the line total when there is no unit price', () => {
    expect(receiptLinePrice({ unitPrice: 0, lineTotal: 1.77, qty: 3 })).toBe(0.59);
  });

  it('is null when the line says nothing', () => {
    expect(receiptLinePrice({ unitPrice: 0, lineTotal: 0, qty: 1 })).toBeNull();
    expect(receiptLinePrice({ unitPrice: Number.NaN, lineTotal: Number.NaN, qty: 1 })).toBeNull();
  });
});

describe('topUpPrices', () => {
  it('takes the first priced accepted row per food, ignoring unticked ones', () => {
    const prices = topUpPrices([
      row({ uid: 'a', parsedName: 'MILK', matchedFoodId: 'milk', accept: false, unitPrice: 9 }),
      row({ uid: 'b', parsedName: 'MILK', matchedFoodId: 'milk', unitPrice: 0 }),
      row({ uid: 'c', parsedName: 'MILK', matchedFoodId: 'milk', unitPrice: 3.4 }),
      row({ uid: 'd', parsedName: 'NEW', unitPrice: 2 }),
    ]);
    expect(prices.get('milk')).toBe(3.4);
    expect(prices.has('d')).toBe(false);
  });
});

describe('acceptedRowsToFoods with a currency', () => {
  it('gives a priced new food its last known price', () => {
    const { creates } = acceptedRowsToFoods(
      [row({ uid: 'a', parsedName: 'Kiwi', unitPrice: 0.5, qty: 4, unit: 'count' })],
      'USD'
    );
    expect(creates[0]).toMatchObject({ name: 'Kiwi', price_per_unit: 0.5, currency: 'USD', is_safe: false });
  });

  it('stores no price without a usable currency, and none for an unpriced line', () => {
    const noCurrency = acceptedRowsToFoods([row({ uid: 'a', parsedName: 'Kiwi', unitPrice: 0.5 })]);
    expect(noCurrency.creates[0]).not.toHaveProperty('price_per_unit');
    const unpriced = acceptedRowsToFoods([row({ uid: 'a', parsedName: 'Kiwi' })], 'USD');
    expect(unpriced.creates[0]).not.toHaveProperty('price_per_unit');
    const bad = acceptedRowsToFoods([row({ uid: 'a', parsedName: 'Kiwi', unitPrice: 1 })], '$');
    expect(bad.creates[0]).not.toHaveProperty('currency');
  });
});
