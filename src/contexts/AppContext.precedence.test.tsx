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
import { AppProvider, useApp, useFoods, useInventory } from './AppContext';
import { writeFlag } from '@/lib/featureFlagCache';
import { queueWrite } from '@/lib/webSyncQueue';

// ---- Supabase mock: a chainable, thenable query builder per table ----------
const tableData: Record<string, unknown[]> = {};
let sessionUser: { id: string } | null = null;
/** When set, the grocery_items read waits for it: a server that has not answered yet. */
let groceryGate: Promise<void> | null = null;
/** When set, the grocery_items read fails with it. */
let groceryError: unknown = null;

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ['select', 'eq', 'order', 'gte', 'lte', 'insert', 'update', 'delete']) {
    builder[m] = vi.fn(chain);
  }
  // limit is honoured for the same reason range is: a stub that chains it away
  // would let a revert to `.limit(500)` pass the paging assertions below.
  let cap: number | null = null;
  builder.limit = vi.fn((n: number) => {
    cap = n;
    return builder;
  });
  // US-819: range is honoured rather than chained away, so a fixture larger
  // than one page exercises the paging instead of quietly returning
  // everything on the first call and proving nothing.
  let window: { from: number; to: number } | null = null;
  builder.range = vi.fn((from: number, to: number) => {
    window = { from, to };
    rangeCalls.push([table, from, to]);
    return builder;
  });
  // thenable: awaiting the builder resolves to the table's dataset.
  builder.then = (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) => {
    let rows = tableData[table] ?? [];
    if (window) rows = rows.slice(window.from, window.to + 1);
    if (cap !== null) rows = rows.slice(0, cap);
    const answer = () =>
      table === 'grocery_items' && groceryError
        ? resolve({ data: null, error: groceryError })
        : resolve({ data: rows, error: null });
    if (table === 'grocery_items' && groceryGate) return groceryGate.then(answer);
    return answer();
  };
  return builder;
}

