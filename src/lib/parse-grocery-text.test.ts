import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGroceryText } from './parse-grocery-text';

describe('parseGroceryText', () => {
  it('returns empty array for empty input', () => {
    expect(parseGroceryText('')).toEqual([]);
    expect(parseGroceryText('   ')).toEqual([]);
  });

  it('parses one-per-line items', () => {
    const result = parseGroceryText('Milk\nBread\nEggs');
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Milk');
    expect(result[1].name).toBe('Bread');
    expect(result[2].name).toBe('Eggs');
  });

  it('parses bulleted lists', () => {
    const result = parseGroceryText('- Chicken\n- Rice\n- Broccoli');
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Chicken');
    expect(result[0].category).toBe('protein');
    expect(result[2].name).toBe('Broccoli');
    expect(result[2].category).toBe('vegetable');
  });

  it('parses numbered lists', () => {
    const result = parseGroceryText('1. Apples\n2. Bananas\n3. Oranges');
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Apples');
    expect(result[0].category).toBe('fruit');
  });

  it('parses comma-separated items', () => {
    const result = parseGroceryText('eggs, butter, cheese, rice');
    expect(result).toHaveLength(4);
    expect(result[0].name).toBe('eggs');
    expect(result[1].name).toBe('butter');
  });

  it('extracts quantity and unit', () => {
    const result = parseGroceryText('2 lbs chicken breast');
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(2);
    expect(result[0].unit).toBe('lb');
    expect(result[0].name).toBe('chicken breast');
  });

  it('handles multiplier format (3x)', () => {
    const result = parseGroceryText('3x Milk');
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(3);
    expect(result[0].name).toBe('Milk');
  });

  it('handles items with no quantity', () => {
    const result = parseGroceryText('Bananas');
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(1);
    expect(result[0].name).toBe('Bananas');
  });

  it('infers correct categories', () => {
    const result = parseGroceryText('Chicken\nMilk\nApples\nSpinach\nBread\nCookies');
    expect(result[0].category).toBe('protein');
    expect(result[1].category).toBe('dairy');
    expect(result[2].category).toBe('fruit');
    expect(result[3].category).toBe('vegetable');
    expect(result[4].category).toBe('carb');
    expect(result[5].category).toBe('snack');
  });

  it('deduplicates items (case-insensitive)', () => {
    const result = parseGroceryText('Milk\nmilk\nMILK');
    expect(result).toHaveLength(1);
  });

  it('skips empty lines', () => {
    const result = parseGroceryText('Milk\n\n\nBread\n\nEggs');
    expect(result).toHaveLength(3);
  });

  it('handles unicode fractions', () => {
    const result = parseGroceryText('½ gallon milk');
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(0.5);
    expect(result[0].unit).toBe('gal');
  });

  it('handles text fractions', () => {
    const result = parseGroceryText('1 1/2 lbs ground beef');
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(1.5);
    expect(result[0].unit).toBe('lb');
  });

  it('normalizes unit synonyms', () => {
    const result = parseGroceryText('2 pounds chicken\n3 ounces cheese\n1 gallon milk');
    expect(result[0].unit).toBe('lb');
    expect(result[1].unit).toBe('oz');
    expect(result[2].unit).toBe('gal');
  });

  it('handles checkbox-style lists', () => {
    const result = parseGroceryText('[ ] Milk\n[x] Bread\n[ ] Eggs');
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Milk');
  });

  it('handles various bullet styles', () => {
    const result = parseGroceryText('• Milk\n* Bread\n▸ Eggs');
    expect(result).toHaveLength(3);
  });

  it('handles cans/bags/boxes units', () => {
    const result = parseGroceryText('3 cans tomato sauce\n2 bags spinach\n1 box cereal');
    expect(result[0].quantity).toBe(3);
    expect(result[0].unit).toBe('can');
    expect(result[1].unit).toBe('bag');
    expect(result[2].unit).toBe('box');
  });
});

/**
 * US-589 / US-590 / US-591 regression suite.
 *
 * Every case below is a behaviour the parser got WRONG before the audit; the
 * comment records the old output so a regression is obvious.
 */
