// Vitest mirror for the edge function's template transforms, so the allergen
// check and the weekday realignment run in CI without Deno.
import { describe, expect, it } from "vitest";
import {
  buildTemplatePlanRows,
  templateEntryDate,
  templateWeekdayShift,
  unsafeReason,
  type FoodSafety,
} from "../../supabase/functions/_shared/meal-plan-templates";

const food = (id: string, name: string, allergens: string[]): Map<string, FoodSafety> =>
  new Map([[id, { name, allergens }]]);

const nutKid = { id: "k", allergens: ["tree nuts"], dietary_restrictions: [] };

describe("unsafeReason uses the shared family- and name-aware matcher", () => {
  it("catches a family member tag against a tree-nut allergy", () => {
    expect(unsafeReason(nutKid, "a", food("a", "Trail mix", ["almonds"]))).toBe("contains almonds");
    expect(unsafeReason(nutKid, "b", food("b", "Snack", ["en:cashew-nuts"]))).toBe("contains tree nut");
  });

  it("catches an untagged food by its name", () => {
    expect(unsafeReason(nutKid, "c", food("c", "Almond butter", []))).toBe("contains tree nut");
  });

  it("leaves guarded names alone and keeps the old spelling-based reasons", () => {
    expect(unsafeReason(nutKid, "d", food("d", "Butternut squash", []))).toBeNull();
    const peanutKid = { id: "p", allergens: ["Peanut"], dietary_restrictions: [] };
    expect(unsafeReason(peanutKid, "s", food("s", "satay", ["Peanuts"]))).toBe("contains peanuts");
    const dairyKid = { id: "d", allergens: [], dietary_restrictions: ["dairy"] };
    expect(unsafeReason(dairyKid, "y", food("y", "yoghurt", ["en:milk"]))).toBe("restricted: en:milk");
  });
});

describe("template weekday realignment", () => {
  it("is 0 when the template has no source week or the weekdays agree", () => {
    expect(templateWeekdayShift(null, "2026-09-07")).toBe(0);
    expect(templateWeekdayShift("2026-08-31", "2026-09-07")).toBe(0);
  });

  it("keeps each meal's weekday when a Sunday-start template is applied to a Monday week", () => {
    const shift = templateWeekdayShift("2026-08-30", "2026-09-07"); // Sun -> Mon
    expect(shift).toBe(6);
    // offset 0 was Sunday; it lands on the Sunday of the target week.
    expect(templateEntryDate("2026-09-07", 0, shift)).toBe("2026-09-13");
    // offset 1 was Monday; it lands on the Monday.
    expect(templateEntryDate("2026-09-07", 1, shift)).toBe("2026-09-07");
    // offset 6 was Saturday.
    expect(templateEntryDate("2026-09-07", 6, shift)).toBe("2026-09-12");
  });

  it("buildTemplatePlanRows places rows on the realigned dates", () => {
    const { rows } = buildTemplatePlanRows({
      templateEntries: [{ day_of_week: 0, meal_slot: "dinner", food_ids: ["f"] }],
      kids: [{ id: "k", allergens: [], dietary_restrictions: [] }],
      foodsById: food("f", "Rice", []),
      userId: "u",
      householdId: "h",
      startDate: "2026-09-07",
      templateName: "T",
      createdFromWeek: "2026-08-30",
    });
    expect(rows.map((r) => r.date)).toEqual(["2026-09-13"]);
  });
});
