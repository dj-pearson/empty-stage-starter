/**
 * Cross-module contract: the plates the real useRecipePlates hook builds (from
 * the rows Supabase returns) flow into reconcileRow and siblingScheduleGuard
 * unchanged. Only the Supabase client is faked; the solver, the annotator, the
 * plate planner, the reconciler and the schedule guard are all real, so a
 * shape drift between them (kid key names, blockedBy, heldBack) fails here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Food, Kid, Recipe } from '@/types';

type Response = { data: unknown; error: unknown };
const responses: Record<string, Response> = {};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: () => Promise.resolve(responses[table] ?? { data: [], error: null }),
      }),
    }),
  },
}));
vi.mock('@/lib/logger', () => {
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return { logger };
});

import { useRecipePlates } from '@/hooks/useRecipePlates';
import {
  annotateResults,
  buildSolverInputs,
  findSiblingMeals,
  kidToSolverKid,
  reconcileRow,
} from '@/lib/siblingMealFinder';
import { siblingScheduleGuard } from '@/lib/siblingSchedule';

const FOODS: Food[] = [
  { id: 'noodles', name: 'Noodles', category: 'carb', allergens: [], is_safe: true, is_try_bite: false } as Food,
  { id: 'sauce', name: 'Sesame sauce', category: 'protein', allergens: ['sesame'], is_safe: true, is_try_bite: false } as Food,
];

const RECIPE = { id: 'r1', name: 'Sesame noodles', food_ids: ['noodles', 'sauce'] } as Recipe;

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

function kid(id: string, name: string, over: Partial<Kid> = {}): Kid {
  return { id, name, allergens: [], allergen_severity: {}, ...over } as Kid;
}

beforeEach(() => {
  for (const key of Object.keys(responses)) delete responses[key];
  responses.recipe_components = { data: COMPONENT_ROWS, error: null };
  responses.recipe_ingredients = {
    data: [
      { component_id: 'c-noodles', food_id: 'noodles' },
      { component_id: 'c-sauce', food_id: 'sauce' },
    ],
    error: null,
  };
  responses.kid_food_ladder = { data: [], error: null };
});

function runPipeline(kids: Kid[]) {
  const inputs = buildSolverInputs([RECIPE], FOODS);
  const selectedKidIds = kids.map((k) => k.id);
  const solved = findSiblingMeals({
    recipes: [RECIPE],
    foods: FOODS,
    kids,
    selectedKidIds,
    history: [],
    options: { limit: Infinity },
    inputs,
  });
  const rows = annotateResults(solved, { recipes: [RECIPE], foods: FOODS, kids, selectedKidIds, inputs });
  // The same mapping the page uses to build the hook's kids.
  const platingKids = kids.map((k) => ({ ...kidToSolverKid(k), textureDislikes: k.texture_dislikes ?? null }));
  const platingRecipes = [inputs.recipeById.get('r1')!];
  return { inputs, rows, platingKids, platingRecipes };
}

describe('useRecipePlates -> reconcileRow -> siblingScheduleGuard', () => {
  it('a mild allergy holds the sauce back and keeps the child plannable', async () => {
    const kids = [
      kid('a', 'Ava', { allergens: ['sesame'], allergen_severity: { sesame: 'mild' } }),
      kid('b', 'Ben'),
    ];
    const { inputs, rows, platingKids, platingRecipes } = runPipeline(kids);
    const { result } = renderHook(() =>
      useRecipePlates({ recipes: platingRecipes, kids: platingKids, today: '2026-09-24' })
    );
    await waitFor(() => expect(result.current.platesByRecipe.has('r1')).toBe(true));
    const plates = result.current.platesByRecipe.get('r1')!;

    const ava = plates.find((p) => p.kidId === 'a')!;
    expect(ava.blocked).toBe(false);
    expect(ava.heldBack.map((c) => c.componentName)).toEqual(['Sauce']);

    const row = rows.find((r) => r.result.recipeId === 'r1')!;
    const reconciled = reconcileRow(row, plates, kids);
    expect(reconciled.usableKidIds.sort()).toEqual(['a', 'b']);
    expect(reconciled.tier).toBe('with_changes');

    const guard = siblingScheduleGuard({
      kids: kids.filter((k) => reconciled.usableKidIds.includes(k.id)),
      recipeFoodIds: RECIPE.food_ids,
      foodById: inputs.foodById,
      plates,
    });
    expect(guard.schedule).toEqual(['a', 'b']);
    expect(guard.blocked).toEqual([]);
  });

  it('an unrated allergy is treated as severe: no plan for that child anywhere in the chain', async () => {
    const kids = [kid('a', 'Ava', { allergens: ['sesame'], allergen_severity: {} }), kid('b', 'Ben')];
    const { inputs, rows, platingKids, platingRecipes } = runPipeline(kids);
    const { result } = renderHook(() =>
      useRecipePlates({ recipes: platingRecipes, kids: platingKids, today: '2026-09-24' })
    );
    await waitFor(() => expect(result.current.platesByRecipe.has('r1')).toBe(true));
    const plates = result.current.platesByRecipe.get('r1')!;
    expect(plates.find((p) => p.kidId === 'a')!.blocked).toBe(true);

    // The solver itself excludes the dish (never split-plates an unrated hit),
    // so reconcileRow offers it to nobody.
    const row = rows.find((r) => r.result.recipeId === 'r1')!;
    expect(row.result.excluded).toBe(true);
    const reconciled = reconcileRow(row, plates, kids);
    expect(reconciled.tier).toBe('none');
    expect(reconciled.usableKidIds).toEqual([]);

    // And even if a stale card asked for both, the guard drops Ava by name.
    const guard = siblingScheduleGuard({
      kids,
      recipeFoodIds: RECIPE.food_ids,
      foodById: inputs.foodById,
      plates,
    });
    expect(guard.schedule).toEqual(['b']);
    expect(guard.blocked).toHaveLength(1);
    expect(guard.blocked[0]).toMatchObject({ cause: 'allergen', copyKind: 'severeUnrated' });
    expect(guard.blocked[0].kid.id).toBe('a');
  });
});
