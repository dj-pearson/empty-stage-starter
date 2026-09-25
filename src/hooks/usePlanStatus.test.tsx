import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * usePlanStatus with the Supabase client mocked. The point: a failed read of
 * user_subscriptions is an error state, never "Free" -- Free would tell a
 * paying parent they have no plan and offer them a second checkout.
 */

const USAGE_STATS = {
  plan: {
    name: "Pro",
    max_children: 3,
    max_pantry_foods: null,
    ai_coach_daily_limit: 20,
    food_tracker_monthly_limit: null,
    has_food_chaining: true,
    has_meal_builder: true,
    has_nutrition_tracking: false,
    is_complementary: false,
  },
  usage: {
    children: { current: 1, limit: 3, percentage: 33 },
    pantry_foods: { current: 10, limit: null, percentage: 0 },
    ai_coach: { current: 2, limit: 20, percentage: 10, resets_at: "2099-01-01 00:00:00" },
    food_tracker: { current: 0, limit: null, percentage: 0, resets_at: "2099-01-01 00:00:00" },
  },
};

type Result = { data: unknown; error: unknown };
const tableResults: Record<string, () => Result> = {};

function builder(table: string) {
  const resolve = () => (tableResults[table] ?? (() => ({ data: null, error: null })))();
  const chain: Record<string, unknown> = {
    then: (ok: (v: Result) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, fail),
    maybeSingle: async () => resolve(),
    single: async () => resolve(),
  };
  for (const m of ["select", "eq", "order", "limit", "in", "is", "or"]) chain[m] = () => chain;
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-1" } } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    from: vi.fn((table: string) => builder(table)),
    rpc: vi.fn(async () => ({ data: USAGE_STATS, error: null })),
    channel: vi.fn(() => {
      const ch = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
      return ch;
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/lib/edge-functions", () => ({ invokeEdgeFunction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { supabase } from "@/integrations/supabase/client";
import { usePlanStatus } from "./usePlanStatus";

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableResults)) delete tableResults[k];
  tableResults.apple_subscriptions = () => ({ data: [], error: null });
  tableResults.complementary_subscriptions = () => ({ data: null, error: null });
});

describe("usePlanStatus", () => {
  it("reads a rejected user_subscriptions query as error, not free", async () => {
    tableResults.user_subscriptions = () => ({ data: null, error: { code: "08006", message: "connection failure" } });

    const { result } = renderHook(() => usePlanStatus());

    await waitFor(() => expect(result.current.status.kind).not.toBe("loading"));
    expect(result.current.status.kind).toBe("error");
    expect(result.current.status.kind).not.toBe("free");
  });

  it("resolves an active Stripe row to stripe", async () => {
    tableResults.user_subscriptions = () => ({
      data: {
        id: "sub-1",
        user_id: "user-1",
        plan_id: "plan-pro",
        status: "active",
        billing_cycle: null,
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        trial_end: null,
        stripe_customer_id: "cus_XXXX",
        stripe_subscription_id: "sub_XXXX",
        is_complementary: false,
        complementary_subscription_id: null,
        plan: { name: "Pro" },
      },
      error: null,
    });

    const { result } = renderHook(() => usePlanStatus());
    await waitFor(() => expect(result.current.status.kind).toBe("stripe"));
    // billing_cycle stays null; it is not defaulted to 'monthly'.
    expect(result.current.subscription?.billing_cycle).toBeNull();
  });

  it("refetch calls all three sources", async () => {
    tableResults.user_subscriptions = () => ({ data: null, error: null });
    const { result } = renderHook(() => usePlanStatus());
    await waitFor(() => expect(result.current.status.kind).not.toBe("loading"));

    const from = vi.mocked(supabase.from);
    const rpc = vi.mocked(supabase.rpc);
    from.mockClear();
    rpc.mockClear();

    await act(async () => {
      await result.current.refetch();
    });

    const tables = from.mock.calls.map(([t]) => t);
    expect(tables).toContain("user_subscriptions");
    expect(tables).toContain("apple_subscriptions");
    expect(rpc.mock.calls.map(([name]) => name)).toContain("get_usage_stats");
  });
});
