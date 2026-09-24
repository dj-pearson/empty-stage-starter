/**
 * A blocked plate renders as blocked, with the reason, never as an empty or
 * shorter plate (owner decision 2026-09-24: a severe or unrated allergen
 * blocks the dish even when its component could come off).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import '@/i18n/appLocale';
import { PerKidPlateBreakdown } from './PerKidPlateBreakdown';
import { planPlates, type PlatingKid } from '@/lib/platePlanner';
import type { RecipeComponent } from '@/lib/recipeComponents';
import type { SolverRecipe } from '@/lib/siblingConstraintSolver';

const FOODS = [
  { id: 'peas', name: 'Peas', category: 'vegetable', allergens: [] },
  { id: 'cheese', name: 'Cheese', category: 'dairy', allergens: ['dairy'] },
];

const RECIPE: SolverRecipe = {
  id: 'r1',
  name: 'Peas with cheese',
  foodIds: FOODS.map((f) => f.id),
  foods: FOODS,
};

function component(id: string, name: string, foodId: string, sortOrder: number): RecipeComponent {
  return {
    id,
    recipeId: 'r1',
    name,
    sortOrder,
    canTouchOtherFoods: true,
    isMixedIn: false,
    canBeHeldBack: true,
    textures: [],
    foodId,
    notes: null,
  };
}

const COMPONENTS = [component('c-peas', 'Peas', 'peas', 0), component('c-cheese', 'Cheese', 'cheese', 1)];

function renderFor(kid: PlatingKid) {
  const plates = planPlates({ recipe: RECIPE, components: COMPONENTS, kids: [kid], today: '2026-09-24' });
  return render(<PerKidPlateBreakdown plates={plates} />);
}

describe('PerKidPlateBreakdown', () => {
  it('shows a recorded severe allergen as a blocked dish with the severe reason', () => {
    renderFor({ id: 'k1', name: 'Sam', allergens: ['dairy'], allergenSeverity: { dairy: 'severe' } });

    expect(screen.getByText('Not this dish')).toBeTruthy();
    expect(screen.getByText(/Sam has a severe allergy to Cheese/)).toBeTruthy();
    expect(screen.getByText('What rules it out')).toBeTruthy();
    // Nothing is presented as going on the plate.
    expect(screen.queryByText('On the plate')).toBeNull();
    expect(screen.queryByText('Held back')).toBeNull();
  });

  it('says an unrated allergen was treated as severe', () => {
    renderFor({ id: 'k1', name: 'Sam', allergens: ['dairy'] });

    expect(screen.getByText('Not this dish')).toBeTruthy();
    expect(screen.getByText(/no severity recorded, so it is treated as severe/)).toBeTruthy();
    expect(screen.queryByText(/Sam has a severe allergy/)).toBeNull();
  });

  it('still shows a mild allergen as held back with the rest on the plate', () => {
    renderFor({ id: 'k1', name: 'Sam', allergens: ['dairy'], allergenSeverity: { dairy: 'mild' } });

    expect(screen.queryByText('Not this dish')).toBeNull();
    expect(screen.getByText('On the plate')).toBeTruthy();
    expect(screen.getByText('Held back')).toBeTruthy();
  });
});
