import { describe, it, expect } from "vitest";
import type { Food } from "@/types";
import {
  allergenConflictsFor,
  allergenCopyKind,
  dropAllergenEntries,
  manualAddPrompt,
  type GuardKid,
} from "./planAllergenGuard";

const food = (id: string, name: string, allergens: string[] = []): Food =>
  ({ id, name, category: "protein", is_safe: true, is_try_bite: false, allergens }) as Food;

const foods = [food("pb", "Peanut butter"), food("yog", "Yogurt"), food("rice", "Rice"), food("mix", "Trail mix", ["almonds"])];
const byId = new Map(foods.map((f) => [f.id, f]));

const maya: GuardKid = { id: "m", name: "Maya", allergens: ["peanuts", "milk"], allergen_severity: { peanuts: "severe", milk: "mild" } };
const leo: GuardKid = { id: "l", name: "Leo", allergens: ["tree nuts"], allergen_severity: { "tree nuts": "moderate" } };
/** Tree-nut allergy recorded with no severity: treated as severe (item 3a). */
const robin: GuardKid = { id: "r", name: "Robin", allergens: ["tree nuts"] };

describe("manualAddPrompt", () => {
  it("is null when nothing conflicts", () => {
    expect(manualAddPrompt([maya, leo], ["rice"], byId)).toBeNull();
  });

  it("leads with the severe conflict so the confirm can name child and allergen", () => {
    const p = manualAddPrompt([maya], ["yog", "pb"], byId)!;
    expect(p.severe).toBe(true);
    expect(p.lead?.kid.name).toBe("Maya");
    expect(p.lead?.allergen).toBe("peanut");
    expect(p.conflicts.map((c) => c.food.id)).toEqual(["pb", "yog"]);
  });

  it("is not severe for a mild or moderate hit, but still asks", () => {
    const p = manualAddPrompt([maya, leo], ["yog", "mix"], byId)!;
    expect(p.severe).toBe(false);
    expect(p.lead).toBeNull();
    expect(p.conflicts.map((c) => `${c.kid.id}:${c.allergen}`)).toEqual(["m:milk", "l:tree nut"]);
    expect(p.conflicts.map(allergenCopyKind)).toEqual(["plain", "plain"]);
  });

  it("gives an unrated hit the severe confirm, with copy that says the severity was not recorded (item 3a)", () => {
    const p = manualAddPrompt([robin], ["mix"], byId)!;
    expect(p.severe).toBe(true);
    expect(p.lead?.kid.name).toBe("Robin");
    expect(p.lead?.allergen).toBe("tree nut");
    expect(p.lead?.severity).toBe("severe");
    expect(p.lead?.severityRecorded).toBe(false);
    expect(allergenCopyKind(p.lead!)).toBe("severeUnrated");
  });

  it("leads with a recorded severe hit over an unrated one, then the mild", () => {
    const p = manualAddPrompt([robin, maya], ["mix", "yog", "pb"], byId)!;
    expect(p.lead?.kid.name).toBe("Maya");
    expect(p.conflicts.map((c) => `${c.kid.id}:${allergenCopyKind(c)}`)).toEqual([
      "m:severe",
      "r:severeUnrated",
      "m:plain",
    ]);
  });
});

describe("allergenConflictsFor", () => {
  it("orders severe conflicts first", () => {
    const out = allergenConflictsFor([maya], ["yog", "pb"], byId);
    expect(out.map((c) => c.severity)).toEqual(["severe", "mild"]);
  });

  it("puts an unrated conflict with the severe ones, ahead of mild and moderate", () => {
    const out = allergenConflictsFor([leo, maya, robin], ["mix", "yog"], byId);
    expect(out.map((c) => `${c.kid.id}:${c.severity}`)).toEqual(["r:severe", "l:moderate", "m:mild"]);
  });
});

describe("dropAllergenEntries", () => {
  it("drops only the entries that hit that entry's kid", () => {
    const entries = [
      { kid_id: "m", food_id: "pb", date: "2026-01-01" },
      { kid_id: "m", food_id: "pb", date: "2026-01-02" },
      { kid_id: "m", food_id: "rice", date: "2026-01-01" },
      { kid_id: "l", food_id: "pb", date: "2026-01-01" },
      { kid_id: "l", food_id: "mix", date: "2026-01-01" },
    ];
    const { kept, dropped } = dropAllergenEntries(entries, [maya, leo], byId);
    expect(kept.map((e) => `${e.kid_id}:${e.food_id}`)).toEqual(["m:rice", "l:pb"]);
    expect(dropped.map((c) => `${c.kid.id}:${c.food.id}`)).toEqual(["m:pb", "l:mix"]);
  });

  it("drops an unrated hit from an auto-plan, like a severe one (item 3a)", () => {
    const { kept, dropped } = dropAllergenEntries(
      [{ kid_id: "r", food_id: "mix" }, { kid_id: "r", food_id: "rice" }],
      [robin],
      byId,
    );
    expect(kept.map((e) => e.food_id)).toEqual(["rice"]);
    expect(dropped.map((c) => [c.food.id, c.severity, c.severityRecorded])).toEqual([["mix", "severe", false]]);
  });

  it("keeps entries for kids it was not given and foods it does not know", () => {
    const { kept } = dropAllergenEntries([{ kid_id: "x", food_id: "pb" }, { kid_id: "m", food_id: "ghost" }], [maya], byId);
    expect(kept).toHaveLength(2);
  });
});
