import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import {
  grocery, groceryRow, planEntries, resetGroceryHarness, renderWithShell,
} from "@/test/groceryPageHarness";
import { toISODate } from "@/lib/date-utils";

/**
 * The Grocery page below `md:` (option a, 2026-09-25): the kid filter,
 * grouping, store picker and In-store mode leave the page for the toolbar's
 * More options menu, so the first row of the list is on the first screen.
 * These pin that each is still reachable from there and that a filter that is
 * on is named on the page, not hidden in the sheet.
 */

// Every useIsMobile caller answers "phone": the page and ResponsiveDialog.
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));

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
vi.mock("@/components/GroceryListSelector", () => ({
  GroceryListSelector: ({ summary }: { summary?: string }) => <div data-testid="list-summary">{summary}</div>,
}));
vi.mock("@/components/CreateGroceryListDialog", () => ({ CreateGroceryListDialog: () => null }));
vi.mock("@/components/ManageGroceryListsDialog", () => ({ ManageGroceryListsDialog: () => null }));
vi.mock("@/components/EditGroceryItemDialog", () => ({ EditGroceryItemDialog: () => null }));
vi.mock("@/lib/analytics", () => ({ analytics: { trackEvent: vi.fn() } }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));


vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }),
}));

import Grocery from "./Grocery";

function seedAvaAndTwoRows() {
  resetGroceryHarness();
  grocery.kids = [{ id: "ava", name: "Ava" }] as never;
  grocery.foods = [
    { id: "f-apple", name: "Apples", category: "fruit", is_safe: true, is_try_bite: false, quantity: 0, unit: "" },
  ] as never;
  planEntries.push({
    id: "p1", kid_id: "ava", food_id: "f-apple", date: toISODate(new Date()), meal_slot: "snack1",
  } as never);
  grocery.items = [
    groceryRow({ id: "g1", name: "Apples", aisle: "Produce" }),
    groceryRow({ id: "g2", name: "Nappies", aisle: "Baby" }),
  ];
}

async function openListView(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "More options" }));
  await user.click(await screen.findByRole("menuitem", { name: "Filter, group and store" }));
  return screen.findByRole("dialog", { name: "List view" });
}

describe("Grocery on a phone: view controls live in More options", () => {
  beforeEach(seedAvaAndTwoRows);

  it("renders no kid chips, grouping row or In-store button above the list", async () => {
    renderWithShell(<Grocery />);
    expect(await screen.findByText("Nappies")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Only Ava's items" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Group items by" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("grocery-in-store-open")).not.toBeInTheDocument();
    expect(screen.queryByTestId("grocery-view-indicator")).not.toBeInTheDocument();
  });

  it("opens In-store mode straight from the menu", async () => {
    const user = userEvent.setup();
    renderWithShell(<Grocery />);
    await screen.findByText("Nappies");
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(await screen.findByRole("menuitem", { name: "In-store mode" }));
    expect(await screen.findByTestId("in-store-mode")).toBeInTheDocument();
  });

  it("a kid filter set in the sheet filters the list and is named on the page until cleared", async () => {
    const user = userEvent.setup();
    renderWithShell(<Grocery />);
    await screen.findByText("Nappies");

    const sheet = await openListView(user);
    await user.click(within(sheet).getByRole("button", { name: "Only Ava's items" }));
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "List view" })).not.toBeInTheDocument());

    expect(screen.queryByText("Nappies")).not.toBeInTheDocument();
    const indicator = screen.getByTestId("grocery-view-indicator");
    expect(indicator).toHaveTextContent("Ava's items, 1 hidden");
    expect(screen.getByTestId("list-summary")).toHaveTextContent("1 left of 1 for Ava");

    await user.click(within(indicator).getByRole("button", { name: "Show everyone's items" }));
    expect(screen.getByText("Nappies")).toBeInTheDocument();
    expect(screen.queryByTestId("grocery-view-indicator")).not.toBeInTheDocument();
  });

  it("grouping by category from the sheet is named on the page, and the chip reopens the sheet", async () => {
    const user = userEvent.setup();
    renderWithShell(<Grocery />);
    await screen.findByText("Nappies");

    const sheet = await openListView(user);
    const byCategory = within(sheet).getByRole("button", { name: "By category" });
    await user.click(byCategory);
    expect(byCategory).toHaveAttribute("aria-pressed", "true");
    await user.click(within(sheet).getByRole("button", { name: "Done" }));

    const indicator = await screen.findByTestId("grocery-view-indicator");
    expect(indicator).toHaveTextContent("By category");
    await user.click(within(indicator).getByRole("button", { name: /By category\. Change list view/ }));
    expect(await screen.findByRole("dialog", { name: "List view" })).toBeInTheDocument();
  });
});
