import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

/**
 * Item 33: the nav badges come from state the shell already holds, plus one
 * cached head-only count for ladder foods due today. What is pinned here is
 * that the ladder read happens once per (user, kids, day) rather than per
 * render or per remount, that a logged tasting re-reads it, and that the kill
 * switch skips it.
 */

const h = vi.hoisted(() => ({
  kids: [{ id: 'k1', name: 'Ada' }] as Array<{ id: string; name: string }>,
  activeKidId: null as string | null,
  planEntries: [] as Array<Record<string, unknown>>,
  groceryItems: [] as Array<Record<string, unknown>>,
  groceryHydrated: true,
  ladderEnabled: true,
  count: 2 as number | null,
  error: null as unknown,
  calls: [] as Array<{ table: string; filters: Array<[string, ...unknown[]]> }>,
  /** When set, each count read waits until the test resolves it. */
  hold: null as null | Array<(v: { count: number | null; error: unknown }) => void>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const call = { table, filters: [] as Array<[string, ...unknown[]]> };
      h.calls.push(call);
      const chain = {
        select: (...a: unknown[]) => (call.filters.push(['select', ...a]), chain),
        in: (...a: unknown[]) => (call.filters.push(['in', ...a]), chain),
        eq: (...a: unknown[]) => (call.filters.push(['eq', ...a]), chain),
        lte: (...a: unknown[]) => {
          call.filters.push(['lte', ...a]);
          if (h.hold) {
            const hold = h.hold;
            return new Promise((resolve) => hold.push(resolve));
          }
          return Promise.resolve({ count: h.count, error: h.error });
        },
      };
      return chain;
    },
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ userId: 'u1' }) }));
vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({ kids: h.kids, activeKidId: h.activeKidId, kidsHydrated: true }),
  usePlan: () => ({ planEntries: h.planEntries }),
  useGrocery: () => ({ groceryItems: h.groceryItems, groceryHydrated: h.groceryHydrated }),
}));
vi.mock('@/hooks/useDefaultGroceryListId', () => ({ useDefaultGroceryListId: () => 'list-1' }));
vi.mock('@/hooks/useExposureLadderFlag', () => ({ useExposureLadderFlag: () => h.ladderEnabled }));

import { clearLadderDueCache, LADDER_COUNT_TTL_MS, useNavBadges } from './useNavBadges';
import { notifyFoodAttemptLogged } from '@/lib/foodAttemptHistory';
import { notifyLadderChanged } from '@/lib/ladderEvents';
import { toISODate } from '@/lib/date-utils';

const ladderCalls = () => h.calls.filter((c) => c.table === 'kid_food_ladder');

