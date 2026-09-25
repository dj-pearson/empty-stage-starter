import { describe, it, expect } from "vitest";
import type { PlanEntry } from "@/types";
import { buildTodayPlan, lastUnloggedEntry, slotStatus, SLOT_HOURS } from "./todayPlan";

const TODAY = "2026-09-24";
const YESTERDAY = "2026-09-23";

let seq = 0;
function row(p: Partial<PlanEntry> & Pick<PlanEntry, "kid_id" | "meal_slot" | "food_id">): PlanEntry {
  seq += 1;
  return {
    id: p.id ?? `e${String(seq).padStart(3, "0")}`,
    date: TODAY,
    result: null,
    ...p,
  };
}

/** Local wall-clock time on TODAY. The suite runs in America/Los_Angeles. */
const at = (hour: number, minute = 0, day = 24) => new Date(2026, 8, day, hour, minute);

const kids = [{ id: "maya" }, { id: "leo" }];

describe("slotStatus", () => {
  it("is not_planned without an entry", () => {
    expect(slotStatus(undefined, "dinner", at(19))).toBe("not_planned");
  });

  it("keeps dinner upcoming at 07:00 and makes it due at 18:00", () => {
    const e = { result: null };
    expect(slotStatus(e, "dinner", at(7))).toBe("upcoming");
    expect(slotStatus(e, "dinner", at(17, 59))).toBe("upcoming");
    expect(slotStatus(e, "dinner", at(18))).toBe("due");
  });

  it("treats try_bite as due all day", () => {
    expect(slotStatus({ result: null }, "try_bite", at(8))).toBe("due");
    expect(slotStatus({ result: null }, "try_bite", at(0, 5))).toBe("due");
  });

  it("covers the snack slots", () => {
    expect(SLOT_HOURS.snack1).toBe(10);
    expect(SLOT_HOURS.snack2).toBe(15);
    expect(slotStatus({ result: null }, "snack1", at(9))).toBe("upcoming");
    expect(slotStatus({ result: null }, "snack1", at(10))).toBe("due");
    expect(slotStatus({ result: null }, "snack2", at(15))).toBe("due");
  });

  it("returns the recorded result whatever the hour", () => {
    expect(slotStatus({ result: "ate" }, "dinner", at(7))).toBe("ate");
    expect(slotStatus({ result: "tasted" }, "lunch", at(7))).toBe("tasted");
    expect(slotStatus({ result: "refused" }, "breakfast", at(20))).toBe("refused");
  });
});

describe("buildTodayPlan", () => {
  it("turns a 3-row recipe dinner into one dish logged on the is_primary_dish row", () => {
    const entries = [
      row({ id: "a", kid_id: "maya", meal_slot: "dinner", food_id: "pasta", recipe_id: "mac" }),
      row({ id: "b", kid_id: "maya", meal_slot: "dinner", food_id: "cheese", recipe_id: "mac", is_primary_dish: true }),
      row({ id: "c", kid_id: "maya", meal_slot: "dinner", food_id: "milk", recipe_id: "mac" }),
    ];
    const plan = buildTodayPlan(entries, [{ id: "maya" }], TODAY);
    const dinner = plan.byKid.get("maya")?.dinner;
    expect(dinner).toBeDefined();
    expect(dinner?.dishKey).toBe("mac");
    expect(dinner?.recipeId).toBe("mac");
    expect(dinner?.primaryEntryId).toBe("b");
    expect(dinner?.foodIds).toEqual(["pasta", "cheese", "milk"]);
    expect(dinner?.isSubstitute).toBe(false);
    expect(dinner?.result).toBeNull();
  });

  it("ignores other dates and kids not asked about", () => {
    const entries = [
      row({ kid_id: "maya", meal_slot: "dinner", food_id: "rice", date: YESTERDAY }),
      row({ kid_id: "stranger", meal_slot: "dinner", food_id: "rice" }),
    ];
    const plan = buildTodayPlan(entries, kids, TODAY);
    expect(plan.byKid.get("maya")).toEqual({});
    expect(plan.byKid.get("leo")).toEqual({});
    expect(plan.byKid.has("stranger")).toBe(false);
  });

  it("includes snack1 and snack2", () => {
    const entries = [
      row({ kid_id: "maya", meal_slot: "snack1", food_id: "apple" }),
      row({ kid_id: "maya", meal_slot: "snack2", food_id: "crackers" }),
    ];
    const plan = buildTodayPlan(entries, kids, TODAY).byKid.get("maya");
    expect(plan?.snack1?.dishKey).toBe("apple");
    expect(plan?.snack2?.dishKey).toBe("crackers");
  });

  it("gives two kids on the same dinner two rows with the same dishKey", () => {
    const entries = [
      row({ id: "m1", kid_id: "maya", meal_slot: "dinner", food_id: "chicken", recipe_id: "satay", is_primary_dish: true }),
      row({ id: "m2", kid_id: "maya", meal_slot: "dinner", food_id: "rice", recipe_id: "satay" }),
      row({ id: "l1", kid_id: "leo", meal_slot: "dinner", food_id: "chicken", recipe_id: "satay", is_primary_dish: true }),
      row({ id: "l2", kid_id: "leo", meal_slot: "dinner", food_id: "rice", recipe_id: "satay" }),
    ];
    const plan = buildTodayPlan(entries, kids, TODAY);
    const maya = plan.byKid.get("maya")?.dinner;
    const leo = plan.byKid.get("leo")?.dinner;
    expect(maya?.dishKey).toBe("satay");
    expect(leo?.dishKey).toBe("satay");
    expect(maya?.primaryEntryId).toBe("m1");
    expect(leo?.primaryEntryId).toBe("l1");
  });

  it("flags a kid on a different dish as a substitute", () => {
    const entries = [
      row({ kid_id: "maya", meal_slot: "dinner", food_id: "chicken", recipe_id: "satay", is_primary_dish: true }),
      row({ kid_id: "leo", meal_slot: "dinner", food_id: "chicken", recipe_id: "satay", is_primary_dish: true }),
      row({ kid_id: "ava", meal_slot: "dinner", food_id: "toast" }),
    ];
    const plan = buildTodayPlan(entries, [...kids, { id: "ava" }], TODAY);
    expect(plan.byKid.get("ava")?.dinner?.isSubstitute).toBe(true);
    expect(plan.byKid.get("maya")?.dinner?.isSubstitute).toBe(false);
  });
});

