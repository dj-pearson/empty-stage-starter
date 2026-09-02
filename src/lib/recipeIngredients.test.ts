import { describe, it, expect } from 'vitest';
import {
  buildAdditionalIngredientsDisplay,
  diffIngredientRows,
  draftsFromRecipe,
  parseIngredientQuantity,
  toIngredientPayloads,
  type IngredientDraft,
} from './recipeIngredients';
import { isMissingColumnError } from '@/contexts/RecipesContext';
import type { Food, Recipe, RecipeIngredient } from '@/types';

/**
 * US-721: the quantity and unit a cook types have to survive the save.
 *
 * The builder collected both and threw them away: linked ingredients became a
 * food_ids uuid array, unlinked ones a comma-joined additional_ingredients
 * string. recipe_ingredients has had columns for all of it since US-265 and the
 * web client never wrote a row.
 */

const draft = (over: Partial<IngredientDraft> & { name: string }): IngredientDraft => ({
  id: 'd1',
  quantity: '',
  unit: '',
  prepNotes: '',
  isOptional: false,
  ...over,
});

const foods = [{ id: 'f1', name: 'Rice' }, { id: 'f2', name: 'Peas' }] as Food[];

describe('parseIngredientQuantity (US-721)', () => {
  it('reads whole numbers and decimals', () => {
    expect(parseIngredientQuantity('2')).toBe(2);
    expect(parseIngredientQuantity('1.5')).toBe(1.5);
  });

  it('reads plain and mixed fractions', () => {
    expect(parseIngredientQuantity('1/2')).toBe(0.5);
    expect(parseIngredientQuantity('1 1/2')).toBe(1.5);
    expect(parseIngredientQuantity('2 3/4')).toBe(2.75);
  });

  it('reads a vulgar fraction', () => {
    expect(parseIngredientQuantity('½')).toBe(0.5);
    expect(parseIngredientQuantity('2 ½')).toBe(2.5);
  });

  it('returns null rather than NaN for something that is not a number', () => {
    // NaN into a numeric column is an error, not a null.
    for (const value of ['', '   ', 'a pinch', 'to taste', null, undefined]) {
      expect(parseIngredientQuantity(value)).toBeNull();
    }
  });

  it('does not divide by zero', () => {
    expect(parseIngredientQuantity('1/0')).toBe(1);
  });
});

