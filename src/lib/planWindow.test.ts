import { describe, it, expect } from "vitest";
import { mergeWindowedPlanEntries } from "./planWindow";
import type { PlanEntry } from "@/types";

const entry = (id: string, date: string): PlanEntry =>
  ({ id, date, kid_id: "k1", meal_slot: "dinner", food_id: "f1", result: "planned" } as unknown as PlanEntry);

// Window: 2026-06-01 .. 2026-08-01 (a -30/+90-style range).
const WSTART = "2026-06-01";
const WEND = "2026-08-01";

describe("mergeWindowedPlanEntries (US-538)", () => {
  it("keeps an out-of-window cached entry across a windowed server load", () => {
    const cached = [
      entry("old", "2026-01-15"), // before window — must survive
      entry("in", "2026-06-15"),  // inside window — will be replaced by server copy
      entry("future", "2026-12-25"), // after window — must survive
    ];
    const server = [entry("in", "2026-06-15"), entry("in2", "2026-07-01")];
    const merged = mergeWindowedPlanEntries(cached, server, WSTART, WEND);
    const ids = merged.map((e) => e.id).sort();
    expect(ids).toEqual(["future", "in", "in2", "old"]);
  });

  it("is server-authoritative in-window: a deleted-in-window entry is not resurrected", () => {
    // The cache still has 'gone' (deleted on another device within the window);
    // the server no longer returns it. It must NOT survive.
    const cached = [entry("gone", "2026-06-10"), entry("old", "2026-01-01")];
    const server: PlanEntry[] = [entry("kept", "2026-06-20")];
    const merged = mergeWindowedPlanEntries(cached, server, WSTART, WEND);
    const ids = merged.map((e) => e.id).sort();
    expect(ids).toEqual(["kept", "old"]); // 'gone' dropped, 'old' (out-of-window) kept
  });

  it("prefers the server row when an id appears in both", () => {
    const cached = [entry("dup", "2026-05-01")]; // cached copy is out-of-window-dated
    const server = [entry("dup", "2026-06-05")]; // server copy in-window
    const merged = mergeWindowedPlanEntries(cached, server, WSTART, WEND);
    expect(merged).toHaveLength(1);
    expect(merged[0].date).toBe("2026-06-05"); // server copy wins
  });
});
