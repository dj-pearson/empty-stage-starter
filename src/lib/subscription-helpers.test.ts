import { describe, it, expect } from "vitest";
import { daysLeft, formatPlanDate, periodProgress } from "./subscription-helpers";

const NOW = new Date("2026-09-24T12:00:00Z");

describe("periodProgress", () => {
  it("is null when start equals end", () => {
    expect(periodProgress("2026-09-01T00:00:00Z", "2026-09-01T00:00:00Z", NOW)).toBeNull();
  });

  it("is null when the end is missing", () => {
    expect(periodProgress("2026-09-01T00:00:00Z", null, NOW)).toBeNull();
  });

  it("is 100 once the end has passed", () => {
    expect(periodProgress("2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z", NOW)).toBe(100);
  });

  it("is never NaN for an unparseable date", () => {
    expect(periodProgress("garbage", "2026-10-01T00:00:00Z", NOW)).toBeNull();
  });

  it("is the fraction of the period elapsed", () => {
    expect(periodProgress("2026-09-24T00:00:00Z", "2026-09-25T00:00:00Z", NOW)).toBe(50);
  });
});

describe("daysLeft", () => {
  it("is null for no end date", () => {
    expect(daysLeft(null, NOW)).toBeNull();
  });

  it("is 0 for an end in the past", () => {
    expect(daysLeft("2026-09-01T00:00:00Z", NOW)).toBe(0);
  });

  it("rounds a partial day up", () => {
    expect(daysLeft("2026-09-26T00:00:00Z", NOW)).toBe(2);
  });
});

describe("formatPlanDate", () => {
  it("returns null for an invalid string", () => {
    expect(formatPlanDate("not a date", "en-US")).toBeNull();
    expect(formatPlanDate(null, "en-US")).toBeNull();
  });

  it("formats a long date in the given locale", () => {
    expect(formatPlanDate("2026-09-25T12:00:00Z", "en-US")).toBe("September 25, 2026");
  });
});
