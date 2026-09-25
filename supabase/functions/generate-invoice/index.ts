import Stripe from "https://esm.sh/stripe@14.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { getCorsHeaders } from "../common/headers.ts";
import { PublicError, publicMessage, publicStatus } from '../_shared/errors.ts';
import {
  buildInvoiceData,
  invoiceNumberFor,
  paymentDescription,
  renderInvoiceEmailHtml,
  renderInvoiceHtml,
  type PaymentForInvoice,
} from '../_shared/invoice.ts';

/**
 * The supabase-js client, named rather than `any` (US-870).
 *
 * This tree has no generated Database types -- `supabase gen types` writes
 * them for src/, and the Deno handlers import the client straight from esm.sh
 * -- so the honest type is "whatever createClient returns".
 */
type SupabaseClientLike = ReturnType<typeof createClient>;

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Generate Invoice Edge Function
 *
 * Actions:
 * - generate: Generate a PDF invoice from payment history
 * - send: Generate and send invoice via email
 * - list: List all invoices for the user
 * - download-stripe: Get Stripe-hosted invoice PDF URL
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

    const { action, paymentId, invoiceId } = await req.json();

    console.log(`Invoice action for user ${user.id}: ${action}`);

    switch (action) {
      case "list": {
        return await handleListInvoices(supabase, user.id, corsHeaders);
      }

      case "generate": {
        if (!paymentId) {
          throw new PublicError("Missing paymentId");
        }
        return await handleGenerateInvoice(supabase, user.id, paymentId, corsHeaders);
      }

      case "send": {
        if (!paymentId) {
          throw new PublicError("Missing paymentId");
        }
        return await handleSendInvoice(supabase, user, paymentId, corsHeaders);
      }

      case "download-stripe": {
        if (!invoiceId) {
          throw new PublicError("Missing invoiceId (Stripe invoice ID)");
        }
        return await handleDownloadStripeInvoice(supabase, user.id, invoiceId, corsHeaders);
      }

      default:
        throw new PublicError("Unknown action");
    }
  } catch (error) {
    // The detail goes to the log; the caller gets a PublicError's own words
    // or "Internal server error".
    console.error("Invoice generation error:", error);
    return new Response(JSON.stringify({ error: publicMessage(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: publicStatus(error),
    });
  }
};

/**
 * The embed is a LEFT join on purpose. It was `user_subscriptions!inner`,
 * which drops every payment whose subscription_id is NULL -- and the column is
 * ON DELETE SET NULL, and a payment recorded before its subscription row
 * existed has none either -- so a real, succeeded payment silently vanished
 * from the list and answered "Payment not found" to generate and send. The
 * plan name is only a fallback description, so a missing one costs nothing.
 */
const PAYMENT_WITH_PLAN = `
  id,
  amount,
  currency,
  status,
  description,
  stripe_invoice_id,
  stripe_payment_intent_id,
  created_at,
  subscription:user_subscriptions(
    plan:subscription_plans(name)
  )
`;

async function handleListInvoices(supabase: SupabaseClientLike, userId: string, corsHeaders: Record<string, string>) {
  const { data, error } = await supabase
    .from("payment_history")
    .select(PAYMENT_WITH_PLAN)
    .eq("user_id", userId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch payments:", error);
    throw new PublicError("Failed to fetch invoices", 500);
  }

  const payments = (data ?? []) as unknown as PaymentForInvoice[];
  const invoices = payments.map((payment) => ({
    id: payment.id,
    // One scheme: the number printed on the generated and emailed invoice.
    invoiceNumber: invoiceNumberFor(payment.id, payment.created_at),
    date: payment.created_at,
    amount: payment.amount,
    currency: payment.currency || 'usd',
    status: payment.status,
    description: paymentDescription(payment, 'Subscription payment'),
    stripeInvoiceId: payment.stripe_invoice_id,
    hasStripeInvoice: !!payment.stripe_invoice_id,
  }));

  return new Response(
    JSON.stringify({ success: true, invoices }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    }
  );
}

/** The caller's own payment, or a PublicError that says nothing more. */
async function loadOwnPayment(
  supabase: SupabaseClientLike,
  userId: string,
  paymentId: string,
): Promise<PaymentForInvoice> {
  const { data, error } = await supabase
    .from("payment_history")
    .select(PAYMENT_WITH_PLAN)
    .eq("id", paymentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load payment:", error);
  }
  if (error || !data) {
    throw new PublicError("Payment not found or access denied", 404);
  }
  return data as unknown as PaymentForInvoice;
}

async function customerNameFor(supabase: SupabaseClientLike, userId: string, email: string): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  const fullName = (profile as { full_name?: string | null } | null)?.full_name;
  return fullName || email.split('@')[0] || 'Customer';
}