describe('toIngredientPayloads (US-721)', () => {
  it('keeps the quantity and unit that used to be discarded', () => {
    const rows = toIngredientPayloads([
      draft({ name: 'Rice', food_id: 'f1', quantity: '2', unit: 'cups' }),
    ]);
    expect(rows).toEqual([
      {
        food_id: 'f1',
        sort_order: 0,
        name: 'Rice',
        quantity: 2,
        unit: 'cups',
        group_label: null,
        optional_notes: null,
      },
    ]);
  });

  it('numbers the rows in the order the cook arranged them', () => {
    const rows = toIngredientPayloads([
      draft({ id: 'a', name: 'Rice' }),
      draft({ id: 'b', name: 'Peas' }),
      draft({ id: 'c', name: 'Salt' }),
    ]);
    expect(rows.map((r) => [r.name, r.sort_order])).toEqual([
      ['Rice', 0], ['Peas', 1], ['Salt', 2],
    ]);
  });

  it('drops a blank row instead of writing an empty ingredient', () => {
    const rows = toIngredientPayloads([
      draft({ name: '  ' }),
      draft({ name: 'Rice' }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Rice']);
    expect(rows[0].sort_order).toBe(0); // numbering closes the gap
  });

  it('records optionality, which has no column of its own', () => {
    const [plain] = toIngredientPayloads([draft({ name: 'Parsley', isOptional: true })]);
    expect(plain.optional_notes).toBe('optional');
    const [withNotes] = toIngredientPayloads([
      draft({ name: 'Parsley', prepNotes: 'chopped', isOptional: true }),
    ]);
    expect(withNotes.optional_notes).toBe('chopped (optional)');
  });

  it('carries the existing row id so an edit updates rather than reinserts', () => {
    const [row] = toIngredientPayloads([draft({ name: 'Rice', rowId: 'ri-1' })]);
    expect(row.id).toBe('ri-1');
  });
});

describe('diffIngredientRows (US-721)', () => {
  const existing = [{ id: 'ri-1' }, { id: 'ri-2' }] as RecipeIngredient[];

  it('updates the rows an edit kept, preserving their ids', () => {
    const next = toIngredientPayloads([
      draft({ id: 'a', name: 'Rice', rowId: 'ri-1', quantity: '3' }),
      draft({ id: 'b', name: 'Peas', rowId: 'ri-2' }),
    ]);
    const diff = diffIngredientRows(existing, next);
    // recipe_components points at these ids; a delete-all would orphan them.
    expect(diff.updates.map((r) => r.id)).toEqual(['ri-1', 'ri-2']);
    expect(diff.inserts).toEqual([]);
    expect(diff.deleteIds).toEqual([]);
  });

  it('inserts a newly added ingredient', () => {
    const next = toIngredientPayloads([
      draft({ id: 'a', name: 'Rice', rowId: 'ri-1' }),
      draft({ id: 'b', name: 'Peas', rowId: 'ri-2' }),
      draft({ id: 'c', name: 'Salt' }),
    ]);
    const diff = diffIngredientRows(existing, next);
    expect(diff.inserts.map((r) => r.name)).toEqual(['Salt']);
    expect(diff.deleteIds).toEqual([]);
  });

  it('deletes a row the cook removed', () => {
    const next = toIngredientPayloads([draft({ id: 'a', name: 'Rice', rowId: 'ri-1' })]);
    const diff = diffIngredientRows(existing, next);
    expect(diff.deleteIds).toEqual(['ri-2']);
  });

  it('clears every row when the cook empties the list', () => {
    const diff = diffIngredientRows(existing, []);
    expect(diff.deleteIds).toEqual(['ri-1', 'ri-2']);
    expect(diff.inserts).toEqual([]);
  });
});

describe('draftsFromRecipe (US-721)', () => {
  it('prefers the real rows over food_ids, so quantities survive an edit', () => {
    const recipe = {
      food_ids: ['f1', 'f2'],
      recipe_ingredients: [
        { id: 'ri-1', recipe_id: 'r', sort_order: 0, name: 'Rice', quantity: 2, unit: 'cups', food_id: 'f1' },
      ],
    } as unknown as Recipe;
    const drafts = draftsFromRecipe(recipe, foods);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].quantity).toBe('2');
    expect(drafts[0].unit).toBe('cups');
    expect(drafts[0].rowId).toBe('ri-1');
  });

  it('orders the rows by sort_order, not by however they arrived', () => {
    const recipe = {
      recipe_ingredients: [
        { id: 'b', recipe_id: 'r', sort_order: 1, name: 'Peas' },
        { id: 'a', recipe_id: 'r', sort_order: 0, name: 'Rice' },
      ],
    } as unknown as Recipe;
    expect(draftsFromRecipe(recipe, foods).map((d) => d.name)).toEqual(['Rice', 'Peas']);
  });

  it('round-trips optionality out of optional_notes', () => {
    const recipe = {
      recipe_ingredients: [
        { id: 'a', recipe_id: 'r', sort_order: 0, name: 'Parsley', optional_notes: 'chopped (optional)' },
      ],
    } as unknown as Recipe;
    const [d] = draftsFromRecipe(recipe, foods);
    expect(d.isOptional).toBe(true);
    expect(d.prepNotes).toBe('chopped');
  });

  it('falls back to food_ids for a legacy recipe with no rows', () => {
    const recipe = { food_ids: ['f1', 'f2'] } as unknown as Recipe;
    const drafts = draftsFromRecipe(recipe, foods);
    expect(drafts.map((d) => d.name)).toEqual(['Rice', 'Peas']);
    expect(drafts.every((d) => d.rowId === null)).toBe(true);
  });

  it('parses additional_ingredients when that is all a recipe ever had', () => {
    const recipe = {
      food_ids: [],
      additionalIngredients: '2 cups rice, 1 tbsp olive oil',
    } as unknown as Recipe;
    const drafts = draftsFromRecipe(recipe, foods);
    expect(drafts.length).toBeGreaterThanOrEqual(2);
    expect(drafts[0].quantity).toBe('2');
  });

  it('returns nothing for a brand new recipe', () => {
    expect(draftsFromRecipe(null, foods)).toEqual([]);
    expect(draftsFromRecipe({ food_ids: [] } as unknown as Recipe, foods)).toEqual([]);
  });
});

describe('buildAdditionalIngredientsDisplay (US-721)', () => {
  it('describes only the ingredients with no linked food', () => {
    const text = buildAdditionalIngredientsDisplay([
      draft({ id: 'a', name: 'Rice', food_id: 'f1', quantity: '2', unit: 'cups' }),
      draft({ id: 'b', name: 'Olive oil', quantity: '1', unit: 'tbsp' }),
    ]);
    expect(text).toBe('1 tbsp Olive oil');
  });

  it('keeps notes and the optional marker', () => {
    expect(
      buildAdditionalIngredientsDisplay([
        draft({ name: 'Parsley', prepNotes: 'chopped', isOptional: true }),
      ]),
    ).toBe('Parsley (chopped) [optional]');
  });

  it('is empty when every ingredient is linked', () => {
    expect(
      buildAdditionalIngredientsDisplay([draft({ name: 'Rice', food_id: 'f1' })]),
    ).toBe('');
  });
});

describe('isMissingColumnError retry guard (US-721)', () => {
  it('recognises a PostgREST unknown-column error', () => {
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'x' column" })).toBe(true);
  });

  it('recognises the Postgres undefined-column code', () => {
    expect(isMissingColumnError({ code: '42703', message: 'column "x" does not exist' })).toBe(true);
  });

  it('does NOT retry a constraint violation', () => {
    // The old code retried on any error, stripping two thirds of the recipe and
    // then "succeeding" with a mangled row.
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key value' })).toBe(false);
  });

  it('does NOT retry an RLS rejection or a network failure', () => {
    expect(isMissingColumnError({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isMissingColumnError({ message: 'Failed to fetch' })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
    expect(isMissingColumnError(undefined)).toBe(false);
  });
});
