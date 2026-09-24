import { describe, expect, it } from 'vitest';
import type { Kid } from '@/types';
import { computeProfileCompleteness } from './kidProfileCompleteness';

const nameOnly: Kid = { id: 'k1', name: 'Maya' };

describe('computeProfileCompleteness', () => {
  it('scores an explicit empty allergy list and not an unrecorded one', () => {
    expect(computeProfileCompleteness({ ...nameOnly, allergens: [] }).percent).toBe(30);
    expect(computeProfileCompleteness({ ...nameOnly, allergens: undefined }).percent).toBe(0);
  });

  it('gives a name-only kid 0% with allergies first', () => {
    const result = computeProfileCompleteness(nameOnly);
    expect(result.percent).toBe(0);
    expect(result.missing).toEqual(['allergies', 'birthday', 'safeFoods', 'preferences', 'goals']);
  });

  it('needs three always-eats foods', () => {
    const two = computeProfileCompleteness({ ...nameOnly, always_eats_foods: ['toast', 'rice'] });
    expect(two.missing).toContain('safeFoods');
    const three = computeProfileCompleteness({ ...nameOnly, always_eats_foods: ['toast', 'rice', 'apple'] });
    expect(three.missing).not.toContain('safeFoods');
    expect(three.percent).toBe(20);
  });

  it('gives a fully filled kid 100%', () => {
    const result = computeProfileCompleteness({
      ...nameOnly,
      allergens: ['peanuts'],
      date_of_birth: '2021-03-04',
      always_eats_foods: ['toast', 'rice', 'apple'],
      texture_dislikes: ['slimy'],
      helpful_strategies: ['food_chaining'],
    });
    expect(result).toEqual({ percent: 100, missing: [] });
  });

  it('accepts age in place of a date of birth', () => {
    expect(computeProfileCompleteness({ ...nameOnly, age: 5 }).missing).not.toContain('birthday');
  });
});
