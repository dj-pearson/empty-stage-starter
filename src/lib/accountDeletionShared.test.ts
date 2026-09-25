// Vitest mirror for delete-account's pure helpers, so they run in CI without
// Deno. Deno twin: supabase/functions/_shared/accountDeletion.test.ts
import { describe, expect, it } from "vitest";
import {
  parseDeleteMode,
  stripeSubscriptionToCancel,
  toPreflight,
} from "../../supabase/functions/_shared/accountDeletion";

describe("parseDeleteMode", () => {
  it("treats the body shipped iOS builds send as a delete", () => {
    expect(parseDeleteMode({})).toBe("delete");
    expect(parseDeleteMode(null)).toBe("delete");
    expect(parseDeleteMode({ mode: "preflight" })).toBe("preflight");
  });
});

describe("stripeSubscriptionToCancel", () => {
  const live = {
    status: "active",
    cancel_at_period_end: false,
    is_complementary: false,
    stripe_subscription_id: "sub_1",
  };

  it("cancels a live Stripe subscription", () => {
    expect(stripeSubscriptionToCancel(live)).toBe("sub_1");
  });

  it("skips complimentary, already-ending, finished and App Store subscriptions", () => {
    expect(stripeSubscriptionToCancel({ ...live, is_complementary: true })).toBeNull();
    expect(stripeSubscriptionToCancel({ ...live, cancel_at_period_end: true })).toBeNull();
    expect(stripeSubscriptionToCancel({ ...live, status: "canceled" })).toBeNull();
    expect(stripeSubscriptionToCancel({ ...live, stripe_subscription_id: "2000000123" })).toBeNull();
    expect(stripeSubscriptionToCancel(undefined)).toBeNull();
  });
});

describe("toPreflight", () => {
  it("reads the RPC summary", () => {
    const view = toPreflight({
      households: [
        {
          household_id: "h1",
          household_name: "Home",
          successor_user_id: "u2",
          successor_name: "Sam",
          successor_role: "parent",
          remaining_members: 1,
          kid_names: ["Mia", "Leo"],
        },
      ],
      transferred: { kids: 2 },
      left_for_deletion: { kids: 0 },
    });
    expect(view.soleMember).toBe(false);
    expect(view.households[0]).toMatchObject({ successorUserId: "u2", kidNames: ["Mia", "Leo"] });
    expect(view.transferred).toEqual({ kids: 2 });
    expect(view.deleted).toEqual({ kids: 0 });
  });

  it("reads a sole member, and junk, as everything deleted", () => {
    expect(toPreflight({ households: [] }).soleMember).toBe(true);
    expect(toPreflight("junk")).toEqual({ soleMember: true, households: [], transferred: {}, deleted: {} });
  });
});
