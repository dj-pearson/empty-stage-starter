/**
 * US-298: tests for the "Twist this meal" alternative picker.
 *
 * Each test builds the minimum recipe + food fixtures the picker needs
 * and exercises one signal in isolation (prep-time, category, tags,
 * protein, favorites, fatigue filter) plus the composite-ranking
 * happy path.
 */

import { describe, it, expect } from 'vitest';
import { pickTwistCandidates } from './varietyTwistPicker';
import type { Food, Recipe } from '@/types';

function makeRecipe(overrides: Partial<Recipe> & Pick<Recipe, 'id' | 'name' | 'food_ids'>): Recipe {
  return {
    id: overrides.id,
    name: overrides.name,
    food_ids: overrides.food_ids,
    ...overrides,
  } as Recipe;
}

function makeFood(id: string, name: string, category?: Food['category']): Food {
  return {
    id,
    user_id: 'u1',
    name,
    category: category ?? 'snack',
    is_safe: true,
    is_try_bite: false,
  } as Food;
}

/** Helper: foodById Map from a flat list. */
function foodMap(...foods: Food[]) {
  return new Map(foods.map((f) => [f.id, f]));
}

/** Closure: anything outside `fatigued` gets 0; entries get their value. */
function fatigueFn(fatigued: Record<string, number> = {}) {
  return (id: string) => fatigued[id] ?? 0;
}

