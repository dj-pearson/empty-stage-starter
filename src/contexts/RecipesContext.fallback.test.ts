/**
 * US-323: recipe-load resilience fallback.
 *
 * When the recipe_ingredients embed isn't available in the target environment
 * (migration not deployed → PostgREST 400 / PGRST200), the recipes read must
 * degrade to a plain select so the list still renders, instead of failing
 * wholesale. These tests pin the predicate + the fallback wrapper.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
vi.mock('@/hooks/useRealtimeSubscription', () => ({
  registerSubscription: vi.fn(),
  unregisterSubscription: vi.fn(),
}));

import {
  isMissingIngredientsEmbedError,
  selectRecipesWithFallback,
  RECIPE_WITH_INGREDIENTS_SELECT,
} from './RecipesContext';

describe('isMissingIngredientsEmbedError (US-323)', () => {
  it('matches the PGRST200 embed-not-found code', () => {
    expect(isMissingIngredientsEmbedError({ code: 'PGRST200', message: 'x' })).toBe(true);
  });

  it('matches a relationship/schema-cache message mentioning recipe_ingredients', () => {
    expect(
      isMissingIngredientsEmbedError({
        message: "Could not find a relationship between 'recipes' and 'recipe_ingredients' in the schema cache",
      }),
    ).toBe(true);
  });

  it('does NOT match unrelated errors (auth, other tables)', () => {
    expect(isMissingIngredientsEmbedError({ code: 'PGRST301', message: 'JWT expired' })).toBe(false);
    expect(isMissingIngredientsEmbedError({ message: 'permission denied for table foods' })).toBe(false);
    expect(isMissingIngredientsEmbedError(null)).toBe(false);
    expect(isMissingIngredientsEmbedError(undefined)).toBe(false);
  });
});

describe('selectRecipesWithFallback (US-323)', () => {
  it('returns the embed result untouched when it succeeds (no fallback)', async () => {
    const run = vi.fn(async (sel: string) => ({ data: [{ id: 'r1' }], error: null, sel }));
    const res = await selectRecipesWithFallback(run);
    expect(res.degraded).toBe(false);
    expect(res.data).toEqual([{ id: 'r1' }]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(RECIPE_WITH_INGREDIENTS_SELECT);
  });

  it('retries with a plain select when the embed 400s, and marks degraded', async () => {
    const run = vi.fn(async (sel: string) => {
      if (sel === RECIPE_WITH_INGREDIENTS_SELECT) {
        return { data: null, error: { code: 'PGRST200', message: 'embed missing' } };
      }
      return { data: [{ id: 'r1' }], error: null };
    });
    const res = await selectRecipesWithFallback(run);
    expect(res.degraded).toBe(true);
    expect(res.data).toEqual([{ id: 'r1' }]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith('*');
  });

  it('propagates a non-embed error without retrying (e.g. auth)', async () => {
    const run = vi.fn(async () => ({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } }));
    const res = await selectRecipesWithFallback(run);
    expect(res.degraded).toBe(false);
    expect(res.error).toEqual({ code: 'PGRST301', message: 'JWT expired' });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
