/**
 * US-672 criterion 6, the half that needs the context: checkout crediting and
 * duplicate-submit idempotency. The delta arithmetic is settled purely in
 * src/lib/movementBuilders.test.ts.
 *
 * What is worth pinning here is the boundary, not the arithmetic: what actually
 * goes over the wire, that a second submit cannot credit the pantry twice, and
 * that a rejected insert does not leave a phantom balance on screen.
 */
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { AppProvider, useInventory } from './AppContext';
import type { MovementItem, PurchasableGroceryItem } from '@/lib/movementBuilders';

const tableData: Record<string, unknown[]> = {};
let sessionUser: { id: string } | null = null;
/** Every row handed to inventory_movements.upsert, in order. */
let upserted: Record<string, unknown>[][] = [];
let upsertOptions: unknown[] = [];
let upsertError: unknown = null;

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ['select', 'eq', 'order', 'limit', 'gte', 'lte', 'insert', 'update', 'delete']) {
    builder[m] = vi.fn(chain);
  }
  builder.upsert = vi.fn((rows: Record<string, unknown>[], options: unknown) => {
    if (table === 'inventory_movements') {
      upserted.push(Array.isArray(rows) ? rows : [rows]);
      upsertOptions.push(options);
    }
    return Promise.resolve({ data: null, error: upsertError });
  });
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
      getUser: vi.fn(() => Promise.resolve({ data: { user: sessionUser }, error: null })),
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

const storageBacking: Record<string, string> = {};
vi.mock('@/lib/platform', () => ({
  getStorage: vi.fn().mockResolvedValue({
    getItem: vi.fn((k: string) => Promise.resolve(storageBacking[k] ?? null)),
    setItem: vi.fn((k: string, v: string) => { storageBacking[k] = v; return Promise.resolve(); }),
    removeItem: vi.fn((k: string) => { delete storageBacking[k]; return Promise.resolve(); }),
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

const FLAG_CACHE_KEY = 'eatpal_feature_flags';

type Inventory = ReturnType<typeof useInventory>;

function InventoryHandle({ onReady }: { onReady: (v: Inventory) => void }) {
  const inventory = useInventory();
  onReady(inventory);
  return null;
}

/** Render the provider and hand back the live context value. */
async function mountInventory() {
  let latest: Inventory | null = null;
  render(
    <AppProvider>
      <InventoryHandle onReady={(v) => { latest = v; }} />
    </AppProvider>
  );
  await waitFor(() => expect(latest).not.toBeNull());
  return () => latest as Inventory;
}

function enableWrites() {
  localStorage.setItem(
    FLAG_CACHE_KEY,
    JSON.stringify({ flags: { kitchen_loop_ledger_writes: true }, timestamp: Date.now() })
  );
}

/** Flour: held in grams, displayed in kilograms. */
const FLOUR: MovementItem & { name: string; quantity: number } = {
  id: 'flour', name: 'Flour', unit: 'kg', canonical_unit: 'g', quantity: 1,
};
const EGGS: MovementItem & { name: string; quantity: number } = {
  id: 'eggs', name: 'Eggs', unit: 'count', canonical_unit: 'count', quantity: 6,
};

const CHECKED_ROWS: PurchasableGroceryItem[] = [
  { id: 'row-flour', name: 'Flour', quantity: 2, unit: 'kg', price_per_unit: 1.5, currency: 'USD' },
  { id: 'row-eggs', name: 'Eggs', quantity: 12, unit: 'count' },
];

describe('US-672: checkout credits the pantry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(storageBacking)) delete storageBacking[k];
    for (const k of Object.keys(tableData)) delete tableData[k];
    localStorage.clear();
    upserted = [];
    upsertOptions = [];
    upsertError = null;
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: 'hh-1' }];
  });

  it('appends one purchase movement per checked row', async () => {
    enableWrites();
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));

    await act(async () => {
      await inventory().recordPurchases(CHECKED_ROWS, [FLOUR, EGGS]);
    });

    expect(upserted).toHaveLength(1);
    const rows = upserted[0];
    expect(rows).toHaveLength(2);

    const flour = rows.find((r) => r.item_id === 'flour')!;
    expect(flour.reason).toBe('purchase');
    expect(flour.delta).toBe(2000);
    expect(flour.canonical_unit).toBe('g');
    // What the parent actually put on the list, kept alongside the canonical
    // amount so a movement can be explained as "2 kg".
    expect(flour.display_quantity).toBe(2);
    expect(flour.display_unit).toBe('kg');
    expect(flour.ref_type).toBe('grocery_item');
    expect(flour.ref_id).toBe('row-flour');
    expect(flour.unit_price).toBe(1.5);
    expect(flour.currency).toBe('USD');
    expect(flour.household_id).toBe('hh-1');
    expect(flour.created_by).toBe('user-1');

    const eggs = rows.find((r) => r.item_id === 'eggs')!;
    expect(eggs.delta).toBe(12);
    // No price on the list means no price on the movement, not a zero.
    expect(eggs.unit_price).toBeNull();
    expect(eggs.currency).toBeNull();
  });

  it('reports rows that resolve to no pantry item instead of dropping them', async () => {
    enableWrites();
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));

    let result!: Awaited<ReturnType<Inventory['recordPurchases']>>;
    await act(async () => {
      result = await inventory().recordPurchases(
        [...CHECKED_ROWS, { id: 'row-saffron', name: 'Saffron', quantity: 1, unit: 'g' }],
        [FLOUR, EGGS]
      );
    });

    expect(result.count).toBe(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/Saffron/);
  });

  it('credits the pantry in the balance immediately, before the trigger answers', async () => {
    // item_stock is maintained server-side, so without the optimistic overlay
    // the number on screen would not move until realtime caught up.
    enableWrites();
    tableData['item_stock'] = [
      { item_id: 'flour', household_id: 'hh-1', on_hand_canonical: 1000, canonical_unit: 'g' },
    ];
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));
    await waitFor(() => expect(inventory().itemStock).toHaveLength(1));

    expect(inventory().ledgerQuantityOf(FLOUR)).toBe(1);

    await act(async () => {
      await inventory().recordPurchases([CHECKED_ROWS[0]], [FLOUR]);
    });

    // 1000 g held plus 2000 g bought, rendered in the item's own unit.
    await waitFor(() => expect(inventory().ledgerQuantityOf(FLOUR)).toBe(3));
  });
});

