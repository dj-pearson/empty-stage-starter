import { describe, it, expect } from 'vitest';
import type { Food, Kid } from '@/types';
import {
  allergenConflictsForNames,
  parsedGroceryItemSchema,
  parseGroceryImagePayload,
  parseRecipePayload,
  safeParseRows,
} from './groceryInputSchemas';

describe('parsedGroceryItemSchema', () => {
  it('drops a row whose name is not a string', () => {
    const { items, dropped } = safeParseRows(parsedGroceryItemSchema, [
      { name: 42, quantity: 1, unit: 'lb', category: 'protein' },
      { name: 'Milk', quantity: 1, unit: 'gal', category: 'dairy' },
    ]);
    expect(dropped).toBe(1);
    expect(items.map((i) => i.name)).toEqual(['Milk']);
  });

  it('drops an empty or whitespace name', () => {
    expect(parsedGroceryItemSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it("maps an out-of-enum category to 'snack'", () => {
    const row = parsedGroceryItemSchema.parse({ name: 'Juice', quantity: 1, unit: '', category: 'beverage' });
    expect(row.category).toBe('snack');
  });

  it('turns a NaN quantity into 1', () => {
    expect(parsedGroceryItemSchema.parse({ name: 'Eggs', quantity: Number.NaN }).quantity).toBe(1);
    expect(parsedGroceryItemSchema.parse({ name: 'Eggs', quantity: 'two' }).quantity).toBe(1);
    expect(parsedGroceryItemSchema.parse({ name: 'Eggs', quantity: -3 }).quantity).toBe(1);
  });

  it('coerces a numeric string and trims the name', () => {
    const row = parsedGroceryItemSchema.parse({ name: '  Rice ', quantity: '2.5', unit: 'lb', category: 'carb' });
    expect(row).toEqual({ name: 'Rice', quantity: 2.5, unit: 'lb', category: 'carb' });
  });

  it('repairs a missing or oversized unit to empty', () => {
    expect(parsedGroceryItemSchema.parse({ name: 'Rice' }).unit).toBe('');
    expect(parsedGroceryItemSchema.parse({ name: 'Rice', unit: 'x'.repeat(40) }).unit).toBe('');
  });
});

describe('edge payloads', () => {
  it('reads nothing from a payload with no items array', () => {
    expect(parseGroceryImagePayload(null)).toEqual({ items: [], dropped: 0 });
    expect(parseGroceryImagePayload({ items: 'milk' })).toEqual({ items: [], dropped: 0 });
  });

  it('surfaces a recipe error and counts dropped ingredients', () => {
    expect(parseRecipePayload({ error: 'blocked' })).toEqual({ recipe: null, error: 'blocked' });
    const { recipe } = parseRecipePayload({
      recipe: { title: 'Tacos', ingredients: [{ name: 'Beef', quantity: 1, unit: 'lb' }, { quantity: 2 }] },
    });
    expect(recipe?.ingredients).toHaveLength(1);
    expect(recipe?.dropped).toBe(1);
  });
});

describe('allergenConflictsForNames', () => {
  const peanut: Food = {
    id: 'pb',
    name: 'Peanut butter',
    category: 'snack',
    is_safe: true,
    is_try_bite: false,
    allergens: ['peanuts'],
  };
  const kids = [{ id: 'leo', name: 'Leo', allergens: ['peanut'] }] as Kid[];

  it('flags a name that resolves to a pantry food carrying a kid allergen', () => {
    const hits = allergenConflictsForNames(['Bread', 'peanut butter'], [peanut], kids);
    expect([...hits.keys()]).toEqual([1]);
    expect(hits.get(1)?.[0].kid.id).toBe('leo');
  });

  it('does not flag a substring lookalike', () => {
    const egg: Food = { ...peanut, id: 'egg', name: 'Egg', allergens: ['egg'] };
    const eggKid = [{ id: 'sam', name: 'Sam', allergens: ['eggs'] }] as Kid[];
    expect(allergenConflictsForNames(['Eggplant'], [egg], eggKid).size).toBe(0);
    expect(allergenConflictsForNames(['eggs'], [egg], eggKid).size).toBe(1);
  });
});
