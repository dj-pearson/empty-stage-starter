import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import React from 'react';
import '@/i18n';
import { grocery, groceryRow, resetGroceryHarness } from '@/test/groceryPageHarness';

/**
 * US-712: checked grocery rows must survive a reload.
 *
 * The page used to run a mount effect that called deleteGroceryItems on every
 * checked row and toasted "Items were already added to your pantry". Both
 * halves were wrong: nothing had been credited to the pantry, and a shopper who
 * reloaded mid-trip lost the record of what was already in the cart. Checkout
 * is the only path that may remove them.
 *
 * This test renders the real page with pre-checked items already in the store,
 * the way a reload hands them over from cache, and asserts nothing is deleted.
 */

const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null });

const CHECKED_ITEM = groceryRow({
  id: 'g1',
  name: 'Milk',
  category: 'dairy',
  unit: 'gal',
  checked: true,
  grocery_list_id: undefined,
});

const UNCHECKED_ITEM = groceryRow({
  id: 'g2',
  name: 'Bread',
  category: 'carb',
  unit: 'gal',
  grocery_list_id: undefined,
});

vi.mock('@/contexts/AppContext', async () => (await import('@/test/groceryPageHarness')).appContextMock);
vi.mock('@/hooks/usePlanToGrocery', async () => (await import('@/test/groceryPageHarness')).planToGroceryMock);
// The session comes from AuthContext. The page used to run its own getUser()
// here, which rejects offline and took the Add button down with it.
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ userId: 'u1', householdId: 'h1' }) }));
vi.mock('@/hooks/useHousehold', () => ({ useHousehold: () => ({ members: [] }) }));
vi.mock('@/hooks/usePendingGroceryIds', () => ({
  usePendingGroceryIds: () => ({ ids: new Set<string>(), count: 0 }),
}));
vi.mock('@/hooks/useGroceryLists', async () => (await import('@/test/groceryPageHarness')).groceryListsMock);
vi.mock('@/hooks/useStoreLayouts', () => ({
  useStoreLayouts: () => ({ walkContext: null, rememberAisle: vi.fn(), stores: [], selectedStore: null, aisles: [], setSelectedStoreId: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

vi.mock('@/lib/analytics', () => ({ analytics: { trackEvent: vi.fn(), track: vi.fn(), page: vi.fn() } }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const toastInfo = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    info: (...a: unknown[]) => toastInfo(...a),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

// Child components that own their own data fetching. Not under test here, and
// each one would otherwise need its own supabase surface mocked. The factories
// are inlined because vi.mock is hoisted above any local helper.
vi.mock('@/components/SmartRestockSuggestions', () => ({
  SmartRestockSuggestions: () => <div data-testid="stub-SmartRestockSuggestions" />,
}));
vi.mock('@/components/GroceryListSelector', () => ({
  GroceryListSelector: () => <div data-testid="stub-GroceryListSelector" />,
}));
vi.mock('@/components/grocery/GroceryQuickAdd', () => ({ GroceryQuickAdd: () => null }));
vi.mock('@/components/grocery/StorePicker', () => ({ StorePicker: () => null }));
vi.mock('@/components/grocery/PlaceInAisleChips', () => ({ PlaceInAisleChips: () => null }));
vi.mock('@/components/CreateGroceryListDialog', () => ({
  CreateGroceryListDialog: () => <div data-testid="stub-CreateGroceryListDialog" />,
}));
vi.mock('@/components/ManageGroceryListsDialog', () => ({
  ManageGroceryListsDialog: () => <div data-testid="stub-ManageGroceryListsDialog" />,
}));
vi.mock('@/components/EditGroceryItemDialog', () => ({
  EditGroceryItemDialog: () => <div data-testid="stub-EditGroceryItemDialog" />,
}));

import Grocery from './Grocery';

function renderGrocery() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Grocery />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('Grocery page mount (US-712)', () => {
  beforeEach(() => {
    resetGroceryHarness();
    getUser.mockClear();
    toastInfo.mockClear();
    grocery.items = [CHECKED_ITEM, UNCHECKED_ITEM];
  });

  it('deletes nothing when the cache hands it pre-checked items', async () => {
    renderGrocery();

    // Let every mount effect settle, including the async user/household load.
    await waitFor(() => expect(screen.getByText('Bread')).toBeInTheDocument());

    expect(grocery.fns.deleteGroceryItems).not.toHaveBeenCalled();
    expect(grocery.fns.deleteGroceryItem).not.toHaveBeenCalled();
    expect(grocery.fns.clearCheckedGroceryItems).not.toHaveBeenCalled();
  });

  it('does not claim the checked items were added to the pantry', async () => {
    renderGrocery();
    await waitFor(() => expect(screen.getByText('Bread')).toBeInTheDocument());

    const messages = toastInfo.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => /purchased item/i.test(m))).toBe(false);
  });

  it('keeps the checked item in a collapsed Purchased section', async () => {
    renderGrocery();
    await waitFor(() => expect(screen.getByText('Bread')).toBeInTheDocument());

    // The section is collapsed by default, so Radix has not mounted the row
    // itself. What proves the item survived is the section and the checkout
    // bar's count.
    expect(screen.getByText(/^Purchased/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear 1 bought/i })).toBeInTheDocument();
  });

  it('expands the Purchased section to reveal the checked row', async () => {
    const user = userEvent.setup();
    renderGrocery();
    await waitFor(() => expect(screen.getByText('Bread')).toBeInTheDocument());

    await user.click(screen.getByText(/^Purchased/));
    expect(await screen.findByText('Milk')).toBeInTheDocument();
    expect(grocery.fns.deleteGroceryItems).not.toHaveBeenCalled();
  });

  it('never asks supabase.auth for the user on mount', async () => {
    renderGrocery();
    await waitFor(() => expect(screen.getByText('Bread')).toBeInTheDocument());
    expect(getUser).not.toHaveBeenCalled();
  });

  it('keeps Add on screen even when a getUser() call would have rejected', async () => {
    getUser.mockRejectedValue(new Error('offline'));
    renderGrocery();
    expect(await screen.findByRole('button', { name: /^Add$/ })).toBeInTheDocument();
  });
});
