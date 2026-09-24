/* eslint-disable react-refresh/only-export-components -- test fixtures, never hot-reloaded */
/**
 * Shared fixtures for the Grocery page tests (checkout, plan CTA, mount).
 *
 * vi.mock is hoisted per file, so each test file still declares its own mocks;
 * their factories return the objects built here, which read the mutable
 * `grocery` state at call time. Reset it in beforeEach with resetGroceryHarness.
 */
import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import type { Food, GroceryItem, Kid, PlanEntry } from "@/types";
import type { PlanToGroceryPreview, PlanToGroceryResult } from "@/hooks/usePlanToGrocery";
import type { GroceryMergeResult } from "@/contexts/GroceryContext";

export const LIST_A = "list-a";
export const LIST_B = "list-b";

export function groceryRow(overrides: Partial<GroceryItem> & Pick<GroceryItem, "id" | "name">): GroceryItem {
  return {
    quantity: 1,
    unit: "",
    checked: false,
    category: "snack",
    grocery_list_id: LIST_A,
    ...overrides,
  };
}

interface PurchaseResult {
  recorded: boolean;
  count: number;
  reason: string | null;
  skipped: Array<{ reason: string; itemId: string | null; groceryItemId: string }>;
  recordedRowIds: string[];
}

const emptyMerge = (): GroceryMergeResult => ({ touched: 0, insertedIds: [], bumps: [] });

export const grocery = {
  items: [] as GroceryItem[],
  hydrated: true,
  foods: [] as Food[],
  kids: [] as Kid[],
  ledger: false,
  /** The list on screen; null leaves every list showing. */
  selectList: LIST_A as string | null,
  preview: { toAdd: 0, alreadyHave: 0, onList: 0 } as PlanToGroceryPreview,
  fns: {
    addFood: vi.fn(async () => true),
    updateFood: vi.fn(),
    toggleGroceryItem: vi.fn(),
    updateGroceryItem: vi.fn(),
    deleteGroceryItem: vi.fn(),
    deleteGroceryItems: vi.fn(),
    clearCheckedGroceryItems: vi.fn(),
    setGroceryItems: vi.fn(),
    addGroceryItem: vi.fn(),
    mergeGroceryItems: vi.fn(emptyMerge),
    restoreGroceryItems: vi.fn(),
    recordPurchases: vi.fn(
      async (_rows: unknown[], _foods: unknown[], _resolve?: unknown): Promise<PurchaseResult> => ({
        recorded: false, count: 0, reason: "ledger writes are off", skipped: [], recordedRowIds: [],
      }),
    ),
    recordPurchaseReversal: vi.fn(async (_rows: unknown[], _foods: unknown[], _resolve?: unknown) => ({
      recorded: true, count: 0, reason: null,
    })),
    previewPlan: vi.fn((): PlanToGroceryPreview => grocery.preview),
    pushPlan: vi.fn(
      (): PlanToGroceryResult => ({
        added: 0, retired: 0, kept: 0, insertedIds: [], generated: 0, retiredRows: [], bumps: [],
      }),
    ),
  },
};

export function resetGroceryHarness() {
  grocery.items = [];
  grocery.hydrated = true;
  grocery.foods = [];
  grocery.kids = [];
  grocery.ledger = false;
  grocery.selectList = LIST_A;
  grocery.preview = { toAdd: 0, alreadyHave: 0, onList: 0 };
  planEntries.length = 0;
  for (const fn of Object.values(grocery.fns)) fn.mockClear();
}

// Stable identities: the page memoizes on these, as it does on the real ones.
/** Mutable in place (push/length = 0): the page holds the array by identity. */
export const planEntries: PlanEntry[] = [];

const stable = {
  catalogById: {},
  plan: { planEntries },
  recipes: { recipes: [] },
};

export const appContextMock = {
  useFoods: () => ({
    foods: grocery.foods,
    addFood: grocery.fns.addFood,
    updateFood: grocery.fns.updateFood,
    catalogById: stable.catalogById,
  }),
  useInventory: () => ({
    ledgerWritesEnabled: grocery.ledger,
    recordPurchases: grocery.fns.recordPurchases,
    recordPurchaseReversal: grocery.fns.recordPurchaseReversal,
  }),
  useKids: () => ({ kids: grocery.kids, activeKidId: null }),
  usePlan: () => stable.plan,
  useRecipes: () => stable.recipes,
  useGrocery: () => ({
    groceryItems: grocery.items,
    groceryHydrated: grocery.hydrated,
    ...grocery.fns,
  }),
};

export const planToGroceryMock = {
  usePlanToGrocery: () => ({ preview: grocery.fns.previewPlan, push: grocery.fns.pushPlan }),
};

const listFns = {
  setSelectedListId: vi.fn(),
  refresh: vi.fn(async () => {}),
  upsertLocal: vi.fn(),
  removeLocal: vi.fn(),
};

/** useGroceryLists: `grocery.selectList` is on screen and LIST_A is the default. */
export const groceryListsMock = {
  useGroceryLists: () => ({
    lists: [],
    selectedListId: grocery.selectList,
    defaultListId: LIST_A,
    loading: false,
    error: false,
    ...listFns,
  }),
};

export function StubListSelector() {
  return <div data-testid="stub-GroceryListSelector" aria-label="Grocery list" />;
}

export function renderWithShell(node: React.ReactNode) {
  return render(
    <HelmetProvider>
      <MemoryRouter>{node}</MemoryRouter>
    </HelmetProvider>,
  );
}
