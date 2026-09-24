import { describe, it, expect } from "vitest";
import { buildWasteReport, pricePerCanonical, startOfMonth, type ReportMovement, type ReportFood } from "./wasteReport";
import { getKidFoodFit, summarizeKidFits } from "./kidFit";
import type { Kid } from "@/types";

const NOW = new Date(2026, 8, 24, 12); // 24 Sep 2026, local
const IN_MONTH = new Date(2026, 8, 10, 9).toISOString();
const LAST_MONTH = new Date(2026, 7, 28, 9).toISOString();

let n = 0;
function mv(over: Partial<ReportMovement> & Pick<ReportMovement, "item_id" | "reason" | "delta">): ReportMovement {
  n += 1;
  return {
    id: `m${n}`,
    canonical_unit: "count",
    display_quantity: over.delta,
    display_unit: null,
    occurred_at: IN_MONTH,
    ...over,
  };
}

const broccoli: ReportFood = { id: "broc", name: "Broccoli", unit: "head", is_try_bite: true };
const milk: ReportFood = { id: "milk", name: "Milk", unit: "gal", is_safe: true, price_per_unit: 4.2, currency: "USD" };
const flour: ReportFood = { id: "flour", name: "Flour", unit: "kg" };

describe("startOfMonth", () => {
  it("is local midnight on the first", () => {
    const s = startOfMonth(NOW);
    expect([s.getFullYear(), s.getMonth(), s.getDate(), s.getHours()]).toEqual([2026, 8, 1, 0]);
  });
});

describe("pricePerCanonical", () => {
  it("turns a display-unit price into a canonical one", () => {
    // 2 kg bought at 1.50/kg, recorded as +2000 g: 0.0015 per g.
    const p = pricePerCanonical(
      mv({ item_id: "flour", reason: "purchase", delta: 2000, canonical_unit: "g", display_quantity: 2, display_unit: "kg", unit_price: 1.5, currency: "EUR" })
    );
    expect(p?.currency).toBe("EUR");
    expect(p?.amount).toBeCloseTo(0.0015);
  });

  it("ignores unpriced, reversed and non-purchase rows", () => {
    expect(pricePerCanonical(mv({ item_id: "x", reason: "purchase", delta: 1 }))).toBeNull();
    expect(pricePerCanonical(mv({ item_id: "x", reason: "purchase", delta: 1, unit_price: 2 }))).toBeNull();
    expect(
      pricePerCanonical(mv({ item_id: "x", reason: "purchase", delta: 1, unit_price: 2, currency: "USD", reversed_by_id: "r" }))
    ).toBeNull();
    expect(pricePerCanonical(mv({ item_id: "x", reason: "waste", delta: -1, unit_price: 2, currency: "USD" }))).toBeNull();
  });
});