describe('US-672: a second submit cannot credit twice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(storageBacking)) delete storageBacking[k];
    for (const k of Object.keys(tableData)) delete tableData[k];
    localStorage.clear();
    upserted = [];
    upsertOptions = [];
    upsertError = null;
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: 'hh-1' }];
  });

  it('sends the same movement ids, so the second insert is a no-op on the primary key', async () => {
    enableWrites();
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));

    await act(async () => {
      await inventory().recordPurchases(CHECKED_ROWS, [FLOUR, EGGS]);
      await inventory().recordPurchases(CHECKED_ROWS, [FLOUR, EGGS]);
    });

    expect(upserted).toHaveLength(2);
    const idsOf = (rows: Record<string, unknown>[]) => rows.map((r) => r.id).sort();
    expect(idsOf(upserted[1])).toEqual(idsOf(upserted[0]));
    // The id IS the grocery row id, which is what makes the collision certain.
    expect(idsOf(upserted[0])).toEqual(['row-eggs', 'row-flour']);
  });

  it('asks the server to ignore duplicates rather than update them', async () => {
    // ON CONFLICT DO NOTHING, not DO UPDATE. The other spelling could not work:
    // inventory_movements REVOKEs UPDATE from authenticated so history cannot
    // be rewritten, so an update branch would be refused by the grant.
    enableWrites();
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));

    await act(async () => {
      await inventory().recordPurchases(CHECKED_ROWS, [FLOUR, EGGS]);
    });

    expect(upsertOptions[0]).toMatchObject({ onConflict: 'id', ignoreDuplicates: true });
  });

  it('does not double the local balance when the same submit is replayed', async () => {
    enableWrites();
    tableData['item_stock'] = [
      { item_id: 'eggs', household_id: 'hh-1', on_hand_canonical: 6, canonical_unit: 'count' },
    ];
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));
    await waitFor(() => expect(inventory().itemStock).toHaveLength(1));

    await act(async () => {
      await inventory().recordPurchases([CHECKED_ROWS[1]], [EGGS]);
      await inventory().recordPurchases([CHECKED_ROWS[1]], [EGGS]);
    });

    // 6 held + 12 bought. Not 30: the movement is deduped by id locally, the
    // same way the primary key dedupes it server-side.
    await waitFor(() => expect(inventory().ledgerQuantityOf(EGGS)).toBe(18));
    expect(inventory().movements.filter((m) => m.item_id === 'eggs')).toHaveLength(1);
  });
});

