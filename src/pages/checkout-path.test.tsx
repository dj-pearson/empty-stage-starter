import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { HelmetProvider } from "react-helmet-async";

/**
 * The path from Pricing to a Stripe session, rendered (US-779).
 *
 * Subscription and billing had three unit tests -- useSubscription,
 * pricing-stripe-parity, stripeWebhookLogic -- and not one that rendered a
 * page. tests/payment.spec.ts exists but never ran until US-764. So the actual
 * upgrade button, the thing every paying customer presses, was covered by
 * nothing: a broken handler, a wrong body, a missing plan id would all have
 * shipped green.
 *
 * THREE PREMISES IN THE STORY WERE WRONG, and this file follows the code:
 *
 * 1. "the UpgradeDialog with a mocked create-checkout-session edge function" --
 *    UpgradeDialog does not call checkout at all; it navigates to /pricing. And
 *    the function is named `create-checkout`, not `create-checkout-session`.
 *
 * 2. "asserts the request carries the price id from src/lib/pricing-plans.ts" --
 *    the client MUST NOT send a price id, and pricing-plans.ts holds prices
 *    (numbers), not Stripe price ids. supabase/functions/create-checkout says
 *    so in its header: "The caller never supplies a Stripe price. It supplies a
 *    planId, and the price is read from the subscription_plans row server-side,
 *    so a caller cannot substitute a cheaper price to provision a paid tier."
 *    That is US-326's price-tampering fix. A test asserting the client sends a
 *    price id would pin the vulnerability, so this asserts the opposite: the
 *    body carries planId and billingCycle and NO price of any kind.
 *
 * 3. "mounts /checkout/success ... and asserts trackPaidConversion fires" --
 *    it did not fire; CheckoutSuccess never imported it. Wired in the same
 *    commit, because a paid conversion nobody records is a funnel that reports
 *    zero conversions forever.
 */

const invokeEdgeFunction = vi.fn();
const trackPaidConversion = vi.fn();
const navigate = vi.fn();

/** Two paid plans and the free one, shaped like subscription_plans rows. */
const PLANS = [
  { id: "plan-free", name: "Free", price_monthly: 0, price_yearly: 0, sort_order: 1, features: [], is_active: true },
  { id: "plan-pro", name: "Pro", price_monthly: 14.99, price_yearly: 143.9, sort_order: 2, features: [], is_active: true },
  { id: "plan-family", name: "Family Plus", price_monthly: 24.99, price_yearly: 239.9, sort_order: 3, features: [], is_active: true },
];

vi.mock("@/lib/edge-functions", () => ({
  invokeEdgeFunction: (...args: unknown[]) => invokeEdgeFunction(...args),
}));

vi.mock("@/lib/conversion-tracking", () => ({
  trackPaidConversion: (...args: unknown[]) => trackPaidConversion(...args),
  trackFunnelEvent: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

let searchParams = new URLSearchParams();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ state: null, search: "", pathname: "/pricing" }),
  useSearchParams: () => [searchParams, vi.fn()],
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    React.createElement("a", { href: to }, children),
}));

let subscriptionRow: Record<string, unknown> | null = null;

/**
 * A chainable stand-in for the PostgREST builder.
 *
 * Written generically rather than as a hand-shaped chain per call site. The
 * first attempt mocked select().eq().order() by eye and blew up on
 * promotional_campaigns' .lte(), because Pricing.tsx issues three different
 * queries with three different chains -- and the failure surfaced as "Unable to
 * find the text: Pro", which reads like a rendering problem rather than a mock
 * that stopped one line short.
 *
 * Every builder method returns the builder; awaiting it (or a terminal
 * maybeSingle/single) yields the rows for that table. New chain links cost
 * nothing.
 */
function builder(rows: unknown) {
  const result = { data: rows, error: null };
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    maybeSingle: async () => ({ data: Array.isArray(rows) ? (rows[0] ?? null) : rows, error: null }),
    single: async () => ({ data: Array.isArray(rows) ? (rows[0] ?? null) : rows, error: null }),
  };
  for (const method of ["select", "eq", "neq", "in", "is", "or", "lte", "gte", "lt", "gt", "order", "limit", "filter", "not", "range"]) {
    chain[method] = () => chain;
  }
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-1" } } } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "subscription_plans") return builder(PLANS);
      if (table === "user_subscriptions") return builder(subscriptionRow);
      return builder([]);
    }),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  subscriptionRow = null;
  invokeEdgeFunction.mockResolvedValue({ data: { url: "https://checkout.stripe.com/c/test" }, error: null });
  // jsdom refuses a real navigation assignment; the component sets it on success.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, origin: "https://app.test", href: "" },
  });
});

