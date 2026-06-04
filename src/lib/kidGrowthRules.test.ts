import { describe, it, expect } from 'vitest';
import {
  ageMilestoneFor,
  assertNoAllergenAutoRemoval,
  buildKidGrowthSuggestions,
  calcAgeYears,
  isBirthdayToday,
  portionScalerForAge,
} from './kidGrowthRules';
import type { Food, Kid } from '@/types';

const NOW = new Date('2026-05-20T12:00:00Z');

function makeKid(overrides: Partial<Kid> = {}): Kid {
  return {
    id: overrides.id ?? 'kid-1',
    name: overrides.name ?? 'Mia',
    date_of_birth: overrides.date_of_birth,
    allergens: overrides.allergens,
    disliked_foods: overrides.disliked_foods,
  };
}

function makeFood(id: string, name: string, category: Food['category'] = 'vegetable'): Food {
  return { id, name, category, is_safe: true, is_try_bite: false };
}

describe('calcAgeYears', () => {
  it('returns full years when birthday already passed', () => {
    expect(calcAgeYears('2020-01-15', NOW)).toBe(6);
  });

  it('subtracts one when the birthday is later this year', () => {
    expect(calcAgeYears('2020-08-15', NOW)).toBe(5);
  });

  it('returns 0 on a malformed date', () => {
    expect(calcAgeYears('not-a-date', NOW)).toBe(0);
  });
});

describe('isBirthdayToday', () => {
  it('matches on month + day across years', () => {
    expect(isBirthdayToday('2020-05-20', NOW)).toBe(true);
  });

  it('returns false on a non-matching day', () => {
    expect(isBirthdayToday('2020-05-19', NOW)).toBe(false);
  });
});

describe('ageMilestoneFor', () => {
  it('maps every age to a stage', () => {
    expect(ageMilestoneFor(0)).toBe('infant');
    expect(ageMilestoneFor(2)).toBe('toddler');
    expect(ageMilestoneFor(5)).toBe('preschool');
    expect(ageMilestoneFor(8)).toBe('school_age');
    expect(ageMilestoneFor(12)).toBe('tween');
    expect(ageMilestoneFor(15)).toBe('teen');
  });
});

describe('portionScalerForAge', () => {
  it('returns 1.0 at the baseline (age 5)', () => {
    expect(portionScalerForAge(5)).toBeCloseTo(1, 2);
  });

  it('returns sub-1 for toddlers', () => {
    expect(portionScalerForAge(2)).toBeLessThan(1);
  });

  it('returns >1 for teens', () => {
    expect(portionScalerForAge(15)).toBeGreaterThan(1.3);
  });

  it('clamps below age 1 and above 16', () => {
    expect(portionScalerForAge(0)).toBe(portionScalerForAge(1));
    expect(portionScalerForAge(20)).toBe(portionScalerForAge(16));
  });
});

describe('buildKidGrowthSuggestions', () => {
  it('returns null when the kid has no birthdate', () => {
    expect(buildKidGrowthSuggestions(makeKid(), [])).toBeNull();
  });

  it('captures toddler → preschool transition (age 3 == preschool by AAP)', () => {
    const k = makeKid({ date_of_birth: '2023-05-20' }); // turning 3 today
    const out = buildKidGrowthSuggestions(k, [], { asOf: NOW });
    expect(out!.ageYears).toBe(3);
    expect(out!.ageMilestone).toBe('preschool');
  });

  it('still calls a 2-year-old toddler', () => {
    const k = makeKid({ date_of_birth: '2024-05-20' });
    const out = buildKidGrowthSuggestions(k, [], { asOf: NOW });
    expect(out!.ageYears).toBe(2);
    expect(out!.ageMilestone).toBe('toddler');
  });

  it('emits up to maxRetryFoods retry candidates from disliked_foods', () => {
    const foods: Food[] = [
      makeFood('food-1', 'Broccoli'),
      makeFood('food-2', 'Carrots'),
      makeFood('food-3', 'Brussels'),
      makeFood('food-4', 'Cauliflower'),
      makeFood('food-5', 'Beets'),
      makeFood('food-6', 'Asparagus'),
    ];
    const k = makeKid({
      date_of_birth: '2020-05-20',
      disliked_foods: ['food-1', 'food-2', 'food-3', 'food-4', 'food-5', 'food-6'],
    });
    const out = buildKidGrowthSuggestions(k, foods, { asOf: NOW, maxRetryFoods: 5 });
    expect(out!.retryFoods).toHaveLength(5);
  });

  it('produces an allergen reintro prompt without auto-removing', () => {
    const k = makeKid({
      date_of_birth: '2020-05-20',
      allergens: ['Peanut'],
    });
    const out = buildKidGrowthSuggestions(k, [], { asOf: NOW });
    expect(out!.allergenReintroPrompts).toHaveLength(1);
    expect(out!.allergenReintroPrompts[0]).toMatch(/peanut/i);
  });

  it('does not invent prompts for unknown allergens', () => {
    const k = makeKid({
      date_of_birth: '2020-05-20',
      allergens: ['Quinoa'],
    });
    const out = buildKidGrowthSuggestions(k, [], { asOf: NOW });
    expect(out!.allergenReintroPrompts).toHaveLength(0);
  });

  it('preschool → elementary transition gets a school_age milestone', () => {
    const k = makeKid({ date_of_birth: '2020-05-20' }); // turning 6
    const out = buildKidGrowthSuggestions(k, [], { asOf: NOW });
    expect(out!.ageMilestone).toBe('school_age');
  });
});

describe('assertNoAllergenAutoRemoval', () => {
  it('passes when no allergens were ever set', () => {
    expect(assertNoAllergenAutoRemoval(undefined, undefined)).toBe(true);
  });

  it('passes when the same allergens are preserved', () => {
    expect(assertNoAllergenAutoRemoval(['peanut'], ['peanut'])).toBe(true);
  });

  it('throws when an allergen is silently dropped', () => {
    expect(() =>
      assertNoAllergenAutoRemoval(['peanut', 'egg'], ['peanut'])
    ).toThrow(/refusing to drop allergen "egg"/);
  });
});
