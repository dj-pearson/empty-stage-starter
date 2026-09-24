import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent, act } from "@testing-library/react";
import "@/i18n";
import {
  grocery, groceryRow, resetGroceryHarness, renderWithShell, LIST_B,
} from "@/test/groceryPageHarness";

/**
 * Checkout on the Grocery page: scope, failure, re-entry, fallback and Undo.
 *
 * Each of these was a real defect. clearCheckedGroceryItems deleted every
 * checked row in the household, so finishing the Costco list emptied the cart
 * of the Saturday list too. A failed ledger append still cleared the rows and
 * toasted success. Two quick taps on the CTA recorded the shop twice. And the
 * Undo re-added rows under new ids, one insert each, without their fields.
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
const toastError = vi.fn();
const toastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    info: (...a: unknown[]) => toastInfo(...a),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import Grocery from "./Grocery";

type ToastOpts = { action?: { onClick: () => void } };

const A_BOUGHT = groceryRow({ id: "a1", name: "Milk", checked: true, unit: "gal", quantity: 2, aisle: "Dairy", notes: "whole" });
const A_BOUGHT_2 = groceryRow({ id: "a3", name: "Apples", checked: true, unit: "lb", quantity: 3 });
const A_LEFT = groceryRow({ id: "a2", name: "Bread" });
const B_BOUGHT = groceryRow({ id: "b1", name: "Eggs", checked: true, grocery_list_id: LIST_B });

async function renderAndCheckout(clicks = 1) {
  renderWithShell(<Grocery />);
  const cta = await screen.findByRole("button", { name: /finish shopping|clear \d+ bought/i });
  for (let i = 0; i < clicks; i++) fireEvent.click(cta);
  return cta;
}

describe("Grocery checkout", () => {
  beforeEach(() => {
    resetGroceryHarness();
    toastSuccess.mockClear();
    toastError.mockClear();
    toastInfo.mockClear();
    grocery.items = [A_BOUGHT, A_LEFT, B_BOUGHT];
  });

  it("checks out only the list on screen and leaves another list's checked rows", async () => {
    await renderAndCheckout();

    await waitFor(() => expect(grocery.fns.deleteGroceryItems).toHaveBeenCalledTimes(1));
    expect(grocery.fns.deleteGroceryItems).toHaveBeenCalledWith(["a1"]);
    expect(grocery.fns.clearCheckedGroceryItems).not.toHaveBeenCalled();
    // List B's bought row is not in what was deleted.
    const deleted = grocery.fns.deleteGroceryItems.mock.calls.flat(2);
    expect(deleted).not.toContain("b1");
  });

  it("keeps the rows checked and says nothing succeeded when the append fails", async () => {
    grocery.ledger = true;
    grocery.fns.recordPurchases.mockResolvedValueOnce({
      recorded: false, count: 0, reason: "the append failed", skipped: [], recordedRowIds: [],
    });

    await renderAndCheckout();

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(grocery.fns.deleteGroceryItems).not.toHaveBeenCalled();
    expect(grocery.fns.toggleGroceryItem).not.toHaveBeenCalled();
    expect(grocery.fns.updateFood).not.toHaveBeenCalled();
    expect(grocery.fns.addFood).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("records the shop once however fast the CTA is tapped", async () => {
    grocery.ledger = true;
    let release: () => void = () => {};
    grocery.fns.recordPurchases.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ recorded: true, count: 1, reason: null, skipped: [], recordedRowIds: ["a1"] });
        }),
    );

    const cta = await renderAndCheckout(2);
    expect(cta).toHaveAttribute("aria-busy", "true");
    expect(cta).toBeDisabled();
    await act(async () => release());

    await waitFor(() => expect(grocery.fns.deleteGroceryItems).toHaveBeenCalledTimes(1));
    expect(grocery.fns.recordPurchases).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(cta).not.toHaveAttribute("aria-busy", "true"));
  });

  it("credits the legacy way only the rows the ledger did not record", async () => {
    grocery.ledger = true;
    grocery.items = [A_BOUGHT, A_BOUGHT_2, A_LEFT, B_BOUGHT];
    grocery.foods = [
      { id: "f-milk", name: "Milk", category: "dairy", is_safe: true, is_try_bite: false, quantity: 1, unit: "gal" },
      { id: "f-apple", name: "Apples", category: "fruit", is_safe: true, is_try_bite: false, quantity: 1, unit: "LB" },
    ] as never;
    grocery.fns.recordPurchases.mockResolvedValueOnce({
      recorded: true, count: 1, reason: null, skipped: [], recordedRowIds: ["a1"],
    });

    await renderAndCheckout();

    await waitFor(() => expect(grocery.fns.deleteGroceryItems).toHaveBeenCalledWith(["a1", "a3"]));
    // Apples went through the fallback; units match case-insensitively.
    expect(grocery.fns.updateFood).toHaveBeenCalledTimes(1);
    expect(grocery.fns.updateFood).toHaveBeenCalledWith("f-apple", { quantity: 4 });
    // Milk was recorded by the ledger and is not credited a second time.
    expect(grocery.fns.updateFood).not.toHaveBeenCalledWith("f-milk", expect.anything());
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("skips a fallback row whose unit differs instead of adding across units", async () => {
    grocery.ledger = true;
    grocery.items = [A_BOUGHT_2, A_LEFT];
    grocery.foods = [
      { id: "f-apple", name: "Apples", category: "fruit", is_safe: true, is_try_bite: false, quantity: 1, unit: "bag" },
    ] as never;
    grocery.fns.recordPurchases.mockResolvedValueOnce({
      recorded: false, count: 0, reason: "nothing resolved to a pantry item", skipped: [], recordedRowIds: [],
    });

    await renderAndCheckout();

    await waitFor(() => expect(grocery.fns.deleteGroceryItems).toHaveBeenCalledWith(["a3"]));
    expect(grocery.fns.updateFood).not.toHaveBeenCalled();
    // Nothing was credited, so nothing says it was.
    expect(toastSuccess).not.toHaveBeenCalled();
    const [, opts] = toastInfo.mock.calls[0] as [string, { description?: string }];
    expect(opts.description).toMatch(/unit differs/i);
  });

  it("Undo restores the rows under their original ids, checked, with every field", async () => {
    await renderAndCheckout();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));

    const [, opts] = toastSuccess.mock.calls[0] as [string, ToastOpts];
    act(() => opts.action!.onClick());

    expect(grocery.fns.restoreGroceryItems).toHaveBeenCalledTimes(1);
    expect(grocery.fns.restoreGroceryItems).toHaveBeenCalledWith([{ ...A_BOUGHT, checked: true }]);
    expect(grocery.fns.addGroceryItem).not.toHaveBeenCalled();
  });

  it("ledger Undo reverses only the rows the ledger recorded", async () => {
    grocery.ledger = true;
    grocery.items = [A_BOUGHT, A_BOUGHT_2, A_LEFT];
    grocery.fns.recordPurchases.mockResolvedValueOnce({
      recorded: true, count: 1, reason: null, skipped: [], recordedRowIds: ["a1"],
    });

    await renderAndCheckout();
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(1));
    const [, opts] = toastSuccess.mock.calls[0] as [string, ToastOpts];
    act(() => opts.action!.onClick());

    expect(grocery.fns.recordPurchaseReversal).toHaveBeenCalledTimes(1);
    const reversed = grocery.fns.recordPurchaseReversal.mock.calls[0][0] as unknown as Array<{ id: string }>;
    expect(reversed.map((r) => r.id)).toEqual(["a1"]);
    expect(grocery.fns.restoreGroceryItems).toHaveBeenCalledWith([
      { ...A_BOUGHT, checked: true },
      { ...A_BOUGHT_2, checked: true },
    ]);
  });

  it("names the mode truthfully: ledger copy does not claim the pantry already has it", async () => {
    grocery.ledger = true;
    renderWithShell(<Grocery />);
    expect(await screen.findByText(/goes to pantry at checkout/i)).toBeInTheDocument();
    expect(screen.queryByText(/tap "done shopping"/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/added to pantry/i)).not.toBeInTheDocument();
  });
});
