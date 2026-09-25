/**
 * useRecipePlates fails closed: a failed ingredient or ladder query must not
 * leave components behind without their food links, because the planner would
 * then put an allergen component 'On the plate'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

type Response = { data: unknown; error: unknown };

const responses: Record<string, Response> = {};
const pending: Record<string, Promise<Response> | undefined> = {};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: () => pending[table] ?? Promise.resolve(responses[table] ?? { data: [], error: null }),
      }),
    }),
  },
}));
vi.mock('@/lib/logger', () => {
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return { logger };
});

import { useRecipePlates } from './useRecipePlates';
import type { SolverRecipe } from '@/lib/siblingConstraintSolver';
import type { PlatingKid } from '@/lib/platePlanner';

const RECIPE: SolverRecipe = {
  id: 'r1',
  name: 'Peanut noodles',
  foodIds: ['noodles', 'sauce'],
  foods: [
    { id: 'noodles', name: 'Noodles', allergens: [] },
    { id: 'sauce', name: 'Peanut sauce', allergens: ['peanut'] },
  ],
};

const KIDS: PlatingKid[] = [
  { id: 'k1', name: 'Ava', allergens: ['peanut'], allergenSeverity: { peanut: 'mild' } },
  { id: 'k2', name: 'Ben' },
];

const COMPONENT_ROWS = [
  {
    id: 'c-noodles',
    recipe_id: 'r1',
    name: 'Noodles',
    sort_order: 0,
    can_touch_other_foods: true,
    is_mixed_in: false,
    can_be_held_back: true,
    textures: [],
    food_id: null,
    notes: null,
  },
  {
    id: 'c-sauce',
    recipe_id: 'r1',
    name: 'Sauce',
    sort_order: 1,
    can_touch_other_foods: true,
    is_mixed_in: false,
    can_be_held_back: true,
    textures: [],
    food_id: null,
    notes: null,
  },
];

beforeEach(() => {
  for (const key of Object.keys(responses)) delete responses[key];
  for (const key of Object.keys(pending)) delete pending[key];
});

describe('useRecipePlates', () => {
  it('plates the recipe when every query succeeds (control)', async () => {
    responses.recipe_components = { data: COMPONENT_ROWS, error: null };
    responses.recipe_ingredients = {
      data: [
        { component_id: 'c-noodles', food_id: 'noodles' },
        { component_id: 'c-sauce', food_id: 'sauce' },
      ],
      error: null,
    };
    responses.kid_food_ladder = { data: [], error: null };

    const recipes = [RECIPE];
    const { result } = renderHook(() =>
      useRecipePlates({ recipes, kids: KIDS, today: '2026-09-24' })
    );
    await waitFor(() => expect(result.current.platesByRecipe.has('r1')).toBe(true));
    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('a failing recipe_ingredients query yields error and no plates', async () => {
    responses.recipe_components = { data: COMPONENT_ROWS, error: null };
    responses.recipe_ingredients = { data: null, error: { message: 'boom' } };
    responses.kid_food_ladder = { data: [], error: null };

    const recipes = [RECIPE];
    const { result } = renderHook(() =>
      useRecipePlates({ recipes, kids: KIDS, today: '2026-09-24' })
    );
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(result.current.platesByRecipe.size).toBe(0);
  });

  it('a failing kid_food_ladder query also fails closed', async () => {
    responses.recipe_components = { data: COMPONENT_ROWS, error: null };
    responses.recipe_ingredients = { data: [], error: null };
    responses.kid_food_ladder = { data: null, error: { message: 'boom' } };

    const recipes = [RECIPE];
    const { result } = renderHook(() =>
      useRecipePlates({ recipes, kids: KIDS, today: '2026-09-24' })
    );
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.platesByRecipe.size).toBe(0);
  });

  it('recipe ids going empty mid-flight leaves loading false', async () => {
    // The components query never answers, so the first load stays in flight.
    pending.recipe_components = new Promise<Response>(() => undefined);

    const { result, rerender } = renderHook(
      ({ recipes }: { recipes: SolverRecipe[] }) =>
        useRecipePlates({ recipes, kids: KIDS, today: '2026-09-24' }),
      { initialProps: { recipes: [RECIPE] } }
    );
    await waitFor(() => expect(result.current.loading).toBe(true));

    rerender({ recipes: [] });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.platesByRecipe.size).toBe(0);
  });
});
