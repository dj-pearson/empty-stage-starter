import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { createElement } from 'react';
import { screen, within } from '@testing-library/react';
import '@/i18n';
import { grocery, groceryRow, resetGroceryHarness, renderWithShell } from '@/test/groceryPageHarness';

/**
 * What a screen reader gets from the grocery list.
 *
 * aria-live used to sit on the progress block AND on both list containers, so
 * one check-off re-read the progress line and then the whole list, three live
 * regions talking over each other. The page now has one polite role="status",
 * written (debounced) when an item is checked off.
 */

vi.mock('@/contexts/AppContext', async () => (await import('@/test/groceryPageHarness')).appContextMock);
vi.mock('@/hooks/usePlanToGrocery', async () => (await import('@/test/groceryPageHarness')).planToGroceryMock);
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ userId: 'u1', householdId: 'h1' }) }));
vi.mock('@/hooks/useHousehold', () => ({ useHousehold: () => ({ members: [] }) }));
vi.mock('@/hooks/usePendingGroceryIds', () => ({
  usePendingGroceryIds: () => ({ ids: new Set<string>(), count: 0 }),
}));
vi.mock('@/hooks/useGroceryLists', async () => (await import('@/test/groceryPageHarness')).groceryListsMock);
vi.mock('@/hooks/useStoreLayouts', () => ({
  useStoreLayouts: () => ({ walkContext: null, rememberAisle: vi.fn(), stores: [], selectedStore: null, aisles: [], setSelectedStoreId: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/components/grocery/StorePicker', () => ({ StorePicker: () => null }));
vi.mock('@/components/grocery/PlaceInAisleChips', () => ({ PlaceInAisleChips: () => null }));
vi.mock('@/components/grocery/GroceryQuickAdd', () => ({ GroceryQuickAdd: () => null }));
vi.mock('@/components/SmartRestockSuggestions', () => ({ SmartRestockSuggestions: () => null }));
vi.mock('@/components/GroceryListSelector', async () => ({
  GroceryListSelector: (await import('@/test/groceryPageHarness')).StubListSelector,
}));
vi.mock('@/components/CreateGroceryListDialog', () => ({ CreateGroceryListDialog: () => null }));
vi.mock('@/components/ManageGroceryListsDialog', () => ({ ManageGroceryListsDialog: () => null }));
vi.mock('@/components/EditGroceryItemDialog', () => ({ EditGroceryItemDialog: () => null }));
vi.mock('@/lib/analytics', () => ({ analytics: { trackEvent: vi.fn() } }));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() }),
}));

import Grocery from './Grocery';

const read = (rel: string) => readFileSync(path.resolve(__dirname, '../..', rel), 'utf-8');

describe('Grocery screen-reader surface', () => {
  beforeEach(() => {
    resetGroceryHarness();
    grocery.items = [
      groceryRow({ id: 'a1', name: 'Whole milk', aisle: 'Dairy' }),
      groceryRow({ id: 'a2', name: 'Frozen peas', aisle: 'Frozen' }),
      groceryRow({ id: 'a3', name: 'Apples', checked: true, aisle: 'Produce' }),
    ];
  });

  it('has exactly one live region, a role=status', async () => {
    const { container } = renderWithShell(createElement(Grocery));
    await screen.findByText('Whole milk');
    expect(container.querySelectorAll('[aria-live]:not([role="status"])')).toHaveLength(0);
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it('names every check-off control after its item', async () => {
    renderWithShell(createElement(Grocery));
    expect(await screen.findByRole('checkbox', { name: /Whole milk/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Frozen peas/ })).toBeInTheDocument();
  });

  it('makes each aisle a heading', async () => {
    renderWithShell(createElement(Grocery));
    await screen.findByText('Whole milk');
    expect(screen.getByRole('heading', { name: /Dairy/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Frozen/ })).toBeInTheDocument();
  });

  it('names the list section', async () => {
    renderWithShell(createElement(Grocery));
    const list = await screen.findByRole('region', { name: /shopping list/i });
    expect(within(list).getByText('Whole milk')).toBeInTheDocument();
  });

  it('puts no aria-live on the list containers in either renderer', () => {
    // The virtual path only renders above 60 rows; guard its source too.
    const source = read('src/pages/Grocery.tsx');
    expect(source).not.toMatch(/aria-live=/);
  });
});

describe('touch target sizing (US-576 / US-043)', () => {
  it('registers the pointer-coarse variant, or the classes silently no-op', () => {
    const config = read('tailwind.config.ts');
    expect(config).toMatch(/addVariant\(\s*["']pointer-coarse["']\s*,\s*["']@media \(pointer: coarse\)["']\s*\)/);
  });

  it('still forces 44px minimum touch targets on coarse pointers', () => {
    const css = read('src/index.css');
    const coarseBlock = css.slice(css.indexOf('@media (pointer: coarse)'));
    expect(coarseBlock).toMatch(/min-height:\s*44px/);
    expect(coarseBlock).toMatch(/min-width:\s*44px/);
  });

  it('gives the toolbar controls a 44px box without leaning on that rule', () => {
    const source = read('src/pages/Grocery.tsx');
    expect(source).not.toMatch(/pointer-coarse:h-\d/);
    // Add and the overflow trigger are h-11 (44px) at every width.
    expect(source).toMatch(/className="h-11 shrink-0 px-4"/);
    expect(source).toMatch(/className="h-11 w-11 shrink-0"/);
  });
});
