import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("No signature", { status: 400 });
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    console.log(`Received event: ${event.type}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different event types
    switch (event.type) {
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

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }
});

async function handleSubscriptionChange(supabase: any, subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  // Get plan by Stripe price ID
  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("id")
    .eq("stripe_price_id", priceId)
    .single();

  if (!plan) {
    console.error(`No plan found for price ID: ${priceId}`);
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
    // Mark subscription as canceled
    await supabase
      .from("user_subscriptions")
      .update({
        status: "canceled",
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", subscription.id);

    // Log event
    await supabase.from("subscription_events").insert({
      user_id: existingSub.user_id,
      event_type: "canceled",
      old_plan_id: existingSub.plan_id,
      metadata: { stripe_subscription_id: subscription.id },
    });
  }
}

async function handlePaymentSucceeded(supabase: any, invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const { data: sub } = await supabase
    .from("user_subscriptions")
    .select("user_id, id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (sub) {
    // Log successful payment
    await supabase.from("payment_history").insert({
      user_id: sub.user_id,
      subscription_id: sub.id,
      stripe_payment_intent_id: invoice.payment_intent as string,
      stripe_invoice_id: invoice.id,
      amount: invoice.amount_paid / 100, // Convert from cents
      currency: invoice.currency,
      status: "succeeded",
      description: invoice.lines.data[0]?.description || "Subscription payment",
    });
  }
}

async function handlePaymentFailed(supabase: any, invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const { data: sub } = await supabase
    .from("user_subscriptions")
    .select("user_id, id")
    .eq("stripe_customer_id", customerId)
    .single();

  if (sub) {
    // Update subscription status
    await supabase
      .from("user_subscriptions")
      .update({
        status: "past_due",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);

    // Log failed payment
    await supabase.from("payment_history").insert({
      user_id: sub.user_id,
      subscription_id: sub.id,
      stripe_payment_intent_id: invoice.payment_intent as string,
      stripe_invoice_id: invoice.id,
      amount: invoice.amount_due / 100,
      currency: invoice.currency,
      status: "failed",
      description: invoice.lines.data[0]?.description || "Subscription payment",
    });

    // Log event
    await supabase.from("subscription_events").insert({
      user_id: sub.user_id,
      subscription_id: sub.id,
      event_type: "payment_failed",
      metadata: { invoice_id: invoice.id },
    });
  }
}
