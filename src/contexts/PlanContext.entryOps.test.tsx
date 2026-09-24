/**
 * Entry-level plan writes (C1): delete, move, replace a slot, schedule a recipe.
 * Each one goes to the server exactly once, rolls back on refusal, and never
 * replaces the whole slice.
 */
import { render, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { PlanProvider, usePlan } from "./PlanContext";
import type { PlanEntry } from "@/types";

const auth = { userId: "u1", householdId: "hh1" };
vi.mock("./AuthContext", () => ({ useAuth: () => auth }));

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }),
    removeChannel: vi.fn(),
    from: (...a: unknown[]) => mockFrom(...a),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));
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
vi.mock("@/lib/trackActivation", () => ({ trackActivationOnce: vi.fn() }));

let api: ReturnType<typeof usePlan> | null = null;
function Probe() { api = usePlan(); return null; }

const row = (id: string, over: Partial<PlanEntry> = {}): PlanEntry => ({
  id, kid_id: "k1", date: "2026-06-02", meal_slot: "dinner", food_id: "f1", result: null, ...over,
});

async function mount(entries: PlanEntry[]) {
  render(<PlanProvider><Probe /></PlanProvider>);
  await waitFor(() => expect(api).not.toBeNull());
  act(() => { api!.setPlanEntries(entries); });
  await waitFor(() => expect(api!.planEntries).toHaveLength(entries.length));
}

beforeEach(() => {
  api = null;
  mockFrom.mockReset();
  mockRpc.mockReset();
  toastError.mockReset();
});

describe("deletePlanEntries", () => {
  it("rolls the rows back when the server refuses", async () => {
    const inFn = vi.fn().mockResolvedValue({ error: { message: "nope" } });
    mockFrom.mockReturnValue({ delete: () => ({ in: inFn }) });
    await mount([row("a"), row("b", { food_id: "f2" })]);

    let res: { error: unknown } | undefined;
    await act(async () => { res = await api!.deletePlanEntries(["a"]); });

    expect(res!.error).toBeTruthy();
    expect(inFn).toHaveBeenCalledWith("id", ["a"]);
    expect(api!.planEntries.map((e) => e.id).sort()).toEqual(["a", "b"]);
    expect(toastError).toHaveBeenCalled();
  });

  it("returns the removed rows on success", async () => {
    mockFrom.mockReturnValue({ delete: () => ({ in: () => Promise.resolve({ error: null }) }) });
    await mount([row("a", { result: "ate" }), row("b", { food_id: "f2" })]);

    let res: Awaited<ReturnType<NonNullable<typeof api>["deletePlanEntries"]>> | undefined;
    await act(async () => { res = await api!.deletePlanEntries(["a"]); });

    expect(res!.error).toBeNull();
    expect(res!.removed.map((e) => e.id)).toEqual(["a"]);
    expect(res!.removed[0].result).toBe("ate");
    expect(api!.planEntries.map((e) => e.id)).toEqual(["b"]);
  });
});

describe("movePlanEntries", () => {
  it("sends one update with an .in() over every id", async () => {
    const inFn = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ in: inFn });
    mockFrom.mockReturnValue({ update });
    await mount([row("a"), row("b", { food_id: "f2" })]);

    await act(async () => {
      await api!.movePlanEntries(["a", "b"], { date: "2026-06-04", meal_slot: "lunch" });
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ date: "2026-06-04", meal_slot: "lunch" });
    expect(inFn).toHaveBeenCalledTimes(1);
    expect(inFn).toHaveBeenCalledWith("id", ["a", "b"]);
    expect(api!.planEntries.every((e) => e.date === "2026-06-04" && e.meal_slot === "lunch")).toBe(true);
  });

  it("puts both rows back on a refusal", async () => {
    mockFrom.mockReturnValue({ update: () => ({ in: () => Promise.resolve({ error: { code: "23505" } }) }) });
    await mount([row("a"), row("b", { food_id: "f2" })]);

    await act(async () => {
      await api!.movePlanEntries(["a", "b"], { date: "2026-06-04", meal_slot: "lunch" });
    });

    expect(api!.planEntries.every((e) => e.date === "2026-06-02" && e.meal_slot === "dinner")).toBe(true);
    // 23505 reads as "already there", not "couldn't save".
    expect(String(toastError.mock.calls[0][0])).toMatch(/already planned/i);
  });
});

