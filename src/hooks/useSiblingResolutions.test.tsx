/**
 * useSiblingResolutions takes the household from AuthContext and persists the
 * pre-fairness score, so fairness history is not inflated by its own boost.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { SolverResult } from '@/lib/siblingConstraintSolver';

const auth = { userId: 'u1' as string | null, householdId: 'hh1' as string | null };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

const inserted: unknown[] = [];
const from = vi.fn((table: string) => {
  if (table !== 'sibling_meal_resolutions') throw new Error(`unexpected table ${table}`);
  const historyChain = {
    eq: () => historyChain,
    gte: () => historyChain,
    order: () => historyChain,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  return {
    select: () => historyChain,
    insert: (row: unknown) => {
      inserted.push(row);
      return {
        select: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: { id: 'res1', created_at: new Date().toISOString() }, error: null }),
        }),
      };
    },
  };
});
const getUser = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => from(table), auth: { getUser: () => getUser() } },
}));
vi.mock('@/lib/logger', () => {
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return { logger };
});

import { useSiblingResolutions } from './useSiblingResolutions';

const RESULT: SolverResult = {
  recipeId: 'r1',
  recipeName: 'Tacos',
  imageUrl: null,
  prepMinutes: 20,
  resolutionType: 'full_match',
  satisfactionScore: 90,
  perKidSatisfaction: [
    {
      kidId: 'k1',
      kidName: 'Ava',
      score: 0.95,
      rawScore: 0.8,
      hardViolations: [],
      softViolations: [],
      favoriteHits: [],
    },
    {
      kidId: 'k2',
      kidName: 'Ben',
      score: 0.7,
      hardViolations: [],
      softViolations: [],
      favoriteHits: [],
    },
  ],
  swaps: [],
  splitPlates: [],
  excluded: false,
};

beforeEach(() => {
  inserted.length = 0;
  from.mockClear();
  getUser.mockClear();
  auth.userId = 'u1';
  auth.householdId = 'hh1';
});

describe('useSiblingResolutions', () => {
  it('persists rawScore rather than the fairness-boosted score', async () => {
    const { result } = renderHook(() => useSiblingResolutions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.householdId).toBe('hh1');

    let ok = false;
    await act(async () => {
      ok = await result.current.recordResolution({
        result: RESULT,
        selectedKidIds: ['k1', 'k2'],
        planEntryId: null,
      });
    });

    expect(ok).toBe(true);
    expect(getUser).not.toHaveBeenCalled();
    const row = inserted[0] as {
      household_id: string;
      user_id: string;
      per_kid_satisfaction: { kid_id: string; score: number }[];
    };
    expect(row.household_id).toBe('hh1');
    expect(row.user_id).toBe('u1');
    expect(row.per_kid_satisfaction.map((pk) => pk.score)).toEqual([0.8, 0.7]);
    // The local history append uses the same pre-fairness score.
    expect(result.current.history.find((h) => h.kidId === 'k1')?.score).toBe(0.8);
  });

  it('returns false without a network call when there is no household', async () => {
    auth.householdId = null;
    const { result } = renderHook(() => useSiblingResolutions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok = true;
    await act(async () => {
      ok = await result.current.recordResolution({
        result: RESULT,
        selectedKidIds: ['k1'],
        planEntryId: null,
      });
    });

    expect(ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('reloads history when the household changes', async () => {
    const { result, rerender } = renderHook(() => useSiblingResolutions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(from).toHaveBeenCalledTimes(1);

    auth.householdId = 'hh2';
    rerender();
    await waitFor(() => expect(from).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.householdId).toBe('hh2'));
  });
});
