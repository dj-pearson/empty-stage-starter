import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { getCorsHeaders, securityHeaders } from "../_shared/headers.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  // Get secure CORS headers based on request origin
  const corsHeaders = getCorsHeaders(req);

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
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { planId, billingCycle, successUrl, cancelUrl } = await req.json();

    if (!planId || !billingCycle) {
      throw new Error("Missing required fields");
    }

    console.log("Fetching plan for:", planId);

    // Get plan details - log the full plan object to see what fields exist
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .single();

    if (planError || !plan) {
      console.error("Plan fetch error:", planError);
      throw new Error("Plan not found");
    }

    console.log("Plan object:", JSON.stringify(plan, null, 2));

    // Get or create Stripe customer
    let customerId: string;
    
    const { data: existingSub } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id;
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

    // Resolve Stripe price ID - prioritize billing-cycle-specific fields
    const priceId = 
      (billingCycle === "yearly" ? (plan.stripe_price_id_yearly || plan.stripe_yearly_price_id) : null) ||
      (billingCycle === "monthly" ? (plan.stripe_price_id_monthly || plan.stripe_monthly_price_id) : null) ||
      plan.stripe_price_id ||
      plan.stripePriceId;

    console.log("Resolved price ID:", priceId);

    if (!priceId) {
      console.error("No price ID found. Available plan fields:", Object.keys(plan));
      throw new Error(
        `Price ID not configured for this plan. Billing cycle: ${billingCycle}. Please configure Stripe price IDs in Supabase.`
      );
    }

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
      success_url: successUrl || `${req.headers.get("origin") || "https://tryeatpal.com"}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.headers.get("origin") || "https://tryeatpal.com"}/pricing?checkout=cancelled`,
      metadata: {
        user_id: user.id,
        plan_id: planId,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_id: planId,
        },
      },
    });

    // Store customer ID if it's new
    if (!existingSub?.stripe_customer_id) {
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
        headers: {
          ...corsHeaders,
          ...securityHeaders,
          "Content-Type": "application/json"
        },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Checkout error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: {
          ...corsHeaders,
          ...securityHeaders,
          "Content-Type": "application/json"
        },
        status: 400,
      }
    );
  }
});
