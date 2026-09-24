import { describe, it, expect } from "vitest";
import { getSetupSteps, isSetupComplete, nextStep } from "./setupSteps";

const TODAY = "2026-09-24";
const base = {
  kids: [{ id: "k1" }],
  foods: [{ is_safe: true }, { is_safe: true }, { is_safe: true }],
  planEntries: [{ date: TODAY }],
  groceryItems: [{ checked: false }],
  hydrated: true,
  todayKey: TODAY,
};

const done = (input: Parameters<typeof getSetupSteps>[0], id: string) =>
  getSetupSteps(input)?.find((s) => s.id === id)?.done;

describe("getSetupSteps", () => {
  it("returns null until hydrated", () => {
    expect(getSetupSteps({ ...base, hydrated: false })).toBeNull();
    expect(nextStep(null)).toBeNull();
    expect(isSetupComplete(null)).toBe(false);
  });

  it("makes 'kid' the next step for an account with no kids", () => {
    const steps = getSetupSteps({ ...base, kids: [], foods: [], planEntries: [], groceryItems: [] });
    expect(nextStep(steps)?.id).toBe("kid");
    expect(steps?.every((s) => !s.done)).toBe(true);
  });

  it("needs three safe foods, counted household-wide", () => {
    expect(done({ ...base, foods: [{ is_safe: true }, { is_safe: true }, { is_safe: false }] }, "foods")).toBe(false);
    expect(done(base, "foods")).toBe(true);
  });

  it("counts a plan for any kid today or later, not a past one", () => {
    expect(done({ ...base, planEntries: [{ date: "2026-09-30" }] }, "plan")).toBe(true);
    expect(done({ ...base, planEntries: [{ date: "2026-09-23" }] }, "plan")).toBe(false);
  });

  it("does not count an all-checked grocery list", () => {
    expect(done({ ...base, groceryItems: [{ checked: true }, { checked: true }] }, "grocery")).toBe(false);
  });

  it("is complete when every step is done", () => {
    const steps = getSetupSteps(base);
    expect(isSetupComplete(steps)).toBe(true);
    expect(nextStep(steps)).toBeNull();
  });
});
