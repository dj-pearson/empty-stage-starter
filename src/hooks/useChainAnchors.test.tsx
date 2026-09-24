import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Food, Kid } from '@/types';

type Result = { data: unknown[] | null; error: unknown };

const h = vi.hoisted(() => ({
  pending: new Map<string, Array<(r: Result) => void>>(),
  calls: [] as Array<{ table: string; select: string; eqs: Array<[string, unknown]>; other: string[] }>,
  online: true,
  foods: [] as unknown[],
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const call = { table, select: '', eqs: [] as Array<[string, unknown]>, other: [] as string[] };
      h.calls.push(call);
      const pendingFor = (kidId: string) =>
        new Promise<Result>((resolve) => {
          const list = h.pending.get(kidId) ?? [];
          list.push(resolve);
          h.pending.set(kidId, list);
        });
      return {
        select: (cols: string) => {
          call.select = cols;
          return {
            eq: (col: string, value: string) => {
              call.eqs.push([col, value]);
              const p = pendingFor(value);
              // Any further filter would be recorded here; the hook must not add one.
              return Object.assign(p, {
                in: () => (call.other.push('in'), p),
                eq: (c: string) => (call.other.push(`eq:${c}`), p),
                neq: () => (call.other.push('neq'), p),
              });
            },
          };
        },
      };
    },
  },
}));

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: h.foods, foodsHydrated: true }),
  useKids: () => ({ kidsHydrated: true }),
  usePlan: () => ({ planEntries: [] }),
}));

vi.mock('@/hooks/useCommon', () => ({
  useOnline: () => h.online,
}));

import { useChainAnchors } from './useChainAnchors';

const food = (id: string, name: string): Food => ({ id, name, category: 'carb', is_safe: false, is_try_bite: false });
const FOODS = [food('pasta', 'Plain pasta'), food('rice', 'Rice'), food('nug', 'Nuggets')];

const kidA: Kid = { id: 'A', name: 'Maya', allergens: [], always_eats_foods: ['pasta'] };
const kidB: Kid = { id: 'B', name: 'Leo', allergens: [] };

function resolveKid(kidId: string, result: Result) {
  const list = h.pending.get(kidId) ?? [];
  const next = list.shift();
  if (!next) throw new Error(`no pending request for ${kidId}`);
  next(result);
}

const successes = (foodId: string, n: number) => Array.from({ length: n }, () => ({ food_id: foodId, outcome: 'success' }));

beforeEach(() => {
  h.pending.clear();
  h.calls.length = 0;
  h.online = true;
  h.foods = FOODS;
});

describe('useChainAnchors', () => {
  it('reads food_attempts with no join and no outcome filter', async () => {
    const { result } = renderHook(() => useChainAnchors(kidA, [], false));
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].table).toBe('food_attempts');
    expect(h.calls[0].select).toBe('food_id, outcome');
    expect(h.calls[0].eqs).toEqual([['kid_id', 'A']]);
    expect(h.calls[0].other).toEqual([]);
    await act(async () => resolveKid('A', { data: [], error: null }));
    expect(result.current.anchors.map((a) => a.foodId)).toEqual(['pasta']);
  });

  it("stays loading until the ladder has been seen to load for this kid", async () => {
    const { result, rerender } = renderHook(({ loading }) => useChainAnchors(kidA, [], loading), {
      initialProps: { loading: false },
    });
    await act(async () => resolveKid('A', { data: [], error: null }));
    expect(result.current.status).toBe('loading');
    rerender({ loading: true });
    expect(result.current.status).toBe('loading');
    rerender({ loading: false });
    expect(result.current.status).toBe('ready');
  });

  it("does not apply the old kid's attempts after a switch mid-fetch", async () => {
    const { result, rerender } = renderHook(({ kid }) => useChainAnchors(kid, [], false), {
      initialProps: { kid: kidA },
    });
    rerender({ kid: kidB });

    await act(async () => resolveKid('B', { data: successes('rice', 3), error: null }));
    await act(async () => resolveKid('A', { data: successes('nug', 5), error: null }));

    const ids = result.current.anchors.map((a) => a.foodId);
    expect(ids).toEqual(['rice']);
  });

  it('reports error while online and refetches on retry', async () => {
    const { result } = renderHook(() => useChainAnchors(kidA, [], false));
    await act(async () => resolveKid('A', { data: null, error: { message: 'boom' } }));
    expect(result.current.status).not.toBe('ready');
    expect(result.current.anchors.map((a) => a.foodId)).toEqual(['pasta']);

    act(() => result.current.retry());
    expect(h.calls).toHaveLength(2);
    await act(async () => resolveKid('A', { data: successes('rice', 3), error: null }));
    expect(result.current.anchors.map((a) => a.foodId)).toEqual(['pasta', 'rice']);
  });

  it('marks a failed read while online as error once the ladder settled', async () => {
    const { result, rerender } = renderHook(({ loading }) => useChainAnchors(kidA, [], loading), {
      initialProps: { loading: true },
    });
    rerender({ loading: false });
    await act(async () => resolveKid('A', { data: null, error: { message: 'boom' } }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.anchors.map((a) => a.foodId)).toEqual(['pasta']);
  });

  it('keeps the last good attempts for the same kid through a failed retry', async () => {
    const { result, rerender } = renderHook(({ loading }) => useChainAnchors(kidA, [], loading), {
      initialProps: { loading: true },
    });
    rerender({ loading: false });
    await act(async () => resolveKid('A', { data: successes('rice', 3), error: null }));
    expect(result.current.status).toBe('ready');
    act(() => result.current.retry());
    await act(async () => resolveKid('A', { data: null, error: { message: 'boom' } }));
    expect(result.current.status).toBe('error');
    expect(result.current.anchors.map((a) => a.foodId)).toEqual(['pasta', 'rice']);
  });

  it("returns the always-eats anchors with status 'offline' when offline and the read failed", async () => {
    h.online = false;
    const { result } = renderHook(() => useChainAnchors(kidA, [], true));
    await act(async () => resolveKid('A', { data: null, error: new TypeError('Failed to fetch') }));
    expect(result.current.status).toBe('offline');
    expect(result.current.anchors).toEqual([{ foodId: 'pasta', name: 'Plain pasta', source: 'always' }]);
  });
});
