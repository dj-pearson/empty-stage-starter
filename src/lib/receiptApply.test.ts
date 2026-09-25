import { describe, it, expect, vi } from "vitest";
import { applyReceiptPlan, planReceiptApply, type ReceiptApplyDeps } from "./receiptApply";
import type { ReviewRow } from "./receiptParse";
import type { Food, GroceryItem } from "@/types";

function line(overrides: Partial<ReviewRow> & Pick<ReviewRow, "uid" | "parsedName">): ReviewRow {
  return {
    rawText: overrides.parsedName,
    qty: 1,
    unit: "",
    unitPrice: 1,
    lineTotal: 1,
    category: "dairy",
    confidence: 0.9,
    accept: true,
    matchedFoodId: null,
    ...overrides,
  };
}

const food = (id: string, name: string, quantity = 1, unit = ""): Food =>
  ({ id, name, category: "dairy", is_safe: false, is_try_bite: false, quantity, unit }) as Food;
const listRow = (id: string, name: string): GroceryItem => ({
  id, name, checked: false, quantity: 1, unit: "", category: "dairy",
});

/** A fake household: foods and rows that the deps read and write in place. */
function harness(opts: { ledger: boolean; foods: Food[]; rows: GroceryItem[]; addFoodOk?: boolean }) {
  const foods = [...opts.foods];
  const rows = opts.rows.map((r) => ({ ...r }));
  const restocks: Array<{ foodId: string; qty: number; unit: string | null }> = [];
  let nextId = 1;
  const deps: ReceiptApplyDeps = {
    ledgerWritesEnabled: opts.ledger,
    getFood: (id) => foods.find((f) => f.id === id),
    getFoods: () => foods,
    getRow: (id) => rows.find((r) => r.id === id),
    addFood: vi.fn(async (f: Omit<Food, "id">) => {
      if (opts.addFoodOk === false) return false;
      foods.push({ ...f, id: `new-${nextId++}` } as Food);
      return true;
    }),
    deleteFood: vi.fn((id: string) => {
      const i = foods.findIndex((f) => f.id === id);
      if (i >= 0) foods.splice(i, 1);
    }),
    updateFood: vi.fn((id: string, patch: Partial<Food>) => {
      const f = foods.find((x) => x.id === id);
      if (f) Object.assign(f, patch);
    }),
    recordRestock: vi.fn(async (f: Food, qty: number, o: { unit: string | null }) => {
      restocks.push({ foodId: f.id, qty, unit: o.unit });
      return { recorded: true };
    }),
    updateGroceryItem: vi.fn((id: string, patch: Partial<GroceryItem>) => {
      const r = rows.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    }),
    now: () => new Date("2026-09-26T10:00:00.000Z"),
  };
  return { deps, foods, rows, restocks };
}

describe("planReceiptApply", () => {
  it("checks off matched rows once and credits every accepted line", () => {
    const rows = [
      line({ uid: "l1", parsedName: "MILK", matchedFoodId: "f-milk", qty: 2, unit: "gal" }),
      line({ uid: "l2", parsedName: "TAHINI" }),
      line({ uid: "l3", parsedName: "CANDY", accept: false }),
    ];
    const plan = planReceiptApply(rows, new Map([["l1", "r-milk"], ["l2", "r-tahini"], ["l3", "r-candy"]]));
    expect(plan.checkOffRowIds).toEqual(["r-milk", "r-tahini"]);
    expect(plan.topUps).toEqual([{ foodId: "f-milk", quantityDelta: 2, unit: "gal" }]);
    expect(plan.creates.map((c) => c.name)).toEqual(["TAHINI"]);
    expect(plan.lineForRow["r-tahini"]).toEqual({ foodId: null, createKey: "tahini|" });
  });
});

