import { describe, it, expect } from 'vitest';
import {
  acceptedRowsToFoods,
  averageConfidence,
  categoryFromString,
  fuzzyMatchFood,
  parseResponseToReviewRows,
} from './receiptParse';
import { ALL_FIXTURES, cornerStoreFixture, walmartFixture } from './receiptParseFixtures';
import type { Food } from '@/types';

function food(id: string, name: string, category: Food['category'] = 'snack'): Food {
  return { id, name, category, is_safe: true, is_try_bite: false };
}

describe('categoryFromString', () => {
  it('passes through canonical FoodCategory values', () => {
    expect(categoryFromString('protein')).toBe('protein');
    expect(categoryFromString('VEGETABLE')).toBe('vegetable');
  });

  it('collapses extended vocabulary onto snack', () => {
    expect(categoryFromString('beverage')).toBe('snack');
    expect(categoryFromString('frozen')).toBe('snack');
    expect(categoryFromString('pantry')).toBe('snack');
    expect(categoryFromString('household')).toBe('snack');
    expect(categoryFromString('other')).toBe('snack');
  });

  it('defaults to snack on empty/garbage input', () => {
    expect(categoryFromString('')).toBe('snack');
    expect(categoryFromString('totally-not-a-category')).toBe('snack');
  });
});

describe('fuzzyMatchFood', () => {
  const foods = [
    food('f1', 'Bananas', 'fruit'),
    food('f2', 'Whole Milk', 'dairy'),
    food('f3', 'Chicken Breast', 'protein'),
  ];

  it('matches case-insensitively on exact name', () => {
    expect(fuzzyMatchFood('bananas', foods)?.id).toBe('f1');
  });

  it('prefers prefix match over substring match', () => {
    expect(fuzzyMatchFood('whole', foods)?.id).toBe('f2');
  });

  it('falls back to substring match', () => {
    expect(fuzzyMatchFood('milk', foods)?.id).toBe('f2');
  });

  it('returns null when no match', () => {
    expect(fuzzyMatchFood('quinoa', foods)).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(fuzzyMatchFood('   ', foods)).toBeNull();
  });
});

describe('parseResponseToReviewRows (5 anonymised fixtures)', () => {
  for (const [name, { fixture, expectedLineCount }] of Object.entries(ALL_FIXTURES)) {
    it(`yields the expected line count for "${name}"`, () => {
      const rows = parseResponseToReviewRows(fixture, []);
      expect(rows).toHaveLength(expectedLineCount);
    });

    it(`assigns deterministic unique uids for "${name}"`, () => {
      const rows = parseResponseToReviewRows(fixture, []);
      const uids = new Set(rows.map((r) => r.uid));
      expect(uids.size).toBe(rows.length);
    });

    it(`defaults accept=true only when confidence >= 0.5 for "${name}"`, () => {
      const rows = parseResponseToReviewRows(fixture, []);
      for (const row of rows) {
        expect(row.accept).toBe(row.confidence >= 0.5);
      }
    });
  }
});

describe('acceptedRowsToFoods (post-confirm shape)', () => {
  it('drops rejected rows', () => {
    // Corner-store fixture has a row at confidence 0.45 → default-rejected.
    const rows = parseResponseToReviewRows(cornerStoreFixture, []);
    const { creates, updates } = acceptedRowsToFoods(rows);
    expect(creates).toHaveLength(rows.length - 1);
    expect(updates).toEqual([]);
  });

  it('produces a Food shape with the right defaults', () => {
    const rows = parseResponseToReviewRows(walmartFixture, []);
    const foods = acceptedRowsToFoods(rows).creates;
    for (const f of foods) {
      // US-803: a receipt says what was bought. It says nothing about whether
      // a child eats any of it, and is_safe is the flag a parent sets. This
      // asserted `true` until that story; in an app built for ARFID, marking a
      // food safe on a parent's behalf is the error that costs the most.
      expect(f.is_safe).toBe(false);
      expect(f.is_try_bite).toBe(false);
      expect(typeof f.name).toBe('string');
      expect(f.name.length).toBeGreaterThan(0);
      expect(typeof f.quantity).toBe('number');
    }
  });

  it('collapses extended categories onto the strict FoodCategory enum', () => {
    const rows = parseResponseToReviewRows(walmartFixture, []);
    const foods = acceptedRowsToFoods(rows).creates;
    const validCategories = new Set(['protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack']);
    for (const f of foods) {
      expect(validCategories.has(f.category)).toBe(true);
    }
  });
});

describe('parseResponseToReviewRows — pantry fuzzy match', () => {
  it('links matched existing food rows when a name is in the pantry', () => {
    const existingFoods = [food('milk-1', 'Whole Milk', 'dairy')];
    const rows = parseResponseToReviewRows(walmartFixture, existingFoods);
    const milkRow = rows.find((r) => r.parsedName.toLowerCase() === 'whole milk');
    expect(milkRow?.matchedFoodId).toBe('milk-1');
  });

  it('leaves matchedFoodId null when no pantry hit', () => {
    const rows = parseResponseToReviewRows(walmartFixture, []);
    expect(rows.every((r) => r.matchedFoodId === null)).toBe(true);
  });
});

describe('acceptedRowsToFoods: matched rows top up the pantry', () => {
  it('a matched row yields an update, not a create', () => {
    const existingFoods = [food('milk-1', 'Whole Milk', 'dairy')];
    const rows = parseResponseToReviewRows(walmartFixture, existingFoods).map((r) => ({
      ...r,
      accept: true,
    }));
    const milkRow = rows.find((r) => r.matchedFoodId === 'milk-1');
    expect(milkRow).toBeDefined();

    const { updates, creates } = acceptedRowsToFoods(rows);
    expect(updates).toEqual([{ foodId: 'milk-1', quantityDelta: milkRow!.qty }]);
    expect(creates.some((c) => c.name.toLowerCase() === 'whole milk')).toBe(false);
    expect(creates).toHaveLength(rows.length - 1);
  });

  it('sums two rows matched to the same food into one update', () => {
    const base = parseResponseToReviewRows(walmartFixture, [])[0];
    const rows = [
      { ...base, uid: 'a', accept: true, qty: 1, matchedFoodId: 'milk-1' },
      { ...base, uid: 'b', accept: true, qty: 2, matchedFoodId: 'milk-1' },
    ];
    expect(acceptedRowsToFoods(rows)).toEqual({
      updates: [{ foodId: 'milk-1', quantityDelta: 3 }],
      creates: [],
    });
  });

  it('ignores a rejected matched row', () => {
    const base = parseResponseToReviewRows(walmartFixture, [])[0];
    const rows = [{ ...base, accept: false, matchedFoodId: 'milk-1' }];
    expect(acceptedRowsToFoods(rows).updates).toEqual([]);
  });
});

describe('averageConfidence', () => {
  it('returns 0 on empty list', () => {
    expect(averageConfidence([])).toBe(0);
  });

  it('matches the corner-store fixture (mostly mid/low confidence)', () => {
    const avg = averageConfidence(cornerStoreFixture.lineItems);
    expect(avg).toBeGreaterThan(0.4);
    expect(avg).toBeLessThan(0.8);
  });
});
