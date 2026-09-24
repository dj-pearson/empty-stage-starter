import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import "@/i18n";
import { grocery, groceryRow, planEntries, resetGroceryHarness, renderWithShell } from "@/test/groceryPageHarness";
import type { PlanEntry } from "@/types";

/**
 * The plan call to action, and the empty/loading distinction.
 *
 * The banner's count comes from usePlanToGrocery().preview() with the same
 * options the push uses, so "needs 6 things" adds six. Add never retires rows
 * (additive); the Undo takes back exactly what the push did: its inserts, its
 * retirements and its quantity bumps.
 */

vi.mock("@/contexts/AppContext", async () => (await import("@/test/groceryPageHarness")).appContextMock);
vi.mock("@/hooks/usePlanToGrocery", async () => (await import("@/test/groceryPageHarness")).planToGroceryMock);
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ userId: "u1", householdId: "h1" }) }));
vi.mock("@/hooks/useHousehold", () => ({ useHousehold: () => ({ members: [] }) }));
vi.mock("@/hooks/usePendingGroceryIds", () => ({
  usePendingGroceryIds: () => ({ ids: new Set<string>(), count: 0 }),
}));
vi.mock("@/hooks/useGroceryLists", async () => (await import("@/test/groceryPageHarness")).groceryListsMock);
vi.mock("@/hooks/useStoreLayouts", () => ({
  useStoreLayouts: () => ({ walkContext: null, rememberAisle: vi.fn(), stores: [], selectedStore: null, aisles: [], setSelectedStoreId: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/grocery/StorePicker", () => ({ StorePicker: () => null }));
vi.mock("@/components/grocery/PlaceInAisleChips", () => ({ PlaceInAisleChips: () => null }));
vi.mock("@/components/grocery/GroceryQuickAdd", () => ({ GroceryQuickAdd: () => null }));
vi.mock("@/components/SmartRestockSuggestions", () => ({ SmartRestockSuggestions: () => null }));
vi.mock("@/components/GroceryListSelector", async () => ({
  GroceryListSelector: (await import("@/test/groceryPageHarness")).StubListSelector,
}));
vi.mock("@/components/CreateGroceryListDialog", () => ({ CreateGroceryListDialog: () => null }));
vi.mock("@/components/ManageGroceryListsDialog", () => ({ ManageGroceryListsDialog: () => null }));
vi.mock("@/components/EditGroceryItemDialog", () => ({ EditGroceryItemDialog: () => null }));
vi.mock("@/lib/analytics", () => ({ analytics: { trackEvent: vi.fn() } }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import Grocery from "./Grocery";

const PLAN_ENTRY = { id: "p1", kid_id: "k1", food_id: "f1", date: "2026-09-24", meal_slot: "dinner" } as PlanEntry;

describe("Grocery plan call to action", () => {
  beforeEach(() => {
    resetGroceryHarness();
    toastSuccess.mockClear();
    grocery.items = [groceryRow({ id: "a1", name: "Bread" })];
  });

  it("is hidden when the plan needs nothing", async () => {
    grocery.preview = { toAdd: 0, alreadyHave: 3, onList: 2 };
    renderWithShell(<Grocery />);
    await screen.findByText("Bread");
    expect(screen.queryByTestId("grocery-plan-banner")).not.toBeInTheDocument();
  });

  it("shows how many things the plan needs", async () => {
    grocery.preview = { toAdd: 6, alreadyHave: 2, onList: 0 };
    renderWithShell(<Grocery />);
    const banner = await screen.findByTestId("grocery-plan-banner");
    expect(banner).toHaveTextContent(/needs 6 things/i);
  });

  it("previews and pushes with one set of options, and Add is additive", async () => {
    grocery.preview = { toAdd: 2, alreadyHave: 0, onList: 0 };
    planEntries.push(PLAN_ENTRY);
    renderWithShell(<Grocery />);
    const banner = await screen.findByTestId("grocery-plan-banner");
    fireEvent.click(banner.querySelector("button")!);

    expect(grocery.fns.pushPlan).toHaveBeenCalledTimes(1);
    const [, , pushOpts] = grocery.fns.pushPlan.mock.calls[0] as unknown as [unknown, unknown, Record<string, unknown>];
    expect(pushOpts.mode).toBe("additive");
    const [, , previewOpts] = grocery.fns.previewPlan.mock.calls.at(-1) as unknown as [unknown, unknown, Record<string, unknown>];
    const { mode: _mode, ...rest } = pushOpts;
    expect(rest).toEqual(previewOpts);
  });

  it("Undo deletes the inserted rows, restores retired ones and reverts bumps", async () => {
    grocery.preview = { toAdd: 2, alreadyHave: 0, onList: 0 };
    planEntries.push(PLAN_ENTRY);
    const retired = groceryRow({ id: "old", name: "Tofu", auto_generated: true });
    grocery.fns.pushPlan.mockReturnValueOnce({
      added: 2, retired: 1, kept: 0, generated: 2,
      insertedIds: ["n1", "n2"],
      retiredRows: [retired],
      bumps: [{ id: "a1", prev: { quantity: 1, unit: "", name: "Bread" } }],
    });

    renderWithShell(<Grocery />);
    const banner = await screen.findByTestId("grocery-plan-banner");
    fireEvent.click(banner.querySelector("button")!);

    const [, opts] = toastSuccess.mock.calls[0] as [string, { action: { onClick: () => void } }];
    act(() => opts.action.onClick());
    expect(grocery.fns.deleteGroceryItems).toHaveBeenCalledWith(["n1", "n2"]);
    expect(grocery.fns.restoreGroceryItems).toHaveBeenCalledWith([retired]);
    expect(grocery.fns.updateGroceryItem).toHaveBeenCalledWith("a1", { quantity: 1, unit: "", name: "Bread" });
  });
});

describe("Grocery empty state", () => {
  beforeEach(() => {
    resetGroceryHarness();
    grocery.items = [];
  });

  it("does not say the list is empty while it is still loading", async () => {
    grocery.hydrated = false;
    renderWithShell(<Grocery />);
    expect(await screen.findByTestId("grocery-loading")).toBeInTheDocument();
    expect(screen.queryByText(/your list is empty/i)).not.toBeInTheDocument();
  });

  it("offers the plan as the first action when it needs something", async () => {
    grocery.preview = { toAdd: 4, alreadyHave: 0, onList: 0 };
    renderWithShell(<Grocery />);
    expect(await screen.findByText(/your list is empty/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add 4 from this week's plan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add from a recipe/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /paste a list/i })).toBeInTheDocument();
  });

  it("links to the planner when the plan needs nothing", async () => {
    renderWithShell(<Grocery />);
    const link = await screen.findByRole("link", { name: /plan this week/i });
    expect(link).toHaveAttribute("href", "/dashboard/planner");
  });
});