/** Every .range() the loader asked for, so a test can see it paged. */
const rangeCalls: Array<[string, number, number]> = [];

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
      if (fn === 'get_user_household_id') return Promise.resolve({ data: '11111111-1111-4111-8111-111111111111', error: null });
      if (fn === 'ensure_user_household') return Promise.resolve({ data: '11111111-1111-4111-8111-111111111111', error: null });
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
    rangeCalls.length = 0;
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
      { id: 'srv', name: 'Server Milk', category: 'dairy', is_safe: true, is_try_bite: false, household_id: '11111111-1111-4111-8111-111111111111' },
    ];
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: '11111111-1111-4111-8111-111111111111' }];

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
      { id: 'srv', name: 'Server Milk', category: 'dairy', is_safe: true, is_try_bite: false, household_id: '11111111-1111-4111-8111-111111111111' },
    ];
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: '11111111-1111-4111-8111-111111111111' }];

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
        { id: 'cached-m1', item_id: 'f1', delta: 500, canonical_unit: 'g', household_id: '11111111-1111-4111-8111-111111111111' },
      ],
      itemStock: [
        { item_id: 'f1', household_id: '11111111-1111-4111-8111-111111111111', on_hand_canonical: 500, canonical_unit: 'g' },
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
        { id: 'stale-m', item_id: 'f1', delta: 9999, canonical_unit: 'g', household_id: '11111111-1111-4111-8111-111111111111' },
      ],
      itemStock: [
        { item_id: 'f1', household_id: '11111111-1111-4111-8111-111111111111', on_hand_canonical: 9999, canonical_unit: 'g' },
      ],
    });
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: '11111111-1111-4111-8111-111111111111' }];
    tableData['inventory_movements'] = [
      { id: 'srv-m1', item_id: 'f1', delta: 500, canonical_unit: 'g', household_id: '11111111-1111-4111-8111-111111111111', reason: 'purchase' },
    ];
    tableData['item_stock'] = [
      { item_id: 'f1', household_id: '11111111-1111-4111-8111-111111111111', on_hand_canonical: 500, canonical_unit: 'g' },
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
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: '11111111-1111-4111-8111-111111111111' }];
    tableData['item_stock'] = [
      { item_id: 'f1', household_id: '11111111-1111-4111-8111-111111111111', on_hand_canonical: 500, canonical_unit: 'g' },
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
  // 2 kg on hand in the ledger, while the legacy column still says 1.
  const FOOD = { id: 'f1', quantity: 1, unit: 'kg', canonical_unit: 'g' };

  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(storageBacking)) delete storageBacking[k];
    for (const k of Object.keys(tableData)) delete tableData[k];
    localStorage.clear();
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: '11111111-1111-4111-8111-111111111111' }];
    tableData['item_stock'] = [
      { item_id: 'f1', household_id: '11111111-1111-4111-8111-111111111111', on_hand_canonical: 2000, canonical_unit: 'g' },
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
    // US-842: seed through the cache module, so the seed cannot drift from
    // the on-disk format the way this hand-written literal did.
    writeFlag('kitchen_loop_ledger_reads', true);

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
    // US-842: seed through the cache module, so the seed cannot drift from
    // the on-disk format the way this hand-written literal did.
    writeFlag('kitchen_loop_ledger_reads', true);
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

/**
 * US-819. The initial load took the first 500 foods, 200 recipes and 500
 * grocery items and wrote each slice into state wholesale, so a household over
 * any of those numbers saw a partial catalogue that looked complete. Worse for
 * grocery_items, which came back oldest-first: the items just added were
 * exactly the ones cut.
 *
 * src/lib/fetchAllRows.test.ts pins the walk. This pins that the loader
 * actually does it -- a household past the old cap gets all of its rows.
 */
describe('US-819: the load reaches past the old row caps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(storageBacking)) delete storageBacking[k];
    for (const k of Object.keys(tableData)) delete tableData[k];
    rangeCalls.length = 0;
    sessionUser = null;
    // The offline write queue lives in the real localStorage, not the mocked
    // platform storage, so a queue left by one test would colour the next.
    localStorage.clear();
  });

  const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';

  it('loads a catalogue larger than the 500 it used to stop at', async () => {
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: HOUSEHOLD }];
    tableData['foods'] = Array.from({ length: 1500 }, (_, i) => ({
      id: `f${i}`,
      // Zero-padded so the names sort the way the ids do and the assertion
      // below can name the last row.
      name: `Food ${String(i).padStart(4, '0')}`,
      category: 'fruit',
      is_safe: true,
      is_try_bite: false,
      household_id: HOUSEHOLD,
    }));

    let latest: string[] = [];
    render(
      <AppProvider>
        <FoodsProbe onFoods={(n) => { latest = n; }} />
      </AppProvider>
    );

    await waitFor(() => expect(latest.length).toBe(1500));
    // Not just the count: the row past the old cap is present, and so is the
    // last one, which two pages of 1000 only reach by asking twice.
    expect(latest).toContain('Food 0500');
    expect(latest).toContain('Food 1499');
  });

  it('pages rather than asking for one enormous window', async () => {
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: HOUSEHOLD }];
    tableData['foods'] = Array.from({ length: 1500 }, (_, i) => ({
      id: `f${i}`, name: `Food ${String(i).padStart(4, '0')}`, category: 'fruit',
      is_safe: true, is_try_bite: false, household_id: HOUSEHOLD,
    }));

    let latest: string[] = [];
    render(
      <AppProvider>
        <FoodsProbe onFoods={(n) => { latest = n; }} />
      </AppProvider>
    );

    await waitFor(() => expect(latest.length).toBe(1500));

    const foodPages = rangeCalls.filter(([t]) => t === 'foods').map(([, from, to]) => [from, to]);
    expect(foodPages).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('gives a household every grocery item, not the oldest 500', async () => {
    // The ordering is what made this a bug people would report rather than
    // "some rows are missing": ascending created_at meant the 500 shown were
    // the oldest, so a household over the cap stopped seeing what it just added.
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: HOUSEHOLD }];
    tableData['grocery_items'] = Array.from({ length: 1200 }, (_, i) => ({
      id: `g${i}`,
      name: `Item ${String(i).padStart(4, '0')}`,
      quantity: 1,
      checked: false,
      household_id: HOUSEHOLD,
    }));

    let names: string[] = [];
    function GroceryProbe() {
      const { groceryItems } = useApp();
      names = groceryItems.map((g) => g.name);
      return null;
    }

    render(
      <AppProvider>
        <GroceryProbe />
      </AppProvider>
    );

    await waitFor(() => expect(names.length).toBe(1200));
    expect(names).toContain('Item 1199');
  });

  /**
   * US-823 AC4. Steps 2 and 5 of the contract meet here: the load REPLACES the
   * grocery slice, and the offline write queue holds writes that have not
   * reached the server yet. Without the projection, the replace is what erases
   * them from the screen -- a shopper ticks items off in an aisle with no
   * signal, closes the tab, opens it at home, and the list arrives with every
   * tick undone while the ops are still sitting in localStorage.
   *
   * This reads the real localStorage queue that src/lib/webSyncQueue.ts writes,
   * not a stub, so a regression in either half reds it.
   */
  it('re-applies writes still queued offline on top of the server load (US-823)', async () => {
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: HOUSEHOLD }];
    tableData['grocery_items'] = [
      { id: 'g1', name: 'Milk', quantity: 1, checked: false, household_id: HOUSEHOLD },
      { id: 'g2', name: 'Bread', quantity: 1, checked: false, household_id: HOUSEHOLD },
      { id: 'g3', name: 'Eggs', quantity: 1, checked: false, household_id: HOUSEHOLD },
    ];

    // Ticked off and deleted in the aisle; never sent.
    await queueWrite('user-1', 'grocery.toggle', { id: 'g1', checked: true });
    await queueWrite('user-1', 'grocery.delete', { id: 'g3' });

    let rows: Array<{ id: string; checked: boolean }> = [];
    function GroceryProbe() {
      const { groceryItems } = useApp();
      rows = groceryItems.map((g) => ({ id: g.id, checked: g.checked }));
      return null;
    }

    render(
      <AppProvider>
        <GroceryProbe />
      </AppProvider>
    );

    await waitFor(() => expect(rows.length).toBe(2));
    expect(rows.find((r) => r.id === 'g1')?.checked).toBe(true);
    expect(rows.find((r) => r.id === 'g2')?.checked).toBe(false);
    expect(rows.find((r) => r.id === 'g3')).toBeUndefined();
  });

  it('leaves the server load untouched when another account owns the queue (US-823)', async () => {
    // The queue is keyed by user. A write belonging to somebody else on this
    // device must not colour what this account sees.
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: HOUSEHOLD }];
    tableData['grocery_items'] = [
      { id: 'g1', name: 'Milk', quantity: 1, checked: false, household_id: HOUSEHOLD },
    ];
    await queueWrite('someone-else', 'grocery.toggle', { id: 'g1', checked: true });

    let rows: Array<{ id: string; checked: boolean }> = [];
    function GroceryProbe() {
      const { groceryItems } = useApp();
      rows = groceryItems.map((g) => ({ id: g.id, checked: g.checked }));
      return null;
    }

    render(
      <AppProvider>
        <GroceryProbe />
      </AppProvider>
    );

    await waitFor(() => expect(rows.length).toBe(1));
    expect(rows[0].checked).toBe(false);
  });
});

