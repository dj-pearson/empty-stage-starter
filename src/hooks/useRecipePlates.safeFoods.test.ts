/**
 * P4: useRecipePlates resolves each kid's safe foods through kidSafeFoodIds
 * before plating, so an always-eats entry saved as a name still anchors the plate.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { withResolvedSafeFoods } from './useRecipePlates';
import { planPlates } from '@/lib/platePlanner';
import type { RecipeComponent } from '@/lib/recipeComponents';
import type { SolverRecipe } from '@/lib/siblingConstraintSolver';

const RECIPE: SolverRecipe = {
  id: 'r1',
  name: 'Rice and peanuts',
  foodIds: ['rice', 'nuts'],
  foods: [
    { id: 'rice', name: 'Rice', allergens: [] },
    { id: 'nuts', name: 'Peanuts', allergens: ['peanut'] },
  ],
};

const RICE: RecipeComponent = {
  id: 'c-rice',
  recipeId: 'r1',
  name: 'Rice',
  sortOrder: 0,
  canTouchOtherFoods: true,
  isMixedIn: false,
  canBeHeldBack: true,
  textures: [],
  foodId: 'rice',
  notes: null,
};

describe('withResolvedSafeFoods', () => {
  it('resolves an always-eats name to the recipe food id', () => {
    const [kid] = withResolvedSafeFoods(
      [{ id: 'k1', name: 'Sam', alwaysEatsFoods: ['rice ', 'Peanuts'], allergens: ['peanut'] }],
      [RECIPE],
      []
    );
    // Peanuts is on the list but is an allergen hit, so it is never "safe".
    expect(kid.safeFoodIds).toEqual(['rice']);

    const [plate] = planPlates({
      recipe: RECIPE,
      components: [RICE],
      kids: [kid],
      today: '2026-08-06',
    });
    expect(plate.placements[0].reasons).toContainEqual({ kind: 'safe_food', foodName: 'Rice' });
  });

  it('counts a mastered ladder food as safe', () => {
    const [kid] = withResolvedSafeFoods(
      [{ id: 'k1', name: 'Sam' }],
      [RECIPE],
      [{ kidId: 'k1', foodId: 'rice', currentRung: 'full_portion', status: 'mastered', nextDueOn: null }]
    );
    expect(kid.safeFoodIds).toEqual(['rice']);
  });

  it('keeps a caller-supplied safe list as is', () => {
    const [kid] = withResolvedSafeFoods(
      [{ id: 'k1', name: 'Sam', safeFoodIds: ['nuts'] }],
      [RECIPE],
      []
    );
    expect(kid.safeFoodIds).toEqual(['nuts']);
  });
});
