import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { parseIsoDate, toISODate } from "./date-utils";

/**
 * US-830: a plan entry's `date` is a calendar key, and two different things are
 * done with it. They need opposite parsing, which is the whole trap.
 *
 *  - BUCKETING against "today" (TodayMeals, streak grouping) must be LOCAL, or
 *    today's entry lands on yesterday for every user west of Greenwich.
 *  - DAY ARITHMETIC between two keys (copy-week, delete-week) must be UTC, or
 *    a 23-hour DST day makes two consecutive dates read as the same day.
 *
 * The suite runs in America/Los_Angeles (US-828), so both are observable.
 *
 * The first two blocks pin the RULES using local helpers -- they demonstrate
 * the arithmetic, they do not exercise any component. That distinction matters:
 * on their own they stayed green against a mutant that reverted the call sites,
 * because they never touch them. The source guards at the bottom are what
 * actually hold the components to the rules.
 */

/** Local-midnight bucketing, as the streak code does it. */
function bucket(key: string): number {
  const d = parseIsoDate(key);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

describe("bucketing a key against today", () => {
  it("puts today's entry on today, not yesterday", () => {
    const todayKey = toISODate(new Date());
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(bucket(todayKey)).toBe(today.getTime());
  });

  it("the old raw new Date() did not", () => {
    // Pin the bug itself, so nobody reintroduces `new Date(entry.date)` and
    // finds the suite still green.
    const todayKey = toISODate(new Date());
    const wrong = new Date(todayKey);
    wrong.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(wrong.getTime()).not.toBe(today.getTime());
  });

  it("keeps consecutive days distinct", () => {
    expect(bucket("2026-03-08")).not.toBe(bucket("2026-03-09"));
  });
});

describe("day differences survive a DST boundary", () => {
  const dayDiff = (a: string, b: string, round: (n: number) => number) =>
    round((bucket(a) - bucket(b)) / 86_400_000);

  // 2026-03-08 is US spring-forward: local midnight to local midnight is 23h.
  it("floor collapses the spring-forward day, which broke the streak", () => {
    expect(dayDiff("2026-03-09", "2026-03-08", Math.floor)).toBe(0);
  });

  it("round keeps it at one day", () => {
    expect(dayDiff("2026-03-09", "2026-03-08", Math.round)).toBe(1);
  });

  it("round is unchanged on ordinary days and on fall-back", () => {
    expect(dayDiff("2026-06-02", "2026-06-01", Math.round)).toBe(1);
    expect(dayDiff("2026-11-02", "2026-11-01", Math.round)).toBe(1);
    expect(dayDiff("2026-06-05", "2026-06-01", Math.round)).toBe(4);
  });
});

describe("week arithmetic stays in UTC", () => {
  // PlanContext computes daysDiff between a week start and each entry with
  // new Date() on BOTH sides. UTC days are always exactly 24h, so the floor is
  // exact -- switching either side to local would reintroduce the DST collapse.
  const utcDiff = (a: string, b: string) =>
    Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

  it("is exact across spring-forward", () => {
    expect(utcDiff("2026-03-09", "2026-03-08")).toBe(1);
    expect(utcDiff("2026-03-14", "2026-03-08")).toBe(6);
  });
});


describe("the call sites follow those rules", () => {
  const read = (rel: string) =>
    readFileSync(path.resolve(__dirname, "../..", rel), "utf-8");

  const STREAK_FILES = [
    "src/components/ProgressDashboard.tsx",
    "src/components/AchievementsView.tsx",
  ];

  it.each(STREAK_FILES)("%s buckets entry dates locally", (file) => {
    const src = read(file);
    expect(src).toMatch(/parseIsoDate\(entry\.date\)/);
    // The raw form is the bug; it must not come back.
    expect(src).not.toMatch(/new Date\(entry\.date\)/);
  });

  it.each(STREAK_FILES)("%s rounds its day difference", (file) => {
    const src = read(file);
    expect(src).toMatch(/dayDiff = Math\.round\(/);
    expect(src).not.toMatch(/dayDiff = Math\.floor\(/);
  });

  it("TodayMeals asks isToday about a locally-parsed key", () => {
    expect(read("src/components/TodayMeals.tsx")).toMatch(/isToday\(parseIsoDate\(p\.date\)\)/);
  });

  // The opposite rule, guarded so a later "consistency" pass does not convert
  // it: PlanContext's week arithmetic must keep BOTH sides on new Date().
  it("PlanContext keeps its week arithmetic in UTC", () => {
    const src = read("src/contexts/PlanContext.tsx");
    expect(src).toMatch(/const fromDateObj = new Date\(fromDate\);/);
    expect(src).toMatch(/const entryDate = new Date\(entry\.date\);/);
    expect(src).not.toMatch(/parseIsoDate\(entry\.date\)/);
  });
});
