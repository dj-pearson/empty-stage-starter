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
      expect(config.bgLight).toBe("bg-cat-other-soft");
      expect(config.text).toBe("text-cat-other");
      expect(config.dot).toBe("bg-cat-other");
    }
  });

  it("returns the real config for a known category", () => {
    expect(getCategoryConfig("dairy")).toBe(CATEGORY_CONFIG.dairy);
  });

  it("does not treat prototype keys as categories", () => {
    expect(getCategoryConfig("toString").value).toBe("other");
  });
});

describe("category colours (item 24)", () => {
  const all = [...Object.values(CATEGORY_CONFIG), getCategoryConfig("other")];
  const classesOf = (c: (typeof all)[number]) =>
    [c.bgLight, c.bgDark, c.text, c.border, c.dot, c.iconOnDot, c.pillActive, c.pillInactive, c.badgeBg, c.badgeText]
      .join(" ")
      .split(/\s+/)
      .filter(Boolean);

  it("uses only category tokens, never a raw palette class", () => {
    const palette =
      /(?:^|:)(?:bg|text|border)-(?:red|amber|yellow|blue|pink|purple|emerald|green|orange|slate|gray)-\d/;
    for (const config of all) {
      for (const cls of classesOf(config)) {
        expect(cls, `${config.value}: ${cls}`).not.toMatch(palette);
        expect(cls, `${config.value}: ${cls}`).toMatch(/cat-/);
      }
    }
  });

  it("names its own category's token in every class", () => {
    for (const config of all) {
      for (const cls of classesOf(config)) {
        expect(cls).toContain(`cat-${config.value}`);
      }
    }
  });

  it("draws text on a fill with that fill's foreground token", () => {
    for (const config of all) {
      expect(config.pillActive).toContain(`bg-cat-${config.value} `);
      expect(config.pillActive).toContain(`text-cat-${config.value}-foreground`);
      expect(config.iconOnDot).toBe(`text-cat-${config.value}-foreground`);
    }
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
