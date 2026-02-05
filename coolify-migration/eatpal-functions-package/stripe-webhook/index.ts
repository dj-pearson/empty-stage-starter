import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  // Validate webhook secret is configured
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("CRITICAL: STRIPE_WEBHOOK_SECRET not configured");
    return new Response("Service configuration error", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    console.warn("Webhook attempt without signature from IP:", req.headers.get("x-forwarded-for"));
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    console.log(`Received event: ${event.type}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(supabase, session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(supabase, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(supabase, subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(supabase, invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(supabase, invoice);
        break;
      }

      case "customer.subscription.paused": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionPaused(supabase, subscription);
        break;
      }

      case "customer.subscription.resumed": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(supabase, subscription);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("Webhook error:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
  }
});

async function handleCheckoutCompleted(supabase: any, session: Stripe.Checkout.Session) {
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;
  
  console.log(`Checkout completed for customer: ${customerId}, subscription: ${subscriptionId}`);

  if (!subscriptionId) {
    console.error("No subscription ID in checkout session");
    return;
  }

  // The subscription details will be handled by the subscription.created/updated events
  // This handler is mainly for logging and triggering any immediate post-purchase actions
  
  // Get user_id from session metadata
  const userId = session.metadata?.user_id;
  
  if (userId) {
    // Ensure the customer ID is saved to the user's subscription record
    await supabase
      .from("user_subscriptions")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
      })
      .eq("user_id", userId);

    console.log(`Successfully linked subscription ${subscriptionId} to user ${userId}`);
  }
}

async function handleSubscriptionChange(supabase: any, subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  // Get plan by Stripe price ID (check both monthly and yearly fields)
  const { data: plans } = await supabase
    .from("subscription_plans")
    .select("id")
    .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`);

  const plan = plans?.[0];

  if (!plan) {
    console.error(`No plan found for price ID: ${priceId}`);
    console.error(`Searched for monthly or yearly price matching: ${priceId}`);
    return;
  }

  // Find user by Stripe customer ID
  const { data: existingSub } = await supabase
    .from("user_subscriptions")
    .select("user_id, plan_id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (existingSub) {
    // Update existing subscription
    const { error } = await supabase
      .from("user_subscriptions")
      .update({
        plan_id: plan.id,
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_customer_id", customerId);

    if (error) throw error;

    // Log event
    const eventType = existingSub.plan_id === plan.id ? "renewed" : "upgraded";
    await supabase.from("subscription_events").insert({
      user_id: existingSub.user_id,
      event_type: eventType,
      old_plan_id: existingSub.plan_id,
      new_plan_id: plan.id,
      metadata: { stripe_subscription_id: subscription.id },
    });
  } else {
    console.log("New subscription - customer ID will be linked when user signs up");
  }
}

async function handleSubscriptionDeleted(supabase: any, subscription: Stripe.Subscription) {
  const { data: existingSub } = await supabase
    .from("user_subscriptions")
    .select("user_id, plan_id")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (existingSub) {
    // Get the Free plan to downgrade the user
    const { data: freePlan } = await supabase
      .from("subscription_plans")
      .select("id")
      .eq("name", "Free")
      .single();

    // Downgrade to Free plan, clear Stripe subscription fields, and mark as canceled
    const { error: updateError } = await supabase
      .from("user_subscriptions")
      .update({
        status: "canceled",
        plan_id: freePlan?.id || existingSub.plan_id,
        stripe_subscription_id: null,
        cancel_at_period_end: false,
        current_period_start: null,
        current_period_end: null,
        trial_end: null,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", subscription.id);

    if (updateError) {
      console.error("Error updating subscription on deletion:", updateError);
    } else {
      console.log(`Subscription ${subscription.id} deleted — user ${existingSub.user_id} downgraded to Free`);
    }

    // Log cancellation event
    await supabase.from("subscription_events").insert({
      user_id: existingSub.user_id,
      event_type: "canceled",
      old_plan_id: existingSub.plan_id,
      new_plan_id: freePlan?.id || null,
      metadata: {
        stripe_subscription_id: subscription.id,
        canceled_at: new Date().toISOString(),
        reason: subscription.cancellation_details?.reason || "unknown",
      },
    });
  } else {
    console.warn(`No subscription record found for Stripe subscription ${subscription.id} on deletion`);
  }
}

async function handlePaymentSucceeded(supabase: any, invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const { data: sub, error: subError } = await supabase
    .from("user_subscriptions")
    .select("user_id, id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (subError) {
    console.error(`Error fetching subscription for customer ${customerId}:`, subError);
    return;
  }

  if (sub) {
    // Log successful payment
    const { error: paymentError } = await supabase.from("payment_history").insert({
      user_id: sub.user_id,
      subscription_id: sub.id,
      stripe_payment_intent_id: invoice.payment_intent as string,
      stripe_invoice_id: invoice.id,
      amount: invoice.amount_paid / 100, // Convert from cents
      currency: invoice.currency,
      status: "succeeded",
      description: invoice.lines.data[0]?.description || "Subscription payment",
    });

    if (paymentError) {
      console.error("Error logging payment:", paymentError);
    } else {
      console.log(`Payment succeeded: $${invoice.amount_paid / 100} for user ${sub.user_id}`);
    }
  } else {
    console.warn(`No subscription found for customer ${customerId} on payment success`);
  }
}

async function handlePaymentFailed(supabase: any, invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const { data: sub, error: subError } = await supabase
    .from("user_subscriptions")
    .select("user_id, id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (subError) {
    console.error(`Error fetching subscription for customer ${customerId}:`, subError);
    return;
  }

  if (sub) {
    // Update subscription status
    const { error: updateError } = await supabase
      .from("user_subscriptions")
      .update({
        status: "past_due",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);

    if (updateError) {
      console.error("Error updating subscription status:", updateError);
    }

    // Log failed payment
    const { error: paymentError } = await supabase.from("payment_history").insert({
      user_id: sub.user_id,
      subscription_id: sub.id,
      stripe_payment_intent_id: invoice.payment_intent as string,
      stripe_invoice_id: invoice.id,
      amount: invoice.amount_due / 100,
      currency: invoice.currency,
      status: "failed",
      description: invoice.lines.data[0]?.description || "Subscription payment",
    });

    if (paymentError) {
      console.error("Error logging failed payment:", paymentError);
    }

    // Log event
    const { error: eventError } = await supabase.from("subscription_events").insert({
      user_id: sub.user_id,
      subscription_id: sub.id,
      event_type: "payment_failed",
      metadata: { invoice_id: invoice.id },
    });

    if (eventError) {
      console.error("Error logging payment_failed event:", eventError);
    }

    console.warn(`Payment failed for user ${sub.user_id}: $${invoice.amount_due / 100}`);
  } else {
    console.warn(`No subscription found for customer ${customerId} on payment failure`);
  }
}

async function handleSubscriptionPaused(supabase: any, subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  const { data: existingSub } = await supabase
    .from("user_subscriptions")
    .select("user_id, plan_id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (existingSub) {
    const { error } = await supabase
      .from("user_subscriptions")
      .update({
        status: "paused",
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_customer_id", customerId);

    if (error) {
      console.error("Error pausing subscription:", error);
    }

    await supabase.from("subscription_events").insert({
      user_id: existingSub.user_id,
      event_type: "paused",
      old_plan_id: existingSub.plan_id,
      metadata: {
        stripe_subscription_id: subscription.id,
        paused_at: new Date().toISOString(),
      },
    });

    console.log(`Subscription paused for user ${existingSub.user_id}`);
  }
}
