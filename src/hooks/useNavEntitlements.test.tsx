import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { invalidateSharedQueries } from "@/lib/sharedQuery";

/**
 * isProfessional follows the server-effective plan (current_user_plan_name),
 * so a trialing, App Store or complimentary Professional sees the link even
 * though no active Stripe row exists.
 */

const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userId: "user-1", householdId: null }),
}));

import { useNavEntitlements } from "./useNavEntitlements";

function rolesChain(data: unknown) {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data, error: null }) };
  return chain;
}

describe("useNavEntitlements", () => {
  beforeEach(() => {
    invalidateSharedQueries();
    rpc.mockReset();
    from.mockReset();
    from.mockImplementation((table: string) => {
      if (table === "user_roles") return rolesChain(null);
      throw new Error(`no ${table} read expected: the Stripe row is not the plan of record`);
    });
  });

  it("gives an App Store or trialing Professional (rpc says Professional) the link", async () => {
    rpc.mockResolvedValue({ data: "Professional", error: null });
    const { result } = renderHook(() => useNavEntitlements());
    await waitFor(() => expect(result.current.isProfessional).toBe(true));
    expect(rpc).toHaveBeenCalledWith("current_user_plan_name");
  });

  it("keeps another plan closed", async () => {
    rpc.mockResolvedValue({ data: "Family Plus", error: null });
    const { result } = renderHook(() => useNavEntitlements());
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(result.current.isProfessional).toBe(false);
  });

  it("fails closed when the plan lookup errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useNavEntitlements());
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(result.current).toEqual({ isAdmin: false, isProfessional: false });
  });
});
