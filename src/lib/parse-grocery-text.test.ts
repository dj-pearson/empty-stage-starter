import { describe, it, expect } from 'vitest';
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
    expect(result[0].unit).toBe('lbs');
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
    const result = parseGroceryText(
      'Chicken\nMilk\nApples\nSpinach\nBread\nCookies'
    );
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
    expect(result[0].unit).toBe('lbs');
  });

  it('normalizes unit synonyms', () => {
    const result = parseGroceryText('2 pounds chicken\n3 ounces cheese\n1 gallon milk');
    expect(result[0].unit).toBe('lbs');
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
    expect(result[0].unit).toBe('cans');
    expect(result[1].unit).toBe('bags');
    expect(result[2].unit).toBe('boxes');
  });
});