/** The body Pricing.tsx sends for a given plan and interval. */
function checkoutBody(): Record<string, unknown> {
  const call = invokeEdgeFunction.mock.calls.find((c) => c[0] === "create-checkout");
  expect(call, "no create-checkout call was made").toBeTruthy();
  return (call![1] as { body: Record<string, unknown> }).body;
}

function renderPricing(Pricing: React.ComponentType) {
  // SEOHead renders react-helmet-async, which throws on an absent context and
  // takes the whole tree down with it -- surfacing as "Unable to find the text:
  // Pro", i.e. as if the plans had failed to load.
  return render(
    <HelmetProvider>
      <Pricing />
    </HelmetProvider>
  );
}

/**
 * Click ONE upgrade CTA in a fresh render and return the edge-function call.
 *
 * A fresh render per CTA rather than clicking all six in one: the first click
 * sets checkoutPlanId and the page enters its redirecting state, which disables
 * every other CTA, so a loop over one render silently stops measuring after the
 * first button. That surfaced as "expected spy to be called at least once",
 * which reads like a broken handler rather than a page doing exactly what it
 * should.
 */
async function clickCta(index: number, cycle: string) {
  const Pricing = (await import("./Pricing")).default;
  const user = userEvent.setup();
  const { container, unmount } = renderPricing(Pricing);

  await waitFor(() =>
    expect(
      Array.from(container.querySelectorAll("button")).filter((b) => /upgrade/i.test(b.textContent ?? ""))
        .length
    ).toBeGreaterThan(index)
  );

  if (cycle === "yearly") {
    const toggle = Array.from(container.querySelectorAll("button")).find((b) =>
      /^yearly/i.test((b.textContent ?? "").trim())
    );
    expect(toggle, "no yearly billing toggle found").toBeTruthy();
    await user.click(toggle!);
  }

  const ctas = Array.from(container.querySelectorAll("button")).filter((b) =>
    /upgrade/i.test(b.textContent ?? "")
  );
  invokeEdgeFunction.mockClear();
  await user.click(ctas[index]);
  await waitFor(() => expect(invokeEdgeFunction).toHaveBeenCalled());
  const calls = [...invokeEdgeFunction.mock.calls];
  unmount();
  return calls;
}

/** How many upgrade CTAs the page renders. */
async function ctaCount() {
  const Pricing = (await import("./Pricing")).default;
  const { container, unmount } = renderPricing(Pricing);
  await waitFor(() =>
    expect(
      Array.from(container.querySelectorAll("button")).some((b) => /upgrade/i.test(b.textContent ?? ""))
    ).toBe(true)
  );
  const n = Array.from(container.querySelectorAll("button")).filter((b) =>
    /upgrade/i.test(b.textContent ?? "")
  ).length;
  unmount();
  return n;
}

describe("Pricing -> create-checkout", () => {
  // The page renders two sets of plan cards (a families section and a
  // therapists section). Driving every CTA is stricter than locating one card
  // by its heading: a wrong plan id anywhere fails, in either section.
  it.each(["monthly", "yearly"])("sends a plan id and %s cycle, never a price", async (cycle) => {
    const total = await ctaCount();
    expect(total, "no upgrade CTA rendered").toBeGreaterThan(0);

    const bodies: Record<string, unknown>[] = [];
    const otherFunctions: string[] = [];

    for (let i = 0; i < total; i++) {
      for (const [fn, arg] of await clickCta(i, cycle)) {
        if (fn === "create-checkout") {
          bodies.push((arg as { body: Record<string, unknown> }).body);
        } else {
          otherFunctions.push(String(fn));
        }
      }
    }

    expect(bodies.length, "no CTA produced a create-checkout call").toBeGreaterThan(0);

    // The Free card cancels through the Stripe portal instead of checking out.
    // Anything else reaching an edge function from these buttons is unexpected.
    expect(new Set(otherFunctions).size === 0 || new Set(otherFunctions).has("stripe-portal")).toBe(true);

    const paidIds = new Set(PLANS.filter((p) => p.price_monthly > 0).map((p) => p.id));
    for (const body of bodies) {
      expect(body.billingCycle).toBe(cycle);
      expect(paidIds.has(String(body.planId))).toBe(true);

      // The anti-tampering invariant, as an assertion. If a future change starts
      // sending a price from the client this fails, and it should: the server
      // reads the price from subscription_plans precisely so a caller cannot
      // name a cheaper one (US-326).
      expect(Object.keys(body).filter((k) => k.toLowerCase().includes("price"))).toEqual([]);
      expect(JSON.stringify(body)).not.toMatch(/price_[A-Za-z0-9]/);

      // Where Stripe sends the customer back matters as much as what it charges:
      // without the session placeholder CheckoutSuccess has nothing to poll on,
      // and every upgrade lands on a spinner that times out to /dashboard.
      expect(String(body.successUrl)).toContain("/checkout/success");
      expect(String(body.successUrl)).toContain("{CHECKOUT_SESSION_ID}");
      expect(String(body.cancelUrl)).toContain("/pricing");
    }

    // Both paid tiers must be purchasable, not just the first one.
    expect(new Set(bodies.map((b) => String(b.planId)))).toEqual(paidIds);
  });
});

