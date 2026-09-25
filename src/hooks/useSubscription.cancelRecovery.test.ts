import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * manage-subscription reports failure after it has applied the change (the
 * corsHeaders bug in the edge function, deferred). useSubscription refetches
 * and believes the row, not the error.
 */

let row: Record<string, unknown> | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-1" } } } }),
    },
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {
        maybeSingle: async () => ({ data: row, error: null }),
      };
      chain.select = () => chain;
      chain.eq = () => chain;
      return chain;
    }),
    channel: vi.fn(() => {
      const ch = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
      return ch;
    }),
    removeChannel: vi.fn(),
  },
}));

const invokeEdgeFunction = vi.fn();
vi.mock("@/lib/edge-functions", () => ({
  invokeEdgeFunction: (...args: unknown[]) => invokeEdgeFunction(...args),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { toast } from "sonner";
import { useSubscription } from "./useSubscription";

function subRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    user_id: "user-1",
    plan_id: "plan-pro",
    status: "active",
    billing_cycle: "monthly",
    current_period_start: "2026-09-01T00:00:00Z",
    current_period_end: "2026-10-01T00:00:00Z",
    cancel_at_period_end: false,
    trial_end: null,
    stripe_customer_id: "cus_XXXX",
    stripe_subscription_id: "sub_XXXX",
    is_complementary: false,
    complementary_subscription_id: null,
    plan: { name: "Pro" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  row = subRow();
});

describe("useSubscription manage-subscription mitigation", () => {
  it("reports success when invoke rejects but the refetched row is canceled at period end", async () => {
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));

    invokeEdgeFunction.mockImplementation(async () => {
      // The change landed before the function threw.
      row = subRow({ cancel_at_period_end: true });
      throw new Error("Edge Function 'manage-subscription' failed: corsHeaders is not defined");
    });

    let outcome: { success: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.cancel();
    });

    expect(outcome?.success).toBe(true);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    const text = String(vi.mocked(toast.success).mock.calls[0][0]);
    expect(text).not.toContain("Edge Function");
    expect(result.current.subscription?.cancel_at_period_end).toBe(true);
  });

  it("reports failure, in translated copy, when the row did not change", async () => {
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));

    invokeEdgeFunction.mockResolvedValue({
      data: null,
      error: new Error("Edge Function 'manage-subscription' failed: boom"),
    });

    let outcome: { success: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.cancel();
    });

    expect(outcome?.success).toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).not.toContain("Edge Function");
  });

  it("treats a billing-cycle change as done when the row shows the target cycle", async () => {
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.loading).toBe(false));

    invokeEdgeFunction.mockImplementation(async () => {
      row = subRow({ billing_cycle: "yearly" });
      return { data: null, error: new Error("Edge Function 'manage-subscription' failed") };
    });

    let outcome: { success: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.changeBillingCycle("yearly");
    });
    expect(outcome?.success).toBe(true);
  });

  it("keeps the previous subscription and sets error when a refetch rejects", async () => {
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => expect(result.current.subscription?.id).toBe("sub-1"));

    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.from).mockImplementationOnce(() => {
      const chain: Record<string, unknown> = {
        maybeSingle: async () => {
          throw new Error("network down");
        },
      };
      chain.select = () => chain;
      chain.eq = () => chain;
      return chain as unknown as ReturnType<typeof supabase.from>;
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.subscription?.id).toBe("sub-1");
    expect(result.current.loading).toBe(false);
  });
});
