import { describe, it, expect } from "vitest";
import { parseServerTimestamp, usageState } from "./usageState";

describe("usageState", () => {
  it("reads a null limit as unlimited", () => {
    expect(usageState(12, null, "count")).toBe("unlimited");
  });

  it("reads a 0 limit as not included, never full", () => {
    expect(usageState(0, 0, "quota")).toBe("not_included");
    expect(usageState(2, 0, "count")).toBe("not_included");
  });

  it("is over when current exceeds the limit (3 of 1)", () => {
    expect(usageState(3, 1, "count")).toBe("over");
  });

  it("is full at exactly the limit (1 of 1)", () => {
    expect(usageState(1, 1, "count")).toBe("full");
  });

  it("is near within max(1, ceil(20%)) of the limit", () => {
    // limit 10: near when 2 or fewer remain
    expect(usageState(8, 10, "quota")).toBe("near");
    expect(usageState(7, 10, "quota")).toBe("ok");
    // limit 3: ceil(0.6) = 1, so near with one left
    expect(usageState(2, 3, "count")).toBe("near");
    expect(usageState(1, 3, "count")).toBe("ok");
  });

  it("is ok well under the limit", () => {
    expect(usageState(0, 20, "quota")).toBe("ok");
  });
});

describe("parseServerTimestamp", () => {
  it("reads a zone-less Postgres timestamp as UTC", () => {
    expect(parseServerTimestamp("2026-09-25 00:00:00")?.toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });

  it("accepts ISO strings with a zone", () => {
    expect(parseServerTimestamp("2026-09-25T00:00:00Z")?.toISOString()).toBe("2026-09-25T00:00:00.000Z");
    expect(parseServerTimestamp("2026-09-25T02:00:00+02:00")?.toISOString()).toBe("2026-09-25T00:00:00.000Z");
    expect(parseServerTimestamp("2026-09-25 00:00:00+00")?.toISOString()).toBe("2026-09-25T00:00:00.000Z");
  });

  it("returns null for garbage", () => {
    expect(parseServerTimestamp("not a date")).toBeNull();
    expect(parseServerTimestamp("")).toBeNull();
    expect(parseServerTimestamp(null)).toBeNull();
    expect(parseServerTimestamp("2026-13-45 99:99:99")).toBeNull();
  });
});