describe("applyReceiptPlan", () => {
  it("ledger on: a receipt-ref movement, a checked and stamped row, and nothing through foods.quantity", async () => {
    const h = harness({ ledger: true, foods: [food("f-milk", "Milk", 1, "gal")], rows: [listRow("r-milk", "Milk")] });
    const plan = planReceiptApply(
      [line({ uid: "l1", parsedName: "MILK", matchedFoodId: "f-milk", qty: 2, unit: "gal" })],
      new Map([["l1", "r-milk"]]),
    );
    const out = await applyReceiptPlan(plan, h.deps);

    expect(out).toMatchObject({ checkedOff: 1, toppedUp: 1, created: 0, blocked: 0 });
    expect(h.restocks).toEqual([{ foodId: "f-milk", qty: 2, unit: "gal" }]);
    expect(h.deps.recordRestock).toHaveBeenCalledWith(expect.anything(), 2, { unit: "gal", refType: "receipt" });
    expect(h.deps.updateFood).not.toHaveBeenCalled();
    expect(h.rows[0]).toMatchObject({ checked: true, pantry_credited_at: "2026-09-26T10:00:00.000Z" });
  });

  it("ledger on but the movement is refused: falls back to the legacy sum", async () => {
    const h = harness({ ledger: true, foods: [food("f-milk", "Milk", 1)], rows: [] });
    (h.deps.recordRestock as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ recorded: false });
    const plan = planReceiptApply([line({ uid: "l1", parsedName: "MILK", matchedFoodId: "f-milk", qty: 3 })], new Map());
    await applyReceiptPlan(plan, h.deps);
    expect(h.foods[0].quantity).toBe(4);
  });

  it("ledger off: the legacy quantity path, never a movement", async () => {
    const h = harness({ ledger: false, foods: [food("f-milk", "Milk", 1)], rows: [listRow("r-milk", "Milk")] });
    const plan = planReceiptApply(
      [line({ uid: "l1", parsedName: "MILK", matchedFoodId: "f-milk", qty: 2 })],
      new Map([["l1", "r-milk"]]),
    );
    await applyReceiptPlan(plan, h.deps);
    expect(h.deps.recordRestock).not.toHaveBeenCalled();
    expect(h.foods[0].quantity).toBe(3);
    expect(h.rows[0].pantry_credited_at).toBe("2026-09-26T10:00:00.000Z");
  });

  it("checks off a row whose new food the plan limit refused, but leaves it unstamped for checkout", async () => {
    const h = harness({ ledger: true, foods: [], rows: [listRow("r-tahini", "Tahini")], addFoodOk: false });
    const plan = planReceiptApply([line({ uid: "l1", parsedName: "TAHINI" })], new Map([["l1", "r-tahini"]]));
    const out = await applyReceiptPlan(plan, h.deps);
    expect(out.blocked).toBe(1);
    expect(h.rows[0].checked).toBe(true);
    expect(h.rows[0].pantry_credited_at).toBeUndefined();
  });

  it("Undo reverses both halves: rows unchecked and unstamped, top-ups taken back, created foods deleted", async () => {
    const h = harness({
      ledger: true,
      foods: [food("f-milk", "Milk", 1, "gal"), food("f-hand", "Tahini", 1)],
      rows: [listRow("r-milk", "Milk"), listRow("r-tahini", "Tahini paste")],
    });
    const plan = planReceiptApply(
      [
        line({ uid: "l1", parsedName: "MILK", matchedFoodId: "f-milk", qty: 2, unit: "gal" }),
        line({ uid: "l2", parsedName: "Tahini" }),
      ],
      new Map([["l1", "r-milk"], ["l2", "r-tahini"]]),
    );
    const out = await applyReceiptPlan(plan, h.deps);
    expect(h.foods.map((f) => f.id)).toEqual(["f-milk", "f-hand", "new-1"]);

    await out.undo();

    expect(h.rows.map((r) => [r.checked, r.pantry_credited_at])).toEqual([
      [false, null],
      [false, null],
    ]);
    // The reversal is a negative movement in the unit the credit used.
    expect(h.restocks).toEqual([
      { foodId: "f-milk", qty: 2, unit: "gal" },
      { foodId: "f-milk", qty: -2, unit: "gal" },
    ]);
    // Only the food the receipt created goes; the hand-added Tahini stays.
    expect(h.foods.map((f) => f.id)).toEqual(["f-milk", "f-hand"]);

    // A second tap does nothing twice.
    await out.undo();
    expect(h.restocks).toHaveLength(2);
  });

  it("legacy Undo subtracts from the latest quantity, never below zero", async () => {
    const h = harness({ ledger: false, foods: [food("f-milk", "Milk", 1)], rows: [] });
    const plan = planReceiptApply([line({ uid: "l1", parsedName: "MILK", matchedFoodId: "f-milk", qty: 2 })], new Map());
    const out = await applyReceiptPlan(plan, h.deps);
    expect(h.foods[0].quantity).toBe(3);
    h.foods[0].quantity = 1; // someone used most of it since
    await out.undo();
    expect(h.foods[0].quantity).toBe(0);
  });
});
