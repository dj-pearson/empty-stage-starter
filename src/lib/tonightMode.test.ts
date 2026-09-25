import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: vi.fn() } } }));

import type { PlanEntry } from '@/types';
import { todayDinnerPlanned, shouldShowPanicCta } from './tonightMode';
import { evaluateKidFit, scoreRecipes, type RecipeContext } from './tonightModeRanking';

const TODAY = '2026-09-24';

const dinner = (kidId: string, date = TODAY): PlanEntry => ({
  id: `${kidId}-${date}`,
  kid_id: kidId,
  date,
  meal_slot: 'dinner',
  food_id: 'rice',
  result: null,
});

describe('todayDinnerPlanned', () => {
  it('is false when only one of two kids has dinner', () => {
    expect(todayDinnerPlanned([dinner('maya')], TODAY, ['maya', 'leo'])).toBe(false);
  });

  it('is true once every kid has dinner', () => {
    expect(todayDinnerPlanned([dinner('maya'), dinner('leo')], TODAY, ['maya', 'leo'])).toBe(true);
  });

  it('ignores other days and other slots', () => {
    const lunch: PlanEntry = { ...dinner('maya'), id: 'l', meal_slot: 'lunch' };
    expect(todayDinnerPlanned([dinner('maya', '2026-09-23'), lunch], TODAY, ['maya'])).toBe(false);
  });

  it('keeps the panic CTA up in the evening while a kid is unplanned', () => {
    const planned = todayDinnerPlanned([dinner('maya')], TODAY, ['maya', 'leo']);
    const now = new Date(2026, 8, 24, 17, 0);
    expect(shouldShowPanicCta({ now, todayDinnerPlanned: planned })).toBe(true);
  });
});

describe('tonightModeRanking allergen matching', () => {
  const satay: RecipeContext = {
    id: 'satay',
    name: 'Satay',
    prepMinutes: 20,
    imageUrl: null,
    foodIds: ['sauce'],
    foods: [{ id: 'sauce', name: 'Peanut sauce', allergens: ['en:peanuts'] }],
  };
  const maya = { id: 'maya', name: 'Maya', allergens: ['Peanuts'], dislikedFoods: [] };

  it("catches a kid's 'Peanuts' against a food's 'en:peanuts'", () => {
    expect(evaluateKidFit(satay, maya).allergenHits).toEqual(['Peanut sauce']);
  });

  it('excludes the recipe from the ranking', () => {
    const [scored] = scoreRecipes(
      { recipes: [satay], pantry: [{ id: 'sauce', name: 'Peanut sauce' }], kids: [maya], recentEntries: [] },
      { maxMinutes: 30 },
    );
    expect(scored.excludeReason).toBe('allergen');
  });
});
