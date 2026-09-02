/**
 * US-551: copyWeekPlan/deleteWeekPlan read current entries from a ref (updated
 * each render), not from an impure `setPlanEntriesRaw(prev => {...})` side
 * effect. Verified under StrictMode double-invocation.
 */
import { render, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { PlanProvider, usePlan } from "./PlanContext";
import type { PlanEntry } from "@/types";

// Unauthenticated by default so the local (no-Supabase) delete branch runs.
// US-717's cases flip this to a signed-in user to exercise the server path.
const auth: { userId: string | null; householdId: string | null } = {
  userId: null,
  householdId: null,
};
vi.mock("./AuthContext", () => ({ useAuth: () => auth }));

const mockFrom = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }),
    removeChannel: vi.fn(),
    from: (...a: unknown[]) => mockFrom(...a),
  },
}));

// The real handler reaches for supabase.auth, which this file does not mock;
// without this stub it throws before the rollback ever runs.
vi.mock("@/lib/supabaseAuthError", () => ({
  isSupabaseAuthError: () => false,
  handleSupabaseAuthError: vi.fn().mockResolvedValue("not-auth-error"),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: (...a: unknown[]) => toastError(...a),
    success: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn(),
  }),
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


/**
 * US-717: a rejected insert must leave nothing behind.
 *
 * Both insert paths used to append a locally-generated row when the server
 * refused it. The meal looked planned, the debounced persist wrote it to the
 * localStorage backup, and it existed nowhere else -- a parent could plan a
 * whole week that lived only on that screen, with no error anywhere.
 */
describe("PlanContext insert rollback (US-717)", () => {
  beforeEach(() => {
    api = null;
    auth.userId = "u1";
    auth.householdId = "hh1";
    mockFrom.mockReset();
    toastError.mockReset();
  });

  afterEach(() => {
    auth.userId = null;
    auth.householdId = null;
  });

  /** A `from('plan_entries')` whose insert(...).select() rejects. */
  const rejectingInsert = (message = "permission denied") => {
    // addPlanEntries awaits select(); addPlanEntry awaits select().single().
    // One object serves both: a thenable that also carries .single().
    const result = () =>
      Object.assign(Promise.resolve({ data: null, error: { message } }), {
        single: () => Promise.resolve({ data: null, error: { message } }),
      });
    mockFrom.mockReturnValue({ insert: () => ({ select: result }) });
  };

  const renderProvider = async () => {
    render(
      <PlanProvider><Probe /></PlanProvider>
    );
    await waitFor(() => expect(api).not.toBeNull());
  };

  it("addPlanEntries leaves state unchanged when the insert rejects", async () => {
    rejectingInsert();
    await renderProvider();

    act(() => { api!.setPlanEntries([entry("existing", "2026-06-01")]); });
    await waitFor(() => expect(api!.planEntries).toHaveLength(1));

    await act(async () => {
      await api!.addPlanEntries([
        { kid_id: "k1", date: "2026-06-02", meal_slot: "dinner", food_id: "f2", result: null },
        { kid_id: "k1", date: "2026-06-03", meal_slot: "lunch", food_id: "f3", result: null },
      ] as unknown as Omit<PlanEntry, "id">[]);
    });

    await waitFor(() => expect(api!.planEntries.map((e) => e.id)).toEqual(["existing"]));
  });

  it("addPlanEntries tells the user instead of failing silently", async () => {
    rejectingInsert();
    await renderProvider();

    await act(async () => {
      await api!.addPlanEntries([
        { kid_id: "k1", date: "2026-06-02", meal_slot: "dinner", food_id: "f2", result: null },
      ] as unknown as Omit<PlanEntry, "id">[]);
    });

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/couldn't save/i);
  });

  it("addPlanEntry leaves state unchanged when the insert rejects", async () => {
    rejectingInsert();
    await renderProvider();

    act(() => { api!.setPlanEntries([entry("existing", "2026-06-01")]); });
    await waitFor(() => expect(api!.planEntries).toHaveLength(1));

    await act(async () => {
      api!.addPlanEntry({
        kid_id: "k1", date: "2026-06-04", meal_slot: "dinner", food_id: "f9", result: null,
      } as unknown as Omit<PlanEntry, "id">);
    });

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(api!.planEntries.map((e) => e.id)).toEqual(["existing"]);
  });

  it("keeps the server's rows, not the temporary ones, when the insert succeeds", async () => {
    const inserted = [
      { id: "server-1", kid_id: "k1", date: "2026-06-02", meal_slot: "dinner", food_id: "f2", result: null },
    ];
    mockFrom.mockReturnValue({
      insert: () => ({ select: () => Promise.resolve({ data: inserted, error: null }) }),
    });
    await renderProvider();

    await act(async () => {
      await api!.addPlanEntries([
        { kid_id: "k1", date: "2026-06-02", meal_slot: "dinner", food_id: "f2", result: null },
      ] as unknown as Omit<PlanEntry, "id">[]);
    });

    await waitFor(() => expect(api!.planEntries).toHaveLength(1));
    // The temporary id is gone; the row carries the id the server assigned.
    expect(api!.planEntries[0].id).toBe("server-1");
    expect(toastError).not.toHaveBeenCalled();
  });
});
