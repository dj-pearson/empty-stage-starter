/**
 * 5a: ledger writes default on, the server flag stays authoritative, and a
 * pantry correction is measured from the ledger balance.
 *
 * Harness copied from InventoryContext.append.test.tsx, with the flag RPC made
 * answerable so the kill switch can be exercised the way production reaches
 * it (evaluate_feature_flag), not only through the local cache.
 */
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { AppProvider, useInventory } from './AppContext';
import { correctionBaseline, type MovementItem } from '@/lib/movementBuilders';
import type { ComparableItem } from '@/lib/stockComparison';

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';

const tableData: Record<string, unknown[]> = {};
let sessionUser: { id: string } | null = null;
let upserted: Record<string, unknown>[][] = [];
/** What evaluate_feature_flag answers; null means "no answer" (RPC down). */
let flagAnswer: boolean | null = null;

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ['select', 'eq', 'order', 'range', 'limit', 'gte', 'lte', 'insert', 'update', 'delete']) {
    builder[m] = vi.fn(chain);
  }
  builder.upsert = vi.fn((rows: Record<string, unknown>[]) => {
    if (table === 'inventory_movements') upserted.push(Array.isArray(rows) ? rows : [rows]);
    return Promise.resolve({ data: null, error: null });
  });
  // The direct feature_flags fallback: an error, so the hook falls through to
  // cache-or-default exactly as it does when the table cannot be reached.
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: { message: 'unreachable' } }));
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
    rpc: vi.fn((fn: string, args?: { p_flag_key?: string }) => {
      if (fn === 'get_user_household_id') return Promise.resolve({ data: HOUSEHOLD, error: null });
      if (fn === 'ensure_user_household') return Promise.resolve({ data: HOUSEHOLD, error: null });
      if (fn === 'evaluate_feature_flag' && args?.p_flag_key === 'kitchen_loop_ledger_writes') {
        return Promise.resolve({ data: flagAnswer, error: null });
      }
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

/** Flour: held in grams, displayed in kilograms. */
const FLOUR: MovementItem & { quantity: number } = {
  id: 'flour', name: 'Flour', unit: 'kg', canonical_unit: 'g', quantity: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(storageBacking)) delete storageBacking[k];
  for (const k of Object.keys(tableData)) delete tableData[k];
  localStorage.clear();
  upserted = [];
  flagAnswer = null;
  sessionUser = { id: 'user-1' };
});

describe('correctionBaseline', () => {
  const item: ComparableItem = { id: 'flour', unit: 'kg', canonical_unit: 'g', quantity: 5 };

  it('measures from the ledger balance when there is one', () => {
    expect(correctionBaseline(item, () => 1.5)).toBe(1.5);
  });

  it('falls back to foods.quantity when the ledger has no renderable balance', () => {
    expect(correctionBaseline(item, () => null)).toBe(5);
  });

  it('treats a missing or non-finite quantity as zero', () => {
    expect(correctionBaseline({ id: 'x', quantity: null }, () => null)).toBe(0);
    expect(correctionBaseline({ id: 'x', quantity: Number.NaN }, () => Number.NaN)).toBe(0);
  });
});

describe('5a: kitchen_loop_ledger_writes', () => {
  it('is on when the server says so', async () => {
    flagAnswer = true;
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));
  });

  it('honours the kill switch: the server answering false beats the default', async () => {
    flagAnswer = false;
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(false));

    await act(async () => {
      await inventory().recordRestock(FLOUR, 1);
    });
    expect(upserted).toEqual([]);
  });

  it('falls back to on when the flag cannot be evaluated at all', async () => {
    flagAnswer = null;
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));
  });
});

describe('5a: a pantry correction is measured from item_stock', () => {
  it('records newQuantity minus the ledger balance, not minus foods.quantity', async () => {
    flagAnswer = true;
    // The ledger holds 1.5 kg; foods.quantity (an INTEGER column) reads 2.
    tableData.item_stock = [
      { item_id: 'flour', household_id: HOUSEHOLD, on_hand_canonical: 1500, canonical_unit: 'g', mirror_unconvertible: false },
    ];
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));
    await waitFor(async () => {
      await act(async () => { await inventory().refreshInventory(); });
      expect(inventory().ledgerQuantityOf(FLOUR)).toBe(1.5);
    });

    let recorded = false;
    await act(async () => {
      recorded = (await inventory().recordPantryCorrection(FLOUR, 2)).recorded;
    });

    // Measured from foods.quantity this would be 2 - 2 = nothing to record,
    // and the parent's edit would vanish while the pantry kept saying 1.5.
    expect(recorded).toBe(true);
    const [row] = upserted[0];
    expect(row.reason).toBe('correction');
    expect(row.delta).toBe(500);
    expect(row.display_quantity).toBe(0.5);
  });

  it('uses foods.quantity when the item has no stock row', async () => {
    flagAnswer = true;
    const inventory = await mountInventory();
    await waitFor(() => expect(inventory().ledgerWritesEnabled).toBe(true));

    await act(async () => {
      await inventory().recordPantryCorrection(FLOUR, 3);
    });

    const [row] = upserted[0];
    expect(row.delta).toBe(1000);
  });
});
