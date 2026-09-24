/**
 * useKidsProgressSummary with the Supabase client faked at the query chain.
 * Pins what the Insights page relies on: loading from the first paint, an
 * error flag, a refetch on refreshKey, and the widened ladder select.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

type Result = { data: unknown; error: unknown };

const calls = vi.hoisted(() => ({
  from: [] as string[],
  selects: [] as string[],
  results: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ userId: 'u1', householdId: 'h1' }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  function query(table: string) {
    const result = (): Result => calls.results[table] ?? { data: [], error: null };
    const chain = {
      select: (cols: string) => {
        calls.selects.push(cols);
        return chain;
      },
      in: () => chain,
      gte: () => chain,
      then: (resolve: (value: Result) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  }
  return {
    supabase: {
      from: (table: string) => {
        calls.from.push(table);
        return query(table);
      },
    },
  };
});

import { LADDER_SELECT, useKidsProgressSummary } from './useKidsProgressSummary';

const IDS = ['k1', 'k2'];

beforeEach(() => {
  calls.from.length = 0;
  calls.selects.length = 0;
  calls.results = {};
});

describe('useKidsProgressSummary', () => {
  it('reports loading on the first render when there is a user and ids', async () => {
    const { result } = renderHook(() => useKidsProgressSummary(IDS));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
  });

  it('is not loading when there are no ids', () => {
    const { result } = renderHook(() => useKidsProgressSummary([]));
    expect(result.current.loading).toBe(false);
  });

  it('sets error when the ladder read fails and keeps the attempts', async () => {
    calls.results.kid_food_ladder = { data: null, error: { message: 'boom' } };
    calls.results.food_attempts = {
      data: [{ kid_id: 'k1', food_id: 'f1', attempted_at: '2026-09-20T12:00:00Z' }],
      error: null,
    };
    const { result } = renderHook(() => useKidsProgressSummary(IDS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.ladderRows).toEqual([]);
    expect(result.current.attempts).toHaveLength(1);
  });

  it('refetches when refreshKey changes', async () => {
    const { result, rerender } = renderHook(({ key }) => useKidsProgressSummary(IDS, { refreshKey: key }), {
      initialProps: { key: 1 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = calls.from.filter((t) => t === 'kid_food_ladder').length;
    rerender({ key: 2 });
    await waitFor(() => expect(calls.from.filter((t) => t === 'kid_food_ladder').length).toBe(before + 1));
  });

  it('does not refetch for a fresh array of the same ids', async () => {
    const { result, rerender } = renderHook(({ ids }) => useKidsProgressSummary(ids), {
      initialProps: { ids: ['k1', 'k2'] },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = calls.from.length;
    rerender({ ids: ['k2', 'k1'] });
    expect(calls.from.length).toBe(before);
  });

  it('selects the ladder columns the Insights page reads', async () => {
    const { result } = renderHook(() => useKidsProgressSummary(IDS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(LADDER_SELECT).toContain('consecutive_holds');
    expect(calls.selects).toContain(LADDER_SELECT);
    expect(calls.selects.some((s) => s.includes('next_due_on') && s.includes('consecutive_successes'))).toBe(true);
  });
});
