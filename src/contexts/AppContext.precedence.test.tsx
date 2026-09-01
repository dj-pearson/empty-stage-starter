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
import { AppProvider, useFoods, useInventory } from './AppContext';

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
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: sessionUser }, error: null })
      ),
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

function PantryQuantityProbe({
  food,
  onValue,
}: {
  food: { id: string; quantity?: number; unit?: string; canonical_unit?: string };
  onValue: (v: { rendered: number; enabled: boolean }) => void;
}) {
  const { pantryQuantityOf, ledgerReadsEnabled } = useInventory();
  onValue({ rendered: pantryQuantityOf(food), enabled: ledgerReadsEnabled });
  return null;
}

function InventoryProbe({
  onInventory,
}: {
  onInventory: (v: { movementIds: string[]; stockByItem: Record<string, number>; ledgerReadsEnabled: boolean }) => void;
}) {
  const { movements, itemStock, ledgerReadsEnabled } = useInventory();
  onInventory({
    movementIds: movements.map((m) => m.id),
    stockByItem: Object.fromEntries(itemStock.map((s) => [s.item_id, Number(s.on_hand_canonical)])),
    ledgerReadsEnabled,
  });
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

  it('cache that resolves AFTER the server load does not overwrite server data (US-526)', async () => {
    // Stale local cache that will hydrate LATE (slow storage read).
    storageBacking[STORAGE_KEY] = JSON.stringify({
      foods: [{ id: 'stale', name: 'Stale Local Food', category: 'fruit', is_safe: true, is_try_bite: false }],
      kids: [{ id: 'k1', name: 'Kid', age: 4 }],
      recipes: [], planEntries: [], groceryItems: [], activeKidId: 'k1',
    });
    sessionUser = { id: 'user-1' };
    tableData['foods'] = [
      { id: 'srv', name: 'Server Milk', category: 'dairy', is_safe: true, is_try_bite: false, household_id: 'hh-1' },
    ];
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: 'hh-1' }];

    // Make ONLY the mount cache-hydrate's getItem resolve late, so the
    // server-authoritative load applies first and the cache arrives afterward.
    const platform = await import('@/lib/platform');
    (platform.getStorage as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      getItem: (k: string) =>
        new Promise((res) => setTimeout(() => res(storageBacking[k] ?? null), 50)),
      setItem: (k: string, v: string) => { storageBacking[k] = v; return Promise.resolve(); },
      removeItem: (k: string) => { delete storageBacking[k]; return Promise.resolve(); },
    });

    let latest: string[] = [];
    render(
      <AppProvider>
        <FoodsProbe onFoods={(n) => { latest = n; }} />
      </AppProvider>
    );

    // Server data applies first.
    await waitFor(() => expect(latest).toEqual(['Server Milk']));
    // Let the delayed cache hydrate fire; the US-526 guard must suppress it.
    await new Promise((r) => setTimeout(r, 90));
    expect(latest).toEqual(['Server Milk']);
    expect(latest).not.toContain('Stale Local Food');
  });
});

/**
 * US-671 criterion 5: the ledger slices obey the same precedence contract as
 * every other domain. Nothing about being append-only exempts them from it --
 * if anything the overwrite is safer here, because there is no local edit to a
 * movement that a server load could discard.
 */
