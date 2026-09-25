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
vi.mock("@/lib/trackActivation", () => ({ trackActivationOnce: vi.fn() }));
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

/**
 * replaceWeekPlan and copyWeekPlan diff instead of wiping. A generated week
 * used to be deleteWeekPlan + addPlanEntries: every logged result in the week
 * went with it, and a rejected insert after a landed delete left the week
 * empty.
 */
describe("PlanContext week diffing", () => {
  const row = (id: string, over: Partial<PlanEntry> = {}): PlanEntry => ({
    id, kid_id: "k1", date: "2026-06-01", meal_slot: "dinner", food_id: "f1", result: null, ...over,
  });

  /** A from('plan_entries') whose insert and delete can be steered per test. */
  const serverWith = (opts: { insertError?: unknown; deleteErrors?: unknown[] }) => {
    const inserted: Array<Record<string, unknown>> = [];
    const deleted: string[][] = [];
    const deleteErrors = [...(opts.deleteErrors ?? [])];
    mockFrom.mockImplementation(() => ({
      insert: (rows: Array<Record<string, unknown>>) => {
        inserted.push(...rows);
        const data = opts.insertError ? null : rows.map((r, i) => ({ ...r, id: `srv-${inserted.length - rows.length + i}` }));
        return { select: () => Promise.resolve({ data, error: opts.insertError ?? null }) };
      },
      delete: () => ({
        in: (_c: string, ids: string[]) => {
          deleted.push(ids);
          return Promise.resolve({ error: deleteErrors.shift() ?? null });
        },
      }),
    }));
    return { inserted, deleted };
  };

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

  const mount = async (entries: PlanEntry[]) => {
    render(<PlanProvider><Probe /></PlanProvider>);
    await waitFor(() => expect(api).not.toBeNull());
    act(() => { api!.setPlanEntries(entries); });
    await waitFor(() => expect(api!.planEntries).toHaveLength(entries.length));
  };

  it("replaceWeekPlan keeps overlapping keys, results included, and writes only the difference", async () => {
    const server = serverWith({});
    await mount([
      row("kept", { result: "ate", notes: "loved it" }),
      row("stale", { date: "2026-06-02", food_id: "f2" }),
      row("next-week", { date: "2026-06-09" }),
      row("other-kid", { kid_id: "k2" }),
    ]);

    let res: Awaited<ReturnType<NonNullable<typeof api>["replaceWeekPlan"]>> | undefined;
    await act(async () => {
      res = await api!.replaceWeekPlan("2026-06-01", "k1", [
        { kid_id: "k1", date: "2026-06-01", meal_slot: "dinner", food_id: "f1", result: null },
        { kid_id: "k1", date: "2026-06-03", meal_slot: "lunch", food_id: "f3", result: null },
      ]);
    });

    expect(res!.error).toBeNull();
    // The overlapping key is never re-inserted, so the US-716 unique index
    // cannot answer 23505 for it.
    expect(server.inserted.map((r) => r.food_id)).toEqual(["f3"]);
    expect(server.deleted).toEqual([["stale"]]);
    expect(res!.removed.map((e) => e.id)).toEqual(["stale"]);
    const kept = api!.planEntries.find((e) => e.id === "kept");
    expect(kept?.result).toBe("ate");
    expect(kept?.notes).toBe("loved it");
    expect(api!.planEntries.map((e) => e.id).sort()).toEqual(["kept", "next-week", "other-kid", "srv-0"]);
  });

  it("replaceWeekPlan leaves the old week intact when the insert is refused (23505)", async () => {
    const server = serverWith({ insertError: { code: "23505", message: "duplicate key value" } });
    await mount([row("a", { result: "tasted" }), row("b", { food_id: "f2" })]);

    let res: Awaited<ReturnType<NonNullable<typeof api>["replaceWeekPlan"]>> | undefined;
    await act(async () => {
      res = await api!.replaceWeekPlan("2026-06-01", "k1", [
        { kid_id: "k1", date: "2026-06-04", meal_slot: "lunch", food_id: "f9", result: null },
      ]);
    });

    expect(res!.error).toBeTruthy();
    expect(server.deleted).toEqual([]);
    expect(api!.planEntries.map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect(String(toastError.mock.calls[0][0])).toMatch(/already planned/i);
  });

  it("replaceWeekPlan removes what it inserted when the delete is refused", async () => {
    const server = serverWith({ deleteErrors: [{ message: "permission denied" }] });
    await mount([row("old", { food_id: "f1" })]);

    let res: Awaited<ReturnType<NonNullable<typeof api>["replaceWeekPlan"]>> | undefined;
    await act(async () => {
      res = await api!.replaceWeekPlan("2026-06-01", "k1", [
        { kid_id: "k1", date: "2026-06-02", meal_slot: "lunch", food_id: "f2", result: null },
      ]);
    });

    expect(res!.error).toBeTruthy();
    expect(server.deleted).toEqual([["old"], ["srv-0"]]);
    // One week, not two stacked: the old row, restored, and nothing else.
    await waitFor(() => expect(api!.planEntries.map((e) => e.id)).toEqual(["old"]));
  });

  it("copyWeekPlan skips keys already in the destination and copies is_primary_dish with result null", async () => {
    const server = serverWith({});
    await mount([
      row("src-1", { recipe_id: "rec", is_primary_dish: true, result: "ate" }),
      row("src-2", { date: "2026-06-02", food_id: "f2", result: "refused" }),
      // Destination (week of 2026-06-08) already has src-1's food in that slot.
      row("dest", { date: "2026-06-08" }),
    ]);

    let res: Awaited<ReturnType<NonNullable<typeof api>["copyWeekPlan"]>> | undefined;
    await act(async () => { res = await api!.copyWeekPlan("2026-06-01", "2026-06-08", "k1"); });

    expect(res).toMatchObject({ error: null, copied: 1, skipped: 1 });
    expect(server.inserted).toHaveLength(1);
    expect(server.inserted[0]).toMatchObject({ date: "2026-06-09", food_id: "f2", result: null });
    expect(server.inserted[0]).not.toHaveProperty("outcome");
  });

  it("copyWeekPlan carries is_primary_dish across", async () => {
    const server = serverWith({});
    await mount([row("src", { recipe_id: "rec", is_primary_dish: true, result: "ate" })]);

    await act(async () => { await api!.copyWeekPlan("2026-06-01", "2026-06-08", "k1"); });

    expect(server.inserted[0]).toMatchObject({
      date: "2026-06-08", recipe_id: "rec", is_primary_dish: true, result: null,
    });
  });
});
