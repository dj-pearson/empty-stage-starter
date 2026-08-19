import Stripe from "https://esm.sh/stripe@14.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { getCorsHeaders, securityHeaders } from "../common/headers.ts";

/**
 * Create Checkout Edge Function
 *
 * POST /create-checkout
 * Body: { planId, billingCycle: "monthly" | "yearly", successUrl?, cancelUrl? }
 * Auth: JWT required
 * Response (200): { url }
 *
 * The caller never supplies a Stripe price. It supplies a planId, and the
 * price is read from the subscription_plans row server-side, so a caller
 * cannot substitute a cheaper price to provision a paid tier (US-326's
 * price/tier tampering concern, solved here by the plan lookup rather than by
 * an env allowlist).
 *
 * US-626 reconciled the duplicate implementation that lived under
 * functions/create-checkout. That copy answered a different contract
 * ({ price_id } -> { checkout_url }) that no client in this repo ever called;
 * this tree is what src/pages/Pricing.tsx invokes and what ships. What it did
 * have over this one -- method checking, a Stripe-not-configured branch, real
 * status codes, and not forwarding upstream Stripe detail to the browser
 * (US-532) -- was ported here before it was deleted.
 */

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

/** Narrow a caught value to a printable message without reaching for `any`. */
const errMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export default async (req: Request) => {
  // Get secure CORS headers based on request origin
  const corsHeaders = getCorsHeaders(req);

  const jsonHeaders = {
    ...corsHeaders,
    ...securityHeaders,
    "Content-Type": "application/json",
  };

  /**
   * Every error the browser sees goes through here. The `error` string is
   * surfaced verbatim by src/lib/edge-functions.ts and string-matched by
   * Pricing.tsx, so it stays coarse and free of Stripe internals (price IDs,
   * customer IDs, upstream messages) while keeping the words that page
   * classifies on. `code` is the stable handle for new callers; the detail
   * only ever goes to the function log.
   */
  const fail = (status: number, code: string, message: string, detail?: unknown) => {
    if (detail !== undefined) {
      console.error(`create-checkout ${code}:`, detail);
    } else {
      console.error(`create-checkout ${code}`);
    }
    return new Response(JSON.stringify({ error: message, code }), {
      headers: jsonHeaders,
      status,
    });
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return fail(405, "method_not_allowed", "Method not allowed");
  }

  if (!stripeSecretKey) {
    return fail(503, "stripe_not_configured", "Payments are not configured");
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return fail(401, "missing_authorization", "Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return fail(401, "unauthorized", "Invalid or expired token", userError);
    }

    let body: { planId?: unknown; billingCycle?: unknown; successUrl?: unknown; cancelUrl?: unknown };
    try {
      body = await req.json();
    } catch (parseError) {
      return fail(400, "invalid_body", "Request body must be JSON", parseError);
    }

    const { planId, billingCycle, successUrl, cancelUrl } = body;

    if (typeof planId !== "string" || !planId) {
      return fail(400, "missing_plan_id", "Missing required fields");
    }

    if (billingCycle !== "monthly" && billingCycle !== "yearly") {
      return fail(400, "invalid_billing_cycle", "Missing required fields");
    }

    // Get plan details. The price comes from this row, never from the caller.
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .single();

    if (planError || !plan) {
      return fail(404, "plan_not_found", "Plan not found", planError);
    }

    // Get or create Stripe customer
    let customerId: string | null = null;
    let customerWasRecreated = false;

    const { data: existingSub } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    try {
      if (existingSub?.stripe_customer_id) {
        // Verify the customer still exists in Stripe (may have been deleted)
        try {
          const existingCustomer = await stripe.customers.retrieve(existingSub.stripe_customer_id);
          if (existingCustomer.deleted) {
            throw new Error("Customer was deleted");
          }
          customerId = existingSub.stripe_customer_id;
        } catch (custError: unknown) {
          console.warn(
            `Stale Stripe customer ${existingSub.stripe_customer_id}, creating new one:`,
            errMessage(custError),
          );
          const newCustomer = await stripe.customers.create({
            email: user.email,
            metadata: { supabase_user_id: user.id },
          });
          customerId = newCustomer.id;
          customerWasRecreated = true;

          // Update the DB with the new customer ID immediately
          await supabase
            .from("user_subscriptions")
            .update({ stripe_customer_id: customerId })
            .eq("user_id", user.id);
        }
      } else {
        // Create new Stripe customer
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            supabase_user_id: user.id,
          },
        });
        customerId = customer.id;
      }
    } catch (customerError) {
      return fail(
        502,
        "customer_setup_failed",
        "Customer account could not be prepared",
        customerError,
      );
    }

    if (!customerId) {
      return fail(
        502,
        "customer_setup_failed",
        "Customer account could not be prepared",
        `no Stripe customer resolved for user ${user.id}`,
      );
    }

    // Resolve Stripe price ID - prioritize billing-cycle-specific fields
    const priceId =
      (billingCycle === "yearly" ? (plan.stripe_price_id_yearly || plan.stripe_yearly_price_id) : null) ||
      (billingCycle === "monthly" ? (plan.stripe_price_id_monthly || plan.stripe_monthly_price_id) : null) ||
      plan.stripe_price_id ||
      plan.stripePriceId;

    if (!priceId) {
      return fail(
        400,
        "price_not_configured",
        "Price is not configured for this plan",
        `plan ${planId} / ${billingCycle} has no price column set; available fields: ${Object.keys(plan).join(", ")}`,
      );
    }

    // Verify the price exists in Stripe before creating checkout
    try {
      await stripe.prices.retrieve(priceId);
    } catch (priceError: unknown) {
      return fail(
        400,
        "price_not_found_in_stripe",
        "Price is not configured for this plan",
        `Stripe price ${priceId} (plan ${planId}) does not exist: ${errMessage(priceError)}`,
      );
    }

    // US-630: the trial the pricing page has been advertising. Length comes
    // from subscription_plans.trial_period_days so it is a data change, not a
    // deploy. NULL or 0 means no trial, and the session is built without one.
    const trialPeriodDays = Number(plan.trial_period_days);
    const hasTrial = Number.isFinite(trialPeriodDays) && trialPeriodDays > 0;

    const origin = req.headers.get("origin") || "https://tryeatpal.com";

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: typeof successUrl === "string" && successUrl
        ? successUrl
        : `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: typeof cancelUrl === "string" && cancelUrl
        ? cancelUrl
        : `${origin}/pricing?checkout=cancelled`,
      // Ported from the reconciled copy: lets a Stripe-side reconciliation find
      // the user without parsing metadata.
      client_reference_id: user.id,
      metadata: {
        user_id: user.id,
        plan_id: planId,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_id: planId,
        },
        ...(hasTrial
          ? {
              trial_period_days: Math.floor(trialPeriodDays),
              // Checkout always collects a card in subscription mode, so a
              // trial that ends with no payment method means the card was
              // removed or declined. Cancel rather than silently leaving the
              // subscription in an unpaid state the user still sees as active.
              trial_settings: {
                end_behavior: { missing_payment_method: "cancel" },
              },
            }
          : {}),
      },
    });

    // Store customer ID if it's new (or skip if already updated during recreation)
    if (!existingSub?.stripe_customer_id && !customerWasRecreated) {
      await supabase
        .from("user_subscriptions")
        .upsert({
          user_id: user.id,
          plan_id: planId,
          stripe_customer_id: customerId,
          status: "incomplete",
        }, {
          onConflict: "user_id",
        });
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      {
        headers: jsonHeaders,
        status: 200,
      }
    );
  } catch (error: unknown) {
    return fail(500, "unexpected_error", "Failed to start checkout", error);
  }
}
