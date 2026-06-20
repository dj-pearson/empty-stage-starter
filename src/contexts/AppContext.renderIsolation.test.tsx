/**
 * US-331: render-isolation regression test.
 *
 * The AppContext split (US-012) moved each domain into its own independently
 * memoized context (FoodsContext, KidsContext, GroceryContext, ...). The value
 * of that split is only realized if a component that subscribes to one domain
 * does NOT re-render when an unrelated domain changes.
 *
 * This test renders a foods-only consumer (useFoods) and a grocery consumer
 * (useGrocery) under the same provider tree, mutates grocery state, and asserts
 * the foods-only consumer did not re-render. If a future change re-merges the
 * domains behind one shared context value, this test fails.
 */
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { AppProvider, useFoods, useGrocery } from './AppContext';

// Mock Supabase client - all operations return empty/success by default
const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: (...args: unknown[]) => mockFrom(...args),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock('@/lib/platform', () => ({
  getStorage: vi.fn().mockResolvedValue({
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  }),
  isWeb: vi.fn().mockReturnValue(true),
  isMobile: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    withContext: vi.fn().mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock('@/hooks/useRealtimeSubscription', () => ({
  registerSubscription: vi.fn(),
  unregisterSubscription: vi.fn(),
}));

describe('US-331: domain context render isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('toggling a grocery item does not re-render a foods-only consumer', async () => {
    const foodsRenders = vi.fn();
    const groceryRenders = vi.fn();

    // expose the grocery API to the test so it can mutate state from outside.
    let groceryApi: ReturnType<typeof useGrocery> | null = null;

    function FoodsOnly() {
      const { foods } = useFoods();
      foodsRenders();
      return <div data-testid="foods-count">{foods.length}</div>;
    }

    function GroceryOnly() {
      const grocery = useGrocery();
      groceryApi = grocery;
      groceryRenders();
      return <div data-testid="grocery-count">{grocery.groceryItems.length}</div>;
    }

    render(
      <AppProvider>
        <FoodsOnly />
        <GroceryOnly />
      </AppProvider>
    );

    // Wait for the initial load effect (starter foods) to settle.
    await waitFor(() => {
      expect(foodsRenders).toHaveBeenCalled();
      expect(groceryApi).not.toBeNull();
    });

    const foodsRendersBefore = foodsRenders.mock.calls.length;

    // Add a grocery item — a grocery-domain mutation only.
    await act(async () => {
      groceryApi!.addGroceryItem({ name: 'Milk', category: 'dairy', quantity: 1, unit: 'ct' });
    });

    await waitFor(() => {
      expect(groceryRenders.mock.calls.length).toBeGreaterThan(0);
    });

    // The foods-only consumer must NOT have re-rendered from the grocery change.
    expect(foodsRenders.mock.calls.length).toBe(foodsRendersBefore);
  });
});
