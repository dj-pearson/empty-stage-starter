/**
 * refreshFoods: pages to completion like the AppContext load, and tells the
 * caller whether it did anything.
 *
 * It used to stop at .limit(500) and write that partial slice over state, so a
 * pull-to-refresh on a 600-item pantry dropped a hundred rows the initial load
 * had shown, and the page toasted success either way.
 */
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useEffect } from 'react';
import { FoodsProvider, useFoods } from './FoodsContext';
import type { Food } from '@/types';

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';
let foodRows: Array<Record<string, unknown>> = [];
let foodsError: unknown = null;
let auth: { userId: string | null; householdId: string | null } = { userId: 'user-1', householdId: HOUSEHOLD };
const orderCalls: string[] = [];

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ['select', 'eq', 'in']) builder[m] = vi.fn(chain);
  builder.order = vi.fn((col: string) => {
    if (table === 'foods') orderCalls.push(col);
    return builder;
  });
  // Honoured, so a revert to one capped request cannot pass by accident.
  let cap: number | null = null;
  builder.limit = vi.fn((n: number) => {
    cap = n;
    return builder;
  });
  let window: { from: number; to: number } | null = null;
  builder.range = vi.fn((from: number, to: number) => {
    window = { from, to };
    return builder;
  });
  builder.then = (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) => {
    if (table !== 'foods') return resolve({ data: [], error: null });
    if (foodsError) return resolve({ data: null, error: foodsError });
    let rows: unknown[] = foodRows;
    if (window) rows = rows.slice(window.from, window.to + 1);
    if (cap !== null) rows = rows.slice(0, cap);
    return resolve({ data: rows, error: null });
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => makeBuilder(table)),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => auth,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(),
    withContext: vi.fn().mockReturnValue({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

vi.mock('@/hooks/useRealtimeSubscription', () => ({
  registerSubscription: vi.fn(),
  unregisterSubscription: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

type FoodsCtx = ReturnType<typeof useFoods>;

function mount() {
  const ref: { current: FoodsCtx | null } = { current: null };
  function Probe() {
    const ctx = useFoods();
    useEffect(() => {
      ref.current = ctx;
    }, [ctx]);
    return null;
  }
  render(
    <FoodsProvider>
      <Probe />
    </FoodsProvider>
  );
  return ref;
}

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `f-${String(i).padStart(4, '0')}`,
    name: `Food ${String(i).padStart(4, '0')}`,
    category: 'snack',
    is_safe: true,
    is_try_bite: false,
    household_id: HOUSEHOLD,
  }));
}

describe('refreshFoods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    foodRows = [];
    foodsError = null;
    orderCalls.length = 0;
    auth = { userId: 'user-1', householdId: HOUSEHOLD };
  });

  it('keeps all 600 rows, not the first 500', async () => {
    foodRows = rows(600);
    const ctx = mount();
    await waitFor(() => expect(ctx.current).not.toBeNull());

    let result: { ok: boolean } | undefined;
    await act(async () => {
      result = await ctx.current!.refreshFoods();
    });

    expect(result).toEqual({ ok: true });
    await waitFor(() => expect(ctx.current!.foods).toHaveLength(600));
    // Same total order as the AppContext load: name, then id as tiebreaker.
    expect(orderCalls).toEqual(['name', 'id']);
  });

  it('pages past one request when the household is larger than a page', async () => {
    foodRows = rows(1500);
    const ctx = mount();
    await waitFor(() => expect(ctx.current).not.toBeNull());

    await act(async () => {
      await ctx.current!.refreshFoods();
    });

    await waitFor(() => expect(ctx.current!.foods).toHaveLength(1500));
  });

  it('returns ok:false and leaves state alone when the read fails', async () => {
    const ctx = mount();
    await waitFor(() => expect(ctx.current).not.toBeNull());
    const existing = { id: 'keep', name: 'Keep Me', category: 'fruit', is_safe: true, is_try_bite: false } as Food;
    act(() => {
      ctx.current!.setFoods([existing]);
    });
    await waitFor(() => expect(ctx.current!.foods).toHaveLength(1));

    foodsError = { message: 'boom', code: 'XX000' };
    let result: { ok: boolean } | undefined;
    await act(async () => {
      result = await ctx.current!.refreshFoods();
    });

    expect(result).toEqual({ ok: false });
    expect(ctx.current!.foods.map((f) => f.id)).toEqual(['keep']);
  });

  it('returns ok:false without a query when there is no household', async () => {
    auth = { userId: 'user-1', householdId: null };
    const ctx = mount();
    await waitFor(() => expect(ctx.current).not.toBeNull());

    let result: { ok: boolean } | undefined;
    await act(async () => {
      result = await ctx.current!.refreshFoods();
    });

    expect(result).toEqual({ ok: false });
    expect(orderCalls).toEqual([]);
  });

  it('starts with foodsHydrated false', async () => {
    const ctx = mount();
    await waitFor(() => expect(ctx.current).not.toBeNull());
    expect(ctx.current!.foodsHydrated).toBe(false);
  });
});
