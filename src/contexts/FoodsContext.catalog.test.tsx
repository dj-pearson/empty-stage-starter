/**
 * US-795 Task 2: the catalog-row fetch a household's foods point at, and the
 * `parseFoodRow` passthrough that lets `canonical_id` survive the normalizer.
 *
 * Four things pinned here (see task-2-brief.md):
 *   1. No food has a `canonical_id` -> no catalog query is issued at all.
 *   2. Two foods sharing one `canonical_id` -> exactly one query, for that
 *      single id (deduped).
 *   3. A failed catalog fetch leaves `catalogById` empty and does not touch
 *      `foods`.
 *   4. `parseFoodRow` carries `canonical_id` through.
 */
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useEffect } from 'react';
import { FoodsProvider, useFoods } from './FoodsContext';
import { parseFoodRow } from '@/lib/normalizeEntities';
import type { Food } from '@/types';

// ---- supabase mock: records every `.from(table)` call and, for
// grocery_product_catalog, the ids passed to `.in()`. ------------------------
type FromCall = { table: string; inArgs?: [string, string[]] };
let fromCalls: FromCall[] = [];
let catalogResponse: { data: unknown[] | null; error: unknown | null } = { data: [], error: null };

function makeBuilder(table: string) {
  const record: FromCall = { table };
  fromCalls.push(record);
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.in = vi.fn((col: string, ids: string[]) => {
    record.inArgs = [col, ids];
    return builder;
  });
  // thenable: awaiting the builder resolves to the mocked response.
  builder.then = (resolve: (v: { data: unknown[] | null; error: unknown | null }) => unknown) =>
    resolve(table === 'grocery_product_catalog' ? catalogResponse : { data: [], error: null });
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

// No session: keeps the realtime-subscription effect (unrelated to this
// task) a no-op so it can't add extra `from`/`channel` calls to interfere
// with the assertions below.
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ userId: null, householdId: null }),
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

function Probe({ onReady }: { onReady: (ctx: FoodsCtx) => void }) {
  const ctx = useFoods();
  useEffect(() => {
    onReady(ctx);
  }, [ctx, onReady]);
  return null;
}

function food(overrides: Partial<Food> & { id: string }): Food {
  return {
    name: overrides.id,
    category: 'fruit',
    is_safe: true,
    is_try_bite: false,
    canonical_id: null,
    ...overrides,
  };
}

describe('US-795: FoodsContext catalog load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCalls = [];
    catalogResponse = { data: [], error: null };
  });

  it('issues no catalog query when no food has a canonical_id', async () => {
    let latest: FoodsCtx | undefined;
    render(
      <FoodsProvider>
        <Probe onReady={(c) => { latest = c; }} />
      </FoodsProvider>
    );

    await waitFor(() => expect(latest).toBeDefined());
    act(() => {
      latest!.setFoods([
        food({ id: 'f1', canonical_id: null }),
        food({ id: 'f2' }), // no canonical_id at all
      ]);
    });

    // Give the fetch effect a tick to (not) fire.
    await new Promise((r) => setTimeout(r, 20));

    expect(fromCalls.some((c) => c.table === 'grocery_product_catalog')).toBe(false);
    expect(latest!.catalogById).toEqual({});
  });

  it('dedupes two foods sharing one canonical_id into exactly one query', async () => {
    catalogResponse = {
      data: [
        { id: 'cat-1', name: 'Whole Milk', default_category: 'dairy', default_aisle_section: 'dairy', verification: 'verified' },
      ],
      error: null,
    };

    let latest: FoodsCtx | undefined;
    render(
      <FoodsProvider>
        <Probe onReady={(c) => { latest = c; }} />
      </FoodsProvider>
    );

    await waitFor(() => expect(latest).toBeDefined());
    act(() => {
      latest!.setFoods([
        food({ id: 'f1', canonical_id: 'cat-1' }),
        food({ id: 'f2', canonical_id: 'cat-1' }),
      ]);
    });

    await waitFor(() => expect(latest!.catalogById['cat-1']).toBeDefined());

    const catalogCalls = fromCalls.filter((c) => c.table === 'grocery_product_catalog');
    expect(catalogCalls).toHaveLength(1);
    expect(catalogCalls[0].inArgs).toEqual(['id', ['cat-1']]);
    expect(latest!.catalogById['cat-1'].name).toBe('Whole Milk');
  });

  it('a failed catalog fetch leaves catalogById empty and foods untouched', async () => {
    catalogResponse = { data: null, error: { message: 'network error' } };

    let latest: FoodsCtx | undefined;
    render(
      <FoodsProvider>
        <Probe onReady={(c) => { latest = c; }} />
      </FoodsProvider>
    );

    await waitFor(() => expect(latest).toBeDefined());
    const seeded = [food({ id: 'f1', canonical_id: 'cat-missing' })];
    act(() => {
      latest!.setFoods(seeded);
    });

    await waitFor(() => expect(fromCalls.some((c) => c.table === 'grocery_product_catalog')).toBe(true));
    // Let the failed fetch resolve.
    await new Promise((r) => setTimeout(r, 20));

    expect(latest!.catalogById).toEqual({});
    // The unlinked-looking food is still there, untouched by the failure.
    expect(latest!.foods).toEqual(seeded);
  });

  it('parseFoodRow carries canonical_id through the normalizer', () => {
    const parsed = parseFoodRow({
      id: 'f1',
      name: 'Milk',
      category: 'dairy',
      is_safe: true,
      is_try_bite: false,
      canonical_id: 'cat-9',
    });

    expect(parsed).not.toBeNull();
    expect(parsed!.canonical_id).toBe('cat-9');
  });
});
