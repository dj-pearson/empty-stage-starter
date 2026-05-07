import { describe, it, expect } from 'vitest';
import { parsePantryQuickAddLine, parsePantryQuickAddBulk } from './pantryQuickAddParser';

describe('parsePantryQuickAddLine', () => {
  describe('leading qty + unit', () => {
    it('"2 lb chicken breast"', () => {
      const r = parsePantryQuickAddLine('2 lb chicken breast')!;
      expect(r.name).toBe('chicken breast');
      expect(r.quantity).toBe(2);
      expect(r.unit).toBe('lbs');
      expect(r.confidence).toBe(1.0);
    });

    it('"3 dozen eggs"', () => {
      const r = parsePantryQuickAddLine('3 dozen eggs')!;
      expect(r.name).toBe('eggs');
      expect(r.quantity).toBe(3);
      expect(r.unit).toBe('dozen');
    });

    it('"1.5 lb ground beef"', () => {
      const r = parsePantryQuickAddLine('1.5 lb ground beef')!;
      expect(r.name).toBe('ground beef');
      expect(r.quantity).toBe(1.5);
      expect(r.unit).toBe('lbs');
    });

    it('"½ gallon milk"', () => {
      const r = parsePantryQuickAddLine('½ gallon milk')!;
      expect(r.name).toBe('milk');
      expect(r.quantity).toBe(0.5);
      expect(r.unit).toBe('gal');
    });

    it('"2 cups flour"', () => {
      const r = parsePantryQuickAddLine('2 cups flour')!;
      expect(r.name).toBe('flour');
      expect(r.quantity).toBe(2);
      expect(r.unit).toBe('cups');
    });

    it('"1 jar peanut butter"', () => {
      const r = parsePantryQuickAddLine('1 jar peanut butter')!;
      expect(r.name).toBe('peanut butter');
      expect(r.unit).toBe('jars');
    });

    it('"3x apples"', () => {
      const r = parsePantryQuickAddLine('3x apples')!;
      expect(r.quantity).toBe(3);
      expect(r.name).toBe('apples');
    });
  });

  describe('trailing qty + unit', () => {
    it('"chicken 2 lb"', () => {
      const r = parsePantryQuickAddLine('chicken 2 lb')!;
      expect(r.name).toBe('chicken');
      expect(r.quantity).toBe(2);
      expect(r.unit).toBe('lb');
      expect(r.confidence).toBe(0.85);
    });

    it('"eggs 12 ct"', () => {
      const r = parsePantryQuickAddLine('eggs 12 ct')!;
      expect(r.name).toBe('eggs');
      expect(r.quantity).toBe(12);
      expect(r.unit).toBe('ct');
    });

    it('"olive oil 750 ml"', () => {
      const r = parsePantryQuickAddLine('olive oil 750 ml')!;
      expect(r.name).toBe('olive oil');
      expect(r.quantity).toBe(750);
      expect(r.unit).toBe('ml');
    });

    it('"pasta 1 box"', () => {
      const r = parsePantryQuickAddLine('pasta 1 box')!;
      expect(r.name).toBe('pasta');
      expect(r.quantity).toBe(1);
      expect(r.unit).toBe('box');
    });
  });

  describe('trailing bare unit (no qty)', () => {
    it('"milk gal"', () => {
      const r = parsePantryQuickAddLine('milk gal')!;
      expect(r.name).toBe('milk');
      expect(r.quantity).toBe(1);
      expect(r.unit).toBe('gal');
      expect(r.confidence).toBe(0.8);
    });

    it('"rice bag"', () => {
      const r = parsePantryQuickAddLine('rice bag')!;
      expect(r.name).toBe('rice');
      expect(r.unit).toBe('bag');
    });

    it('"yogurt oz" doesn\'t mistake oz for product name', () => {
      const r = parsePantryQuickAddLine('yogurt oz')!;
      expect(r.name).toBe('yogurt');
      expect(r.unit).toBe('oz');
    });
  });

  describe('bare name (UnitInference catalog)', () => {
    it('"milk" → 1 gal (catalog)', () => {
      const r = parsePantryQuickAddLine('milk')!;
      expect(r.name).toBe('milk');
      expect(r.quantity).toBe(1);
      expect(r.unit).toBe('gal');
      expect(r.category).toBe('dairy');
      expect(r.confidence).toBe(0.7);
    });

    it('"eggs" → 1 dozen (catalog)', () => {
      const r = parsePantryQuickAddLine('eggs')!;
      expect(r.unit).toBe('dozen');
      expect(r.quantity).toBe(1);
    });

    it('"rice" → 1 bag (catalog)', () => {
      const r = parsePantryQuickAddLine('rice')!;
      expect(r.unit).toBe('bag');
    });

    it('"chicken breast" → 2 lb (catalog)', () => {
      const r = parsePantryQuickAddLine('chicken breast')!;
      expect(r.unit).toBe('lb');
      expect(r.quantity).toBe(2);
      expect(r.category).toBe('protein');
    });

    it('"banana" → 6 count (catalog)', () => {
      const r = parsePantryQuickAddLine('banana')!;
      expect(r.unit).toBe('count');
      expect(r.quantity).toBe(6);
    });

    it('"peanut butter" → 1 jar (catalog)', () => {
      const r = parsePantryQuickAddLine('peanut butter')!;
      expect(r.unit).toBe('jar');
    });

    it('"ice cream" → 1 pt (catalog, must beat generic "cream")', () => {
      const r = parsePantryQuickAddLine('ice cream')!;
      expect(r.unit).toBe('pt');
      expect(r.category).toBe('snack');
    });
  });

  describe('bare name (no catalog hit)', () => {
    it('"unicorn dust" falls through to 1 piece, low confidence', () => {
      const r = parsePantryQuickAddLine('unicorn dust')!;
      expect(r.name).toBe('unicorn dust');
      expect(r.quantity).toBe(1);
      expect(r.unit).toBe('');
      expect(r.confidence).toBe(0.5);
    });

    it('"basil"', () => {
      const r = parsePantryQuickAddLine('basil')!;
      expect(r.name).toBe('basil');
      expect(r.quantity).toBe(1);
      expect(r.confidence).toBe(0.5);
    });
  });

  describe('whitespace + edge cases', () => {
    it('empty string returns null', () => {
      expect(parsePantryQuickAddLine('')).toBeNull();
      expect(parsePantryQuickAddLine('   ')).toBeNull();
    });

    it('leading bullet is stripped via parseGroceryText', () => {
      const r = parsePantryQuickAddLine('- 2 lb chicken')!;
      expect(r.name).toBe('chicken');
      expect(r.quantity).toBe(2);
    });

    it('trailing whitespace tolerated', () => {
      const r = parsePantryQuickAddLine('   2 lb chicken   ')!;
      expect(r.quantity).toBe(2);
    });

    it('mixed casing: "MILK"', () => {
      const r = parsePantryQuickAddLine('MILK')!;
      // Catalog lookup is case-insensitive on the keyword side.
      expect(r.unit).toBe('gal');
    });

    it('"3" (number-only) treated as bare name, qty 1', () => {
      // Pathological — user typed only "3". The leading parser will not match
      // (no name), the trailing parser won't match (single token), and the
      // catalog won't hit. Falls through to tier 4 with the literal as name.
      const r = parsePantryQuickAddLine('3')!;
      expect(r.name).toBe('3');
      expect(r.quantity).toBe(1);
    });
  });

  describe('category inference', () => {
    it('protein hits (chicken)', () => {
      expect(parsePantryQuickAddLine('chicken thigh')!.category).toBe('protein');
    });
    it('dairy hits (yogurt)', () => {
      expect(parsePantryQuickAddLine('yogurt')!.category).toBe('dairy');
    });
    it('fruit hits (apple)', () => {
      expect(parsePantryQuickAddLine('apple')!.category).toBe('fruit');
    });
    it('vegetable hits (broccoli)', () => {
      expect(parsePantryQuickAddLine('broccoli')!.category).toBe('vegetable');
    });
    it('carb hits (bread)', () => {
      expect(parsePantryQuickAddLine('bread')!.category).toBe('carb');
    });
  });
});

describe('parsePantryQuickAddBulk', () => {
  it('splits on newlines and parses each non-empty line', () => {
    const out = parsePantryQuickAddBulk(`
2 lb chicken
eggs 12 ct
milk

rice
`);
    expect(out).toHaveLength(4);
    expect(out[0].name).toBe('chicken');
    expect(out[1].name).toBe('eggs');
    expect(out[2].name).toBe('milk');
    expect(out[3].name).toBe('rice');
  });

  it('empty input returns []', () => {
    expect(parsePantryQuickAddBulk('')).toEqual([]);
    expect(parsePantryQuickAddBulk('\n\n   \n')).toEqual([]);
  });

  it('bulk preserves per-line confidence', () => {
    const out = parsePantryQuickAddBulk('2 lb chicken\nmilk\nunicorn dust');
    expect(out[0].confidence).toBe(1.0);
    expect(out[1].confidence).toBe(0.7);
    expect(out[2].confidence).toBe(0.5);
  });
});
