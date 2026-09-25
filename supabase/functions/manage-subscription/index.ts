import Stripe from "https://esm.sh/stripe@14.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { getCorsHeaders, securityHeaders } from "../common/headers.ts";
import { PublicError, publicMessage, publicStatus } from '../_shared/errors.ts';

/**
 * Manage Subscription Edge Function
 *
 * POST { action: "upgrade" | "change", planId, billingCycle }
 * POST { action: "cancel" | "reactivate" }
 * POST { action: "change_billing_cycle", billingCycle }
 *
 * Caller: src/hooks/useSubscription.ts (web). No shipped iOS build calls it.
 *
 * The response headers are built per request and passed to every handler.
 * They used to be a `corsHeaders` const inside the default export that the
 * module-level handlers referenced by name, where it is not in scope: every
 * successful cancel, reactivate, change and change_billing_cycle threw a
 * ReferenceError while building its 200, AFTER Stripe and the database had
 * been written, so the change landed and the caller was told it failed.
 */

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** No generated Database types in the Deno tree; name what createClient returns. */
type SupabaseClientLike = ReturnType<typeof createClient>;

type ResponseHeaders = Record<string, string>;

/** The user_subscriptions columns these handlers read. */
interface CurrentSubscription {
  id: string;
  user_id: string;
  plan_id: string | null;
  status: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean | null;
}

interface PlanPrices {
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
}

type BillingCycle = "monthly" | "yearly";

const isBillingCycle = (v: unknown): v is BillingCycle => v === "monthly" || v === "yearly";

/** A live Stripe subscription whose items can be swapped in place. */
const LIVE_STRIPE = new Set(["active", "trialing"]);

function json(headers: ResponseHeaders, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers, status });
}

export default async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  const headers: ResponseHeaders = { ...corsHeaders, ...securityHeaders, "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new PublicError("No authorization header", 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new PublicError("Unauthorized", 401);
    }

    let body: { action?: unknown; planId?: unknown; billingCycle?: unknown };
    try {
      body = await req.json();
    } catch {
      throw new PublicError("Request body must be JSON");
    }
    const { action, planId, billingCycle } = body;

    console.log(`Managing subscription for user ${user.id}: ${String(action)}`);

    const { data: currentSub, error: subError } = await supabase
      .from("user_subscriptions")
      .select("*, plan:subscription_plans(*)")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError) {
      throw subError;
    }
    const sub = (currentSub ?? null) as CurrentSubscription | null;

    switch (action) {
      case "upgrade":
      case "change": {
        if (typeof planId !== "string" || !planId || !isBillingCycle(billingCycle)) {
          throw new PublicError("Missing planId or billingCycle");
        }
        return await handleUpgradeOrChange(supabase, user.id, authHeader, sub, planId, billingCycle, headers);
      }

      case "cancel":
        return await handleCancel(supabase, sub, headers);

      case "reactivate":
        return await handleReactivate(supabase, sub, headers);

      case "change_billing_cycle": {
        if (!isBillingCycle(billingCycle)) {
          throw new PublicError("Missing or invalid billingCycle");
        }
        return await handleChangeBillingCycle(supabase, sub, billingCycle, headers);
      }

      default:
        throw new PublicError("Unknown action");
    }
  } catch (error: unknown) {
    // Full detail to the log only; the body carries a PublicError's own
    // message or "Internal server error".
    console.error("Subscription management error:", error);
    return json(headers, { error: publicMessage(error) }, publicStatus(error));
  }
};

async function loadPlanPrices(supabase: SupabaseClientLike, planId: string): Promise<PlanPrices | null> {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("stripe_price_id_monthly, stripe_price_id_yearly")
    .eq("id", planId)
    .maybeSingle();
  if (error) {
    console.error(`Failed to load plan ${planId}:`, error);
    return null;
  }
  return (data ?? null) as PlanPrices | null;
}

const priceFor = (plan: PlanPrices, cycle: BillingCycle): string | null =>
  cycle === "monthly" ? plan.stripe_price_id_monthly : plan.stripe_price_id_yearly;

async function handleUpgradeOrChange(
  supabase: SupabaseClientLike,
  userId: string,
  authHeader: string,
  currentSub: CurrentSubscription | null,
  newPlanId: string,
  billingCycle: BillingCycle,
  headers: ResponseHeaders,
) {
  const newPlan = await loadPlanPrices(supabase, newPlanId);
  if (!newPlan) {
    throw new PublicError("Plan not found", 404);
  }

  const priceId = priceFor(newPlan, billingCycle);
  if (!priceId) {
    console.error(`Price ID not configured for plan ${newPlanId} / ${billingCycle}`);
    throw new PublicError("This plan is not available for that billing cycle");
  }

  // A live Stripe subscription (trialing included) is changed in place. A
  // trialing one used to fall through to a second checkout.
  if (currentSub?.stripe_subscription_id && currentSub.status && LIVE_STRIPE.has(currentSub.status)) {
    let updatedSubscription: Stripe.Subscription;
    try {
      const stripeSubscription = await stripe.subscriptions.retrieve(currentSub.stripe_subscription_id);
      updatedSubscription = await stripe.subscriptions.update(currentSub.stripe_subscription_id, {
        items: [{ id: stripeSubscription.items.data[0].id, price: priceId }],
        proration_behavior: "always_invoice", // Charge/credit immediately
        metadata: { user_id: userId, plan_id: newPlanId },
      });
    } catch (error: unknown) {
      console.error("Error updating Stripe subscription:", error);
      throw new PublicError("Failed to update subscription in Stripe", 502);
    }

    console.log(`Updated subscription ${updatedSubscription.id} to plan ${newPlanId}`);

    return json(headers, {
      success: true,
      message: "Subscription updated successfully",
      subscription: updatedSubscription,
    });
  }

  // No live subscription: hand off to create-checkout AS THE CALLER. This
  // client holds the service-role key, so without the caller's Authorization
  // header create-checkout's getUser() saw the service key and answered 401.
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: { planId: newPlanId, billingCycle },
    headers: { Authorization: authHeader },
  });

  if (error || !data?.url) {
    console.error("create-checkout hand-off failed:", error);
    throw new PublicError("Failed to start checkout", 502);
  }

  return json(headers, {
    success: true,
    checkout_url: data.url,
    message: "Redirecting to checkout",
  });
}