/**
 * groceryHydrated lets the Grocery page tell "still loading" from "your list is
 * empty". It must not claim ready before the server has answered (an empty
 * cache is not an answer), and it must not wait forever when the load fails.
 */
describe('groceryHydrated', () => {
  const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(storageBacking)) delete storageBacking[k];
    for (const k of Object.keys(tableData)) delete tableData[k];
    localStorage.clear();
    groceryGate = null;
    groceryError = null;
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: HOUSEHOLD }];
    tableData['grocery_items'] = [
      { id: 'g1', name: 'Milk', quantity: 1, checked: false, household_id: HOUSEHOLD },
      { id: 'g2', name: 'Bread', quantity: 1, checked: false, household_id: HOUSEHOLD },
    ];
  });

  function probe() {
    const seen = { hydrated: [] as boolean[], rows: [] as Array<{ id: string; checked: boolean }> };
    function GroceryProbe() {
      const { groceryItems, groceryHydrated } = useApp();
      seen.hydrated.push(groceryHydrated);
      seen.rows = groceryItems.map((g) => ({ id: g.id, checked: g.checked }));
      return null;
    }
    return { seen, GroceryProbe };
  }

  it('is false until the server load resolves, then true', async () => {
    let open!: () => void;
    groceryGate = new Promise<void>((r) => { open = r; });
    const { seen, GroceryProbe } = probe();

    render(
      <AppProvider>
        <GroceryProbe />
      </AppProvider>
    );

    // Everything else has loaded; the grocery read is still out.
    await new Promise((r) => setTimeout(r, 50));
    expect(seen.hydrated.at(-1)).toBe(false);
    expect(seen.hydrated).not.toContain(true);

    open();
    await waitFor(() => expect(seen.hydrated.at(-1)).toBe(true));
    expect(seen.rows.map((r) => r.id)).toEqual(['g1', 'g2']);
  });

  it('turns true when the load fails, so the page does not spin forever', async () => {
    groceryError = { message: 'boom', code: 'XX000' };
    const { seen, GroceryProbe } = probe();

    render(
      <AppProvider>
        <GroceryProbe />
      </AppProvider>
    );

    await waitFor(() => expect(seen.hydrated.at(-1)).toBe(true));
  });

  it('a queued toggle still survives the load that marks the list ready', async () => {
    await queueWrite('user-1', 'grocery.toggle', { id: 'g2', checked: true });
    const { seen, GroceryProbe } = probe();

    render(
      <AppProvider>
        <GroceryProbe />
      </AppProvider>
    );

    await waitFor(() => expect(seen.hydrated.at(-1)).toBe(true));
    expect(seen.rows.find((r) => r.id === 'g2')?.checked).toBe(true);
    expect(seen.rows.find((r) => r.id === 'g1')?.checked).toBe(false);
  });
});

