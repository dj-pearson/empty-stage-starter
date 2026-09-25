import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import "@/i18n";
import {
  grocery, groceryRow, planEntries, resetGroceryHarness, renderWithShell,
} from "@/test/groceryPageHarness";
import { toISODate } from "@/lib/date-utils";

/**
 * Items 16, 18 and 42 on the Grocery page: a row a receipt credited is not
 * credited again at checkout, "Only <kid>'s items" says what it hides, and
 * in-store mode opens and closes over the list.
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

// The dialog has its own tests; here it only hands the page a plan.
vi.mock("@/components/ScanReceiptDialog", () => ({
  ScanReceiptDialog: ({
    onApplyToList,
    listRows,
  }: {
    onApplyToList: (plan: unknown) => Promise<boolean>;
    listRows: Array<{ id: string }>;
  }) => (
    <button
      type="button"
      data-testid="fake-receipt-apply"
      data-rows={listRows.map((r) => r.id).join(",")}
      onClick={() =>
        void onApplyToList({
          checkOffRowIds: ["g1"],
          lineForRow: { g1: { foodId: "f-apple", createKey: null } },
          topUps: [{ foodId: "f-apple", quantityDelta: 2, unit: null }],
          creates: [],
        })
      }
    >
      apply
    </button>
  ),
}));

const toastSuccess = vi.fn();
const toastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: vi.fn(),
    info: (...a: unknown[]) => toastInfo(...a),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import Grocery from "./Grocery";

const CREDITED = "2026-09-26T10:00:00.000Z";

describe("Grocery: receipt-credited rows at checkout (Item 16)", () => {
  beforeEach(() => {
    resetGroceryHarness();
    toastSuccess.mockClear();
    toastInfo.mockClear();
  });

  it("ledger checkout clears a receipt-credited row without crediting it again", async () => {
    grocery.ledger = true;
    grocery.items = [
      groceryRow({ id: "a1", name: "Milk", checked: true, pantry_credited_at: CREDITED }),
      groceryRow({ id: "a2", name: "Apples", checked: true }),
      groceryRow({ id: "a3", name: "Bread" }),
    ];
    grocery.fns.recordPurchases.mockResolvedValueOnce({
      recorded: true, count: 1, reason: null, skipped: [], recordedRowIds: ["a2"],
    });

    renderWithShell(<Grocery />);
    fireEvent.click(await screen.findByRole("button", { name: /finish shopping/i }));

    await waitFor(() => expect(grocery.fns.deleteGroceryItems).toHaveBeenCalledWith(["a1", "a2"]));
    const credited = grocery.fns.recordPurchases.mock.calls[0][0] as Array<{ id: string }>;
    expect(credited.map((r) => r.id)).toEqual(["a2"]);
    expect(grocery.fns.updateFood).not.toHaveBeenCalled();
    expect(grocery.fns.addFood).not.toHaveBeenCalled();
    const [, opts] = toastSuccess.mock.calls[0] as [string, { description?: string }];
    expect(opts.description).toMatch(/1 already added from your receipt/i);
  });

  it("ledger checkout with only receipt-credited rows records nothing", async () => {
    grocery.ledger = true;
    grocery.items = [
      groceryRow({ id: "a1", name: "Milk", checked: true, pantry_credited_at: CREDITED }),
      groceryRow({ id: "a3", name: "Bread" }),
    ];
    renderWithShell(<Grocery />);
    fireEvent.click(await screen.findByRole("button", { name: /finish shopping/i }));
    await waitFor(() => expect(grocery.fns.deleteGroceryItems).toHaveBeenCalledWith(["a1"]));
    expect(grocery.fns.recordPurchases).not.toHaveBeenCalled();
  });

  it("legacy mode: unticking a receipt-credited row leaves the pantry alone", async () => {
    grocery.foods = [
      { id: "f-milk", name: "Milk", category: "dairy", is_safe: true, is_try_bite: false, quantity: 3, unit: "" },
    ] as never;
    grocery.items = [
      groceryRow({ id: "a1", name: "Milk", checked: true, pantry_credited_at: CREDITED }),
      groceryRow({ id: "a3", name: "Bread" }),
    ];
    renderWithShell(<Grocery />);
    fireEvent.click(await screen.findByText(/purchased - in pantry/i));
    expect(await screen.findByTestId("grocery-row-in-pantry")).toHaveTextContent(/in pantry from receipt/i);
    fireEvent.click(screen.getByRole("checkbox", { name: /uncheck milk/i }));
    expect(grocery.fns.toggleGroceryItem).toHaveBeenCalledWith("a1");
    expect(grocery.fns.updateFood).not.toHaveBeenCalled();
  });

  it("unticking a receipt-credited row clears its stamp, so a later purchase is credited", async () => {
    grocery.foods = [
      { id: "f-milk", name: "Milk", category: "dairy", is_safe: true, is_try_bite: false, quantity: 3, unit: "" },
    ] as never;
    grocery.items = [
      groceryRow({ id: "a1", name: "Milk", checked: true, pantry_credited_at: CREDITED }),
      groceryRow({ id: "a3", name: "Bread" }),
    ];
    const view = renderWithShell(<Grocery />);
    fireEvent.click(await screen.findByText(/purchased - in pantry/i));
    fireEvent.click(screen.getByRole("checkbox", { name: /uncheck milk/i }));
    await waitFor(() =>
      expect(grocery.fns.updateGroceryItem).toHaveBeenCalledWith("a1", { pantry_credited_at: null }),
    );
    expect(String(toastInfo.mock.calls.at(-1)?.[0])).toMatch(/back on the list/i);
    expect(grocery.fns.updateFood).not.toHaveBeenCalled();
    view.unmount();

    // Bought again later: the row carries no stamp, so ticking it credits the pantry.
    grocery.items = [groceryRow({ id: "a1", name: "Milk", checked: false, pantry_credited_at: null })];
    renderWithShell(<Grocery />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /milk/i }));
    await waitFor(() => expect(grocery.fns.updateFood).toHaveBeenCalled());
  });

  it("an unchecked row never shows 'In pantry from receipt'", async () => {
    grocery.items = [groceryRow({ id: "a1", name: "Milk", checked: false, pantry_credited_at: CREDITED })];
    renderWithShell(<Grocery />);
    await screen.findByRole("checkbox", { name: /milk/i });
    expect(screen.queryByTestId("grocery-row-in-pantry")).toBeNull();
  });
});

describe("Grocery: Only <kid>'s items (Item 42)", () => {
  beforeEach(() => {
    resetGroceryHarness();
    grocery.kids = [{ id: "ava", name: "Ava" }] as never;
    grocery.foods = [
      { id: "f-apple", name: "Apples", category: "fruit", is_safe: true, is_try_bite: false, quantity: 0, unit: "" },
    ] as never;
    planEntries.push({
      id: "p1", kid_id: "ava", food_id: "f-apple", date: toISODate(new Date()), meal_slot: "snack1",
    } as never);
    grocery.items = [
      groceryRow({ id: "g1", name: "Apples" }),
      groceryRow({ id: "g2", name: "Nappies" }),
      groceryRow({ id: "g3", name: "Wipes", checked: true }),
    ];
  });

  it("filters to the kid's rows, counts only them, and says what it hid", async () => {
    renderWithShell(<Grocery />);
    expect(await screen.findByText("Nappies")).toBeInTheDocument();
    expect(screen.getByTestId("list-summary")).toHaveTextContent("2 left of 3");

    fireEvent.click(screen.getByRole("button", { name: "Only Ava's items" }));

    expect(screen.queryByText("Nappies")).not.toBeInTheDocument();
    expect(screen.getByText("Apples")).toBeInTheDocument();
    expect(screen.getByTestId("grocery-kid-filter-status")).toHaveTextContent("1 other item hidden");
    expect(screen.getByTestId("list-summary")).toHaveTextContent("1 left of 1 for Ava");

    fireEvent.click(screen.getByRole("button", { name: /show all items/i }));
    expect(screen.getByText("Nappies")).toBeInTheDocument();
    expect(screen.getByTestId("list-summary")).toHaveTextContent("2 left of 3");
  });

  it("says so when the kid's rows are all bought but others are left", async () => {
    grocery.items = [groceryRow({ id: "g1", name: "Apples", checked: true }), groceryRow({ id: "g2", name: "Nappies" })];
    renderWithShell(<Grocery />);
    fireEvent.click(await screen.findByRole("button", { name: "Only Ava's items" }));
    expect(screen.getByTestId("grocery-kid-filter-empty")).toHaveTextContent("Nothing left to buy for Ava");
    expect(screen.getByTestId("grocery-kid-filter-empty")).toHaveTextContent("1 other item is still on the list");
  });
});

describe("Grocery: in-store mode (Item 18)", () => {
  beforeEach(() => {
    resetGroceryHarness();
    grocery.items = [groceryRow({ id: "g1", name: "Apples", aisle: "Produce" }), groceryRow({ id: "g2", name: "Milk", aisle: "Dairy" })];
  });

  it("opens over the list and toggles through the page's own handler", async () => {
    renderWithShell(<Grocery />);
    fireEvent.click(await screen.findByTestId("grocery-in-store-open"));
    expect(await screen.findByTestId("in-store-mode")).toBeInTheDocument();
    expect(screen.getByTestId("in-store-aisle")).toHaveTextContent("Produce");
    fireEvent.click(screen.getAllByRole("checkbox", { name: /check off apples/i }).at(-1)!);
    expect(grocery.fns.toggleGroceryItem).toHaveBeenCalledWith("g1");
    fireEvent.click(screen.getByRole("button", { name: /^exit$/i }));
    await waitFor(() => expect(screen.queryByTestId("in-store-mode")).not.toBeInTheDocument());
  });
});

describe("Grocery: receipt closes the loop (Item 16)", () => {
  beforeEach(() => {
    resetGroceryHarness();
    toastSuccess.mockClear();
    toastInfo.mockClear();
    grocery.ledger = true;
    grocery.foods = [
      { id: "f-apple", name: "Apples", category: "fruit", is_safe: true, is_try_bite: false, quantity: 1, unit: "" },
    ] as never;
    grocery.items = [groceryRow({ id: "g1", name: "Apples" }), groceryRow({ id: "g2", name: "Milk", checked: true })];
  });

  it("checks the row off, stamps it, credits the ledger, and Undo reverses both", async () => {
    renderWithShell(<Grocery />);
    // Radix opens its menu on pointerdown or a key, not on jsdom's click.
    const add = await screen.findByRole("button", { name: /^add$/i });
    add.focus();
    fireEvent.keyDown(add, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /scan a receipt/i }));
    const apply = await screen.findByTestId("fake-receipt-apply");
    // Only the unchecked rows of the list on screen are offered to the receipt.
    expect(apply).toHaveAttribute("data-rows", "g1");
    fireEvent.click(apply);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    expect(grocery.fns.recordRestock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "f-apple" }), 2, { unit: null, refType: "receipt" },
    );
    expect(grocery.fns.updateFood).not.toHaveBeenCalled();
    expect(grocery.fns.updateGroceryItem).toHaveBeenCalledWith("g1", {
      checked: true, pantry_credited_at: expect.any(String),
    });
    const [title, opts] = toastSuccess.mock.calls[0] as [string, { action: { onClick: () => void } }];
    expect(title).toMatch(/checked off 1 item from your receipt/i);

    opts.action.onClick();
    await waitFor(() =>
      expect(grocery.fns.updateGroceryItem).toHaveBeenCalledWith("g1", { checked: false, pantry_credited_at: null }),
    );
    await waitFor(() =>
      expect(grocery.fns.recordRestock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "f-apple" }), -2, { unit: null, refType: "receipt" },
      ),
    );
  });
});
