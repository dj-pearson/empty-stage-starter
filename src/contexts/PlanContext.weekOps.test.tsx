/**
 * US-551: copyWeekPlan/deleteWeekPlan read current entries from a ref (updated
 * each render), not from an impure `setPlanEntriesRaw(prev => {...})` side
 * effect. Verified under StrictMode double-invocation.
 */
import { render, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { PlanProvider, usePlan } from "./PlanContext";
import type { PlanEntry } from "@/types";

// Unauthenticated so the local (no-Supabase) delete branch runs.
vi.mock("./AuthContext", () => ({ useAuth: () => ({ userId: null, householdId: null }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }),
    removeChannel: vi.fn(),
    from: vi.fn(),
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useRealtimeSubscription", () => ({ registerSubscription: vi.fn(), unregisterSubscription: vi.fn() }));

let api: ReturnType<typeof usePlan> | null = null;
function Probe() { api = usePlan(); return null; }

const entry = (id: string, date: string, kidId = "k1"): PlanEntry =>
  ({ id, date, kid_id: kidId, meal_slot: "dinner", food_id: "f1", result: "planned" } as unknown as PlanEntry);

describe("PlanContext week ops read current state via ref (US-551)", () => {
  beforeEach(() => { api = null; });

  it("deleteWeekPlan removes exactly the target week/kid entries (under StrictMode)", async () => {
    render(
      <React.StrictMode>
        <PlanProvider><Probe /></PlanProvider>
      </React.StrictMode>
    );
    await waitFor(() => expect(api).not.toBeNull());

    act(() => {
      api!.setPlanEntries([
        entry("in-1", "2026-06-01"),          // inside week of 2026-06-01
        entry("in-2", "2026-06-05"),          // inside week
        entry("out", "2026-06-10"),           // outside week
        entry("other-kid", "2026-06-02", "k2"), // inside week, different kid
      ]);
    });
    await waitFor(() => expect(api!.planEntries).toHaveLength(4));

    await act(async () => { await api!.deleteWeekPlan("2026-06-01", "k1"); });

    const ids = api!.planEntries.map((e) => e.id).sort();
    // Only k1's in-week entries removed; out-of-week and other-kid survive.
    expect(ids).toEqual(["other-kid", "out"]);
  });

  it("deleteWeekPlan is a no-op when no entries fall in the week", async () => {
    render(<PlanProvider><Probe /></PlanProvider>);
    await waitFor(() => expect(api).not.toBeNull());
    act(() => { api!.setPlanEntries([entry("out", "2026-07-01")]); });
    await act(async () => { await api!.deleteWeekPlan("2026-06-01", "k1"); });
    expect(api!.planEntries.map((e) => e.id)).toEqual(["out"]);
  });
});