describe("replaceSlot", () => {
  it("inserts the food with recipe_id null and removes the rest of the slot", async () => {
    const inserted: unknown[] = [];
    const deleteIn = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({
      insert: (rows: Array<Record<string, unknown>>) => {
        inserted.push(...rows);
        return { select: () => Promise.resolve({ data: rows.map((r, i) => ({ ...r, id: `new-${i}` })), error: null }) };
      },
      delete: () => ({ in: deleteIn }),
    }));
    await mount([
      row("r1", { recipe_id: "rec", food_id: "f1" }),
      row("r2", { recipe_id: "rec", food_id: "f2" }),
      row("keep-other-slot", { meal_slot: "lunch" }),
    ]);

    await act(async () => {
      await api!.replaceSlot(["k1"], "2026-06-02", "dinner", { foodId: "f9" });
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ kid_id: "k1", food_id: "f9", recipe_id: null, meal_slot: "dinner" });
    expect(deleteIn).toHaveBeenCalledWith("id", ["r1", "r2"]);
    expect(api!.planEntries.map((e) => e.id).sort()).toEqual(["keep-other-slot", "new-0"]);
  });
});

describe("scheduleRecipe", () => {
  it("runs one scoped select and merges by id without touching other rows", async () => {
    mockRpc.mockResolvedValue({ data: 2, error: null });
    const calls: Array<[string, unknown]> = [];
    const chain = {
      select: () => chain,
      in: (c: string, v: unknown) => { calls.push([`in:${c}`, v]); return chain; },
      eq: (c: string, v: unknown) => {
        calls.push([`eq:${c}`, v]);
        if (c === "recipe_id") {
          return Promise.resolve({
            data: [
              { id: "s1", kid_id: "k1", date: "2026-06-02", meal_slot: "dinner", food_id: "f1", recipe_id: "rec", result: null },
              { id: "s2", kid_id: "k2", date: "2026-06-02", meal_slot: "dinner", food_id: "f1", recipe_id: "rec", result: null },
            ],
            error: null,
          });
        }
        return chain;
      },
    };
    mockFrom.mockReturnValue(chain);
    await mount([
      row("old-rec", { recipe_id: "rec" }),                      // replaced by the RPC
      row("other-slot", { meal_slot: "lunch" }),                   // outside the slot
      row("other-day", { date: "2026-06-03", recipe_id: "rec" }),  // outside the date
      row("kid3", { kid_id: "k3", recipe_id: "rec" }),             // not a target kid
    ]);

    let res: Awaited<ReturnType<NonNullable<typeof api>["scheduleRecipe"]>> | undefined;
    await act(async () => { res = await api!.scheduleRecipe("rec", "2026-06-02", "dinner", ["k1", "k2"]); });

    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      ["in:kid_id", ["k1", "k2"]],
      ["eq:date", "2026-06-02"],
      ["eq:meal_slot", "dinner"],
      ["eq:recipe_id", "rec"],
    ]);
    expect(res).toMatchObject({ error: null, succeeded: ["k1", "k2"], failed: [] });
    expect(api!.planEntries.map((e) => e.id).sort()).toEqual(["kid3", "other-day", "other-slot", "s1", "s2"]);
  });

  it("reports the kids it failed for", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: 1, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "Not authorized" } });
    const chain = {
      select: () => chain,
      in: () => chain,
      eq: (c: string) => (c === "recipe_id" ? Promise.resolve({ data: [], error: null }) : chain),
    };
    mockFrom.mockReturnValue(chain);
    await mount([row("x", { meal_slot: "lunch" })]);

    let res: Awaited<ReturnType<NonNullable<typeof api>["scheduleRecipe"]>> | undefined;
    await act(async () => { res = await api!.scheduleRecipe("rec", "2026-06-02", "dinner", ["k1", "k2"]); });

    expect(res!.succeeded).toEqual(["k1"]);
    expect(res!.failed).toEqual(["k2"]);
    expect(res!.error).toBeTruthy();
    expect(api!.planEntries.map((e) => e.id)).toEqual(["x"]);
  });
});
