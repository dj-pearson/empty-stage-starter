import { describe, it, expect, beforeEach } from "vitest";
import { endOfWeek, startOfWeek, toISODate, PLANNER_WEEK_STARTS_ON } from "./date-utils";
import {
  DEFAULT_WEEK_STARTS_ON,
  WEEK_STARTS_ON_CACHE_KEY,
  adoptWeekStartsOnUser,
  getWeekStartsOn,
  parseWeekStartsOn,
  resetWeekStartsOnForTests,
  setWeekStartsOnLocal,
  subscribeWeekStartsOn,
} from "./weekStartPref";

beforeEach(() => {
  localStorage.clear();
  resetWeekStartsOnForTests();
});

describe("week math (item 3)", () => {
  it("defaults to Monday", () => {
    expect(PLANNER_WEEK_STARTS_ON).toBe(1);
    expect(DEFAULT_WEEK_STARTS_ON).toBe(1);
    // Thu Sep 24 2026 sits in the week of Mon Sep 21 .. Sun Sep 27.
    expect(toISODate(startOfWeek("2026-09-24"))).toBe("2026-09-21");
    expect(toISODate(endOfWeek("2026-09-24"))).toBe("2026-09-27");
  });

  it("puts a Sunday at the END of a Monday week and the START of a Sunday week", () => {
    expect(toISODate(startOfWeek("2026-09-27", 1))).toBe("2026-09-21");
    expect(toISODate(startOfWeek("2026-09-27", 0))).toBe("2026-09-27");
    expect(toISODate(endOfWeek("2026-09-27", 0))).toBe("2026-10-03");
  });

  it("does not move a date: the day is inside the window either way", () => {
    for (const ws of [0, 1] as const) {
      const s = toISODate(startOfWeek("2026-09-24", ws));
      const e = toISODate(endOfWeek("2026-09-24", ws));
      expect(s <= "2026-09-24" && "2026-09-24" <= e).toBe(true);
    }
  });
});

describe("parseWeekStartsOn", () => {
  it("accepts 0 and 1 only", () => {
    expect(parseWeekStartsOn(0)).toBe(0);
    expect(parseWeekStartsOn("1")).toBe(1);
    expect(parseWeekStartsOn(2)).toBeNull();
    expect(parseWeekStartsOn(null)).toBeNull();
    expect(parseWeekStartsOn("monday")).toBeNull();
  });
});

describe("week-start store", () => {
  it("is Monday with nothing cached", () => {
    expect(getWeekStartsOn()).toBe(1);
  });

  it("paints from the device cache before the server answers", () => {
    localStorage.setItem(WEEK_STARTS_ON_CACHE_KEY, JSON.stringify({ u: "u1", v: 0 }));
    expect(getWeekStartsOn()).toBe(0);
  });

  it("ignores a corrupt cache", () => {
    localStorage.setItem(WEEK_STARTS_ON_CACHE_KEY, "{not json");
    expect(getWeekStartsOn()).toBe(1);
    localStorage.setItem(WEEK_STARTS_ON_CACHE_KEY, JSON.stringify({ u: "u1", v: 7 }));
    resetWeekStartsOnForTests();
    expect(getWeekStartsOn()).toBe(1);
  });

  it("writes through to the cache and notifies subscribers", () => {
    let calls = 0;
    const off = subscribeWeekStartsOn(() => calls++);
    setWeekStartsOnLocal(0, "u1");
    expect(getWeekStartsOn()).toBe(0);
    expect(calls).toBe(1);
    expect(JSON.parse(localStorage.getItem(WEEK_STARTS_ON_CACHE_KEY) ?? "{}")).toEqual({ u: "u1", v: 0 });
    setWeekStartsOnLocal(0, "u1");
    expect(calls).toBe(1);
    off();
  });

  it("does not hand one account's Sunday to the next account on this browser", () => {
    localStorage.setItem(WEEK_STARTS_ON_CACHE_KEY, JSON.stringify({ u: "u1", v: 0 }));
    expect(getWeekStartsOn()).toBe(0);
    adoptWeekStartsOnUser("u2");
    expect(getWeekStartsOn()).toBe(1);
  });

  it("keeps the cached value for the same account", () => {
    localStorage.setItem(WEEK_STARTS_ON_CACHE_KEY, JSON.stringify({ u: "u1", v: 0 }));
    adoptWeekStartsOnUser("u1");
    expect(getWeekStartsOn()).toBe(0);
  });
});
