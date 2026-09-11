import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { IngredientRowPayload } from '@/types';

/**
 * US-867: an ingredient write that fails says so.
 *
 * updateRecipe saves two things: the recipe row, through runOptimisticMutation,
 * which rolls back and toasts on failure; and the ingredient rows, through
 * persistIngredientRows, which used to log every error and return void. So a
 * failed ingredient write was followed by a re-read that rendered the OLD rows,
 * with nothing said. The edit was gone and the screen looked like it was never
 * made.
 *
 * The delete-then-insert shape is why stopping matters as much as reporting: a
 * delete that lands followed by an insert that fails leaves a recipe with its
 * old ingredients removed and the new ones absent. There is no transaction here
 * to undo that with.
 */
const calls: string[] = [];
let failOn: string | null = null;

function result() {
  return { data: [], error: null };
}

/** One row already on the recipe, so an edit produces a delete to diff against. */
const EXISTING = [{ id: 'ing-1' }];

vi.mock('@/integrations/supabase/client', () => {
  const chainFor = (table: string) => {
    const record = (op: string) => {
      calls.push(`${table}.${op}`);
      return failOn === `${table}.${op}`
        ? { data: null, error: { message: `${op} rejected` } }
        : result();
    };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.in = () => ({ ...result(), ...(failOn === `${table}.delete` ? { error: { message: 'delete rejected' } } : {}) });
    chain.order = self;
    chain.delete = () => {
      calls.push(`${table}.delete`);
      return {
        in: async () =>
          failOn === `${table}.delete` ? { data: null, error: { message: 'delete rejected' } } : result(),
      };
    };
    chain.update = () => {
      calls.push(`${table}.update`);
      return { eq: async () => (failOn === `${table}.update` ? { data: null, error: { message: 'update rejected' } } : result()) };
    };
    chain.insert = async () => record('insert');
    // The `select('id').eq('recipe_id', ...)` read the function starts with.
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: table === 'recipe_ingredients' ? EXISTING : [], error: null });
    return chain;
  };
  return { supabase: { from: (table: string) => chainFor(table) } };
});

vi.mock('@/lib/logger', () => {
  const base = { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() };
  return { logger: { ...base, withContext: () => base } };
});

const { persistIngredientRows } = await import('./RecipesContext');

const ROWS: IngredientRowPayload[] = [
  {
    food_id: null,
    sort_order: 0,
    name: 'Flour',
    quantity: 2,
    unit: 'cup',
    group_label: null,
    optional_notes: null,
  },
];

describe('persistIngredientRows reports what happened', () => {
  beforeEach(() => {
    calls.length = 0;
    failOn = null;
  });

  it('returns no error when every write lands', async () => {
    expect(await persistIngredientRows('r1', ROWS)).toEqual({ error: null });
  });

  it('hands back a failed insert instead of swallowing it', async () => {
    failOn = 'recipe_ingredients.insert';
    const { error } = await persistIngredientRows('r1', ROWS);
    expect(error).toMatchObject({ message: 'insert rejected' });
  });

  it('stops at a failed delete rather than half-applying the edit', async () => {
    // The case that turns a failed write into a recipe with no ingredients.
    failOn = 'recipe_ingredients.delete';
    const { error } = await persistIngredientRows('r1', ROWS);
    expect(error).toMatchObject({ message: 'delete rejected' });
    expect(calls, `kept going after the delete failed: ${calls.join(', ')}`).not.toContain(
      'recipe_ingredients.insert'
    );
  });
});
