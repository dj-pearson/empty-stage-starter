/**
 * recordRestock: the pantry's top-up write (stepper, photo, receipt, barcode)
 * as a signed purchase movement, only when ledger writes are on. Harness
 * copied from InventoryContext.append.test.tsx.
 */
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { AppProvider, useInventory } from './AppContext';
import type { MovementItem } from '@/lib/movementBuilders';
import { writeFlag } from '@/lib/featureFlagCache';

const tableData: Record<string, unknown[]> = {};
let sessionUser: { id: string } | null = null;
/** Every row handed to inventory_movements.upsert, in order. */
let upserted: Record<string, unknown>[][] = [];
let upsertOptions: unknown[] = [];
let upsertError: unknown = null;

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ['select', 'eq', 'order', 'range', 'limit', 'gte', 'lte', 'insert', 'update', 'delete']) {
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
      if (fn === 'get_user_household_id') return Promise.resolve({ data: '11111111-1111-4111-8111-111111111111', error: null });
      if (fn === 'ensure_user_household') return Promise.resolve({ data: '11111111-1111-4111-8111-111111111111', error: null });
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

/**
 * US-842: seed through the cache module rather than writing its on-disk shape
 * by hand. These tests hand-wrote `{ flags, timestamp }` and went red when the
 * cache moved to a per-flag timestamp -- a second copy of a format, which is
 * the thing this repo keeps paying for.
 */
function enableWrites() {
  writeFlag('kitchen_loop_ledger_writes', true);
}

/** Flour: held in grams, displayed in kilograms. */
const FLOUR: MovementItem = { id: 'flour', name: 'Flour', unit: 'kg', canonical_unit: 'g' };
const EGGS: MovementItem = { id: 'eggs', name: 'Eggs', unit: 'count', canonical_unit: 'count' };

describe('recordRestock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(storageBacking)) delete storageBacking[k];
    for (const k of Object.keys(tableData)) delete tableData[k];
    localStorage.clear();
    upserted = [];
    upsertOptions = [];
    upsertError = null;
    sessionUser = { id: 'user-1' };
    tableData['kids'] = [{ id: 'k1', name: 'Kid', age: 4, household_id: '11111111-1111-4111-8111-111111111111' }];
  });

  it('appends a purchase movement when ledger writes are on', async () => {
    enableWrites();
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));

    let result!: Awaited<ReturnType<Inventory['recordRestock']>>;
    await act(async () => {
      result = await inventory().recordRestock(FLOUR, 0.5, { refType: 'receipt', refId: 'rcpt-1' });
    });

    expect(result.recorded).toBe(true);
    expect(upserted).toHaveLength(1);
    const [row] = upserted[0];
    expect(row.item_id).toBe('flour');
    expect(row.reason).toBe('purchase');
    expect(row.delta).toBe(500);
    expect(row.display_quantity).toBe(0.5);
    expect(row.display_unit).toBe('kg');
    expect(row.ref_type).toBe('receipt');
    expect(row.ref_id).toBe('rcpt-1');
  });

  it('uses the unit passed in opts over the item display unit', async () => {
    enableWrites();
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));

    await act(async () => {
      await inventory().recordRestock(FLOUR, 250, { unit: 'g' });
    });

    const [row] = upserted[0];
    expect(row.delta).toBe(250);
    expect(row.display_unit).toBe('g');
    expect(row.ref_type).toBeNull();
  });

  it('records a known price with its currency on the purchase (item 22)', async () => {
    enableWrites();
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));

    await act(async () => {
      await inventory().recordRestock(EGGS, 12, { unitPrice: 0.35, currency: 'USD', refType: 'receipt' });
    });

    const [row] = upserted[0];
    expect(row.unit_price).toBe(0.35);
    expect(row.currency).toBe('USD');
  });

  it('drops a price that has no currency rather than storing half a pair', async () => {
    enableWrites();
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));

    await act(async () => {
      await inventory().recordRestock(EGGS, 12, { unitPrice: 0.35 });
    });

    const [row] = upserted[0];
    expect(row.unit_price).toBeNull();
    expect(row.currency).toBeNull();
  });

  it('attempts nothing when ledger writes are off', async () => {
    // 5a: off is the kill switch now, not the default.
    writeFlag('kitchen_loop_ledger_writes', false);
    const inventory = await mountInventory();
    expect(inventory().ledgerWritesEnabled).toBe(false);

    let result!: Awaited<ReturnType<Inventory['recordRestock']>>;
    await act(async () => {
      result = await inventory().recordRestock(EGGS, 6);
    });

    expect(result.recorded).toBe(false);
    expect(result.reason).toMatch(/off/);
    expect(upserted).toHaveLength(0);
  });
});