describe("CheckoutSuccess records the paid conversion", () => {
  it("fires trackPaidConversion once the subscription row appears", async () => {
    searchParams = new URLSearchParams("session_id=cs_test_123");
    subscriptionRow = {
      id: "sub-1",
      plan_id: "plan-pro",
      status: "active",
      plan: { name: "Pro", price_monthly: 14.99, features: [] },
    };

    const CheckoutSuccess = (await import("./CheckoutSuccess")).default;
    render(
      <HelmetProvider>
        <CheckoutSuccess />
      </HelmetProvider>
    );

    // The funnel defined paid_conversion and nothing emitted it, so the
    // conversion rate read as a flat zero no matter how many people paid.
    await waitFor(() => expect(trackPaidConversion).toHaveBeenCalled());
    expect(trackPaidConversion).toHaveBeenCalledWith("plan-pro", 14.99);

    // Fired on the confirmed row, not on arrival: a customer who lands here
    // while the webhook is still in flight has not converted yet.
    expect(trackPaidConversion).toHaveBeenCalledTimes(1);
  });

  it("polls user_subscriptions for the row the webhook writes", async () => {
    searchParams = new URLSearchParams("session_id=cs_test_123");
    subscriptionRow = { id: "sub-1", plan_id: "plan-pro", status: "active", plan: { name: "Pro", price_monthly: 14.99 } };

    const { supabase } = await import("@/integrations/supabase/client");
    const CheckoutSuccess = (await import("./CheckoutSuccess")).default;
    render(
      <HelmetProvider>
        <CheckoutSuccess />
      </HelmetProvider>
    );

    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith("user_subscriptions"));
  });

  it("sends a visitor with no session id back to the dashboard", async () => {
    searchParams = new URLSearchParams();
    const CheckoutSuccess = (await import("./CheckoutSuccess")).default;
    render(
      <HelmetProvider>
        <CheckoutSuccess />
      </HelmetProvider>
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
    expect(trackPaidConversion).not.toHaveBeenCalled();
  });
});

describe("Billing shows the dunning state", () => {
  /** useSubscription is mocked per-test so Billing can be put in one state. */
  async function renderBilling(state: Record<string, unknown>) {
    vi.doMock("@/hooks/useSubscription", () => ({
      useSubscription: () => ({
        subscription: null,
        loading: false,
        actionLoading: false,
        refetch: vi.fn(),
        upgrade: vi.fn(),
        cancel: vi.fn(),
        reactivate: vi.fn(),
        changeBillingCycle: vi.fn(),
        isActive: false,
        isTrialing: false,
        isPastDue: false,
        isCanceled: false,
        isPaused: false,
        willCancelAtPeriodEnd: false,
        ...state,
      }),
    }));
    vi.resetModules();
    const Billing = (await import("./dashboard/Billing")).default;
    return render(
      <HelmetProvider>
        <Billing />
      </HelmetProvider>
    );
  }

  const PAST_DUE_SUB = {
    id: "sub-1",
    status: "past_due",
    plan_id: "plan-pro",
    cancel_at_period_end: false,
    current_period_start: "2026-08-05T00:00:00Z",
    current_period_end: "2026-09-05T00:00:00Z",
    plan: { name: "Pro", price_monthly: 14.99, features: [] },
    subscription_plans: { name: "Pro", price_monthly: 14.99, features: [] },
  };

  it("tells a past_due customer their payment failed and how to fix it", async () => {
    const { container } = await renderBilling({ subscription: PAST_DUE_SUB, isPastDue: true });

    // A failed payment that the billing page does not mention is a silent
    // cancellation waiting to happen: the customer finds out when the product
    // stops working.
    await waitFor(() => expect(container.textContent).toContain("Payment Failed"));
    expect(container.textContent).toContain("Past Due");
    expect(container.textContent).toMatch(/Update your payment method/i);

    const fixIt = Array.from(container.querySelectorAll("button")).find((b) =>
      /update payment method/i.test(b.textContent ?? "")
    );
    expect(fixIt, "no way to fix the failed payment").toBeTruthy();
    expect((fixIt as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not show the dunning banner to an active customer", async () => {
    const { container } = await renderBilling({
      subscription: { ...PAST_DUE_SUB, status: "active" },
      isActive: true,
    });

    await waitFor(() => expect(container.textContent).toContain("Active"));
    expect(container.textContent).not.toContain("Payment Failed");
  });
});
