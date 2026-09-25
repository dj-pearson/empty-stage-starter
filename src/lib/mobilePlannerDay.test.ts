import { describe, it, expect } from "vitest";
import { todayIndex, weekdayIndex, isoDay } from "./mobilePlannerDay";

describe("mobilePlannerDay", () => {
  const sunday = new Date(2026, 8, 20); // Sun Sep 20 2026

  it("finds today inside the week", () => {
    expect(todayIndex(sunday, new Date(2026, 8, 24, 18, 30))).toBe(4);
    expect(todayIndex(sunday, new Date(2026, 8, 20, 0, 0))).toBe(0);
    expect(todayIndex(sunday, new Date(2026, 8, 26, 23, 59))).toBe(6);
  });

  it("returns -1 outside the week", () => {
    expect(todayIndex(sunday, new Date(2026, 8, 27))).toBe(-1);
    expect(todayIndex(sunday, new Date(2026, 8, 19))).toBe(-1);
  });

  it("gives today's weekday offset for any week on the same start day", () => {
    const lastYear = new Date(2025, 0, 5); // a Sunday
    expect(weekdayIndex(lastYear, new Date(2026, 8, 24))).toBe(4);
  });

  it("formats a local ISO day", () => {
    expect(isoDay(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});