beforeEach(() => {
  clearLadderDueCache();
  h.calls.length = 0;
  h.kids = [{ id: 'k1', name: 'Ada' }];
  h.activeKidId = null;
  h.planEntries = [];
  h.groceryItems = [];
  h.groceryHydrated = true;
  h.ladderEnabled = true;
  h.count = 2;
  h.error = null;
  h.hold = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useNavBadges', () => {
  it('counts unchecked grocery items on the default list', () => {
    h.ladderEnabled = false; // not about the ladder read
    h.groceryItems = [
      { id: 'a', checked: false, grocery_list_id: 'list-1' },
      { id: 'b', checked: false },
      { id: 'c', checked: true, grocery_list_id: 'list-1' },
      { id: 'd', checked: false, grocery_list_id: 'other' },
    ];
    const { result } = renderHook(() => useNavBadges());
    expect(result.current.groceryLeft).toEqual({ kind: 'count', count: 2 });
  });

  it('shows no grocery count before the list has loaded', () => {
    h.ladderEnabled = false; // not about the ladder read
    h.groceryHydrated = false;
    h.groceryItems = [{ id: 'a', checked: false }];
    const { result } = renderHook(() => useNavBadges());
    expect(result.current.groceryLeft).toBeUndefined();
  });

  it('puts a dot on Planner until today has a dinner', () => {
    h.ladderEnabled = false; // not about the ladder read
    const { result, rerender } = renderHook(() => useNavBadges());
    expect(result.current.dinnerUnplanned).toEqual({ kind: 'dot' });
    h.planEntries = [{ id: 'p1', kid_id: 'k1', meal_slot: 'dinner', date: toISODate(new Date()), food_id: 'f1' }];
    rerender();
    expect(result.current.dinnerUnplanned).toBeUndefined();
  });

  it('counts past-due unlogged meals for today', () => {
    h.ladderEnabled = false; // not about the ladder read
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 24, 13, 0));
    h.planEntries = [
      { id: 'b', kid_id: 'k1', meal_slot: 'breakfast', date: '2026-09-24', food_id: 'f1', result: null },
      { id: 'l', kid_id: 'k1', meal_slot: 'lunch', date: '2026-09-24', food_id: 'f2', result: 'ate' },
      { id: 'd', kid_id: 'k1', meal_slot: 'dinner', date: '2026-09-24', food_id: 'f3', result: null },
    ];
    const { result } = renderHook(() => useNavBadges());
    expect(result.current.unloggedMeals).toEqual({ kind: 'count', count: 1 });
  });

  it('reads ladder foods due today with one head-only count', async () => {
    const { result } = renderHook(() => useNavBadges());
    await waitFor(() => expect(result.current.ladderDue).toEqual({ kind: 'count', count: 2 }));
    expect(ladderCalls()).toHaveLength(1);
    const f = ladderCalls()[0].filters;
    expect(f).toContainEqual(['select', 'id', { count: 'exact', head: true }]);
    expect(f).toContainEqual(['in', 'kid_id', ['k1']]);
    expect(f).toContainEqual(['eq', 'status', 'active']);
    expect(f).toContainEqual(['lte', 'next_due_on', toISODate(new Date())]);
  });

  it('does not read again on re-render or on a remount inside the cache window', async () => {
    const first = renderHook(() => useNavBadges());
    await waitFor(() => expect(first.result.current.ladderDue).toBeDefined());
    first.rerender();
    first.rerender();
    first.unmount();
    const second = renderHook(() => useNavBadges());
    expect(second.result.current.ladderDue).toEqual({ kind: 'count', count: 2 });
    expect(ladderCalls()).toHaveLength(1);
  });

  it('re-reads after a tasting is logged', async () => {
    const { result } = renderHook(() => useNavBadges());
    await waitFor(() => expect(result.current.ladderDue).toBeDefined());
    h.count = 1;
    act(() => notifyFoodAttemptLogged('k1'));
    await waitFor(() => expect(result.current.ladderDue).toEqual({ kind: 'count', count: 1 }));
    expect(ladderCalls()).toHaveLength(2);
  });

  it('scopes the ladder read to the picked kid', async () => {
    h.kids = [
      { id: 'k1', name: 'Ada' },
      { id: 'k2', name: 'Bo' },
    ];
    h.activeKidId = 'k2';
    const { result } = renderHook(() => useNavBadges());
    await waitFor(() => expect(result.current.ladderDue).toBeDefined());
    expect(ladderCalls()[0].filters).toContainEqual(['in', 'kid_id', ['k2']]);
  });

  it('skips the ladder read when the exposure ladder is switched off', async () => {
    h.ladderEnabled = false;
    const { result } = renderHook(() => useNavBadges());
    await act(async () => {});
    expect(result.current.ladderDue).toBeUndefined();
    expect(ladderCalls()).toHaveLength(0);
  });

  it('shows nothing, not zero, when the ladder read fails', async () => {
    h.count = null;
    h.error = { message: 'boom' };
    const { result } = renderHook(() => useNavBadges());
    await waitFor(() => expect(ladderCalls()).toHaveLength(1));
    await act(async () => {});
    expect(result.current.ladderDue).toBeUndefined();
  });

  it('returns the same object while nothing changed, so the nav does not re-render for it', async () => {
    const { result, rerender } = renderHook(() => useNavBadges());
    await waitFor(() => expect(result.current.ladderDue).toBeDefined());
    const before = result.current;
    rerender();
    expect(result.current).toBe(before);
  });

  it('re-reads once the cached count goes stale while the shell stays mounted', async () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 24, 13, 30) });
    const { result } = renderHook(() => useNavBadges());
    await act(async () => {});
    expect(ladderCalls()).toHaveLength(1);
    h.count = 5;
    await act(async () => {
      vi.advanceTimersByTime(LADDER_COUNT_TTL_MS + 10);
    });
    await act(async () => {});
    expect(ladderCalls()).toHaveLength(2);
    expect(result.current.ladderDue).toEqual({ kind: 'count', count: 5 });
  });

  it('re-reads after a ladder edit made on this device', async () => {
    const { result } = renderHook(() => useNavBadges());
    await waitFor(() => expect(result.current.ladderDue).toBeDefined());
    h.count = 3;
    act(() => notifyLadderChanged());
    await waitFor(() => expect(result.current.ladderDue).toEqual({ kind: 'count', count: 3 }));
    expect(ladderCalls()).toHaveLength(2);
  });

  it('a tasting logged while a read is in flight is not hidden by that read', async () => {
    h.hold = [];
    const { result } = renderHook(() => useNavBadges());
    await waitFor(() => expect(h.hold).toHaveLength(1));
    act(() => notifyFoodAttemptLogged('k1'));
    await waitFor(() => expect(h.hold).toHaveLength(2));
    await act(async () => {
      h.hold?.[0]({ count: 4, error: null }); // the pre-log read
      h.hold?.[1]({ count: 3, error: null }); // the post-log read
    });
    await waitFor(() => expect(result.current.ladderDue).toEqual({ kind: 'count', count: 3 }));
    // A remount trusts the cache, which must hold the post-log count.
    h.hold = null;
    const again = renderHook(() => useNavBadges());
    expect(again.result.current.ladderDue).toEqual({ kind: 'count', count: 3 });
    expect(ladderCalls()).toHaveLength(2);
  });

  it('moves to the new day at midnight with the tab left open', async () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 24, 23, 59, 30) });
    renderHook(() => useNavBadges());
    await act(async () => {});
    expect(ladderCalls().at(-1)?.filters).toContainEqual(['lte', 'next_due_on', '2026-09-24']);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await act(async () => {});
    expect(ladderCalls().at(-1)?.filters).toContainEqual(['lte', 'next_due_on', '2026-09-25']);
  });
});
