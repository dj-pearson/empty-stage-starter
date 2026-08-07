/**
 * US-612: components are optional metadata.
 *
 * The test that matters is `a recipe with no components`: every recipe in
 * production today is in that state, and it has to come back complete rather
 * than empty. The second is that an ingredient is never lost, whatever its
 * component_id points at.
 */

import { describe, it, expect } from 'vitest';
import type { Database } from '@/integrations/supabase/types';
import {
  groupIngredientsByComponent,
  normalizeRecipeComponents,
  type RecipeComponent,
} from './recipeComponents';

type ComponentRow = Database['public']['Tables']['recipe_components']['Row'];
type IngredientRow = Database['public']['Tables']['recipe_ingredients']['Row'];

function componentRow(over: Partial<ComponentRow> & { id: string }): ComponentRow {
  return {
    recipe_id: 'recipe-1',
    name: over.id,
    sort_order: 0,
    can_touch_other_foods: true,
    is_mixed_in: false,
    can_be_held_back: true,
    textures: [],
    food_id: null,
    notes: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...over,
  };
}

function ingredientRow(over: Partial<IngredientRow> & { id: string }): IngredientRow {
  return {
    recipe_id: 'recipe-1',
    component_id: null,
    food_id: null,
    sort_order: 0,
    name: over.id,
    quantity: null,
    unit: null,
    group_label: null,
    optional_notes: null,
    created_at: '2026-08-01T00:00:00Z',
    ...over,
  };
}

function component(over: Partial<RecipeComponent> & { id: string }): RecipeComponent {
  return {
    recipeId: 'recipe-1',
    name: over.id,
    sortOrder: 0,
    canTouchOtherFoods: true,
    isMixedIn: false,
    canBeHeldBack: true,
    textures: [],
    foodId: null,
    notes: null,
    ...over,
  };
}

describe('normalizeRecipeComponents', () => {
  it('carries the sensory flags through without re-defaulting them', () => {
    const [normalized] = normalizeRecipeComponents([
      componentRow({
        id: 'sauce',
        name: 'Tomato sauce',
        can_touch_other_foods: false,
        is_mixed_in: true,
        can_be_held_back: true,
        textures: ['Wet', 'Slimy'],
        food_id: 'food-tomato',
      }),
    ]);

    expect(normalized).toEqual({
      id: 'sauce',
      recipeId: 'recipe-1',
      name: 'Tomato sauce',
      sortOrder: 0,
      canTouchOtherFoods: false,
      isMixedIn: true,
      canBeHeldBack: true,
      textures: ['Wet', 'Slimy'],
      foodId: 'food-tomato',
      notes: null,
    });
  });

  it('orders by sort_order, ties by name', () => {
    const rows = [
      componentRow({ id: 'c', name: 'Peas', sort_order: 1 }),
      componentRow({ id: 'a', name: 'Pasta', sort_order: 0 }),
      componentRow({ id: 'b', name: 'Cheese', sort_order: 1 }),
    ];

    expect(normalizeRecipeComponents(rows).map((c) => c.name)).toEqual(['Pasta', 'Cheese', 'Peas']);
  });
});

describe('groupIngredientsByComponent', () => {
  it('returns a recipe with no components as complete, not empty', () => {
    const ingredients = [
      ingredientRow({ id: 'i2', name: 'Sauce', sort_order: 1 }),
      ingredientRow({ id: 'i1', name: 'Pasta', sort_order: 0 }),
    ];

    const grouped = groupIngredientsByComponent([], ingredients);

    expect(grouped.hasComponents).toBe(false);
    expect(grouped.groups).toEqual([]);
    expect(grouped.ungrouped.map((i) => i.name)).toEqual(['Pasta', 'Sauce']);
  });

  it('groups ingredients under their component and keeps the remainder', () => {
    const components = [
      component({ id: 'pasta', name: 'Pasta', sortOrder: 0 }),
      component({ id: 'sauce', name: 'Sauce', sortOrder: 1, isMixedIn: true }),
    ];
    const ingredients = [
      ingredientRow({ id: 'i1', name: 'Penne', component_id: 'pasta' }),
      ingredientRow({ id: 'i2', name: 'Passata', component_id: 'sauce' }),
      ingredientRow({ id: 'i3', name: 'Basil', component_id: 'sauce', sort_order: 1 }),
      ingredientRow({ id: 'i4', name: 'Salt' }),
    ];

    const grouped = groupIngredientsByComponent(components, ingredients);

    expect(grouped.hasComponents).toBe(true);
    expect(grouped.groups.map((g) => g.component.name)).toEqual(['Pasta', 'Sauce']);
    expect(grouped.groups[1].ingredients.map((i) => i.name)).toEqual(['Passata', 'Basil']);
    expect(grouped.ungrouped.map((i) => i.name)).toEqual(['Salt']);
  });

  it('never loses an ingredient whose component_id does not resolve', () => {
    const grouped = groupIngredientsByComponent(
      [component({ id: 'pasta', name: 'Pasta' })],
      [
        ingredientRow({ id: 'i1', name: 'Penne', component_id: 'pasta' }),
        ingredientRow({ id: 'i2', name: 'Ghost', component_id: 'deleted-component' }),
      ]
    );

    expect(grouped.groups[0].ingredients.map((i) => i.name)).toEqual(['Penne']);
    expect(grouped.ungrouped.map((i) => i.name)).toEqual(['Ghost']);
  });

  it('keeps a component with no ingredients rather than hiding it', () => {
    const grouped = groupIngredientsByComponent(
      [component({ id: 'peas', name: 'Peas on the side' })],
      []
    );

    expect(grouped.groups).toHaveLength(1);
    expect(grouped.groups[0].ingredients).toEqual([]);
  });
});