describe("buildWasteReport", () => {
  it("counts this month's waste and expiry only, not last month's or other reasons", () => {
    const report = buildWasteReport({
      movements: [
        mv({ item_id: "broc", reason: "waste", delta: -1 }),
        mv({ item_id: "broc", reason: "expire", delta: -1 }),
        mv({ item_id: "broc", reason: "waste", delta: -3, occurred_at: LAST_MONTH }),
        mv({ item_id: "broc", reason: "correction", delta: -2 }),
        mv({ item_id: "broc", reason: "cook", delta: -1 }),
      ],
      foods: [broccoli],
      now: NOW,
    });
    expect(report.events).toBe(2);
    expect(report.lines[0].quantities).toEqual([{ amount: 2, unit: "head" }]);
  });

  it("skips a waste that was reversed, and counts a duplicated id once", () => {
    const once = mv({ item_id: "broc", reason: "waste", delta: -1 });
    const report = buildWasteReport({
      movements: [once, { ...once }, mv({ item_id: "broc", reason: "waste", delta: -1, reversed_by_id: "undo" })],
      foods: [broccoli],
      now: NOW,
    });
    expect(report.events).toBe(1);
  });

  it("costs waste from the latest priced purchase, in canonical units", () => {
    const report = buildWasteReport({
      movements: [
        mv({ item_id: "flour", reason: "purchase", delta: 1000, canonical_unit: "g", display_quantity: 1, display_unit: "kg", unit_price: 1, currency: "EUR", occurred_at: LAST_MONTH }),
        mv({ item_id: "flour", reason: "purchase", delta: 2000, canonical_unit: "g", display_quantity: 2, display_unit: "kg", unit_price: 2, currency: "EUR" }),
        // 500 g thrown out, recorded in grams though bought in kilograms.
        mv({ item_id: "flour", reason: "waste", delta: -500, canonical_unit: "g", display_quantity: -500, display_unit: "g" }),
      ],
      foods: [flour],
      now: NOW,
    });
    expect(report.lines[0].cost).toEqual([{ amount: 1, currency: "EUR" }]);
    expect(report.totals).toEqual([{ amount: 1, currency: "EUR" }]);
  });

  it("falls back to the food's last price when the waste is in the food's unit", () => {
    const report = buildWasteReport({
      movements: [mv({ item_id: "milk", reason: "waste", delta: -3785, canonical_unit: "ml", display_quantity: -1, display_unit: "gal" })],
      foods: [milk],
      now: NOW,
    });
    expect(report.lines[0].cost).toEqual([{ amount: 4.2, currency: "USD" }]);
  });

  it("says no price rather than guessing across units", () => {
    const report = buildWasteReport({
      movements: [
        mv({ item_id: "milk", reason: "waste", delta: -500, canonical_unit: "ml", display_quantity: -500, display_unit: "ml" }),
        mv({ item_id: "broc", reason: "waste", delta: -1 }),
      ],
      foods: [milk, broccoli],
      now: NOW,
    });
    expect(report.unpricedLines).toBe(2);
    expect(report.totals).toEqual([]);
    expect(report.lines.every((l) => l.partlyUnpriced)).toBe(true);
  });

  it("keeps currencies apart", () => {
    const report = buildWasteReport({
      movements: [
        mv({ item_id: "milk", reason: "waste", delta: -3785, canonical_unit: "ml", display_quantity: -1, display_unit: "gal" }),
        mv({ item_id: "flour", reason: "purchase", delta: 1000, canonical_unit: "g", display_quantity: 1, display_unit: "kg", unit_price: 3, currency: "EUR" }),
        mv({ item_id: "flour", reason: "waste", delta: -1000, canonical_unit: "g", display_quantity: -1, display_unit: "kg" }),
      ],
      foods: [milk, flour],
      now: NOW,
    });
    expect(report.totals).toEqual(
      expect.arrayContaining([
        { amount: 4.2, currency: "USD" },
        { amount: 3, currency: "EUR" },
      ])
    );
  });

  it("separates try-bite waste from the rest, by kid fit when there is one", () => {
    const ava = { id: "k1", name: "Ava", allergens: [] } as Kid;
    const fit = summarizeKidFits([
      { kid: ava, fit: getKidFoodFit(ava, { id: "milk", name: "Milk", allergens: [], is_safe: false, is_try_bite: true }, []) },
    ]);
    const report = buildWasteReport({
      movements: [
        mv({ item_id: "broc", reason: "waste", delta: -1 }),
        mv({ item_id: "milk", reason: "waste", delta: -1, display_unit: "gal" }),
        mv({ item_id: "flour", reason: "waste", delta: -1, display_unit: "kg" }),
      ],
      foods: [broccoli, milk, flour],
      // Milk is a household safe food, but for Ava it is a try bite.
      fitByFoodId: new Map([["milk", fit]]),
      now: NOW,
    });
    expect(report.groups.map((g) => g.group)).toEqual(["trying", "other"]);
    expect(report.groups[0].lines.map((l) => l.name).sort()).toEqual(["Broccoli", "Milk"]);
    expect(report.groups[0].totals).toEqual([{ amount: 4.2, currency: "USD" }]);
  });
});