describe("lastUnloggedEntry", () => {
  it("returns null with nothing past due", () => {
    const entries = [row({ kid_id: "maya", meal_slot: "dinner", food_id: "rice" })];
    expect(lastUnloggedEntry(entries, ["maya"], at(9))).toBeNull();
  });

  it("prefers today's past-due slot over yesterday's dinner", () => {
    const entries = [
      row({ id: "y-dinner", kid_id: "maya", meal_slot: "dinner", food_id: "rice", date: YESTERDAY }),
      row({ id: "t-breakfast", kid_id: "maya", meal_slot: "breakfast", food_id: "oats" }),
      row({ id: "t-dinner", kid_id: "maya", meal_slot: "dinner", food_id: "pasta" }),
    ];
    // 09:00: breakfast is due, dinner is not yet.
    expect(lastUnloggedEntry(entries, ["maya"], at(9))?.primaryEntryId).toBe("t-breakfast");
    // 19:00: dinner is the latest meal that has happened.
    expect(lastUnloggedEntry(entries, ["maya"], at(19))?.primaryEntryId).toBe("t-dinner");
  });

  it("falls back to yesterday when today has nothing due, and skips logged meals", () => {
    const entries = [
      row({ id: "y-lunch", kid_id: "maya", meal_slot: "lunch", food_id: "wrap", date: YESTERDAY }),
      row({ id: "y-dinner", kid_id: "maya", meal_slot: "dinner", food_id: "rice", date: YESTERDAY, result: "ate" }),
      row({ id: "t-lunch", kid_id: "maya", meal_slot: "lunch", food_id: "soup" }),
    ];
    const found = lastUnloggedEntry(entries, ["maya"], at(8));
    expect(found?.primaryEntryId).toBe("y-lunch");
    expect(found?.date).toBe(YESTERDAY);
  });

  it("logs a recipe on its primary row and ignores try_bite and old dates", () => {
    const entries = [
      row({ id: "r1", kid_id: "maya", meal_slot: "lunch", food_id: "bread", recipe_id: "sandwich" }),
      row({ id: "r2", kid_id: "maya", meal_slot: "lunch", food_id: "ham", recipe_id: "sandwich", is_primary_dish: true }),
      row({ id: "tb", kid_id: "maya", meal_slot: "try_bite", food_id: "kiwi" }),
      row({ id: "old", kid_id: "maya", meal_slot: "dinner", food_id: "fish", date: "2026-09-10" }),
    ];
    const found = lastUnloggedEntry(entries, ["maya"], at(13));
    expect(found?.primaryEntryId).toBe("r2");
    expect(found?.slot).toBe("lunch");
  });

  it("uses local date keys, not UTC, late in the evening", () => {
    // 23:30 in Los Angeles is already the next day in UTC; toISOString would
    // call this 2026-09-25 and find nothing.
    const entries = [row({ id: "late", kid_id: "maya", meal_slot: "dinner", food_id: "rice" })];
    const now = at(23, 30);
    expect(now.toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(lastUnloggedEntry(entries, ["maya"], now)?.primaryEntryId).toBe("late");
    expect(lastUnloggedEntry(entries, ["maya"], now)?.date).toBe(TODAY);
  });
});
