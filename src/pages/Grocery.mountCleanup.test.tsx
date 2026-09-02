import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import React from 'react';

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

const deleteGroceryItem = vi.fn();
const deleteGroceryItems = vi.fn();
const clearCheckedGroceryItems = vi.fn();
const setGroceryItems = vi.fn();

const CHECKED_ITEM = {
  id: 'g1',
  name: 'Milk',
  category: 'dairy',
  quantity: 1,
  unit: 'gal',
  checked: true,
  is_manual: true,
  grocery_list_id: null,
};

const UNCHECKED_ITEM = {
  ...CHECKED_ITEM,
  id: 'g2',
  name: 'Bread',
  category: 'bakery',
  checked: false,
};

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods: [], addFood: vi.fn(), updateFood: vi.fn() }),
  useInventory: () => ({
    ledgerWritesEnabled: false,
    recordPurchases: vi.fn(),
    recordPurchaseReversal: vi.fn(),
  }),
  useKids: () => ({ kids: [], activeKidId: null }),
  usePlan: () => ({ planEntries: [] }),
  useRecipes: () => ({ recipes: [] }),
  useGrocery: () => ({
    groceryItems: [CHECKED_ITEM, UNCHECKED_ITEM],
    setGroceryItems,
    addGroceryItem: vi.fn(),
    toggleGroceryItem: vi.fn(),
    updateGroceryItem: vi.fn(),
    deleteGroceryItem,
    deleteGroceryItems,
    clearCheckedGroceryItems,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

vi.mock('@/lib/analytics', () => ({ analytics: { track: vi.fn(), page: vi.fn() } }));
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
vi.mock('@/components/CreateGroceryListDialog', () => ({
  CreateGroceryListDialog: () => <div data-testid="stub-CreateGroceryListDialog" />,
}));
vi.mock('@/components/ManageGroceryListsDialog', () => ({
  ManageGroceryListsDialog: () => <div data-testid="stub-ManageGroceryListsDialog" />,
}));
vi.mock('@/components/CreateStoreLayoutDialog', () => ({
  CreateStoreLayoutDialog: () => <div data-testid="stub-CreateStoreLayoutDialog" />,
}));
vi.mock('@/components/ManageStoreLayoutsDialog', () => ({
  ManageStoreLayoutsDialog: () => <div data-testid="stub-ManageStoreLayoutsDialog" />,
}));
vi.mock('@/components/ManageStoreAislesDialog', () => ({
  ManageStoreAislesDialog: () => <div data-testid="stub-ManageStoreAislesDialog" />,
}));
vi.mock('@/components/AisleContributionDialog', () => ({
  AisleContributionDialog: () => <div data-testid="stub-AisleContributionDialog" />,
}));
vi.mock('@/components/ImportRecipeToGroceryDialog', () => ({
  ImportRecipeToGroceryDialog: () => <div data-testid="stub-ImportRecipeToGroceryDialog" />,
}));
vi.mock('@/components/ScanReceiptDialog', () => ({
  ScanReceiptDialog: () => <div data-testid="stub-ScanReceiptDialog" />,
}));
vi.mock('@/components/AddGroceryItemDialog', () => ({
  AddGroceryItemDialog: () => <div data-testid="stub-AddGroceryItemDialog" />,
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
  beforeEach(() => vi.clearAllMocks());

  it('deletes nothing when the cache hands it pre-checked items', async () => {
    renderGrocery();

    // Let every mount effect settle, including the async user/household load.
    await waitFor(() => expect(screen.getByText('Bread')).toBeInTheDocument());

    expect(deleteGroceryItems).not.toHaveBeenCalled();
    expect(deleteGroceryItem).not.toHaveBeenCalled();
    expect(clearCheckedGroceryItems).not.toHaveBeenCalled();
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
    // itself. What proves the item survived is the section and its count.
    expect(screen.getByText('Purchased')).toBeInTheDocument();
    expect(screen.getByText(/move 1 to pantry/i)).toBeInTheDocument();
  });

  it('expands the Purchased section to reveal the checked row', async () => {
    const user = userEvent.setup();
    renderGrocery();
    await waitFor(() => expect(screen.getByText('Bread')).toBeInTheDocument());

    await user.click(screen.getByText('Purchased'));
    expect(await screen.findByText('Milk')).toBeInTheDocument();
    expect(deleteGroceryItems).not.toHaveBeenCalled();
  });
});
