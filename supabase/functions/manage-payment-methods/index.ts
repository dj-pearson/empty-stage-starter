import Stripe from "https://esm.sh/stripe@14.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { getCorsHeaders, noCacheHeaders } from "../common/headers.ts";
import { PublicError, publicMessage, publicStatus } from '../_shared/errors.ts';
import {
  classifyCustomerRetrieve,
  customerRowWrite,
  isStripeResourceMissing,
  paymentMethodBelongsTo,
} from '../_shared/paymentMethodOwnership.ts';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** No generated Database types in the Deno tree; name what createClient returns. */
type SupabaseClientLike = ReturnType<typeof createClient>;
type ResponseHeaders = Record<string, string>;

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
 *
 * Callers: src/lib/billingPortal.ts (get-portal-url). No shipped iOS build.
 *
 * detach and set-default act only on a payment method attached to the
 * caller's own Stripe customer (see _shared/paymentMethodOwnership.ts).
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

    const { action, paymentMethodId } = await req.json();

    console.log(`Payment method action for user ${user.id}: ${action}`);

    // Get user's Stripe customer ID
    const { data: subscription, error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subscriptionError) {
      // Reading this as "no row" would create a second Stripe customer.
      throw subscriptionError;
    }
    const hasRow = subscription !== null;

    // For some actions, we need a customer ID
    let customerId: string | null =
      (subscription as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;

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
        customerId = await ensureCustomer(supabase, user, customerId, hasRow);
        return await handleCreateSetupIntent(customerId, corsHeaders);
      }

      case "attach": {
        if (typeof paymentMethodId !== "string" || !paymentMethodId) {
          throw new PublicError("Missing paymentMethodId");
        }
        customerId = await ensureCustomer(supabase, user, customerId, hasRow);
        return await handleAttachPaymentMethod(customerId, paymentMethodId, corsHeaders);
      }

      case "detach": {
        if (typeof paymentMethodId !== "string" || !paymentMethodId) {
          throw new PublicError("Missing paymentMethodId");
        }
        if (!customerId) {
          throw new PublicError("No customer found");
        }
        return await handleDetachPaymentMethod(customerId, paymentMethodId, corsHeaders);
      }

      case "set-default": {
        if (typeof paymentMethodId !== "string" || !paymentMethodId) {
          throw new PublicError("Missing paymentMethodId");
        }
        if (!customerId) {
          throw new PublicError("No customer found");
        }
        return await handleSetDefaultPaymentMethod(customerId, paymentMethodId, corsHeaders);
      }

      case "get-portal-url": {
        if (!customerId) {
          throw new PublicError("No subscription found. Please subscribe first.");
        }
        return await handleGetPortalUrl(customerId, corsHeaders);
      }

      default:
        throw new PublicError("Unknown action");
    }
  } catch (error: unknown) {
    // Detail to the log only; the body is a PublicError's words or generic.
    console.error("Payment method management error:", error);
    return new Response(JSON.stringify({ error: publicMessage(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: publicStatus(error),
    });
  }
};

/**
 * The caller's Stripe customer id, creating one only when there is none or
 * Stripe says the stored one is gone.
 *
 * A transient Stripe failure (timeout, 429, 5xx) is an error, not a missing
 * customer: it used to create a new customer and upsert the row with status
 * 'inactive', which orphaned a paying parent's subscription on the old
 * customer and marked the account unpaid.
 */
async function ensureCustomer(
  supabase: SupabaseClientLike,
  user: { id: string; email?: string | null },
  existingCustomerId: string | null,
  hasRow: boolean,
): Promise<string> {
  if (existingCustomerId) {
    let retrieved: { deleted?: boolean } | null = null;
    let retrieveError: unknown = undefined;
    try {
      const found = await stripe.customers.retrieve(existingCustomerId);
      retrieved = { deleted: "deleted" in found && found.deleted === true };
    } catch (error: unknown) {
      retrieveError = error;
    }
    const verdict = classifyCustomerRetrieve(retrieved, retrieveError);
    if (verdict === 'use') return existingCustomerId;
    if (verdict === 'fail') {
      console.error("Could not verify Stripe customer:", retrieveError);
      throw new PublicError("Payment provider unavailable. Please try again.", 503);
    }
    console.log("Stripe customer missing or deleted, creating a new one");
  }

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: {
      supabase_user_id: user.id,
    },
  });

  const write = customerRowWrite(hasRow, user.id, customer.id, new Date().toISOString());
  const { error: writeError } = write.kind === 'update'
    ? await supabase.from("user_subscriptions").update(write.values).eq("user_id", user.id)
    : await supabase.from("user_subscriptions").upsert(write.values, { onConflict: 'user_id', ignoreDuplicates: true });

  if (writeError) {
    console.error("Error recording Stripe customer id:", writeError);
  }

  return customer.id;
}

/**
 * Throw unless `paymentMethodId` is attached to `customerId`.
 *
 * Not-found and not-yours answer the same 404, so the endpoint cannot be used
 * to learn whether some other account's pm_ id exists.
 */
async function assertOwnPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
  let pm: Stripe.PaymentMethod;
  try {
    pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  } catch (error: unknown) {
    if (isStripeResourceMissing(error)) {
      throw new PublicError("Payment method not found", 404);
    }
    console.error("Error retrieving payment method:", error);
    throw new PublicError("Payment provider unavailable. Please try again.", 503);
  }
  if (!paymentMethodBelongsTo(pm, customerId)) {
    console.warn(`Refused payment method ${paymentMethodId}: not attached to customer ${customerId}`);
    throw new PublicError("Payment method not found", 404);
  }
}

async function handleListPaymentMethods(customerId: string, corsHeaders: ResponseHeaders) {
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
  } catch (error: unknown) {
    console.error("Error listing payment methods:", error);
    throw new PublicError("Failed to list payment methods", 502);
  }
}

async function handleCreateSetupIntent(customerId: string, corsHeaders: ResponseHeaders) {
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
  } catch (error: unknown) {
    console.error("Error creating setup intent:", error);
    throw new PublicError("Failed to create setup intent", 502);
  }
}

async function handleAttachPaymentMethod(
  customerId: string,
  paymentMethodId: string,
  corsHeaders: ResponseHeaders
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
  } catch (error: unknown) {
    console.error("Error attaching payment method:", error);
    throw new PublicError("Failed to attach payment method", 502);
  }
}

async function handleDetachPaymentMethod(
  customerId: string,
  paymentMethodId: string,
  corsHeaders: ResponseHeaders
) {
  await assertOwnPaymentMethod(customerId, paymentMethodId);

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
  } catch (error: unknown) {
    console.error("Error detaching payment method:", error);
    throw new PublicError("Failed to remove payment method", 502);
  }
}

async function handleSetDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string,
  corsHeaders: ResponseHeaders
) {
  await assertOwnPaymentMethod(customerId, paymentMethodId);

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
  } catch (error: unknown) {
    console.error("Error setting default payment method:", error);
    throw new PublicError("Failed to set default payment method", 502);
  }
}

async function handleGetPortalUrl(customerId: string, corsHeaders: ResponseHeaders) {
  try {
    const returnUrl = `${Deno.env.get("SITE_URL") || "https://tryeatpal.com"}/dashboard/billing`;

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
  } catch (error: unknown) {
    console.error("Error creating portal session:", error);
    throw new PublicError("Failed to create customer portal session", 502);
  }
}
