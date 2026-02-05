import Stripe from "https://esm.sh/stripe@14.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { getCorsHeaders, noCacheHeaders } from "../common/headers.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Payment Methods Management Edge Function
 *
 * Actions:
 * - list: List all payment methods for the user
 * - create-setup-intent: Create a SetupIntent for adding a new payment method
 * - attach: Attach a payment method to the customer
 * - detach: Remove a payment method
 * - set-default: Set a payment method as default
 * - get-portal-url: Get Stripe Customer Portal URL for self-service
 */
export default async (req: Request) => {
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
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { action, paymentMethodId } = await req.json();

    console.log(`Payment method action for user ${user.id}: ${action}`);

    // Get user's Stripe customer ID
    const { data: subscription } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    // For some actions, we need a customer ID
    let customerId = subscription?.stripe_customer_id;

    switch (action) {
      case "list": {
        if (!customerId) {
          return new Response(
            JSON.stringify({ success: true, paymentMethods: [], defaultPaymentMethodId: null }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            }
          );
        }
        return await handleListPaymentMethods(customerId, corsHeaders);
      }

      case "create-setup-intent": {
        // Create or get customer
        customerId = await ensureCustomer(supabase, stripe, user, customerId);
        return await handleCreateSetupIntent(customerId, corsHeaders);
      }

      case "attach": {
        if (!paymentMethodId) {
          throw new Error("Missing paymentMethodId");
        }
        customerId = await ensureCustomer(supabase, stripe, user, customerId);
        return await handleAttachPaymentMethod(customerId, paymentMethodId, corsHeaders);
      }

      case "detach": {
        if (!paymentMethodId) {
          throw new Error("Missing paymentMethodId");
        }
        if (!customerId) {
          throw new Error("No customer found");
        }
        return await handleDetachPaymentMethod(customerId, paymentMethodId, corsHeaders);
      }

      case "set-default": {
        if (!paymentMethodId) {
          throw new Error("Missing paymentMethodId");
        }
        if (!customerId) {
          throw new Error("No customer found");
        }
        return await handleSetDefaultPaymentMethod(customerId, paymentMethodId, corsHeaders);
      }

      case "get-portal-url": {
        if (!customerId) {
          throw new Error("No subscription found. Please subscribe first.");
        }
        return await handleGetPortalUrl(customerId, corsHeaders);
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: any) {
    console.error("Payment method management error:", error);
    const corsHeaders = getCorsHeaders(req);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function ensureCustomer(
  supabase: any,
  stripe: Stripe,
  user: any,
  existingCustomerId: string | null
): Promise<string> {
  if (existingCustomerId) {
    // Verify customer exists in Stripe
    try {
      await stripe.customers.retrieve(existingCustomerId);
      return existingCustomerId;
    } catch (error) {
      console.log("Customer not found in Stripe, creating new one");
    }
  }

  // Create a new customer in Stripe
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: {
      supabase_user_id: user.id,
    },
  });

  // Update or create subscription record with customer ID
  const { error: upsertError } = await supabase
    .from("user_subscriptions")
    .upsert({
      user_id: user.id,
      stripe_customer_id: customer.id,
      status: "inactive",
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

  if (upsertError) {
    console.error("Error upserting subscription record:", upsertError);
  }

  return customer.id;
}

async function handleListPaymentMethods(customerId: string, corsHeaders: any) {
  try {
    // Get customer to find default payment method
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method as string | null;

    // List all payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    const formattedMethods = paymentMethods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
      isDefault: pm.id === defaultPaymentMethodId,
      created: pm.created,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        paymentMethods: formattedMethods,
        defaultPaymentMethodId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error listing payment methods:", error);
    throw new Error(`Failed to list payment methods: ${error.message}`);
  }
}

async function handleCreateSetupIntent(customerId: string, corsHeaders: any) {
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session", // Allow using this payment method for future payments
    });

    return new Response(
      JSON.stringify({
        success: true,
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error creating setup intent:", error);
    throw new Error(`Failed to create setup intent: ${error.message}`);
  }
}

async function handleAttachPaymentMethod(
  customerId: string,
  paymentMethodId: string,
  corsHeaders: any
) {
  try {
    // Attach the payment method to the customer
    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Get current payment methods count
    const existingMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    // If this is the only payment method, set it as default
    if (existingMethods.data.length === 1) {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Payment method added successfully",
        paymentMethod: {
          id: paymentMethod.id,
          brand: paymentMethod.card?.brand,
          last4: paymentMethod.card?.last4,
          expMonth: paymentMethod.card?.exp_month,
          expYear: paymentMethod.card?.exp_year,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error attaching payment method:", error);
    throw new Error(`Failed to attach payment method: ${error.message}`);
  }
}

async function handleDetachPaymentMethod(
  customerId: string,
  paymentMethodId: string,
  corsHeaders: any
) {
  try {
    // Check if this is the default payment method
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    const isDefault = customer.invoice_settings?.default_payment_method === paymentMethodId;

    // Detach the payment method
    await stripe.paymentMethods.detach(paymentMethodId);

    // If it was the default, try to set another one as default
    if (isDefault) {
      const remainingMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
      });

      if (remainingMethods.data.length > 0) {
        await stripe.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: remainingMethods.data[0].id,
          },
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Payment method removed successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error detaching payment method:", error);
    throw new Error(`Failed to remove payment method: ${error.message}`);
  }
}

async function handleSetDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string,
  corsHeaders: any
) {
  try {
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Default payment method updated",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error setting default payment method:", error);
    throw new Error(`Failed to set default payment method: ${error.message}`);
  }
}

async function handleGetPortalUrl(customerId: string, corsHeaders: any) {
  try {
    const returnUrl = `${Deno.env.get("SITE_URL") || "https://eatpal.com"}/dashboard/billing`;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return new Response(
      JSON.stringify({
        success: true,
        url: portalSession.url,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error creating portal session:", error);
    throw new Error(`Failed to create customer portal session: ${error.message}`);
  }
}
