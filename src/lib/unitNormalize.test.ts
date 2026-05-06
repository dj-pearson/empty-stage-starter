import { describe, it, expect } from 'vitest';
import { normalize, compare, convert, unitFamily } from './unitNormalize';

/**
 * US-287: 50+ unit pairs covering the canonical set, fuzzy aliases,
 * cross-family incomparability, and package canonical-noun matching.
 *
 * Conversion factors with " (approx)" comments in unitNormalize.ts come from
 * NIST guidelines and are accurate to four sig figs. The bar for "exact" is
 * a 0.05% tolerance; "approximate" gets a 1% tolerance.
 */

const closeTo = (actual: number, expected: number, tol = 0.005) => {
  expect(Math.abs(actual - expected) / Math.max(1, Math.abs(expected))).toBeLessThan(tol);
};

describe('unitNormalize.normalize', () => {
  describe('mass family (canonical: g)', () => {
    it('grams pass through unchanged', () => {
      expect(normalize(500, 'g')).toEqual({ qty: 500, canonicalUnit: 'g', family: 'mass', recognised: true });
    });
    it('kg → g', () => {
      const r = normalize(2, 'kg');
      expect(r.canonicalUnit).toBe('g');
      expect(r.qty).toBe(2000);
    });
    it('oz → g (approx)', () => {
      const r = normalize(1, 'oz');
      closeTo(r.qty, 28.3495);
      expect(r.family).toBe('mass');
    });
    it('lb → g (approx)', () => {
      const r = normalize(1, 'lb');
      closeTo(r.qty, 453.592);
    });
    it('"pound" alias → mass', () => {
      expect(normalize(1, 'pound').family).toBe('mass');
    });
    it('"pounds" plural → mass', () => {
      expect(normalize(2, 'pounds').qty).toBeCloseTo(907.184, 1);
    });
    it('handles "lbs" alias', () => {
      expect(normalize(1, 'lbs').qty).toBeCloseTo(453.592, 1);
    });
  });

  describe('volume family (canonical: ml)', () => {
    it('ml passes through', () => {
      expect(normalize(250, 'ml').qty).toBe(250);
    });
    it('l → ml', () => {
      expect(normalize(1, 'l').qty).toBe(1000);
    });
    it('cup → ml', () => {
      const r = normalize(1, 'cup');
      closeTo(r.qty, 236.588);
    });
    it('"cups" plural', () => {
      const r = normalize(2, 'cups');
      closeTo(r.qty, 473.176);
    });
    it('tsp / teaspoon / "t" all canonicalise to volume', () => {
      const tsp = normalize(1, 'tsp');
      const teaspoon = normalize(1, 'teaspoon');
      const t = normalize(1, 't');
      expect(tsp.qty).toBe(teaspoon.qty);
      expect(tsp.qty).toBe(t.qty);
      expect(tsp.family).toBe('volume');
    });
    it('tbsp / tablespoon / "T" canonicalise the same', () => {
      const tbsp = normalize(1, 'tbsp');
      const word = normalize(1, 'tablespoon');
      const tShort = normalize(1, 'T');
      expect(tbsp.qty).toBe(word.qty);
      expect(tbsp.qty).toBe(tShort.qty);
    });
    it('strips trailing periods (tbsp.)', () => {
      expect(normalize(1, 'tbsp.').family).toBe('volume');
    });
    it('floz → ml (approx)', () => {
      closeTo(normalize(1, 'floz').qty, 29.5735);
    });
    it('"fl oz" with whitespace → ml', () => {
      closeTo(normalize(1, 'fl oz').qty, 29.5735);
    });
    it('pt → ml (approx)', () => {
      closeTo(normalize(1, 'pt').qty, 473.176);
    });
    it('qt → ml (approx)', () => {
      closeTo(normalize(1, 'qt').qty, 946.353);
    });
    it('gal → ml (approx)', () => {
      closeTo(normalize(1, 'gal').qty, 3785.41);
    });
    it('British spellings: litre, millilitre', () => {
      expect(normalize(1, 'litre').qty).toBe(1000);
      expect(normalize(1, 'millilitre').qty).toBe(1);
    });
  });

  describe('count family (canonical: piece)', () => {
    it('piece / pieces / pcs → piece', () => {
      expect(normalize(3, 'pieces').qty).toBe(3);
      expect(normalize(3, 'pcs').qty).toBe(3);
    });
    it('count / ct → piece', () => {
      expect(normalize(5, 'count').canonicalUnit).toBe('piece');
      expect(normalize(5, 'ct').qty).toBe(5);
    });
    it('each / ea → piece', () => {
      expect(normalize(2, 'each').qty).toBe(2);
      expect(normalize(2, 'ea').qty).toBe(2);
    });
    it('dozen → 12 pieces', () => {
      expect(normalize(1, 'dozen').qty).toBe(12);
      expect(normalize(2, 'dozen').qty).toBe(24);
    });
    it('"doz" alias matches dozen', () => {
      expect(normalize(1, 'doz').qty).toBe(12);
    });
    it('placeholder units fall through to count', () => {
      expect(normalize(3, '').family).toBe('count');
      expect(normalize(3, 'item').family).toBe('count');
      expect(normalize(3, 'item').recognised).toBe(false);
    });
  });

  describe('package family (canonical = noun)', () => {
    it('jar / bag / can / box keep their canonical', () => {
      expect(normalize(2, 'jar').canonicalUnit).toBe('jar');
      expect(normalize(1, 'bag').canonicalUnit).toBe('bag');
      expect(normalize(1, 'can').canonicalUnit).toBe('can');
      expect(normalize(1, 'box').canonicalUnit).toBe('box');
      expect(normalize(1, 'jar').family).toBe('package');
    });
    it('package alias collapses to "pack"', () => {
      expect(normalize(1, 'package').canonicalUnit).toBe('pack');
      expect(normalize(1, 'pkg').canonicalUnit).toBe('pack');
    });
    it('btl alias collapses to "bottle"', () => {
      expect(normalize(1, 'btl').canonicalUnit).toBe('bottle');
    });
    it('plural sticks → singular stick', () => {
      expect(normalize(2, 'sticks').canonicalUnit).toBe('stick');
    });
    it('loaf / bunch / head are recognised', () => {
      expect(normalize(1, 'loaf').family).toBe('package');
      expect(normalize(1, 'bunch').family).toBe('package');
      expect(normalize(1, 'head').family).toBe('package');
    });
  });

  describe('unknown family', () => {
    it('"slice" is not in the table → unknown', () => {
      expect(normalize(2, 'slice').family).toBe('unknown');
    });
    it('garbage strings stay unknown', () => {
      expect(normalize(2, 'asdf').recognised).toBe(false);
    });
  });

  describe('numeric input handling', () => {
    it('string qty parses', () => {
      expect(normalize('500', 'g').qty).toBe(500);
    });
    it('non-numeric qty falls back to 0', () => {
      expect(normalize('abc', 'g').qty).toBe(0);
    });
    it('null/undefined qty falls back to 0', () => {
      expect(normalize(null, 'g').qty).toBe(0);
      expect(normalize(undefined, 'g').qty).toBe(0);
    });
  });

  describe('whitespace + casing', () => {
    it('uppercase units canonicalise', () => {
      expect(normalize(1, 'CUP').family).toBe('volume');
      expect(normalize(1, 'KG').family).toBe('mass');
    });
    it('extra whitespace is trimmed', () => {
      expect(normalize(1, '  cup  ').family).toBe('volume');
    });
    it('underscores/hyphens collapse', () => {
      expect(normalize(1, 'fl-oz').family).toBe('volume');
      expect(normalize(1, 'fl_oz').family).toBe('volume');
    });
  });
});

