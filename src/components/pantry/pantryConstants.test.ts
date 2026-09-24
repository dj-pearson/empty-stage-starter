import { describe, it, expect } from "vitest";
import {
  CATEGORY_CONFIG,
  PANTRY_DISPLAY_ORDER,
  getCategoryConfig,
  isLastUnit,
  parseQuantityInput,
  stepDown,
  toDisplayCategory,
} from "./pantryConstants";

describe("stepDown", () => {
  it("never goes negative on a fractional quantity", () => {
    expect(stepDown(0.5)).toBe(0);
    expect(stepDown(1)).toBe(0);
    expect(stepDown(1.5)).toBe(0.5);
    expect(stepDown(3)).toBe(2);
  });

  it("rounds to two decimals rather than leaking float error", () => {
    expect(stepDown(1.1)).toBe(0.1);
  });
});

describe("isLastUnit", () => {
  it("is true only when one more step empties the item", () => {
    expect(isLastUnit(0.5)).toBe(true);
    expect(isLastUnit(1)).toBe(true);
    expect(isLastUnit(1.5)).toBe(false);
    expect(isLastUnit(3)).toBe(false);
    expect(isLastUnit(0)).toBe(false);
  });
});

describe("getCategoryConfig", () => {
  it("returns the neutral config for 'other', unknown and missing categories", () => {
    for (const c of ["other", "frozen", undefined, null, ""]) {
      const config = getCategoryConfig(c);
      expect(config.value).toBe("other");
      expect(config.bgLight).toBe("bg-muted");
      expect(config.text).toBe("text-muted-foreground");
      expect(config.border).toBe("border-border");
    }
  });

  it("returns the real config for a known category", () => {
    expect(getCategoryConfig("dairy")).toBe(CATEGORY_CONFIG.dairy);
  });

  it("does not treat prototype keys as categories", () => {
    expect(getCategoryConfig("toString").value).toBe("other");
  });
});

describe("toDisplayCategory", () => {
  it("keeps known categories and maps everything else to other", () => {
    expect(toDisplayCategory("fruit")).toBe("fruit");
    expect(toDisplayCategory("Fruit")).toBe("other");
    expect(toDisplayCategory(undefined)).toBe("other");
  });

  it("puts other last in the display order", () => {
    expect(PANTRY_DISPLAY_ORDER[PANTRY_DISPLAY_ORDER.length - 1]).toBe("other");
    expect(PANTRY_DISPLAY_ORDER).toHaveLength(7);
  });
});

describe("parseQuantityInput", () => {
  it("keeps decimals and refuses what is not a count", () => {
    expect(parseQuantityInput("1.5")).toBe(1.5);
    expect(parseQuantityInput("0.333")).toBe(0.33);
    expect(parseQuantityInput("0")).toBe(0);
    expect(parseQuantityInput("-1")).toBeNull();
    expect(parseQuantityInput("abc")).toBeNull();
    expect(parseQuantityInput("")).toBeNull();
    expect(parseQuantityInput("Infinity")).toBeNull();
  });
});