describe('pickTwistCandidates', () => {
  it('returns empty when the library has only the original', () => {
    const original = makeRecipe({ id: 'r1', name: 'Original', food_ids: [] });
    const result = pickTwistCandidates({
      original,
      allRecipes: [original],
      foodById: foodMap(),
      fatigueScoreFor: fatigueFn(),
    });
    expect(result).toHaveLength(0);
  });

  it('hard-filters candidates whose fatigue >= 0.2', () => {
    const original = makeRecipe({
      id: 'r1',
      name: 'Mac and Cheese',
      food_ids: [],
      category: 'dinner' as any,
      total_time_minutes: 20,
    });
    const fatiguedAlt = makeRecipe({
      id: 'r2',
      name: 'Spaghetti',
      food_ids: [],
      category: 'dinner' as any,
      total_time_minutes: 20, // would otherwise score high
    });
    const result = pickTwistCandidates({
      original,
      allRecipes: [original, fatiguedAlt],
      foodById: foodMap(),
      fatigueScoreFor: fatigueFn({ r2: 0.35 }), // over the 0.2 cap
    });
    expect(result.map((c) => c.recipe.id)).toEqual([]);
  });

  it('keeps candidates with fatigue just under threshold', () => {
    const original = makeRecipe({
      id: 'r1',
      name: 'Tacos',
      food_ids: [],
      total_time_minutes: 20,
      category: 'dinner' as any,
    });
    const alt = makeRecipe({
      id: 'r2',
      name: 'Burritos',
      food_ids: [],
      total_time_minutes: 20,
      category: 'dinner' as any,
    });
    const result = pickTwistCandidates({
      original,
      allRecipes: [original, alt],
      foodById: foodMap(),
      fatigueScoreFor: fatigueFn({ r2: 0.19 }),
    });
    expect(result).toHaveLength(1);
    expect(result[0].recipe.id).toBe('r2');
  });

  it('rewards prep-time proximity', () => {
    const original = makeRecipe({
      id: 'r1',
      name: 'A',
      food_ids: [],
      total_time_minutes: 20,
    });
    const exactMatch = makeRecipe({
      id: 'r2',
      name: 'B',
      food_ids: [],
      total_time_minutes: 20,
    });
    const closeMatch = makeRecipe({
      id: 'r3',
      name: 'C',
      food_ids: [],
      total_time_minutes: 23,
    });
    const farMatch = makeRecipe({
      id: 'r4',
      name: 'D',
      food_ids: [],
      total_time_minutes: 60,
    });
    const result = pickTwistCandidates({
      original,
      allRecipes: [original, exactMatch, closeMatch, farMatch],
      foodById: foodMap(),
      fatigueScoreFor: fatigueFn(),
    });
    // exact > close > (far dropped as score 1)
    expect(result.map((c) => c.recipe.id)).toEqual(['r2', 'r3']);
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it('counts shared tags up to the +0.6 cap', () => {
    const original = makeRecipe({
      id: 'r1',
      name: 'Mexican Night',
      food_ids: [],
      total_time_minutes: 20,
      tags: ['mexican', 'spicy', 'family-friendly'],
    });
    const oneShared = makeRecipe({
      id: 'r2',
      name: 'Quesadillas',
      food_ids: [],
      total_time_minutes: 20,
      tags: ['mexican'],
    });
    const allShared = makeRecipe({
      id: 'r3',
      name: 'Burrito Bowl',
      food_ids: [],
      total_time_minutes: 20,
      tags: ['mexican', 'spicy', 'family-friendly'],
    });
    const result = pickTwistCandidates({
      original,
      allRecipes: [original, oneShared, allShared],
      foodById: foodMap(),
      fatigueScoreFor: fatigueFn(),
    });
    expect(result[0].recipe.id).toBe('r3'); // 3 shared > 1 shared
    // 3 shared caps at +0.6; we expect a sensible reason chip.
    expect(result[0].reasons.some((r) => /shared/i.test(r))).toBe(true);
  });

  it('rewards shared primary protein', () => {
    const chicken = makeFood('chicken', 'Chicken Breast', 'protein');
    const beef = makeFood('beef', 'Ground Beef', 'protein');
    const rice = makeFood('rice', 'Rice', 'carb');
    const original = makeRecipe({
      id: 'r1',
      name: 'Chicken & Rice',
      food_ids: ['chicken', 'rice'],
      total_time_minutes: 30,
    });
    const sharedProtein = makeRecipe({
      id: 'r2',
      name: 'Chicken Tacos',
      food_ids: ['chicken'],
      total_time_minutes: 30,
    });
    const differentProtein = makeRecipe({
      id: 'r3',
      name: 'Beef & Rice',
      food_ids: ['beef', 'rice'],
      total_time_minutes: 30,
    });
    const result = pickTwistCandidates({
      original,
      allRecipes: [original, sharedProtein, differentProtein],
      foodById: foodMap(chicken, beef, rice),
      fatigueScoreFor: fatigueFn(),
    });
    expect(result[0].recipe.id).toBe('r2');
    expect(result[0].reasons).toContain('Same protein');
  });

  it('rewards favorites and 4+ ratings', () => {
    const original = makeRecipe({
      id: 'r1',
      name: 'A',
      food_ids: [],
      total_time_minutes: 20,
    });
    const plain = makeRecipe({
      id: 'r2',
      name: 'B',
      food_ids: [],
      total_time_minutes: 20,
    });
    const fav = makeRecipe({
      id: 'r3',
      name: 'C',
      food_ids: [],
      total_time_minutes: 20,
      is_favorite: true,
    });
    const result = pickTwistCandidates({
      original,
      allRecipes: [original, plain, fav],
      foodById: foodMap(),
      fatigueScoreFor: fatigueFn(),
    });
    // favorite should outrank the unfavorited equivalent
    expect(result[0].recipe.id).toBe('r3');
    expect(result[0].reasons).toContain('Family favorite');
  });

  it('respects the limit option', () => {
    const original = makeRecipe({
      id: 'r1',
      name: 'A',
      food_ids: [],
      total_time_minutes: 20,
    });
    const candidates = Array.from({ length: 10 }, (_, i) =>
      makeRecipe({
        id: `r${i + 2}`,
        name: `Twist ${i}`,
        food_ids: [],
        total_time_minutes: 20,
      })
    );
    const result = pickTwistCandidates(
      {
        original,
        allRecipes: [original, ...candidates],
        foodById: foodMap(),
        fatigueScoreFor: fatigueFn(),
      },
      { limit: 5 }
    );
    expect(result).toHaveLength(5);
  });

  it('excludes hidden-veggies variants of the original', () => {
    const original = makeRecipe({
      id: 'r1',
      name: 'Mac and Cheese',
      food_ids: [],
      total_time_minutes: 20,
    });
    const variant = makeRecipe({
      id: 'r2',
      name: "Jake's Mac and Cheese (with cauliflower)",
      food_ids: [],
      total_time_minutes: 20,
      parent_recipe_id: 'r1',
    });
    const sibling = makeRecipe({
      id: 'r3',
      name: 'Pasta Carbonara',
      food_ids: [],
      total_time_minutes: 20,
    });
    const result = pickTwistCandidates({
      original,
      allRecipes: [original, variant, sibling],
      foodById: foodMap(),
      fatigueScoreFor: fatigueFn(),
    });
    expect(result.map((c) => c.recipe.id)).toEqual(['r3']);
  });

  it('drops candidates with no real similarity (score == base)', () => {
    const original = makeRecipe({
      id: 'r1',
      name: 'Stir-fry',
      food_ids: [],
      total_time_minutes: 15,
      category: 'dinner' as any,
      tags: ['asian'],
    });
    // Completely different category, no shared tags, prep time far off
    const unrelated = makeRecipe({
      id: 'r2',
      name: 'Cookies',
      food_ids: [],
      total_time_minutes: 90,
      category: 'snack' as any,
      tags: ['dessert'],
    });
    const result = pickTwistCandidates({
      original,
      allRecipes: [original, unrelated],
      foodById: foodMap(),
      fatigueScoreFor: fatigueFn(),
    });
    expect(result).toHaveLength(0);
  });
});
