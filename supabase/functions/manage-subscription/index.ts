import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { action, planId, billingCycle } = await req.json();

    console.log(`Managing subscription for user ${user.id}: ${action}`);

    // Get current subscription
    const { data: currentSub, error: subError } = await supabase
      .from("user_subscriptions")
      .select("*, plan:subscription_plans(*)")
      .eq("user_id", user.id)
      .single();

    if (subError && subError.code !== "PGRST116") {
      // PGRST116 = not found, which is okay
      throw subError;
    }

    switch (action) {
      case "upgrade":
      case "change": {
        if (!planId || !billingCycle) {
          throw new Error("Missing planId or billingCycle");
        }

        return await handleUpgradeOrChange(
          supabase,
          user,
          currentSub,
          planId,
          billingCycle,
          req
        );
      }

      case "cancel": {
        return await handleCancel(supabase, currentSub);
      }

      case "reactivate": {
        return await handleReactivate(supabase, currentSub);
      }

      case "change_billing_cycle": {
        return await handleChangeBillingCycle(
          supabase,
          currentSub,
          billingCycle
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("Subscription management error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function handleUpgradeOrChange(
  supabase: any,
  user: any,
  currentSub: any,
  newPlanId: string,
  billingCycle: string,
  req: Request
) {
  // Get new plan details
  const { data: newPlan, error: planError } = await supabase
    .from("subscription_plans")
    .select("*")
    .eq("id", newPlanId)
    .single();

  if (planError || !newPlan) {
    throw new Error("Plan not found");
  }

  // Get the correct price ID
  const priceId =
    billingCycle === "monthly"
      ? newPlan.stripe_price_id_monthly
      : newPlan.stripe_price_id_yearly;

  if (!priceId) {
    throw new Error(`Price ID not configured for ${billingCycle} billing`);
  }

  // If user has an active subscription, update it in Stripe
  if (
    currentSub?.stripe_subscription_id &&
    currentSub?.status === "active"
  ) {
    try {
      // Get the current subscription from Stripe
      const stripeSubscription = await stripe.subscriptions.retrieve(
        currentSub.stripe_subscription_id
      );

      // Update the subscription
      const updatedSubscription = await stripe.subscriptions.update(
        currentSub.stripe_subscription_id,
        {
          items: [
            {
              id: stripeSubscription.items.data[0].id,
              price: priceId,
            },
          ],
          proration_behavior: "always_invoice", // Charge/credit immediately
          metadata: {
            user_id: user.id,
            plan_id: newPlanId,
          },
        }
      );

      console.log(
        `Updated subscription ${updatedSubscription.id} to plan ${newPlanId}`
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: "Subscription updated successfully",
          subscription: updatedSubscription,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    } catch (error) {
      console.error("Error updating Stripe subscription:", error);
      throw new Error("Failed to update subscription in Stripe");
    }
  } else {
    // No active subscription, create a new checkout session
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: { planId: newPlanId, billingCycle },
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        checkout_url: data.url,
        message: "Redirecting to checkout",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  }
}

async function handleCancel(supabase: any, currentSub: any) {
  if (!currentSub?.stripe_subscription_id) {
    throw new Error("No active subscription found");
  }

  try {
    // Cancel at period end (don't immediately revoke access)
    const canceledSubscription = await stripe.subscriptions.update(
      currentSub.stripe_subscription_id,
      {
        cancel_at_period_end: true,
      }
    );

    console.log(
      `Canceled subscription ${canceledSubscription.id} at period end`
    );

    // Update local database
    await supabase
      .from("user_subscriptions")
      .update({
        cancel_at_period_end: true,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", currentSub.stripe_subscription_id);

    // Log event
    await supabase.from("subscription_events").insert({
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

    return new Response(
      JSON.stringify({
        success: true,
        message:
          "Subscription will be canceled at the end of the billing period",
        cancel_at: canceledSubscription.cancel_at,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error canceling subscription:", error);
    throw new Error("Failed to cancel subscription");
  }
}

async function handleReactivate(supabase: any, currentSub: any) {
  if (!currentSub?.stripe_subscription_id) {
    throw new Error("No subscription found");
  }

  if (!currentSub.cancel_at_period_end) {
    throw new Error("Subscription is not scheduled for cancellation");
  }

  try {
    // Reactivate the subscription
    const reactivatedSubscription = await stripe.subscriptions.update(
      currentSub.stripe_subscription_id,
      {
        cancel_at_period_end: false,
      }
    );

    console.log(`Reactivated subscription ${reactivatedSubscription.id}`);

    // Update local database
    await supabase
      .from("user_subscriptions")
      .update({
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", currentSub.stripe_subscription_id);

    // Log event
    await supabase.from("subscription_events").insert({
      user_id: currentSub.user_id,
      subscription_id: currentSub.id,
      event_type: "reactivated",
      new_plan_id: currentSub.plan_id,
      metadata: {
        reactivated_at: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Subscription reactivated successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error reactivating subscription:", error);
    throw new Error("Failed to reactivate subscription");
  }
}

async function handleChangeBillingCycle(
  supabase: any,
  currentSub: any,
  newBillingCycle: string
) {
  if (!currentSub?.stripe_subscription_id) {
    throw new Error("No active subscription found");
  }

  try {
    // Get current plan
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", currentSub.plan_id)
      .single();

    if (!plan) {
      throw new Error("Plan not found");
    }

    // Get new price ID
    const newPriceId =
      newBillingCycle === "monthly"
        ? plan.stripe_price_id_monthly
        : plan.stripe_price_id_yearly;

    if (!newPriceId) {
      throw new Error(
        `Price ID not configured for ${newBillingCycle} billing`
      );
    }

    // Get current subscription from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(
      currentSub.stripe_subscription_id
    );

    // Update subscription with new price
    const updatedSubscription = await stripe.subscriptions.update(
      currentSub.stripe_subscription_id,
      {
        items: [
          {
            id: stripeSubscription.items.data[0].id,
            price: newPriceId,
          },
        ],
        proration_behavior: "always_invoice",
      }
    );

    console.log(
      `Changed billing cycle to ${newBillingCycle} for subscription ${updatedSubscription.id}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Billing cycle changed to ${newBillingCycle}`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error changing billing cycle:", error);
    throw new Error("Failed to change billing cycle");
  }
}

