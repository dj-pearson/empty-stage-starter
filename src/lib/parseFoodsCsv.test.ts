import { describe, it, expect } from 'vitest';
import { parseFoodsCsv, splitCsv } from './parseFoodsCsv';
import { ACQUIRED_FOOD_IS_SAFE, ACQUIRED_FOOD_IS_TRY_BITE } from './foodSafetyDefault';

describe('splitCsv', () => {
  it('keeps a comma, a doubled quote and a newline inside quotes', () => {
    expect(splitCsv('a,"b, c","say ""hi""","line\nbreak"\r\nx,y,z,w')).toEqual([
      ['a', 'b, c', 'say "hi"', 'line\nbreak'],
      ['x', 'y', 'z', 'w'],
    ]);
  });
});

describe('parseFoodsCsv', () => {
  it('reads a quoted comma as part of the name', () => {
    const { foods, errors } = parseFoodsCsv('name,category\n"Mac, Cheese",snack');
    expect(errors).toEqual([]);
    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({ name: 'Mac, Cheese', category: 'snack' });
  });

  it('reads only the whitelisted columns', () => {
    const { foods } = parseFoodsCsv(
      'name,category,notes,aisle,quantity,unit,allergens,household_id\n' +
        'Hummus,protein,kids love it,Deli,1.5,tub,sesame;chickpea,someone-else'
    );
    expect(foods).toEqual([
      {
        name: 'Hummus',
        category: 'protein',
        is_safe: ACQUIRED_FOOD_IS_SAFE,
        is_try_bite: ACQUIRED_FOOD_IS_TRY_BITE,
        aisle: 'Deli',
        quantity: 1.5,
        unit: 'tub',
        allergens: ['sesame', 'chickpea'],
      },
    ]);
    expect(foods[0]).not.toHaveProperty('notes');
    expect(foods[0]).not.toHaveProperty('household_id');
  });

  it('imports the same name once, case-insensitively, and says so', () => {
    const { foods, errors } = parseFoodsCsv('name,category\nApples,fruit\napples ,fruit\nPears,fruit');
    expect(foods.map((f) => f.name)).toEqual(['Apples', 'Pears']);
    expect(errors).toEqual(['Row 3 (apples): same name as row 2, imported once']);
  });

  it('lists the bad rows instead of dropping them silently', () => {
    const { foods, errors } = parseFoodsCsv(
      [
        'name,category,is_safe,quantity',
        'Broccoli,vegetable,false,1',
        ',fruit,,',
        'Cake,dessert,,',
        'Toast,carb,maybe,',
        'Rice,carb,,-2',
        'Short,carb',
      ].join('\n')
    );
    expect(foods.map((f) => f.name)).toEqual(['Broccoli']);
    expect(errors).toHaveLength(5);
    expect(errors[0]).toBe('Row 3: name is empty');
    expect(errors[1]).toMatch(/^Row 4 \(Cake\): category must be one of/);
    expect(errors[2]).toBe('Row 5 (Toast): is_safe must be true or false');
    expect(errors[3]).toBe('Row 6 (Rice): quantity must be a number, 0 or more');
    expect(errors[4]).toBe('Row 7: expected 4 columns, found 2');
  });

  it('tolerates trailing empty cells from a spreadsheet export', () => {
    const { foods, errors } = parseFoodsCsv('name,category\nMilk,dairy,,');
    expect(errors).toEqual([]);
    expect(foods).toHaveLength(1);
  });

  it('requires a name column', () => {
    expect(parseFoodsCsv('title,category\nMilk,dairy')).toEqual({
      foods: [],
      errors: ['Missing required column: name'],
    });
  });

  it('reports an empty file', () => {
    expect(parseFoodsCsv('\n\n').errors).toEqual(['The file is empty.']);
  });

  describe('US-803 safety defaults', () => {
    it('an unstated is_safe / is_try_bite is the acquired-food default', () => {
      const { foods } = parseFoodsCsv('name,category,is_safe,is_try_bite\nBroccoli,vegetable,,\nPeas,vegetable');
      // Second row is short, so only the first counts here.
      expect(foods[0].is_safe).toBe(ACQUIRED_FOOD_IS_SAFE);
      expect(foods[0].is_try_bite).toBe(ACQUIRED_FOOD_IS_TRY_BITE);
    });

    it('a file without the columns at all is the default too', () => {
      const { foods } = parseFoodsCsv('name\nBroccoli');
      expect(foods[0]).toMatchObject({
        is_safe: ACQUIRED_FOOD_IS_SAFE,
        is_try_bite: ACQUIRED_FOOD_IS_TRY_BITE,
        category: 'snack',
      });
    });

    it('a parent who wrote true in the column is believed', () => {
      const { foods } = parseFoodsCsv('name,is_safe,is_try_bite\nNuggets,TRUE,no\nPeas,,yes');
      expect(foods[0]).toMatchObject({ is_safe: true, is_try_bite: false });
      expect(foods[1]).toMatchObject({ is_safe: ACQUIRED_FOOD_IS_SAFE, is_try_bite: true });
    });
  });
});