describe('parseGroceryText — audit regressions', () => {
  describe('US-590: ranges', () => {
    it('averages a hyphen range (was: name "-3 lbs chicken thighs", qty 2, unit "")', () => {
      const [item] = parseGroceryText('2-3 lbs chicken thighs');
      expect(item.quantity).toBe(2.5);
      expect(item.unit).toBe('lb');
      expect(item.name).toBe('chicken thighs');
    });
    it('averages a " to " range', () => {
      const [item] = parseGroceryText('2 to 4 cups flour');
      expect(item.quantity).toBe(3);
      expect(item.unit).toBe('cup');
      expect(item.name).toBe('flour');
    });
    it('averages an en-dash range', () => {
      expect(parseGroceryText('1–2 lb beef')[0].quantity).toBe(1.5);
    });
    it('still sums a mixed number rather than averaging it', () => {
      expect(parseGroceryText('1 1/2 cups sugar')[0].quantity).toBe(1.5);
    });
  });

  describe('US-590: package sizes', () => {
    it('keeps a parenthetical size (was: 14.5 oz silently discarded)', () => {
      const [item] = parseGroceryText('1 (14.5 oz) can diced tomatoes');
      expect(item.quantity).toBe(1);
      expect(item.unit).toBe('can');
      expect(item.name).toBe('tomatoes');
      expect(item.packageSize).toEqual({ quantity: 14.5, unit: 'oz' });
    });
    it('treats "15-ounce" as a size descriptor, not a range endpoint', () => {
      const [item] = parseGroceryText('1 15-ounce can black beans');
      expect(item.quantity).toBe(1);
      expect(item.unit).toBe('can');
      expect(item.packageSize).toEqual({ quantity: 15, unit: 'oz' });
    });
    it('drops non-size parentheticals', () => {
      const [item] = parseGroceryText('1 red bell pepper (thinly sliced)');
      expect(item.name).toBe('red bell pepper');
      expect(item.packageSize).toBeUndefined();
    });
  });

  describe('US-590: units and descriptors', () => {
    it('recognises cloves and strips the trailing descriptor (was: name "cloves garlic, minced")', () => {
      const [item] = parseGroceryText('2 cloves garlic, minced');
      expect(item.quantity).toBe(2);
      expect(item.unit).toBe('clove');
      expect(item.name).toBe('garlic');
    });
    it('strips the connective "of" (was: name "of lettuce")', () => {
      const [item] = parseGroceryText('1 head of lettuce');
      expect(item.unit).toBe('head');
      expect(item.name).toBe('lettuce');
    });
    it('strips size adjectives (was: name "large eggs")', () => {
      const [item] = parseGroceryText('3 large eggs');
      expect(item.quantity).toBe(3);
      expect(item.name).toBe('eggs');
    });
    it('parses word-form numbers (was: qty 1, name "a dozen eggs")', () => {
      const [item] = parseGroceryText('a dozen eggs');
      expect(item.quantity).toBe(1);
      expect(item.unit).toBe('dozen');
      expect(item.name).toBe('eggs');
    });
    it('keeps "ground" — it is part of the name, not a filler', () => {
      expect(parseGroceryText('1 lb ground beef')[0].name).toBe('ground beef');
    });
    it('preserves an explicit zero (was: coerced to 1)', () => {
      expect(parseGroceryText('0 bananas')[0].quantity).toBe(0);
    });
  });

  describe('US-589: repeated items are summed, not dropped', () => {
    it('sums two milk lines (was: one 0.5-cup item, tablespoons discarded)', () => {
      const result = parseGroceryText('1/2 cup milk\n2 tbsp milk');
      expect(result).toHaveLength(1);
      // 118.29ml + 29.57ml = 147.87ml ≈ 0.63 cup
      expect(result[0].quantity).toBeCloseTo(0.63, 2);
      expect(result[0].unit).toBe('cup');
    });
    it('sums same-unit repeats', () => {
      const result = parseGroceryText('1 lb beef\n2 lb beef');
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(3);
      expect(result[0].unit).toBe('lb');
    });
    it('collapses qualifier variants onto one line', () => {
      const result = parseGroceryText('1 lb ground beef\n1 lb ground beef 80/20');
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(2);
    });
  });

  describe('US-591: word-boundary category inference', () => {
    const categoryOf = (line: string) => parseGroceryText(line)[0].category;

    it('graham crackers are carbs, not protein (substring "ham")', () => {
      expect(categoryOf('graham crackers')).toBe('carb');
    });
    it('hamburger buns are carbs, not protein', () => {
      expect(categoryOf('hamburger buns')).toBe('carb');
    });
    it('peanut butter is a snack, not dairy (substring "butter")', () => {
      expect(categoryOf('peanut butter')).toBe('snack');
    });
    it('"salt and pepper to taste" is a snack/pantry item, not produce', () => {
      expect(categoryOf('salt and pepper to taste')).toBe('snack');
    });
    it('eggplant is a vegetable, not protein (substring "egg")', () => {
      expect(categoryOf('2 eggplant')).toBe('vegetable');
    });
    it('corned beef is protein', () => {
      expect(categoryOf('1 lb corned beef')).toBe('protein');
    });
    it('coconut milk is not filed as dairy by accident', () => {
      expect(categoryOf('1 can coconut milk')).not.toBe('dairy');
    });
    it('bell peppers are still vegetables', () => {
      expect(categoryOf('2 bell peppers')).toBe('vegetable');
    });
    it('buttermilk is dairy', () => {
      expect(categoryOf('1 cup buttermilk')).toBe('dairy');
    });
  });
});

/**
 * US-590: shared cross-platform case table.
 *
 * These cases live in tests/fixtures/ingredient-parse-cases.json and are
 * asserted by BOTH this suite and
 * ios/EatPal/EatPalTests/SharedIngredientParseCasesTests.swift, so the web and
 * iOS ingredient parsers cannot drift apart again. Add cases to the fixture,
 * not here.
 */
describe('parseGroceryText — shared cross-platform cases', () => {
  // Resolved from the vitest root (vitest.config.ts sits at the repo root)
  // rather than import.meta.url, which is not a file: URL under the jsdom
  // environment this suite runs in.
  const fixturePath = resolve(process.cwd(), 'tests/fixtures/ingredient-parse-cases.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    cases: Array<{
      input: string;
      quantity: number;
      unit: string;
      name: string;
      was?: string;
      note?: string;
    }>;
  };

  it('the fixture is non-empty (guards against a silently broken path)', () => {
    expect(fixture.cases.length).toBeGreaterThan(15);
  });

  for (const c of fixture.cases) {
    const suffix = c.was ? ` (was: ${c.was})` : c.note ? ` — ${c.note}` : '';
    it(`${JSON.stringify(c.input)} → ${c.quantity} ${c.unit || '(no unit)'} ${c.name}${suffix}`, () => {
      const [item] = parseGroceryText(c.input);
      expect(item, 'parser returned no item').toBeDefined();
      expect(item.quantity).toBeCloseTo(c.quantity, 2);
      expect(item.unit).toBe(c.unit);
      // Case-insensitive: iOS title-cases for display, web preserves input.
      expect(item.name.toLowerCase()).toBe(c.name.toLowerCase());
    });
  }
});