async function handleCancel(supabase: SupabaseClientLike, currentSub: CurrentSubscription | null, headers: ResponseHeaders) {
  if (!currentSub?.stripe_subscription_id) {
    throw new PublicError("No active subscription found", 404);
  }
  const stripeSubscriptionId = currentSub.stripe_subscription_id;

  let canceledSubscription: Stripe.Subscription;
  try {
    // Cancel at period end (don't immediately revoke access)
    canceledSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  } catch (error: unknown) {
    console.error("Error canceling subscription:", error);
    throw new PublicError("Failed to cancel subscription", 502);
  }

  console.log(`Canceled subscription ${canceledSubscription.id} at period end`);

  // Stripe is the record from here on, and its webhook writes the same
  // column; a failed mirror is logged rather than reported as a failed cancel.
  const { error: updateError } = await supabase
    .from("user_subscriptions")
    .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (updateError) console.error("Failed to mirror cancel_at_period_end:", updateError);

  const { error: eventError } = await supabase.from("subscription_events").insert({
    user_id: currentSub.user_id,
    subscription_id: currentSub.id,
    event_type: "cancellation_scheduled",
    old_plan_id: currentSub.plan_id,
    metadata: {
      cancel_at: canceledSubscription.cancel_at
        ? new Date(canceledSubscription.cancel_at * 1000).toISOString()
        : null,
    },
  });
  if (eventError) console.error("Failed to log cancellation event:", eventError);

  return json(headers, {
    success: true,
    message: "Subscription will be canceled at the end of the billing period",
    cancel_at: canceledSubscription.cancel_at,
  });
}

async function handleReactivate(supabase: SupabaseClientLike, currentSub: CurrentSubscription | null, headers: ResponseHeaders) {
  if (!currentSub?.stripe_subscription_id) {
    throw new PublicError("No subscription found", 404);
  }
  if (!currentSub.cancel_at_period_end) {
    throw new PublicError("Subscription is not scheduled for cancellation");
  }
  const stripeSubscriptionId = currentSub.stripe_subscription_id;

  let reactivatedSubscription: Stripe.Subscription;
  try {
    reactivatedSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
  } catch (error: unknown) {
    console.error("Error reactivating subscription:", error);
    throw new PublicError("Failed to reactivate subscription", 502);
  }

  console.log(`Reactivated subscription ${reactivatedSubscription.id}`);

  const { error: updateError } = await supabase
    .from("user_subscriptions")
    .update({ cancel_at_period_end: false, updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (updateError) console.error("Failed to mirror cancel_at_period_end:", updateError);

  const { error: eventError } = await supabase.from("subscription_events").insert({
    user_id: currentSub.user_id,
    subscription_id: currentSub.id,
    event_type: "reactivated",
    new_plan_id: currentSub.plan_id,
    metadata: { reactivated_at: new Date().toISOString() },
  });
  if (eventError) console.error("Failed to log reactivation event:", eventError);

  return json(headers, {
    success: true,
    message: "Subscription reactivated successfully",
  });
}

async function handleChangeBillingCycle(
  supabase: SupabaseClientLike,
  currentSub: CurrentSubscription | null,
  newBillingCycle: BillingCycle,
  headers: ResponseHeaders,
) {
  if (!currentSub?.stripe_subscription_id) {
    throw new PublicError("No active subscription found", 404);
  }
  if (!currentSub.plan_id) {
    throw new PublicError("Plan not found", 404);
  }
  const stripeSubscriptionId = currentSub.stripe_subscription_id;

  const plan = await loadPlanPrices(supabase, currentSub.plan_id);
  if (!plan) {
    throw new PublicError("Plan not found", 404);
  }

  const newPriceId = priceFor(plan, newBillingCycle);
  if (!newPriceId) {
    console.error(`Price ID not configured for plan ${currentSub.plan_id} / ${newBillingCycle}`);
    throw new PublicError("This plan is not available for that billing cycle");
  }

  let updatedSubscription: Stripe.Subscription;
  try {
    const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    updatedSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      items: [{ id: stripeSubscription.items.data[0].id, price: newPriceId }],
      proration_behavior: "always_invoice",
    });
  } catch (error: unknown) {
    console.error("Error changing billing cycle:", error);
    throw new PublicError("Failed to change billing cycle", 502);
  }

  console.log(`Changed billing cycle to ${newBillingCycle} for subscription ${updatedSubscription.id}`);

  return json(headers, {
    success: true,
    message: `Billing cycle changed to ${newBillingCycle}`,
  });
}
