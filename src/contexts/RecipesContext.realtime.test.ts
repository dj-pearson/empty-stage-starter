import { describe, it, expect } from 'vitest';
import { applyRecipeRealtime, normalizeRecipeFromDB } from './RecipesContext';

// Minimal raw snake_case DB row as a realtime payload would deliver it.
// deno-lint-ignore no-explicit-any
function rawRow(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'r1',
    name: 'Spaghetti',
    description: null,
    food_ids: ['f1', 'f2'],
    image_url: 'https://cdn/x.jpg',
    prep_time: '10 min',
    cook_time: '20 min',
    servings: '4',
    is_favorite: false,
    created_at: '2026-06-13T00:00:00Z',
    ...overrides,
  };
}

describe('applyRecipeRealtime (US-340)', () => {
  it('normalizes a raw INSERT payload (snake_case -> camelCase, keeps image_url)', () => {
    const next = applyRecipeRealtime([], { eventType: 'INSERT', new: rawRow(), old: { id: 'r1' } });
    expect(next).toHaveLength(1);
    expect(next[0].image_url).toBe('https://cdn/x.jpg');
    expect(next[0].prepTime).toBe('10 min'); // camelCase derived field
    expect(next[0].food_ids).toEqual(['f1', 'f2']);
  });

  it('dedupes by id (INSERT for an existing recipe updates in place)', () => {
    const seed = [normalizeRecipeFromDB(rawRow())];
    const next = applyRecipeRealtime(seed, {
      eventType: 'INSERT',
      new: rawRow({ name: 'Spaghetti Bolognese' }),
      old: { id: 'r1' },
    });
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe('Spaghetti Bolognese');
  });

  it('preserves already-loaded structured ingredients on UPDATE (realtime carries none)', () => {
    const seed = [normalizeRecipeFromDB(rawRow())];
    seed[0].recipe_ingredients = [
      // deno-lint-ignore no-explicit-any
      { id: 'i1', recipe_id: 'r1', name: 'pasta', sort_order: 0 } as any,
    ];
    const next = applyRecipeRealtime(seed, {
      eventType: 'UPDATE',
      new: rawRow({ name: 'Updated' }),
      old: { id: 'r1' },
    });
    expect(next[0].name).toBe('Updated');
    expect(next[0].recipe_ingredients).toHaveLength(1);
  });

  it('removes a recipe on DELETE', () => {
    const seed = [normalizeRecipeFromDB(rawRow())];
    const next = applyRecipeRealtime(seed, { eventType: 'DELETE', new: rawRow(), old: { id: 'r1' } });
    expect(next).toHaveLength(0);
  });
});
