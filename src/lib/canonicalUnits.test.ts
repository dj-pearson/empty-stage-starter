import { describe, it, expect } from 'vitest';
import {
  toCanonical,
  sumCanonical,
  isUnknown,
  type CanonicalItemFacts,
} from './canonicalUnits';

/** Assert a successful conversion and return it narrowed. */
function ok(r: ReturnType<typeof toCanonical>) {
  if (isUnknown(r)) throw new Error(`expected a value, got unknown: ${r.reason}`);
  return r;
}

const GRAMS: CanonicalItemFacts = { canonical_unit: 'g' };
const MILLILITRES: CanonicalItemFacts = { canonical_unit: 'ml' };
const COUNTED: CanonicalItemFacts = { canonical_unit: 'count' };

describe('toCanonical — mass family', () => {
  it('converts the US and metric pairs into grams', () => {
    expect(ok(toCanonical(1, 'kg', GRAMS)).value).toBeCloseTo(1000, 6);
    expect(ok(toCanonical(1, 'lb', GRAMS)).value).toBeCloseTo(453.592, 3);
    expect(ok(toCanonical(16, 'oz', GRAMS)).value).toBeCloseTo(453.592, 1);
    expect(ok(toCanonical(250, 'g', GRAMS)).value).toBeCloseTo(250, 6);
  });

  it('1 lb and 16 oz agree', () => {
    const a = ok(toCanonical(1, 'lb', GRAMS)).value;
    const b = ok(toCanonical(16, 'oz', GRAMS)).value;
    expect(Math.abs(a - b)).toBeLessThan(0.5);
  });
});

describe('toCanonical — volume family', () => {
  it('converts the US and metric pairs into millilitres', () => {
    expect(ok(toCanonical(1, 'l', MILLILITRES)).value).toBeCloseTo(1000, 6);
    expect(ok(toCanonical(1, 'gal', MILLILITRES)).value).toBeCloseTo(3785.41, 2);
    expect(ok(toCanonical(1, 'qt', MILLILITRES)).value).toBeCloseTo(946.353, 3);
    expect(ok(toCanonical(1, 'cup', MILLILITRES)).value).toBeCloseTo(236.588, 3);
    expect(ok(toCanonical(1, 'tbsp', MILLILITRES)).value).toBeCloseTo(14.7868, 4);
    expect(ok(toCanonical(1, 'tsp', MILLILITRES)).value).toBeCloseTo(4.92892, 5);
  });

  /**
   * Criterion 6, and the concrete failure the design names: moveCheckedToPantry
   * currently credits the raw number and drops the item into `mismatchedNames`
   * when the bought unit differs from the pantry row's unit. Both are volume,
   * so this must simply convert.
   */
  it('2 gal credited onto a pantry row measured in fl oz converts, not mismatches', () => {
    const bought = ok(toCanonical(2, 'gal', MILLILITRES));
    const onHand = ok(toCanonical(256, 'fl oz', MILLILITRES));
    expect(bought.unit).toBe('ml');
    expect(onHand.unit).toBe('ml');
    // 2 US gallons is 256 US fluid ounces, so the two land on the same number.
    expect(bought.value).toBeCloseTo(onHand.value, 0);
    expect(bought.value).toBeCloseTo(7570.82, 1);
  });

  it('handles the half-gallon token the mobile picker offers', () => {
    expect(ok(toCanonical(1, '½ gal', MILLILITRES)).value).toBeCloseTo(1892.71, 2);
  });
});

describe('toCanonical — count family', () => {
  it('treats pieces, each and dozen as counts', () => {
    expect(ok(toCanonical(3, 'piece', COUNTED)).value).toBeCloseTo(3, 6);
    expect(ok(toCanonical(2, 'dozen', COUNTED)).value).toBeCloseTo(24, 6);
    expect(ok(toCanonical(5, 'each', COUNTED)).value).toBeCloseTo(5, 6);
  });
});

describe('toCanonical — item-specific conversions win', () => {
  const tomatoes: CanonicalItemFacts = {
    canonical_unit: 'g',
    unit_conversions: { can: 400, bunch: 60 },
  };

  it('turns a package unit into an amount, which nothing generic can do', () => {
    const r = ok(toCanonical(2, 'can', tomatoes));
    expect(r.value).toBeCloseTo(800, 6);
    expect(r.unit).toBe('g');
    expect(r.via).toBe('item_conversion');
  });

  it('beats the generic table when both could apply', () => {
    // 'cup' is a known volume unit generically. For THIS item the parent has
    // said a cup of it is 120 g, and that has to win.
    const flour: CanonicalItemFacts = {
      canonical_unit: 'g',
      unit_conversions: { cup: 120 },
    };
    const r = ok(toCanonical(2, 'cup', flour));
    expect(r.value).toBeCloseTo(240, 6);
    expect(r.via).toBe('item_conversion');
  });

  it('matches conversion keys through the same token rules as units', () => {
    const item: CanonicalItemFacts = {
      canonical_unit: 'g',
      unit_conversions: { 'Fl Oz': 30 },
    };
    expect(ok(toCanonical(2, 'fl oz', item)).value).toBeCloseTo(60, 6);
  });

  it('reports unknown when a conversion exists but no canonical_unit does', () => {
    const r = toCanonical(1, 'can', { unit_conversions: { can: 400 } });
    expect(isUnknown(r)).toBe(true);
    if (isUnknown(r)) expect(r.reason).toMatch(/no canonical_unit/);
  });

  it('reports unknown for a non-numeric conversion factor rather than trusting it', () => {
    const r = toCanonical(1, 'can', {
      canonical_unit: 'g',
      unit_conversions: { can: 'four hundred' as unknown as number },
    });
    expect(isUnknown(r)).toBe(true);
  });
});

