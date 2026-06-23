import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// --- Supabase mock -------------------------------------------------------
const mockRpc = vi.fn();
const mockInsert = vi.fn();
const mockChannel = vi.fn(() => ({ on: () => ({ subscribe: () => ({}) }) }));
const mockRemoveChannel = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      insert: (...a: unknown[]) => mockInsert(...a),
    }),
    rpc: (...a: unknown[]) => mockRpc(...a),
    channel: (...a: unknown[]) => mockChannel(...a),
    removeChannel: (...a: unknown[]) => mockRemoveChannel(...a),
  },
}));

// Authenticated user/household so the merge takes the server (RPC) path.
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ userId: 'u1', householdId: 'h1' }),
}));

vi.mock('@/hooks/useRealtimeSubscription', () => ({
  registerSubscription: vi.fn(),
  unregisterSubscription: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GroceryProvider, useGrocery } from './GroceryContext';
import type { GroceryItem } from '@/types';

function wrapper({ children }: { children: React.ReactNode }) {
  return <GroceryProvider>{children}</GroceryProvider>;
}

function existing(over: Partial<GroceryItem>): GroceryItem {
  return {
    id: over.id ?? 'x',
    name: over.name ?? 'item',
    quantity: over.quantity ?? 1,
    unit: over.unit ?? 'lb',
    checked: over.checked ?? false,
    category: over.category ?? 'protein',
  } as GroceryItem;
}

describe('addGroceryItemsMerged — batched writes (US-334)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
    mockInsert.mockReturnValue({
      select: () => Promise.resolve({ data: [], error: null }),
    });
  });

  it('issues exactly ONE bulk rpc for an N-item merge (not N updates)', async () => {
    const { result } = renderHook(() => useGrocery(), { wrapper });

    // Seed three existing unchecked rows that the incoming lines will merge into.
    act(() => {
      result.current.setGroceryItemsState([
        existing({ id: 'a', name: 'ground beef', quantity: 1, unit: 'lb' }),
        existing({ id: 'b', name: 'milk', quantity: 1, unit: 'gal' }),
        existing({ id: 'c', name: 'eggs', quantity: 6, unit: 'count' }),
      ]);
    });

    act(() => {
      result.current.addGroceryItemsMerged([
        { name: 'ground beef', quantity: 1, unit: 'lb' },
        { name: 'milk', quantity: 1, unit: 'gal' },
        { name: 'eggs', quantity: 6, unit: 'count' },
      ]);
    });

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());

    // The whole point of US-334: one bulk request, not three.
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      'bump_grocery_item_quantities',
      expect.objectContaining({ p_updates: expect.any(Array) }),
    );
    // All three rows were bumped in the single call.
    const callArg = mockRpc.mock.calls[0][1] as { p_updates: unknown[] };
    expect(callArg.p_updates).toHaveLength(3);
  });

  it('applies the merged quantities optimistically in one render pass', async () => {
    const { result } = renderHook(() => useGrocery(), { wrapper });
    act(() => {
      result.current.setGroceryItemsState([
        existing({ id: 'a', name: 'ground beef', quantity: 1, unit: 'lb' }),
      ]);
    });
    act(() => {
      result.current.addGroceryItemsMerged([{ name: 'ground beef', quantity: 1, unit: 'lb' }]);
    });
    // 1 lb + 1 lb => 2 lb, merged onto the existing row (no duplicate inserted).
    await waitFor(() => {
      const beef = result.current.groceryItems.find((i) => i.id === 'a');
      expect(beef?.quantity).toBe(2);
    });
    expect(result.current.groceryItems).toHaveLength(1);
  });
});
