/**
 * scheduleRecipe returns the rows its scoped read-back found, so the Recipes
 * screen can offer Undo and "add missing" without a second read.
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

type Result = Awaited<ReturnType<ReturnType<typeof usePlan>["scheduleRecipe"]>>;

const chainReturning = (resolved: { data: unknown; error: unknown }) => {
  const chain = {
    select: () => chain,
    in: () => chain,
    eq: (c: string) => (c === "recipe_id" ? Promise.resolve(resolved) : chain),
  };
  return chain;
};

describe("scheduleRecipe rows", () => {
  it("resolves with the rows from the scoped read", async () => {
    mockRpc.mockResolvedValue({ data: 1, error: null });
    const data = [
      { id: "s1", kid_id: "k1", date: "2026-06-02", meal_slot: "dinner", food_id: "f1", recipe_id: "rec", result: null },
      { id: "s2", kid_id: "k2", date: "2026-06-02", meal_slot: "dinner", food_id: "f2", recipe_id: "rec", result: null },
    ];
    mockFrom.mockReturnValue(chainReturning({ data, error: null }));
    await mount([row("x", { meal_slot: "lunch" })]);

    let res: Result | undefined;
    await act(async () => { res = await api!.scheduleRecipe("rec", "2026-06-02", "dinner", ["k1", "k2"]); });

    expect(res!.rows.map((r) => r.id)).toEqual(["s1", "s2"]);
    expect(res!.rows[1]).toMatchObject({ kid_id: "k2", food_id: "f2", recipe_id: "rec" });
  });

  it("resolves with rows=[] when no kid succeeded", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Not authorized" } });
    await mount([row("x", { meal_slot: "lunch" })]);

    let res: Result | undefined;
    await act(async () => { res = await api!.scheduleRecipe("rec", "2026-06-02", "dinner", ["k1"]); });

    expect(res!.succeeded).toEqual([]);
    expect(res!.rows).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("resolves with rows=[] when the read-back fails", async () => {
    mockRpc.mockResolvedValue({ data: 1, error: null });
    mockFrom.mockReturnValue(chainReturning({ data: null, error: { message: "boom" } }));
    await mount([row("x", { meal_slot: "lunch" })]);

    let res: Result | undefined;
    await act(async () => { res = await api!.scheduleRecipe("rec", "2026-06-02", "dinner", ["k1"]); });

    expect(res!.succeeded).toEqual(["k1"]);
    expect(res!.rows).toEqual([]);
    expect(res!.error).toBeNull();
  });

  it("resolves with rows=[] for an empty kid list", async () => {
    await mount([]);
    let res: Result | undefined;
    await act(async () => { res = await api!.scheduleRecipe("rec", "2026-06-02", "dinner", []); });
    expect(res).toEqual({ error: null, succeeded: [], failed: [], rows: [] });
  });
});
