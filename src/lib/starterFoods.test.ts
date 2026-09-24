import { describe, it, expect } from 'vitest';
import { STARTER_FOODS, seedStarterFoods } from './starterFoods';
import { canonicalAllergen, matchingAllergen } from './allergens';

const byName = new Map(STARTER_FOODS.map((f) => [f.name, f]));
const allergensOf = (name: string) => {
  const food = byName.get(name);
  if (!food) throw new Error(`no starter food named ${name}`);
  return [...(food.allergens ?? [])].sort();
};

describe('starter foods (the local-app seed)', () => {
  it('marks no food safe (US-803)', () => {
    expect(STARTER_FOODS.filter((f) => f.is_safe).map((f) => f.name)).toEqual([]);
  });

  it('never marks a food both safe and a try bite', () => {
    expect(STARTER_FOODS.some((f) => f.is_safe && f.is_try_bite)).toBe(false);
  });

  it('carries an allergen list on every food, in canonical words', () => {
    for (const food of STARTER_FOODS) {
      expect(Array.isArray(food.allergens), food.name).toBe(true);
      for (const a of food.allergens ?? []) {
        expect(canonicalAllergen(a), `${food.name}: ${a}`).toBe(a);
      }
    }
  });

  it.each([
    ['Chicken Nuggets', ['soy', 'wheat']],
    ['Mac & Cheese', ['milk', 'wheat']],
    ['Pizza', ['milk', 'wheat']],
    ['Yogurt', ['milk']],
    ['Goldfish Crackers', ['milk', 'wheat']],
    ['String Cheese', ['milk']],
    ['Hummus', ['sesame']],
    ['Banana', []],
    ['Carrots', []],
  ])('%s is tagged %j', (name, expected) => {
    expect(allergensOf(name)).toEqual([...expected].sort());
  });

  it('is caught by the allergen check a kid profile uses', () => {
    // The picker stores "dairy"-style words; the check must still hit.
    expect(matchingAllergen(['dairy'], byName.get('String Cheese')?.allergens)).toBe('milk');
    expect(matchingAllergen(['gluten'], byName.get('Pizza')?.allergens)).toBe('wheat');
    expect(matchingAllergen(['sesame seeds'], byName.get('Hummus')?.allergens)).toBe('sesame');
  });

  it('seeds fresh ids and copies, so editing a seeded food leaves the list alone', () => {
    let n = 0;
    const seeded = seedStarterFoods(() => `id-${++n}`);
    expect(seeded).toHaveLength(STARTER_FOODS.length);
    expect(new Set(seeded.map((f) => f.id)).size).toBe(seeded.length);
    seeded[0].allergens?.push('egg');
    expect(STARTER_FOODS[0].allergens).not.toContain('egg');
  });
});
