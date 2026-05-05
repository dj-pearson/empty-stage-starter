import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: () => getUserMock(),
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { checkFeatureLimit } from "./featureLimits";
import { requestUpgradePrompt, subscribeUpgradePrompt } from "./upgradePromptBus";

describe("checkFeatureLimit", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    rpcMock.mockReset();
  });

  it("allows the action when no user is signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await checkFeatureLimit("children", 0);
    expect(result.allowed).toBe(true);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns the RPC verdict when blocked", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpcMock.mockResolvedValue({
      data: { allowed: false, limit: 1, current: 1, message: "Limit reached" },
      error: null,
    });

    const result = await checkFeatureLimit("children", 1);

    expect(rpcMock).toHaveBeenCalledWith("check_feature_limit", {
      p_user_id: "user-1",
      p_feature_type: "children",
      p_current_count: 1,
    });
    expect(result.allowed).toBe(false);
    expect(result.message).toBe("Limit reached");
  });

  it("fails open when the RPC errors so users are never wrongly blocked", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    rpcMock.mockResolvedValue({ data: null, error: new Error("network") });

    const result = await checkFeatureLimit("pantry_foods", 50);
    expect(result.allowed).toBe(true);
  });
});

describe("upgradePromptBus", () => {
  it("delivers requests to all subscribed listeners", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeUpgradePrompt(a);
    const unsubB = subscribeUpgradePrompt(b);

    requestUpgradePrompt({ feature: "AI Coach", message: "Upgrade required" });

    expect(a).toHaveBeenCalledWith({ feature: "AI Coach", message: "Upgrade required" });
    expect(b).toHaveBeenCalledWith({ feature: "AI Coach", message: "Upgrade required" });

    unsubA();
    requestUpgradePrompt({ feature: "Meal Builder" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);

    unsubB();
  });
});