describe('US-671: the ledger slices under the US-341 precedence contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(storageBacking)) delete storageBacking[k];
    for (const k of Object.keys(tableData)) delete tableData[k];
    sessionUser = null;
  });

  it('offline fallback: renders cached movements and stock when there is no session', async () => {
    storageBacking[STORAGE_KEY] = JSON.stringify({
      foods: [{ id: 'f1', name: 'Cached Apple', category: 'fruit', is_safe: true, is_try_bite: false }],
      kids: [{ id: 'k1', name: 'Kid', age: 4 }],
      recipes: [], planEntries: [], groceryItems: [], activeKidId: 'k1',
      movements: [
        { id: 'cached-m1', item_id: 'f1', delta: 500, canonical_unit: 'g', household_id: 'hh-1' },
      ],
      itemStock: [
        { item_id: 'f1', household_id: 'hh-1', on_hand_canonical: 500, canonical_unit: 'g' },
      ],
    });

    let latest = { movementIds: [] as string[], stockByItem: {} as Record<string, number>, ledgerReadsEnabled: false };
    render(
      <AppProvider>
        <InventoryProbe onInventory={(v) => { latest = v; }} />
      </AppProvider>
    );

    await waitFor(() => expect(latest.movementIds).toEqual(['cached-m1']));
    expect(latest.stockByItem).toEqual({ f1: 500 });
  });

  it('server-authoritative: a successful load overwrites the cached ledger wholesale', async () => {
    // A cache carrying a movement the server no longer reports -- the shape a
    // merge would resurrect and an overwrite must not.
    storageBacking[STORAGE_KEY] = JSON.stringify({
      foods: [], kids: [{ id: 'k1', name: 'Kid', age: 4 }],
      recipes: [], planEntries: [], groceryItems: [], activeKidId: 'k1',
      movements: [
        { id: 'stale-m', item_id: 'f1', delta: 9999, canonical_unit: 'g', household_id: 'hh-1' },
      ],
      itemStock: [
        { item_id: 'f1', household_id: 'hh-1', on_hand_canonical: 9999, canonical_unit: 'g' },
      ],
    });
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: 'hh-1' }];
    tableData['inventory_movements'] = [
      { id: 'srv-m1', item_id: 'f1', delta: 500, canonical_unit: 'g', household_id: 'hh-1', reason: 'purchase' },
    ];
    tableData['item_stock'] = [
      { item_id: 'f1', household_id: 'hh-1', on_hand_canonical: 500, canonical_unit: 'g' },
    ];

    let latest = { movementIds: [] as string[], stockByItem: {} as Record<string, number>, ledgerReadsEnabled: false };
    render(
      <AppProvider>
        <InventoryProbe onInventory={(v) => { latest = v; }} />
      </AppProvider>
    );

    await waitFor(() => expect(latest.movementIds).toEqual(['srv-m1']));
    expect(latest.movementIds).not.toContain('stale-m');
    expect(latest.stockByItem).toEqual({ f1: 500 });
  });

  it('the flag defaults off, so the ledger loads without changing what renders', async () => {
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: 'hh-1' }];
    tableData['item_stock'] = [
      { item_id: 'f1', household_id: 'hh-1', on_hand_canonical: 500, canonical_unit: 'g' },
    ];

    let latest = { movementIds: [] as string[], stockByItem: {} as Record<string, number>, ledgerReadsEnabled: true };
    render(
      <AppProvider>
        <InventoryProbe onInventory={(v) => { latest = v; }} />
      </AppProvider>
    );

    await waitFor(() => expect(latest.stockByItem).toEqual({ f1: 500 }));
    expect(latest.ledgerReadsEnabled).toBe(false);
  });
});

/**
 * US-671 criterion 2: the flag is what selects where a pantry number comes
 * from. Off is the shipped behaviour, unchanged; on reads the ledger.
 */
describe('US-671: the feature-flag gate on pantry quantity', () => {
  const FLAG_CACHE_KEY = 'eatpal_feature_flags';
  // 2 kg on hand in the ledger, while the legacy column still says 1.
  const FOOD = { id: 'f1', quantity: 1, unit: 'kg', canonical_unit: 'g' };

  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(storageBacking)) delete storageBacking[k];
    for (const k of Object.keys(tableData)) delete tableData[k];
    localStorage.clear();
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: 'hh-1' }];
    tableData['item_stock'] = [
      { item_id: 'f1', household_id: 'hh-1', on_hand_canonical: 2000, canonical_unit: 'g' },
    ];
  });

  it('off: renders foods.quantity, exactly as the shipped app does', async () => {
    let latest = { rendered: -1, enabled: true };
    render(
      <AppProvider>
        <PantryQuantityProbe food={FOOD} onValue={(v) => { latest = v; }} />
      </AppProvider>
    );

    await waitFor(() => expect(latest.enabled).toBe(false));
    expect(latest.rendered).toBe(1);
  });

  it('on: renders the ledger balance converted into the item display unit', async () => {
    localStorage.setItem(
      FLAG_CACHE_KEY,
      JSON.stringify({ flags: { kitchen_loop_ledger_reads: true }, timestamp: Date.now() })
    );

    let latest = { rendered: -1, enabled: false };
    render(
      <AppProvider>
        <PantryQuantityProbe food={FOOD} onValue={(v) => { latest = v; }} />
      </AppProvider>
    );

    // 2000 g rendered in kg, not the 1 the legacy column still holds.
    await waitFor(() => expect(latest.rendered).toBe(2));
    expect(latest.enabled).toBe(true);
  });

  it('on: keeps the legacy number for an item the ledger has no balance for', async () => {
    localStorage.setItem(
      FLAG_CACHE_KEY,
      JSON.stringify({ flags: { kitchen_loop_ledger_reads: true }, timestamp: Date.now() })
    );
    tableData['item_stock'] = [];

    let latest = { rendered: -1, enabled: false };
    render(
      <AppProvider>
        <PantryQuantityProbe food={FOOD} onValue={(v) => { latest = v; }} />
      </AppProvider>
    );

    await waitFor(() => expect(latest.enabled).toBe(true));
    // A stale number beats a blank one while the backfill is still landing.
    expect(latest.rendered).toBe(1);
  });
});
