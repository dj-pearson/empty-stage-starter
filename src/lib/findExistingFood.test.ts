import { describe, it, expect } from 'vitest';
import { findExistingFood, foodNameKey } from './findExistingFood';
import type { Food } from '@/types';

const food = (id: string, over: Partial<Food> = {}): Food => ({
  id,
  name: id,
  category: 'snack',
  is_safe: false,
  is_try_bite: false,
  ...over,
});

describe('findExistingFood', () => {
  it("'Milk ' matches 'milk'", () => {
    const foods = [food('a', { name: 'Bread' }), food('b', { name: 'milk' })];
    expect(findExistingFood(foods, { name: 'Milk ' })?.id).toBe('b');
  });

  it('collapses whitespace and singularises the last word', () => {
    const foods = [food('a', { name: 'Granny Smith Apple' })];
    expect(findExistingFood(foods, { name: '  granny   smith apples' })?.id).toBe('a');
    expect(foodNameKey('Eggs')).toBe('egg');
  });

  it('a barcode match beats a name mismatch', () => {
    const foods = [
      food('named', { name: 'Oat Milk' }),
      food('scanned', { name: 'Oatly Barista', barcode: '7394376616037' }),
    ];
    expect(findExistingFood(foods, { name: 'Oat Milk', barcode: '7394376616037' })?.id).toBe('scanned');
  });

  it('nothing matches across different barcodes', () => {
    const foods = [food('a', { name: 'Yogurt', barcode: '111', canonical_id: 'cat-1' })];
    expect(findExistingFood(foods, { name: 'Yogurt', barcode: '222' })).toBeUndefined();
    expect(findExistingFood(foods, { name: 'Yogurt', barcode: '222', canonicalId: 'cat-1' })).toBeUndefined();
  });

  it('a food with no barcode can still take a scanned name match', () => {
    const foods = [food('a', { name: 'Yogurt' })];
    expect(findExistingFood(foods, { name: 'yogurt', barcode: '222' })?.id).toBe('a');
  });

  it('canonical_id comes before name', () => {
    const foods = [
      food('byName', { name: 'Cheddar' }),
      food('byCatalog', { name: 'Sharp Cheddar Block', canonical_id: 'cat-9' }),
    ];
    expect(findExistingFood(foods, { name: 'Cheddar', canonicalId: 'cat-9' })?.id).toBe('byCatalog');
  });

  it('returns undefined for an empty name and no ids', () => {
    expect(findExistingFood([food('a', { name: '' })], { name: '  ' })).toBeUndefined();
  });
});
