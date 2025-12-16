import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { getCorsHeaders, noCacheHeaders } from "../common/headers.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface InvoiceData {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  customer: {
    name: string;
    email: string;
    address?: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  status: string;
  paymentId: string;
  stripeInvoiceId?: string;
}

/**
 * Generate Invoice Edge Function
 *
 * Actions:
 * - generate: Generate a PDF invoice from payment history
 * - send: Generate and send invoice via email
 * - list: List all invoices for the user
 * - download-stripe: Get Stripe-hosted invoice PDF URL
 */
serve(async (req) => {
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

    const { action, paymentId, invoiceId } = await req.json();

    console.log(`Invoice action for user ${user.id}: ${action}`);

    switch (action) {
      case "list": {
        return await handleListInvoices(supabase, user.id, corsHeaders);
      }

      case "generate": {
        if (!paymentId) {
          throw new Error("Missing paymentId");
        }
        return await handleGenerateInvoice(supabase, user.id, paymentId, corsHeaders);
      }

      case "send": {
        if (!paymentId) {
          throw new Error("Missing paymentId");
        }
        return await handleSendInvoice(supabase, user, paymentId, corsHeaders);
      }

      case "download-stripe": {
        if (!invoiceId) {
          throw new Error("Missing invoiceId (Stripe invoice ID)");
        }
        return await handleDownloadStripeInvoice(supabase, user.id, invoiceId, corsHeaders);
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("Invoice generation error:", error);
    const corsHeaders = getCorsHeaders(req);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function handleListInvoices(supabase: any, userId: string, corsHeaders: any) {
  // Get all payments for the user
  const { data: payments, error } = await supabase
    .from("payment_history")
    .select(`
      id,
      amount,
      currency,
      status,
      description,
      stripe_invoice_id,
      stripe_payment_intent_id,
      created_at,
      subscription:user_subscriptions!inner(
        plan:subscription_plans(name)
      )
    `)
    .eq("user_id", userId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch payments: ${error.message}`);
  }

  // Transform to invoice format
  const invoices = (payments || []).map((payment: any, index: number) => ({
    id: payment.id,
    invoiceNumber: `INV-${new Date(payment.created_at).getFullYear()}-${String(payments.length - index).padStart(4, '0')}`,
    date: payment.created_at,
    amount: payment.amount,
    currency: payment.currency || 'usd',
    status: payment.status,
    description: payment.description || payment.subscription?.plan?.name || 'Subscription payment',
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

async function handleGenerateInvoice(
  supabase: any,
  userId: string,
  paymentId: string,
  corsHeaders: any
) {
  // Get payment details
  const { data: payment, error: paymentError } = await supabase
    .from("payment_history")
    .select(`
      *,
      subscription:user_subscriptions!inner(
        stripe_customer_id,
        plan:subscription_plans(name, price_monthly, price_yearly)
      )
    `)
    .eq("id", paymentId)
    .eq("user_id", userId)
    .single();

  if (paymentError || !payment) {
    throw new Error("Payment not found or access denied");
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .single();

  // Get user email from auth
  const { data: authUser } = await supabase.auth.admin.getUserById(userId);

  const customerName = profile?.full_name || authUser?.user?.email?.split('@')[0] || 'Customer';
  const customerEmail = authUser?.user?.email || '';

  // Build invoice data
  const invoiceData: InvoiceData = {
    invoiceNumber: `INV-${new Date(payment.created_at).getFullYear()}-${payment.id.slice(0, 8).toUpperCase()}`,
    date: new Date(payment.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    dueDate: new Date(payment.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    customer: {
      name: customerName,
      email: customerEmail,
    },
    items: [{
      description: payment.description || payment.subscription?.plan?.name || 'Subscription',
      quantity: 1,
      unitPrice: payment.amount,
      total: payment.amount,
    }],
    subtotal: payment.amount,
    tax: 0,
    total: payment.amount,
    currency: (payment.currency || 'usd').toUpperCase(),
    status: payment.status === 'succeeded' ? 'PAID' : payment.status.toUpperCase(),
    paymentId: payment.id,
    stripeInvoiceId: payment.stripe_invoice_id,
  };

  // Generate HTML invoice
  const invoiceHtml = generateInvoiceHtml(invoiceData);

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
  supabase: any,
  user: any,
  paymentId: string,
  corsHeaders: any
) {
  // Generate the invoice first
  const { data: payment, error: paymentError } = await supabase
    .from("payment_history")
    .select(`
      *,
      subscription:user_subscriptions!inner(
        stripe_customer_id,
        plan:subscription_plans(name)
      )
    `)
    .eq("id", paymentId)
    .eq("user_id", user.id)
    .single();

  if (paymentError || !payment) {
    throw new Error("Payment not found or access denied");
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", user.id)
    .single();

  const customerName = profile?.full_name || user.email?.split('@')[0] || 'Customer';
  const customerEmail = user.email || '';

  const invoiceNumber = `INV-${new Date(payment.created_at).getFullYear()}-${payment.id.slice(0, 8).toUpperCase()}`;

  // Build invoice data for email
  const invoiceData: InvoiceData = {
    invoiceNumber,
    date: new Date(payment.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    dueDate: new Date(payment.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    customer: {
      name: customerName,
      email: customerEmail,
    },
    items: [{
      description: payment.description || payment.subscription?.plan?.name || 'Subscription',
      quantity: 1,
      unitPrice: payment.amount,
      total: payment.amount,
    }],
    subtotal: payment.amount,
    tax: 0,
    total: payment.amount,
    currency: (payment.currency || 'usd').toUpperCase(),
    status: payment.status === 'succeeded' ? 'PAID' : payment.status.toUpperCase(),
    paymentId: payment.id,
    stripeInvoiceId: payment.stripe_invoice_id,
  };

  // Generate email HTML
  const emailHtml = generateInvoiceEmailHtml(invoiceData);

  // Queue the email
  const { error: emailError } = await supabase.from("email_queue").insert({
    to_email: customerEmail,
    subject: `Your Invoice ${invoiceNumber} from EatPal`,
    html_body: emailHtml,
    text_body: `Your invoice ${invoiceNumber} for $${payment.amount.toFixed(2)} ${invoiceData.currency} is attached. Thank you for your payment!`,
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
    throw new Error("Failed to queue invoice email");
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
  supabase: any,
  userId: string,
  stripeInvoiceId: string,
  corsHeaders: any
) {
  // Verify the user owns this invoice
  const { data: payment, error } = await supabase
    .from("payment_history")
    .select("id, stripe_invoice_id")
    .eq("stripe_invoice_id", stripeInvoiceId)
    .eq("user_id", userId)
    .single();

  if (error || !payment) {
    throw new Error("Invoice not found or access denied");
  }

  try {
    // Get the invoice from Stripe
    const invoice = await stripe.invoices.retrieve(stripeInvoiceId);

    if (!invoice.invoice_pdf) {
      throw new Error("Invoice PDF not available from Stripe");
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
  } catch (stripeError: any) {
    console.error("Stripe error fetching invoice:", stripeError);
    throw new Error(`Failed to fetch invoice from Stripe: ${stripeError.message}`);
  }
}

function generateInvoiceHtml(invoice: InvoiceData): string {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: invoice.currency.toLowerCase(),
    }).format(amount);
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; line-height: 1.5; }
    .invoice { max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #4f46e5; padding-bottom: 20px; }
    .logo { font-size: 28px; font-weight: 700; color: #4f46e5; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 32px; color: #4f46e5; margin-bottom: 8px; }
    .invoice-number { color: #666; font-size: 14px; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .status.paid { background: #dcfce7; color: #166534; }
    .status.pending { background: #fef3c7; color: #92400e; }
    .status.failed { background: #fee2e2; color: #dc2626; }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
    .detail-section h3 { font-size: 12px; text-transform: uppercase; color: #666; margin-bottom: 8px; letter-spacing: 0.5px; }
    .detail-section p { margin-bottom: 4px; }
    .items { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .items th { text-align: left; padding: 12px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 12px; text-transform: uppercase; color: #666; }
    .items td { padding: 16px 12px; border-bottom: 1px solid #e2e8f0; }
    .items .amount { text-align: right; }
    .totals { margin-left: auto; width: 280px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; }
    .totals-row.total { border-top: 2px solid #1a1a1a; margin-top: 8px; padding-top: 16px; font-weight: 700; font-size: 18px; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #666; font-size: 14px; }
    .footer a { color: #4f46e5; text-decoration: none; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .invoice { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="logo">EatPal</div>
      <div class="invoice-title">
        <h1>INVOICE</h1>
        <p class="invoice-number">${invoice.invoiceNumber}</p>
        <span class="status ${invoice.status.toLowerCase()}">${invoice.status}</span>
      </div>
    </div>

    <div class="details">
      <div class="detail-section">
        <h3>Bill To</h3>
        <p><strong>${invoice.customer.name}</strong></p>
        <p>${invoice.customer.email}</p>
        ${invoice.customer.address ? `<p>${invoice.customer.address}</p>` : ''}
      </div>
      <div class="detail-section" style="text-align: right;">
        <h3>Invoice Details</h3>
        <p><strong>Date:</strong> ${invoice.date}</p>
        <p><strong>Payment ID:</strong> ${invoice.paymentId.slice(0, 8)}...</p>
        ${invoice.stripeInvoiceId ? `<p><strong>Reference:</strong> ${invoice.stripeInvoiceId.slice(0, 12)}...</p>` : ''}
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>Description</th>
          <th class="amount">Qty</th>
          <th class="amount">Unit Price</th>
          <th class="amount">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${invoice.items.map(item => `
          <tr>
            <td>${item.description}</td>
            <td class="amount">${item.quantity}</td>
            <td class="amount">${formatCurrency(item.unitPrice)}</td>
            <td class="amount">${formatCurrency(item.total)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>${formatCurrency(invoice.subtotal)}</span>
      </div>
      ${invoice.tax > 0 ? `
        <div class="totals-row">
          <span>Tax</span>
          <span>${formatCurrency(invoice.tax)}</span>
        </div>
      ` : ''}
      <div class="totals-row total">
        <span>Total</span>
        <span>${formatCurrency(invoice.total)}</span>
      </div>
    </div>

    <div class="footer">
      <p>Thank you for your business!</p>
      <p>Questions? Contact us at <a href="mailto:support@eatpal.com">support@eatpal.com</a></p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function generateInvoiceEmailHtml(invoice: InvoiceData): string {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: invoice.currency.toLowerCase(),
    }).format(amount);
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoiceNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">EatPal</h1>
        <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">Invoice Receipt</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 30px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <h2 style="margin: 0 0 10px; color: #1a1a1a; font-size: 24px;">Hi ${invoice.customer.name},</h2>
              <p style="margin: 0 0 30px; color: #666; font-size: 16px; line-height: 1.5;">
                Thank you for your payment! Here's a summary of your invoice.
              </p>
            </td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 8px; margin-bottom: 30px;">
          <tr>
            <td style="padding: 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom: 15px; border-bottom: 1px solid #e2e8f0;">
                    <span style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Invoice Number</span>
                    <p style="margin: 5px 0 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">${invoice.invoiceNumber}</p>
                  </td>
                  <td style="padding-bottom: 15px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                    <span style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Date</span>
                    <p style="margin: 5px 0 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">${invoice.date}</p>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top: 15px;">
                    <span style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Status</span>
                    <p style="margin: 5px 0 0;">
                      <span style="display: inline-block; padding: 4px 12px; background-color: #dcfce7; color: #166534; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                        ${invoice.status}
                      </span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
          <tr style="background-color: #f8fafc;">
            <td style="padding: 12px; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0;">Description</td>
            <td style="padding: 12px; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; text-align: right;">Amount</td>
          </tr>
          ${invoice.items.map(item => `
            <tr>
              <td style="padding: 16px 12px; border-bottom: 1px solid #e2e8f0; color: #1a1a1a;">${item.description}</td>
              <td style="padding: 16px 12px; border-bottom: 1px solid #e2e8f0; color: #1a1a1a; text-align: right;">${formatCurrency(item.total)}</td>
            </tr>
          `).join('')}
          <tr>
            <td style="padding: 16px 12px; font-weight: 700; font-size: 18px; color: #1a1a1a;">Total</td>
            <td style="padding: 16px 12px; font-weight: 700; font-size: 18px; color: #4f46e5; text-align: right;">${formatCurrency(invoice.total)}</td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align: center; padding: 30px 0;">
              <p style="margin: 0 0 20px; color: #666; font-size: 14px;">
                You can view and download your invoice from your dashboard.
              </p>
              <a href="${Deno.env.get('SITE_URL') || 'https://eatpal.com'}/dashboard/billing"
                 style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                View in Dashboard
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding: 30px; background-color: #f8fafc; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0 0 10px; color: #666; font-size: 14px;">
          Questions? Contact us at <a href="mailto:support@eatpal.com" style="color: #4f46e5; text-decoration: none;">support@eatpal.com</a>
        </p>
        <p style="margin: 0; color: #999; font-size: 12px;">
          &copy; ${new Date().getFullYear()} EatPal. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