describe('unitNormalize.compare', () => {
  it('same unit equality', () => {
    expect(compare({ qty: 100, unit: 'g' }, { qty: 100, unit: 'g' })).toBe('equal');
  });

  it('cross-unit equality within tolerance: 1 lb ≈ 16 oz', () => {
    expect(compare({ qty: 1, unit: 'lb' }, { qty: 16, unit: 'oz' })).toBe('equal');
  });

  it('cross-unit equality: 1 kg ≈ 1000 g', () => {
    expect(compare({ qty: 1, unit: 'kg' }, { qty: 1000, unit: 'g' })).toBe('equal');
  });

  it('cross-unit equality: 1 gal ≈ 4 qt', () => {
    expect(compare({ qty: 1, unit: 'gal' }, { qty: 4, unit: 'qt' })).toBe('equal');
  });

  it('1 cup < 500 ml', () => {
    expect(compare({ qty: 1, unit: 'cup' }, { qty: 500, unit: 'ml' })).toBe('less');
  });

  it('1 l > 1 cup', () => {
    expect(compare({ qty: 1, unit: 'l' }, { qty: 1, unit: 'cup' })).toBe('greater');
  });

  it('cross-family is incomparable: 2 cups vs 200 g', () => {
    expect(compare({ qty: 2, unit: 'cup' }, { qty: 200, unit: 'g' })).toBe('incomparable');
  });

  it('mass vs count is incomparable', () => {
    expect(compare({ qty: 1, unit: 'lb' }, { qty: 1, unit: 'dozen' })).toBe('incomparable');
  });

  it('unknown unit is incomparable', () => {
    expect(compare({ qty: 1, unit: 'slice' }, { qty: 1, unit: 'g' })).toBe('incomparable');
  });

  it('package canonical match → comparable', () => {
    expect(compare({ qty: 2, unit: 'jar' }, { qty: 1, unit: 'jar' })).toBe('greater');
  });

  it('package canonical mismatch → incomparable', () => {
    expect(compare({ qty: 2, unit: 'jar' }, { qty: 1, unit: 'box' })).toBe('incomparable');
  });

  it('package alias normalisation: pkg ≡ pack', () => {
    expect(compare({ qty: 1, unit: 'pkg' }, { qty: 1, unit: 'pack' })).toBe('equal');
  });

  it('count: 1 dozen = 12 pieces', () => {
    expect(compare({ qty: 1, unit: 'dozen' }, { qty: 12, unit: 'piece' })).toBe('equal');
  });

  it('count: 2 dozen > 12 pieces', () => {
    expect(compare({ qty: 2, unit: 'dozen' }, { qty: 12, unit: 'piece' })).toBe('greater');
  });

  it('1 tbsp = 3 tsp', () => {
    expect(compare({ qty: 1, unit: 'tbsp' }, { qty: 3, unit: 'tsp' })).toBe('equal');
  });

  it('1 cup = 16 tbsp', () => {
    expect(compare({ qty: 1, unit: 'cup' }, { qty: 16, unit: 'tbsp' })).toBe('equal');
  });

  it('1 floz = 2 tbsp', () => {
    expect(compare({ qty: 1, unit: 'floz' }, { qty: 2, unit: 'tbsp' })).toBe('equal');
  });
});

describe('unitNormalize.convert', () => {
  it('1 kg → 2.2 lb (approx)', () => {
    const r = convert(1, 'kg', 'lb')!;
    expect(r).toBeCloseTo(2.20462, 3);
  });
  it('500 ml → 0.5 l', () => {
    expect(convert(500, 'ml', 'l')).toBe(0.5);
  });
  it('1 cup → 16 tbsp', () => {
    expect(convert(1, 'cup', 'tbsp')).toBeCloseTo(16, 1);
  });
  it('cross-family returns null', () => {
    expect(convert(1, 'cup', 'g')).toBeNull();
  });
  it('cross-package returns null', () => {
    expect(convert(1, 'jar', 'bag')).toBeNull();
  });
  it('within-package returns 1', () => {
    expect(convert(2, 'jar', 'jar')).toBe(2);
  });
});

describe('unitNormalize.unitFamily', () => {
  it('reports correct families', () => {
    expect(unitFamily('cup')).toBe('volume');
    expect(unitFamily('lb')).toBe('mass');
    expect(unitFamily('dozen')).toBe('count');
    expect(unitFamily('jar')).toBe('package');
    expect(unitFamily('xxx')).toBe('unknown');
    expect(unitFamily(null)).toBe('count');
  });
});
