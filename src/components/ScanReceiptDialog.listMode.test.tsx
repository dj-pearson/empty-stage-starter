import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@/i18n";
import type { Food, GroceryItem } from "@/types";
import type { ParseResponse } from "@/lib/receiptParse";
import type { ReceiptApplyPlan } from "@/lib/receiptApply";

/**
 * Item 16 on the Grocery page: the receipt review sheet pairs lines with the
 * unchecked rows of the list on screen, groups them into what will be checked
 * off, what is new to the pantry and what is not on the list, and hands the
 * page one plan that does both halves.
 */

const foods: Food[] = [
  { id: "f-milk", name: "Milk", category: "dairy", is_safe: false, is_try_bite: false, quantity: 1, unit: "gal" } as Food,
  { id: "f-rice", name: "Rice", category: "carb", is_safe: false, is_try_bite: false, quantity: 1, unit: "" } as Food,
];
const addFoods = vi.fn(async () => true);
const updateFood = vi.fn();
vi.mock("@/contexts/AppContext", () => ({ useFoods: () => ({ foods, addFoods, updateFood }) }));
vi.mock("@/hooks/useFeatureLimit", () => ({
  useFeatureLimit: () => ({
    checkFeatureLimit: vi.fn(async () => ({ allowed: true })),
    incrementUsage: vi.fn(async () => {}),
  }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/analytics", () => ({ analytics: { trackEvent: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

const parsed: ParseResponse = {
  merchant: "Corner Shop",
  purchasedAt: "2026-09-26",
  currency: "USD",
  lineItems: [
    { rawText: "ORG WHL MILK 1GAL", parsedName: "ORG WHL MILK", qty: 1, unit: "gal", unitPrice: 4, lineTotal: 4, category: "dairy", confidence: 0.95 },
    { rawText: "TAHINI", parsedName: "TAHINI", qty: 1, unit: "", unitPrice: 6, lineTotal: 6, category: "pantry", confidence: 0.9 },
    { rawText: "RICE", parsedName: "RICE", qty: 2, unit: "", unitPrice: 2, lineTotal: 4, category: "carb", confidence: 0.9 },
    { rawText: "SAFFRON", parsedName: "SAFFRON", qty: 1, unit: "", unitPrice: 9, lineTotal: 9, category: "pantry", confidence: 0.9 },
  ],
};
vi.mock("@/lib/edge-functions", () => ({
  invokeEdgeFunction: vi.fn(async () => ({ data: parsed, error: null })),
}));

import { ScanReceiptDialog } from "./ScanReceiptDialog";

const listRow = (id: string, name: string, checked = false): GroceryItem => ({
  id, name, checked, quantity: 1, unit: "", category: "snack",
});
const LIST = [listRow("r-milk", "Milk"), listRow("r-tahini", "Tahini"), listRow("r-bread", "Bread")];

async function scan(onApplyToList: (plan: ReceiptApplyPlan) => Promise<boolean>, onClose = vi.fn()) {
  const { container } = render(
    <ScanReceiptDialog
      open
      onClose={onClose}
      listRows={LIST}
      resolveFoodForRow={(row) => foods.find((f) => f.name.toLowerCase() === row.name.toLowerCase())}
      onApplyToList={onApplyToList}
    />,
  );
  const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["x"], "receipt.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByTestId("receipt-section-matched");
  return { onClose };
}

describe("ScanReceiptDialog on the Grocery page", () => {
  beforeEach(() => {
    addFoods.mockClear();
    updateFood.mockClear();
  });

  it("sorts lines into on-your-list, new to pantry and not on this list", async () => {
    await scan(vi.fn(async () => true));
    const matched = screen.getByTestId("receipt-section-matched");
    expect(within(matched).getByDisplayValue("ORG WHL MILK")).toBeInTheDocument();
    expect(within(matched).getByDisplayValue("TAHINI")).toBeInTheDocument();
    // The list row's pantry food, not the receipt's spelling, is credited.
    expect(within(matched).getByText(/tops up milk in your pantry/i)).toBeInTheDocument();
    expect(within(matched).getByText(/new to your pantry/i)).toBeInTheDocument();

    const fresh = screen.getByTestId("receipt-section-new");
    expect(within(fresh).getByDisplayValue("SAFFRON")).toBeInTheDocument();
    const notOnList = screen.getByTestId("receipt-section-unmatched");
    expect(within(notOnList).getByDisplayValue("RICE")).toBeInTheDocument();
    expect(within(notOnList).getByText(/tops up rice/i)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /check off 2, update pantry/i })).toBeInTheDocument();
  });

  it("hands the page one plan that checks off and credits, and never saves to the pantry itself", async () => {
    const onApply = vi.fn(async (_plan: ReceiptApplyPlan) => true);
    const { onClose } = await scan(onApply);
    fireEvent.click(screen.getByRole("button", { name: /check off 2, update pantry/i }));

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const plan = onApply.mock.calls[0][0];
    expect(plan.checkOffRowIds).toEqual(["r-milk", "r-tahini"]);
    expect(plan.topUps).toEqual(
      expect.arrayContaining([
        { foodId: "f-milk", quantityDelta: 1, unit: "gal" },
        { foodId: "f-rice", quantityDelta: 2, unit: null },
      ]),
    );
    expect(plan.creates.map((c) => c.name).sort()).toEqual(["SAFFRON", "TAHINI"]);
    expect(addFoods).not.toHaveBeenCalled();
    expect(updateFood).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("stays on the review when the page could not apply it", async () => {
    const onApply = vi.fn(async () => false);
    const { onClose } = await scan(onApply);
    fireEvent.click(screen.getByRole("button", { name: /check off 2, update pantry/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(await screen.findByTestId("receipt-section-matched")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("dropping a line off the review takes its check-off with it", async () => {
    const onApply = vi.fn(async (_plan: ReceiptApplyPlan) => true);
    await scan(onApply);
    fireEvent.click(screen.getByRole("button", { name: /remove tahini/i }));
    fireEvent.click(screen.getByRole("button", { name: /check off 1, update pantry/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply.mock.calls[0][0].checkOffRowIds).toEqual(["r-milk"]);
  });
});