describe('US-672: pantry corrections and failure handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(storageBacking)) delete storageBacking[k];
    for (const k of Object.keys(tableData)) delete tableData[k];
    localStorage.clear();
    upserted = [];
    upsertOptions = [];
    upsertError = null;
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: 'hh-1' }];
  });

  it('records an edit as the change, not the new total', async () => {
    enableWrites();
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));

    await act(async () => {
      await inventory().recordPantryCorrection({ ...FLOUR, quantity: 1 }, 3);
    });

    const row = upserted[0][0];
    expect(row.reason).toBe('correction');
    expect(row.delta).toBe(2000); // the 2 kg change, not the 3 kg total
    expect(row.ref_type).toBeNull();
  });

  it('records a throw-out as waste, which is a different fact from a miscount', async () => {
    enableWrites();
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));

    await act(async () => {
      await inventory().recordWaste(FLOUR, 0.5);
    });

    expect(upserted[0][0].reason).toBe('waste');
    expect(upserted[0][0].delta).toBe(-500);
  });

  it('rolls the optimistic movement back when the insert is rejected', async () => {
    // A movement that never reached the server must not keep inflating the
    // balance: the next server load would drop it and the number would change
    // with no action from the parent.
    enableWrites();
    upsertError = { message: 'permission denied' };
    tableData['item_stock'] = [
      { item_id: 'eggs', household_id: 'hh-1', on_hand_canonical: 6, canonical_unit: 'count' },
    ];
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));
    await waitFor(() => expect(inventory().itemStock).toHaveLength(1));

    let result!: Awaited<ReturnType<Inventory['recordPurchases']>>;
    await act(async () => {
      result = await inventory().recordPurchases([CHECKED_ROWS[1]], [EGGS]);
    });

    expect(result.recorded).toBe(false);
    expect(inventory().movements).toHaveLength(0);
    expect(inventory().ledgerQuantityOf(EGGS)).toBe(6);
  });

  it('writes nothing at all while the flag is off', async () => {
    // No enableWrites(): this is the shipped state, and the story must be inert.
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(false));

    let result!: Awaited<ReturnType<Inventory['recordPurchases']>>;
    await act(async () => {
      result = await inventory().recordPurchases(CHECKED_ROWS, [FLOUR, EGGS]);
      await inventory().recordPantryCorrection({ ...FLOUR, quantity: 1 }, 3);
      await inventory().recordWaste(FLOUR, 1);
    });

    expect(upserted).toEqual([]);
    expect(result.recorded).toBe(false);
    expect(inventory().movements).toEqual([]);
  });

  it('undoing a checkout appends a negating correction rather than rewriting history', async () => {
    enableWrites();
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));

    await act(async () => {
      await inventory().recordPurchases([CHECKED_ROWS[1]], [EGGS]);
      await inventory().recordPurchaseReversal([CHECKED_ROWS[1]], [EGGS]);
    });

    const purchase = upserted[0][0];
    const reversal = upserted[1][0];
    expect(purchase.delta).toBe(12);
    expect(reversal.delta).toBe(-12);
    expect(reversal.reason).toBe('correction');
    // A NEW row, not a re-send of the purchase: reusing the purchase id would
    // collide with the row it is meant to cancel and undo nothing at all.
    expect(reversal.id).not.toBe(purchase.id);
    expect(reversal.ref_id).toBe('row-eggs');
  });
});
