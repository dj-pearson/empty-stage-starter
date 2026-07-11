import { describe, it, expect } from "vitest";
import { applyFoodRealtime } from "./FoodsContext";
import { normalizeFoodFromDB } from "@/lib/normalizeEntities";
import type { Food } from "@/types";

// deno-lint-ignore no-explicit-any
const payload = (eventType: string, newRow: Record<string, unknown>, oldId = "x"): any => ({
  eventType,
  new: newRow,
  old: { id: oldId },
});

describe("normalizeFoodFromDB (US-534)", () => {
  it("coerces null booleans/arrays and defaults category", () => {
    const f = normalizeFoodFromDB({
      id: "f1", name: "Milk", category: null, is_safe: null, is_try_bite: null, allergens: null,
    });
    expect(f.is_safe).toBe(false);
    expect(f.is_try_bite).toBe(false);
    expect(f.category).toBe("snack"); // default
    expect(f.allergens).toBeUndefined(); // null array dropped
  });

  it("preserves real values", () => {
    const f = normalizeFoodFromDB({
      id: "f2", name: "Peanut Butter", category: "protein", is_safe: true, is_try_bite: false,
      allergens: ["peanut"], quantity: 2,
    });
    expect(f.is_safe).toBe(true);
    expect(f.category).toBe("protein");
    expect(f.allergens).toEqual(["peanut"]);
    expect(f.quantity).toBe(2);
  });
});

describe("applyFoodRealtime (US-534)", () => {
  it("normalizes a raw INSERT and dedupes by id", () => {
    const next = applyFoodRealtime([], payload("INSERT", { id: "f1", name: "Milk", is_safe: null, category: null }));
    expect(next).toHaveLength(1);
    expect(next[0].is_safe).toBe(false);
    expect(next[0].category).toBe("snack");
  });

  it("updates an existing row in place on UPDATE", () => {
    const seed = applyFoodRealtime([], payload("INSERT", { id: "f1", name: "Milk", is_safe: true, category: "dairy" }));
    const next = applyFoodRealtime(seed, payload("UPDATE", { id: "f1", name: "Milk 2%", is_safe: true, category: "dairy" }));
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe("Milk 2%");
  });

  it("removes on DELETE", () => {
    const seed: Food[] = [{ id: "f1", name: "Milk", category: "dairy", is_safe: true, is_try_bite: false } as Food];
    expect(applyFoodRealtime(seed, payload("DELETE", {}, "f1"))).toHaveLength(0);
  });

  it("applies every payload in a burst (parity with US-525)", () => {
    const rows = [
      { id: "f1", name: "Milk", is_safe: true, category: "dairy" },
      { id: "f2", name: "Eggs", is_safe: true, category: "protein" },
    ];
    const next = rows.reduce((state, r) => applyFoodRealtime(state, payload("INSERT", r)), [] as Food[]);
    expect(next.map((f) => f.id)).toEqual(["f1", "f2"]);
  });
});
