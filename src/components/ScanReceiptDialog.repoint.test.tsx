import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { createContext, useContext } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@/i18n";
import type { Food, GroceryItem } from "@/types";
import { parseResponseToReviewRows, type ParseResponse } from "@/lib/receiptParse";
import type { ReceiptApplyPlan } from "@/lib/receiptApply";

/**
 * Item 16 review fixes: re-pointing a receipt line on the review sheet, and
 * a subset pairing that must not steal a line from the food it matched.
 */

const foods: Food[] = [
  { id: "f-milk", name: "Milk", category: "dairy", is_safe: false, is_try_bite: false, quantity: 1, unit: "gal" } as Food,
  { id: "f-beans", name: "Beans", category: "protein", is_safe: false, is_try_bite: false, quantity: 1, unit: "bags" } as Food,
  { id: "f-aj", name: "Apple juice", category: "snack", is_safe: false, is_try_bite: false, quantity: 1, unit: "" } as Food,
  { id: "f-apple", name: "Apple", category: "fruit", is_safe: false, is_try_bite: false, quantity: 1, unit: "" } as Food,
];
vi.mock("@/contexts/AppContext", () => ({
  useFoods: () => ({ foods, addFoods: vi.fn(async () => true), updateFood: vi.fn() }),
}));
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

// A plain stand-in for the Radix Select, so a test can pick an option.
vi.mock("@/components/ui/select", () => {
  const Ctx = createContext<(v: string) => void>(() => {});
  return {
    Select: ({ onValueChange, children }: { onValueChange: (v: string) => void; children: React.ReactNode }) => (
      <Ctx.Provider value={onValueChange}>
        <div data-testid="line-picker">{children}</div>
      </Ctx.Provider>
    ),
    SelectTrigger: ({ children, ...rest }: { children?: React.ReactNode; "aria-label"?: string }) => (
      <div aria-label={rest["aria-label"]}>{children}</div>
    ),
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const pick = useContext(Ctx);
      return (
        <button type="button" onClick={() => pick(value)}>
          {children}
        </button>
      );
    },
  };
});

const parsed: ParseResponse = {
  merchant: "Corner Shop",
  purchasedAt: "2026-09-26",
  currency: "USD",
  lineItems: [
    { rawText: "WHL MILK", parsedName: "WHL MILK", qty: 1, unit: "gal", unitPrice: 4, lineTotal: 4, category: "dairy", confidence: 0.95 },
    { rawText: "PINTO 2LB", parsedName: "PINTO", qty: 2, unit: "lb", unitPrice: 2, lineTotal: 4, category: "protein", confidence: 0.9 },
    { rawText: "APPLE JUICE", parsedName: "Apple juice", qty: 1, unit: "", unitPrice: 3, lineTotal: 3, category: "beverage", confidence: 0.9 },
  ],
};
vi.mock("@/lib/edge-functions", () => ({
  invokeEdgeFunction: vi.fn(async () => ({ data: parsed, error: null })),
}));

import { ScanReceiptDialog } from "./ScanReceiptDialog";

const listRow = (id: string, name: string): GroceryItem => ({
  id, name, checked: false, quantity: 1, unit: "", category: "snack",
});
const LIST = [listRow("r-milk", "Milk"), listRow("r-bread", "Bread"), listRow("r-beans", "Beans"), listRow("r-apple", "apple")];

async function scan(onApply: (plan: ReceiptApplyPlan) => Promise<boolean>) {
  const { container } = render(
    <ScanReceiptDialog
      open
      onClose={vi.fn()}
      listRows={LIST}
      resolveFoodForRow={(row) => foods.find((f) => f.name.toLowerCase() === row.name.toLowerCase())}
      onApplyToList={onApply}
    />,
  );
  const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "r.jpg", { type: "image/jpeg" })] } });
  await screen.findByTestId("receipt-section-matched");
}

function pick(lineName: string, option: RegExp) {
  const trigger = screen.getByLabelText(new RegExp(`which list item ${lineName} pays for`, "i"));
  const picker = trigger.closest('[data-testid="line-picker"]') as HTMLElement;
  fireEvent.click(within(picker).getByRole("button", { name: option }));
}

async function confirm(onApply: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByRole("button", { name: /update pantry|save/i }));
  await waitFor(() => expect(onApply).toHaveBeenCalled());
  return onApply.mock.calls[0][0] as ReceiptApplyPlan;
}

const ownMatch = (name: string) =>
  parseResponseToReviewRows(parsed, foods).find((r) => r.parsedName === name)?.matchedFoodId ?? null;

describe("re-pointing a receipt line", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pointed at a row with no pantry food, it stops crediting the old row's food", async () => {
    const onApply = vi.fn(async (_p: ReceiptApplyPlan) => true);
    await scan(onApply);
    pick("WHL MILK", /checks off bread/i);
    const plan = await confirm(onApply);
    expect(plan.checkOffRowIds).toContain("r-bread");
    expect(plan.checkOffRowIds).not.toContain("r-milk");
    // "WHL MILK" matched no pantry food by its own spelling, so it becomes a create.
    expect(ownMatch("WHL MILK")).toBeNull();
    expect(plan.lineForRow["r-bread"].foodId).toBeNull();
    expect(plan.topUps.map((u) => u.foodId)).not.toContain("f-milk");
  });

  it("pointed at a row whose food uses another unit, the line is unticked", async () => {
    const onApply = vi.fn(async (_p: ReceiptApplyPlan) => true);
    await scan(onApply);
    pick("PINTO", /checks off beans/i);
    const plan = await confirm(onApply);
    expect(plan.checkOffRowIds).not.toContain("r-beans");
    expect(plan.topUps.map((u) => u.foodId)).not.toContain("f-beans");
  });

  it("a subset pairing does not move a line off the food it matched exactly", async () => {
    expect(ownMatch("Apple juice")).toBe("f-aj");
    const onApply = vi.fn(async (_p: ReceiptApplyPlan) => true);
    await scan(onApply);
    const plan = await confirm(onApply);
    // Paired on the sheet but unticked: nothing credits Apple with the juice.
    expect(plan.checkOffRowIds).not.toContain("r-apple");
    expect(plan.topUps.map((u) => u.foodId)).not.toContain("f-apple");
  });
});