describe('toCanonical — cross-dimension needs a density', () => {
  it('refuses ml to g without one, and says why', () => {
    const r = toCanonical(100, 'ml', GRAMS);
    expect(isUnknown(r)).toBe(true);
    if (isUnknown(r)) expect(r.reason).toMatch(/without a density/);
  });

  it('converts ml to g when the item supplies a density', () => {
    const honey: CanonicalItemFacts = { canonical_unit: 'g', density_g_per_ml: 1.42 };
    const r = ok(toCanonical(100, 'ml', honey));
    expect(r.value).toBeCloseTo(142, 6);
    expect(r.via).toBe('density');
  });

  it('converts g to ml with the same density, in the other direction', () => {
    const honey: CanonicalItemFacts = { canonical_unit: 'ml', density_g_per_ml: 1.42 };
    const r = ok(toCanonical(142, 'g', honey));
    expect(r.value).toBeCloseTo(100, 6);
  });

  it('rejects a nonsensical density instead of dividing by it', () => {
    for (const density of [0, -1, Number.NaN]) {
      const r = toCanonical(100, 'ml', { canonical_unit: 'g', density_g_per_ml: density });
      expect(isUnknown(r)).toBe(true);
    }
  });

  it('does not pretend a density bridges count and mass', () => {
    const r = toCanonical(3, 'piece', { canonical_unit: 'g', density_g_per_ml: 1 });
    expect(isUnknown(r)).toBe(true);
    if (isUnknown(r)) expect(r.reason).toMatch(/per-item conversion/);
  });
});

describe('toCanonical — unknown is a value, never an exception', () => {
  it('never throws on any hostile input', () => {
    const inputs: [number, unknown][] = [
      [Number.NaN, 'g'],
      [Number.POSITIVE_INFINITY, 'g'],
      [1, null],
      [1, undefined],
      [1, ''],
      [1, 'sploots'],
      [1, 'jar'],
    ];
    for (const [q, u] of inputs) {
      expect(() => toCanonical(q, u as string, GRAMS)).not.toThrow();
    }
  });

  it('reports a package unit as unknown and points at the fix', () => {
    const r = toCanonical(1, 'jar', GRAMS);
    expect(isUnknown(r)).toBe(true);
    if (isUnknown(r)) {
      expect(r.reason).toMatch(/package unit/);
      expect(r.reason).toMatch(/unit_conversions/);
    }
  });

  it('reports an unrecognised unit as unknown', () => {
    const r = toCanonical(1, 'sploots', GRAMS);
    expect(isUnknown(r)).toBe(true);
    if (isUnknown(r)) expect(r.reason).toMatch(/unrecognised unit/);
  });

  it('rejects a non-finite quantity', () => {
    for (const q of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = toCanonical(q, 'g', GRAMS);
      expect(isUnknown(r)).toBe(true);
    }
  });

  it('accepts negative quantities, because a debit is a negative movement', () => {
    expect(ok(toCanonical(-250, 'g', GRAMS)).value).toBeCloseTo(-250, 6);
  });
});

describe('toCanonical — items with no declared canonical_unit', () => {
  it('classifies from the unit itself, which is what the backfill needs', () => {
    expect(ok(toCanonical(1, 'lb', {})).unit).toBe('g');
    expect(ok(toCanonical(1, 'cup', {})).unit).toBe('ml');
    expect(ok(toCanonical(1, 'dozen', {})).unit).toBe('count');
  });
});

describe('sumCanonical', () => {
  it('adds amounts in mixed units of one dimension', () => {
    const r = sumCanonical([
      { quantity: 1, unit: 'lb' },
      { quantity: 250, unit: 'g' },
    ], GRAMS);
    expect(r.unit).toBe('g');
    expect(r.total).toBeCloseTo(703.592, 2);
    expect(r.unconvertible).toEqual([]);
  });

  it('reports what it could not convert instead of quietly shrinking the total', () => {
    const r = sumCanonical([
      { quantity: 1, unit: 'lb' },
      { quantity: 2, unit: 'jar' },
    ], GRAMS);
    expect(r.total).toBeCloseTo(453.592, 2);
    expect(r.unconvertible).toHaveLength(1);
    expect(r.unconvertible[0].reason).toMatch(/package unit/);
  });

  it('returns a null unit for an empty list rather than guessing one', () => {
    expect(sumCanonical([], GRAMS)).toEqual({ total: 0, unit: null, unconvertible: [] });
  });
});

describe('purity', () => {
  it('does not mutate the item it is given', () => {
    const item: CanonicalItemFacts = {
      canonical_unit: 'g',
      unit_conversions: { can: 400 },
      density_g_per_ml: 1.1,
    };
    const snapshot = JSON.stringify(item);
    toCanonical(2, 'can', item);
    toCanonical(100, 'ml', item);
    expect(JSON.stringify(item)).toBe(snapshot);
  });

  it('is referentially transparent', () => {
    const first = toCanonical(2, 'gal', MILLILITRES);
    toCanonical(999, 'jar', GRAMS);
    expect(toCanonical(2, 'gal', MILLILITRES)).toEqual(first);
  });
});
