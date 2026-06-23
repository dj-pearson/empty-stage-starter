/**
 * US-341: localStorage vs Supabase load precedence.
 *
 * Documented contract (see CLAUDE.md "Load Precedence"):
 *   1. On mount the app hydrates from the platform storage cache (localStorage
 *      on web) so the UI paints instantly and works offline.
 *   2. Once a session + household resolve, a successful Supabase fetch is
 *      SERVER-AUTHORITATIVE: it OVERWRITES the cached slices wholesale rather
 *      than merging stale local rows back in. This prevents a cross-device edit
 *      from being resurrected by a stale local backup.
 *   3. The cache is a write-through backup (debounced save), never a merge
 *      source once the server has answered.
 *
 * These tests pin that behaviour:
 *   - "offline fallback": with no session, the cached data renders.
 *   - "server wins on load": a stale local cache is replaced by newer server
 *     rows, not merged with them.
 */
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { AppProvider, useFoods } from './AppContext';

// ---- Supabase mock: a chainable, thenable query builder per table ----------
const tableData: Record<string, unknown[]> = {};
let sessionUser: { id: string } | null = null;

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ['select', 'eq', 'order', 'limit', 'gte', 'lte', 'insert', 'update', 'delete']) {
    builder[m] = vi.fn(chain);
  }
  // thenable: awaiting the builder resolves to the table's dataset.
  builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: tableData[table] ?? [], error: null });
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: sessionUser ? { user: sessionUser } : null } })
      ),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: vi.fn((table: string) => makeBuilder(table)),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn((fn: string) => {
      if (fn === 'get_user_household_id') return Promise.resolve({ data: 'hh-1', error: null });
      if (fn === 'ensure_user_household') return Promise.resolve({ data: 'hh-1', error: null });
      return Promise.resolve({ data: null, error: null });
    }),
  },
}));

// ---- platform storage mock: an in-memory cache we can pre-seed --------------
const storageBacking: Record<string, string> = {};
vi.mock('@/lib/platform', () => ({
  getStorage: vi.fn().mockResolvedValue({
    getItem: vi.fn((k: string) => Promise.resolve(storageBacking[k] ?? null)),
    setItem: vi.fn((k: string, v: string) => {
      storageBacking[k] = v;
      return Promise.resolve();
    }),
    removeItem: vi.fn((k: string) => {
      delete storageBacking[k];
      return Promise.resolve();
    }),
  }),
  isWeb: vi.fn().mockReturnValue(true),
  isMobile: vi.fn().mockReturnValue(false),
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

const STORAGE_KEY = 'kid-meal-planner';

function FoodsProbe({ onFoods }: { onFoods: (names: string[]) => void }) {
  const { foods } = useFoods();
  onFoods(foods.map((f) => f.name));
  return null;
}

describe('US-341: load precedence (localStorage vs Supabase)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(storageBacking)) delete storageBacking[k];
    for (const k of Object.keys(tableData)) delete tableData[k];
    sessionUser = null;
  });

  it('offline fallback: renders cached foods when there is no session', async () => {
    storageBacking[STORAGE_KEY] = JSON.stringify({
      foods: [{ id: 'f1', name: 'Cached Apple', category: 'fruit', is_safe: true, is_try_bite: false }],
      kids: [{ id: 'k1', name: 'Kid', age: 4 }],
      recipes: [], planEntries: [], groceryItems: [], activeKidId: 'k1',
    });

    let latest: string[] = [];
    render(
      <AppProvider>
        <FoodsProbe onFoods={(n) => { latest = n; }} />
      </AppProvider>
    );

    await waitFor(() => expect(latest).toContain('Cached Apple'));
    // No session => server never answers => cache is the source of truth.
    expect(latest).toEqual(['Cached Apple']);
  });

  it('server-authoritative: a successful Supabase load overwrites a stale local cache', async () => {
    // Stale local cache (e.g. an edit made on another device since deleted).
    storageBacking[STORAGE_KEY] = JSON.stringify({
      foods: [{ id: 'stale', name: 'Stale Local Food', category: 'fruit', is_safe: true, is_try_bite: false }],
      kids: [{ id: 'k1', name: 'Kid', age: 4 }],
      recipes: [], planEntries: [], groceryItems: [], activeKidId: 'k1',
    });
    // Server is the source of truth and has different rows.
    sessionUser = { id: 'user-1' };
    tableData['foods'] = [
      { id: 'srv', name: 'Server Milk', category: 'dairy', is_safe: true, is_try_bite: false, household_id: 'hh-1' },
    ];
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: 'hh-1' }];

    let latest: string[] = [];
    render(
      <AppProvider>
        <FoodsProbe onFoods={(n) => { latest = n; }} />
      </AppProvider>
    );

    // Server load replaces the stale cache wholesale — not merged.
    await waitFor(() => expect(latest).toEqual(['Server Milk']));
    expect(latest).not.toContain('Stale Local Food');
  });
});
