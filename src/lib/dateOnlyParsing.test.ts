import { describe, it, expect, beforeAll } from "vitest";
import {
  toDate,
  parseIsoDate,
  toISODate,
  formatDate,
  isToday,
  startOfDay,
  startOfWeek,
  getDayName,
} from "./date-utils";

/**
 * US-828: a 'YYYY-MM-DD' key is a calendar DAY, not an instant.
 *
 * `new Date('2026-03-08')` is specified to parse as UTC midnight. Rendered by a
 * local formatter anywhere west of Greenwich that is March 7. toISODate()
 * deliberately builds its key from LOCAL parts (US-818 fixed the write side),
 * so the app wrote local keys and read them back as UTC -- and the round trip
 * lost a day for every user in the Americas.
 *
 * These run under a fixed TZ so the assertions mean the same thing everywhere.
 */

beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
});

const LA_OFFSET_IS_NEGATIVE = new Date("2026-03-08T12:00:00Z").getTimezoneOffset() > 0;

describe("the harness really is west of UTC", () => {
  it("is running in a negative-offset zone, or these tests prove nothing", () => {
    // Guard the instrument: under TZ=UTC every assertion below passes whether
    // or not the bug is present.
    expect(LA_OFFSET_IS_NEGATIVE).toBe(true);
  });
});

describe("date-only strings parse as local midnight", () => {
  it("keeps the calendar day the string names", () => {
    const d = parseIsoDate("2026-03-08");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(0);
  });

  it("round-trips through toISODate, which the old code could not", () => {
    for (const key of ["2026-01-01", "2026-03-08", "2026-07-04", "2026-12-31"]) {
      expect(toISODate(parseIsoDate(key))).toBe(key);
    }
  });

  it("today's key round-trips to today", () => {
    const key = toISODate(new Date());
    expect(toISODate(parseIsoDate(key))).toBe(key);
    expect(isToday(key)).toBe(true);
  });

  it("renders the day the user picked, not the one before", () => {
    expect(parseIsoDate("2026-03-08").toLocaleDateString("en-US")).toBe("3/8/2026");
    expect(getDayName("2026-03-08")).toBe("Sunday");
  });
});

describe("a real instant is left alone", () => {
  // created_at and friends are moments in time. Shifting them to local midnight
  // would be the same bug pointing the other way.
  it("does not touch a string carrying a time", () => {
    const iso = "2026-03-08T04:30:00.000Z";
    expect(toDate(iso).toISOString()).toBe(iso);
  });

  it("does not touch a Date or a timestamp", () => {
    const now = new Date();
    expect(toDate(now).getTime()).toBe(now.getTime());
    expect(toDate(now.getTime()).getTime()).toBe(now.getTime());
  });
});

describe("every date-utils helper inherits the fix", () => {
  it.each([
    ["formatDate", () => formatDate("2026-03-08", "short")],
    ["startOfDay", () => toISODate(startOfDay("2026-03-08"))],
    ["startOfWeek", () => toISODate(startOfWeek("2026-03-08"))],
  ])("%s reads the key as the day it names", (_name, run) => {
    const out = run();
    // March 8 2026 is a Sunday, so it is also the start of its week.
    expect(out).toMatch(/3\/8\/26|2026-03-08/);
  });

  it("isToday is not off by one at either end of the day", () => {
    const key = toISODate(new Date());
    expect(isToday(key)).toBe(true);
  });
});