async function handleGenerateInvoice(
  supabase: SupabaseClientLike,
  userId: string,
  paymentId: string,
  corsHeaders: Record<string, string>
) {
  const payment = await loadOwnPayment(supabase, userId, paymentId);

  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const customerEmail = authUser?.user?.email || '';
  const customerName = await customerNameFor(supabase, userId, customerEmail);

  const invoiceData = buildInvoiceData(payment, { name: customerName, email: customerEmail });
  const invoiceHtml = renderInvoiceHtml(invoiceData);

  return new Response(
    JSON.stringify({
      success: true,
      invoice: invoiceData,
      html: invoiceHtml,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    }
  );
}

async function handleSendInvoice(
  supabase: SupabaseClientLike,
  user: { id: string; email?: string | null },
  paymentId: string,
  corsHeaders: Record<string, string>
) {
  const payment = await loadOwnPayment(supabase, user.id, paymentId);

  const customerEmail = user.email || '';
  const customerName = await customerNameFor(supabase, user.id, customerEmail);

  const invoiceData = buildInvoiceData(payment, { name: customerName, email: customerEmail });
  const invoiceNumber = invoiceData.invoiceNumber;
  const siteUrl = Deno.env.get('SITE_URL') || 'https://eatpal.com';
  const emailHtml = renderInvoiceEmailHtml(invoiceData, siteUrl, new Date().getUTCFullYear());

  const { error: emailError } = await supabase.from("email_queue").insert({
    to_email: customerEmail,
    subject: `Your Invoice ${invoiceNumber} from EatPal`,
    html_body: emailHtml,
    text_body: `Your invoice ${invoiceNumber} for $${invoiceData.total.toFixed(2)} ${invoiceData.currency} is attached. Thank you for your payment!`,
    status: "pending",
    priority: 5,
    scheduled_for: new Date().toISOString(),
    metadata: {
      type: "invoice",
      invoice_number: invoiceNumber,
      payment_id: paymentId,
      user_id: user.id,
    },
  });

  if (emailError) {
    console.error("Failed to queue invoice email:", emailError);
    throw new PublicError("Failed to queue invoice email", 500);
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `Invoice ${invoiceNumber} has been sent to ${customerEmail}`,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    }
  );
}

async function handleDownloadStripeInvoice(
  supabase: SupabaseClientLike,
  userId: string,
  stripeInvoiceId: string,
  corsHeaders: Record<string, string>
) {
  // Verify the user owns this invoice
  const { data: payment, error } = await supabase
    .from("payment_history")
    .select("id, stripe_invoice_id")
    .eq("stripe_invoice_id", stripeInvoiceId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error || !payment) {
    if (error) console.error("Failed to verify invoice ownership:", error);
    throw new PublicError("Invoice not found or access denied", 404);
  }

  let invoice: Stripe.Invoice;
  try {
    invoice = await stripe.invoices.retrieve(stripeInvoiceId);
  } catch (stripeError: unknown) {
    console.error("Stripe error fetching invoice:", stripeError);
    throw new PublicError("Failed to fetch invoice from Stripe", 502);
  }

  if (!invoice.invoice_pdf) {
    throw new PublicError("Invoice PDF not available from Stripe", 404);
  }

  return new Response(
    JSON.stringify({
      success: true,
      pdfUrl: invoice.invoice_pdf,
      hostedUrl: invoice.hosted_invoice_url,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    }
  );
}
