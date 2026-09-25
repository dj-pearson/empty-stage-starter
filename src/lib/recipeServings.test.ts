import { describe, it, expect } from "vitest";
import {
  DEFAULT_SERVINGS,
  clampTargetServings,
  parseBaseServings,
  servingScale,
} from "./recipeServings";

describe("parseBaseServings", () => {
  it("reads the number out of 'Serves 4'", () => {
    expect(parseBaseServings("Serves 4")).toBe(4);
  });

  it("gives the default for an empty string", () => {
    expect(parseBaseServings("")).toBe(DEFAULT_SERVINGS);
  });

  it("gives the default for text with no number", () => {
    expect(parseBaseServings("abc")).toBe(DEFAULT_SERVINGS);
  });

  it("takes the low end of a range and ignores zero", () => {
    expect(parseBaseServings("4-6 servings")).toBe(4);
    expect(parseBaseServings("0")).toBe(DEFAULT_SERVINGS);
    expect(parseBaseServings(undefined, 2)).toBe(2);
    expect(parseBaseServings(6)).toBe(6);
  });
});

describe("servingScale / clampTargetServings", () => {
  it("never returns NaN", () => {
    expect(servingScale(8, 4)).toBe(2);
    expect(servingScale(8, 0)).toBe(1);
    expect(servingScale(Number.NaN, 4)).toBe(1);
  });

  it("clamps to 1-24", () => {
    expect(clampTargetServings(0)).toBe(1);
    expect(clampTargetServings(30)).toBe(24);
    expect(clampTargetServings(5)).toBe(5);
  });
});
