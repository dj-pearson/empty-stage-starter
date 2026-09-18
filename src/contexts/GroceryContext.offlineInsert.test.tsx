import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

/**
 * US-823: adding an item with no signal.
 *
 * This is the story's own sentence -- "a parent ADDING items to the grocery
 * list in a store with no signal" -- and it was the one write the web queue
 * refused, because the database owned the row id. A queued insert would have
 * replayed under an id the optimistic row did not have and come back over
 * realtime as a second row. buildGroceryRow generates the uuid now, so the
 * optimistic row and the server row are the same row.
 */

const mockInsert = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ insert: (...a: unknown[]) => mockInsert(...a) }),
    rpc: vi.fn(),
    channel: vi.fn(() => ({ on: () => ({ subscribe: () => ({}) }) })),
    removeChannel: vi.fn(),
  },
}));

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

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (m: string) => toastSuccess(m),
    error: (m: string) => toastError(m),
    info: vi.fn(),
  },
}));

import { GroceryProvider, useGrocery } from './GroceryContext';
import { pendingWebOps } from '@/lib/webSyncQueue';

function wrapper({ children }: { children: React.ReactNode }) {
  return <GroceryProvider>{children}</GroceryProvider>;
}

/** `.insert(row).select().single()` resolving to whatever the test wants. */
function insertResolves(result: { data: unknown; error: unknown }) {
  mockInsert.mockImplementation((row: Record<string, unknown>) => ({
    select: () => ({
      single: () => Promise.resolve(result.data === 'echo' ? { data: row, error: null } : result),
    }),
  }));
}

const DRAFT = { name: 'Oat milk', quantity: 2, unit: 'l', category: 'dairy' as const };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('adding a grocery item offline', () => {
  it('keeps the row on screen and queues it, rather than telling the user it was lost', async () => {
    insertResolves({ data: null, error: { message: 'Failed to fetch' } });

    const { result } = renderHook(() => useGrocery(), { wrapper });
    act(() => result.current.addGroceryItem(DRAFT));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(result.current.groceryItems.map((i) => i.name)).toEqual(['Oat milk']);

    const queued = await pendingWebOps('u1');
    expect(queued.map((o) => o.kind)).toEqual(['grocery.insert']);

    // THE POINT: the op names the same row the user is looking at, so the
    // replay cannot come back as a second item.
    const row = (queued[0].payload as { row: { id: string; name: string } }).row;
    expect(row.name).toBe('Oat milk');
    expect(row.id).toBe(result.current.groceryItems[0].id);
  });

  it('still rolls back a rejection the server actually issued (US-717)', async () => {
    // A status means the server answered, so this is not an offline failure and
    // the row must not stay: an item that looks added and exists nowhere else
    // is the bug US-717 fixed.
    insertResolves({ data: null, error: { status: 403, message: 'row-level security' } });

    const { result } = renderHook(() => useGrocery(), { wrapper });
    act(() => result.current.addGroceryItem(DRAFT));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(result.current.groceryItems).toEqual([]);
    expect(await pendingWebOps('u1')).toEqual([]);
  });

  it('folds the server row over the optimistic one instead of listing both', async () => {
    insertResolves({ data: 'echo', error: null });

    const { result } = renderHook(() => useGrocery(), { wrapper });
    act(() => result.current.addGroceryItem(DRAFT));

    await waitFor(() => expect(result.current.groceryItems).toHaveLength(1));
    expect(result.current.groceryItems[0].name).toBe('Oat milk');
    expect(await pendingWebOps('u1')).toEqual([]);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('sends an id with the insert so the row is named before it leaves the client', async () => {
    insertResolves({ data: 'echo', error: null });

    const { result } = renderHook(() => useGrocery(), { wrapper });
    act(() => result.current.addGroceryItem(DRAFT));

    await waitFor(() => expect(mockInsert).toHaveBeenCalled());
    const sent = mockInsert.mock.calls[0][0] as { id?: string };
    expect(typeof sent.id).toBe('string');
    expect(sent.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
