import { describe, it, expect } from "vitest";
import { resolvePlanStatus, upgradeTargetFor, type ResolvePlanInput } from "./planSource";
import { APPLE_SUBSCRIPTIONS_URL } from "./billingBannerState";
import type { Subscription } from "@/hooks/useSubscription";
import type { UsageStats } from "@/hooks/useUsageStats";

const NOW = new Date("2026-09-24T12:00:00Z");

function stats(name: string, isComp = false): UsageStats {
  const meter = { current: 0, limit: null, percentage: 0 };
  return {
    plan: {
      name,
      max_children: null,
      max_pantry_foods: null,
      ai_coach_daily_limit: null,
      food_tracker_monthly_limit: null,
      has_food_chaining: true,
      has_meal_builder: true,
      has_nutrition_tracking: true,
      is_complementary: isComp,
    },
    usage: {
      children: meter,
      pantry_foods: meter,
      ai_coach: { ...meter, resets_at: "2026-09-25 00:00:00" },
      food_tracker: { ...meter, resets_at: "2026-10-01 00:00:00" },
    },
  };
}

function stripe(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub-1",
    user_id: "user-1",
    plan_id: "plan-pro",
    plan_name: "Pro",
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
    ...overrides,
  };
}

const APPLE_ACTIVE = { id: "a-1", status: "active", expires_at: "2026-10-24T00:00:00Z", product_id: "familyplus.monthly" };

function input(partial: Partial<ResolvePlanInput>): ResolvePlanInput {
  return {
    stats: null,
    subscription: null,
    appleRow: null,
    subError: null,
    usageError: null,
    online: true,
    loading: false,
    now: NOW,
    ...partial,
  };
}

describe("resolvePlanStatus", () => {
  it("App Store only gives appStore", () => {
    const status = resolvePlanStatus(input({ stats: stats("Family Plus"), appleRow: APPLE_ACTIVE }));
    expect(status).toEqual({ kind: "appStore", planName: "Family Plus", expiresAt: APPLE_ACTIVE.expires_at });
  });

  it("an App Store row with no expiry still entitles", () => {
    const status = resolvePlanStatus(
      input({ stats: stats("Pro"), appleRow: { ...APPLE_ACTIVE, expires_at: null } })
    );
    expect(status.kind).toBe("appStore");
  });

  it("an expired App Store row does not entitle", () => {
    const status = resolvePlanStatus(
      input({ stats: stats("Free"), appleRow: { ...APPLE_ACTIVE, expires_at: "2026-09-01T00:00:00Z" } })
    );
    expect(status).toEqual({ kind: "free" });
  });

  it("Stripe Pro plus App Store Family Plus gives appStore with strayStripe", () => {
    const sub = stripe();
    const status = resolvePlanStatus(input({ stats: stats("Family Plus"), subscription: sub, appleRow: APPLE_ACTIVE }));
    expect(status).toEqual({
      kind: "appStore",
      planName: "Family Plus",
      expiresAt: APPLE_ACTIVE.expires_at,
      strayStripe: sub,
    });
  });

  it("canceled Stripe plus a comp gives comp", () => {
    const status = resolvePlanStatus(
      input({
        stats: stats("Family Plus", true),
        subscription: stripe({ status: "canceled" }),
        compRow: { end_date: "2027-01-01T00:00:00Z" },
      })
    );
    expect(status).toEqual({ kind: "comp", planName: "Family Plus", endDate: "2027-01-01T00:00:00Z" });
  });

  it("canceled Stripe alone gives free with the ended plan", () => {
    const status = resolvePlanStatus(
      input({ stats: stats("Free"), subscription: stripe({ status: "canceled", current_period_end: "2026-09-01T00:00:00Z" }) })
    );
    expect(status).toEqual({ kind: "free", endedPlan: { name: "Pro", endedAt: "2026-09-01T00:00:00Z" } });
  });

  it("incomplete_expired never entitles", () => {
    const status = resolvePlanStatus(input({ stats: stats("Free"), subscription: stripe({ status: "incomplete_expired" }) }));
    expect(status.kind).toBe("free");
  });

  it("past_due gives stripe named for the enforced plan (Free)", () => {
    const sub = stripe({ status: "past_due" });
    const status = resolvePlanStatus(input({ stats: stats("Free"), subscription: sub }));
    expect(status).toEqual({ kind: "stripe", planName: "Free", sub });
    if (status.kind === "stripe") expect(status.sub.status).toBe("past_due");
  });

  it("active Stripe gives stripe, with mismatch when the enforced plan differs", () => {
    const sub = stripe();
    expect(resolvePlanStatus(input({ stats: stats("Pro"), subscription: sub }))).toEqual({
      kind: "stripe",
      planName: "Pro",
      sub,
    });
    expect(resolvePlanStatus(input({ stats: stats("Free"), subscription: sub }))).toEqual({
      kind: "stripe",
      planName: "Pro",
      sub,
      mismatch: { enforcedPlan: "Free" },
    });
  });

  it("a subscription error with no data gives error, offline from the input", () => {
    const err = new Error("fetch failed");
    expect(resolvePlanStatus(input({ stats: stats("Pro"), subError: err, online: false }))).toEqual({
      kind: "error",
      offline: true,
    });
    expect(resolvePlanStatus(input({ stats: stats("Pro"), subError: err, online: true }))).toEqual({
      kind: "error",
      offline: false,
    });
  });

  it("a usage error with no stats gives error, never free", () => {
    expect(resolvePlanStatus(input({ usageError: "network" })).kind).toBe("error");
  });

  it("keeps resolving from cached data when a refetch failed", () => {
    const sub = stripe();
    const status = resolvePlanStatus(
      input({ stats: stats("Pro"), subscription: sub, subError: new Error("x"), usageError: "network" })
    );
    expect(status.kind).toBe("stripe");
  });

  it("comp with a null end_date gives comp with endDate null", () => {
    const status = resolvePlanStatus(input({ stats: stats("Pro", true), compRow: { end_date: null } }));
    expect(status).toEqual({ kind: "comp", planName: "Pro", endDate: null });
  });

  it("a paid enforced plan no row explains is an error, not Free", () => {
    expect(resolvePlanStatus(input({ stats: stats("Pro") })).kind).toBe("error");
  });

  it("is loading while stats have not arrived", () => {
    expect(resolvePlanStatus(input({ loading: true })).kind).toBe("loading");
  });
});

describe("upgradeTargetFor", () => {
  it("routes each source where its plan is managed", () => {
    expect(upgradeTargetFor("free")).toEqual({ type: "pricing" });
    expect(upgradeTargetFor("stripe")).toEqual({ type: "portal" });
    expect(upgradeTargetFor("appStore")).toEqual({ type: "appStore", href: APPLE_SUBSCRIPTIONS_URL });
    expect(upgradeTargetFor("comp")).toEqual({ type: "support" });
    expect(upgradeTargetFor("loading")).toEqual({ type: "pricing" });
    expect(upgradeTargetFor("error")).toEqual({ type: "pricing" });
  });
});