/**
 * foodsHydrated replaces the pantry's 1200ms "probably loaded by now" timer.
 * Same contract as groceryHydrated: not ready before the server answers, ready
 * once it settles even with zero rows, and a non-empty cache counts as ready.
 * The grocery gate holds the whole Promise.all, so it holds the foods load too.
 */
describe('foodsHydrated', () => {
  const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(storageBacking)) delete storageBacking[k];
    for (const k of Object.keys(tableData)) delete tableData[k];
    localStorage.clear();
    groceryGate = null;
    groceryError = null;
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: HOUSEHOLD }];
  });

  function probe() {
    const seen = { hydrated: [] as boolean[], names: [] as string[] };
    function Probe() {
      const { foods, foodsHydrated } = useFoods();
      const app = useApp();
      expect(app.foodsHydrated).toBe(foodsHydrated);
      seen.hydrated.push(foodsHydrated);
      seen.names = foods.map((f) => f.name);
      return null;
    }
    return { seen, Probe };
  }

  it('is false until the server load settles, then true', async () => {
    tableData['foods'] = [
      { id: 'srv', name: 'Server Milk', category: 'dairy', is_safe: true, is_try_bite: false, household_id: HOUSEHOLD },
    ];
    let open!: () => void;
    groceryGate = new Promise<void>((r) => { open = r; });
    const { seen, Probe } = probe();

    render(
      <AppProvider>
        <Probe />
      </AppProvider>
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(seen.hydrated.at(-1)).toBe(false);
    expect(seen.hydrated).not.toContain(true);

    open();
    await waitFor(() => expect(seen.hydrated.at(-1)).toBe(true));
    expect(seen.names).toEqual(['Server Milk']);
  });

  it('turns true when the server answers with zero foods', async () => {
    tableData['foods'] = [];
    let open!: () => void;
    groceryGate = new Promise<void>((r) => { open = r; });
    const { seen, Probe } = probe();

    render(
      <AppProvider>
        <Probe />
      </AppProvider>
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(seen.hydrated.at(-1)).toBe(false);

    open();
    await waitFor(() => expect(seen.hydrated.at(-1)).toBe(true));
    expect(seen.names).toEqual([]);
  });

  it('a non-empty cache counts as hydrated before the server answers', async () => {
    storageBacking[STORAGE_KEY] = JSON.stringify({
      foods: [{ id: 'f1', name: 'Cached Apple', category: 'fruit', is_safe: true, is_try_bite: false }],
      kids: [{ id: 'k1', name: 'Kid', age: 4 }],
      recipes: [], planEntries: [], groceryItems: [], activeKidId: 'k1',
    });
    groceryGate = new Promise<void>(() => {});
    const { seen, Probe } = probe();

    render(
      <AppProvider>
        <Probe />
      </AppProvider>
    );

    await waitFor(() => expect(seen.hydrated.at(-1)).toBe(true));
    expect(seen.names).toEqual(['Cached Apple']);
  });
});
