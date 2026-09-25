import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

type Result = { data: unknown[] | null; error: unknown };

const h = vi.hoisted(() => ({
  /** One pending promise per kid id; tests resolve them in any order. */
  pending: new Map<string, Array<(r: Result) => void>>(),
  eqCalls: [] as Array<[string, unknown]>,
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (col: string, kidId: string) => {
          h.eqCalls.push([col, kidId]);
          return new Promise<Result>((resolve) => {
            const list = h.pending.get(kidId) ?? [];
            list.push(resolve);
            h.pending.set(kidId, list);
          });
        },
      }),
    }),
  },
}));

import { useFoodAttemptHistory } from './useFoodAttemptHistory';
import { notifyFoodAttemptLogged } from '@/lib/foodAttemptHistory';

function resolveKid(kidId: string, result: Result) {
  const list = h.pending.get(kidId) ?? [];
  const next = list.shift();
  if (!next) throw new Error(`no pending request for ${kidId}`);
  next(result);
}

const rowFor = (kidId: string) => ({
  id: `${kidId}-1`,
  food_id: 'broccoli',
  stage: 'looking',
  outcome: 'success',
  attempted_at: '2026-09-01T18:00:00.000Z',
  is_milestone: false,
  reaction_notes: null,
});

beforeEach(() => {
  h.pending.clear();
  h.eqCalls.length = 0;
});

describe('useFoodAttemptHistory', () => {
  it("never paints kid A's rows when A resolves after the switch to B", async () => {
    const { result, rerender } = renderHook(({ kid }) => useFoodAttemptHistory(kid), {
      initialProps: { kid: 'A' },
    });
    rerender({ kid: 'B' });

    await act(async () => {
      resolveKid('B', { data: [rowFor('B')], error: null });
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      resolveKid('A', { data: [rowFor('A')], error: null });
    });

    const state = result.current;
    expect(state.status).toBe('ready');
    if (state.status === 'ready') expect(state.rows.map((r) => r.id)).toEqual(['B-1']);
  });

  it('exposes retry on error, and retry refetches', async () => {
    const { result } = renderHook(() => useFoodAttemptHistory('A'));
    await act(async () => {
      resolveKid('A', { data: null, error: { message: 'boom' } });
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    const state = result.current;
    if (state.status !== 'error') throw new Error('expected error');
    act(() => state.retry());

    await act(async () => {
      resolveKid('A', { data: [rowFor('A')], error: null });
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(h.eqCalls.filter(([, id]) => id === 'A')).toHaveLength(2);
  });

  it('resets to loading on a kid change', async () => {
    const { result, rerender } = renderHook(({ kid }) => useFoodAttemptHistory(kid), {
      initialProps: { kid: 'A' },
    });
    await act(async () => {
      resolveKid('A', { data: [rowFor('A')], error: null });
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ kid: 'B' });
    expect(result.current.status).toBe('loading');
  });

  it("re-reads when an attempt lands for this child, and not for another child's", async () => {
    renderHook(() => useFoodAttemptHistory('A'));
    expect(h.eqCalls).toEqual([['kid_id', 'A']]);

    act(() => notifyFoodAttemptLogged('B'));
    expect(h.eqCalls).toEqual([['kid_id', 'A']]);

    act(() => notifyFoodAttemptLogged('A'));
    await waitFor(() => expect(h.eqCalls).toEqual([['kid_id', 'A'], ['kid_id', 'A']]));
  });

  it('reads by kid only, with no outcome filter', async () => {
    renderHook(() => useFoodAttemptHistory('A'));
    expect(h.eqCalls).toEqual([['kid_id', 'A']]);
  });
});
