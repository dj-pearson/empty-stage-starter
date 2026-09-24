import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const db: {
  row: Record<string, unknown> | null;
  planName: string | null;
} = { row: null, planName: null };

const rpc = vi.fn(async () => ({ data: db.planName, error: null }));

vi.mock("@/integrations/supabase/client", () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: db.row, error: null }),
  };
  return { supabase: { from: () => builder, rpc: (...args: unknown[]) => rpc(...(args as [])) } };
});

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ userId: "u1", householdId: "h1" }) }));

// A fully set-up account, so the free upsell is not held back by setup.
vi.mock("@/contexts/AppContext", () => ({
  useKids: () => ({ kids: [{ id: "k1", name: "Ava" }], kidsHydrated: true }),
  useFoods: () => ({
    foods: [1, 2, 3].map((n) => ({ id: `f${n}`, name: `f${n}`, category: "fruit", is_safe: true, is_try_bite: false })),
    foodsHydrated: true,
  }),
  usePlan: () => ({ planEntries: [{ id: "p1", kid_id: "k1", date: "2999-01-01", meal_slot: "dinner", food_id: "f1", result: null }] }),
  useGrocery: () => ({
    groceryItems: [{ id: "g1", name: "Milk", quantity: 1, unit: "", checked: false, category: "dairy" }],
    groceryHydrated: true,
  }),
}));

vi.mock("./SubscriptionManagementDialog", () => ({ SubscriptionManagementDialog: () => null }));

import { SubscriptionStatusBanner } from "./SubscriptionStatusBanner";
import { resolveSubscription } from "@/lib/billingBannerState";

function renderBanner() {
  return render(
    <MemoryRouter>
      <SubscriptionStatusBanner />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  db.row = null;
  db.planName = null;
  rpc.mockClear();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

describe("SubscriptionStatusBanner", () => {
  it("shows no upgrade to an App Store subscriber with no Stripe row", async () => {
    db.planName = "Pro";
    const { container } = renderBanner();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("current_user_plan_name"));
    // Let the parallel reads settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/Upgrade/i)).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("treats a non-Free effective plan with no Stripe row as an App Store plan", () => {
    expect(resolveSubscription(null, "Pro")).toMatchObject({ status: "active", source: "app_store" });
    expect(resolveSubscription(null, "Free")).toMatchObject({ status: null, source: "free" });
    expect(resolveSubscription(null, null)).toMatchObject({ status: null, source: "free" });
  });

  it("renders nothing for an active Stripe plan", async () => {
    db.row = {
      status: "active",
      current_period_end: "2999-01-01T00:00:00Z",
      cancel_at_period_end: false,
      trial_end: null,
      plan: { id: "pro", name: "Pro" },
    };
    db.planName = "Pro";
    const { container } = renderBanner();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("warns when a trial has two days left", async () => {
    const end = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 - 60_000).toISOString();
    db.row = {
      status: "trialing",
      current_period_end: end,
      cancel_at_period_end: false,
      trial_end: end,
      plan: { id: "pro", name: "Pro" },
    };
    db.planName = "Pro";
    renderBanner();
    expect(await screen.findByRole("heading", { name: "2 days left in your free trial" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "/pricing");
  });

  it("shows the free upsell once setup is done, and it can be dismissed", async () => {
    db.planName = "Free";
    renderBanner();
    const dismiss = await screen.findByRole("button", { name: "Dismiss" });
    expect(screen.getByRole("link", { name: "Upgrade" })).toBeInTheDocument();
    fireEvent.click(dismiss);
    await waitFor(() => expect(screen.queryByRole("link", { name: "Upgrade" })).toBeNull());
    expect(localStorage.getItem("eatpal:billing-upsell-dismissed:u1")).toBe("1");
  });
});
