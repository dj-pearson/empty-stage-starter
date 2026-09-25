/**
 * generate-invoice's pure parts: the invoice number, the invoice data, and
 * the two HTML documents built from it.
 *
 * ESCAPING. Both templates interpolated profile.full_name, the payment
 * description and the Stripe ids straight into markup. full_name is whatever
 * the account holder typed, so a name of `<img src=x onerror=...>` was stored
 * once and then rendered into the invoice HTML the web app displays and into
 * the email queued to that address: stored XSS. Every interpolated value now
 * goes through escapeHtml, numbers included, so a later edit that swaps a
 * number for a string cannot reopen it.
 *
 * NUMBERING. There were two schemes. `generate` and `send` used
 * INV-<year>-<first 8 hex of the payment id, upper-cased>; `list` used
 * INV-<year>-<position in the result set, zero-padded>. The positional one
 * was never stable: it counted rows in the current query, so every new
 * payment shifted the number of every older one, and it never matched the
 * number printed on the emailed invoice. The id-based number is the one that
 * was actually issued (it is in every queued invoice email's subject and
 * metadata.invoice_number), so it is the one kept; `list` now answers with
 * it too. No issued number changes. The year is read in UTC: the edge
 * runtime runs in UTC, so getUTCFullYear gives the same year the old
 * getFullYear call did there, and it no longer depends on the host's zone.
 *
 * Pure: no network, no Deno APIs. The site URL is passed in.
 */

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  customer: {
    name: string;
    email: string;
    address?: string;
  };
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  status: string;
  paymentId: string;
  stripeInvoiceId?: string;
}

/** A payment_history row joined (left, not inner) to its subscription's plan. */
export interface PaymentForInvoice {
  id: string;
  amount: number | string;
  currency: string | null;
  status: string;
  description: string | null;
  stripe_invoice_id: string | null;
  created_at: string;
  subscription?: { plan?: { name?: string | null } | null } | null;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for an HTML text node or a quoted attribute. */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** The one invoice number: INV-<UTC year>-<first 8 of the payment id, upper>. */
export function invoiceNumberFor(paymentId: string, createdAt: string): string {
  const year = new Date(createdAt).getUTCFullYear();
  return `INV-${year}-${paymentId.slice(0, 8).toUpperCase()}`;
}

/** The line-item description: the payment's own, else the plan, else a default. */
export function paymentDescription(payment: PaymentForInvoice, fallback: string): string {
  return payment.description || payment.subscription?.plan?.name || fallback;
}

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

export function buildInvoiceData(
  payment: PaymentForInvoice,
  customer: { name: string; email: string },
): InvoiceData {
  const amount = Number(payment.amount);
  const date = longDate(payment.created_at);
  return {
    invoiceNumber: invoiceNumberFor(payment.id, payment.created_at),
    date,
    dueDate: date,
    customer,
    items: [{
      description: paymentDescription(payment, 'Subscription'),
      quantity: 1,
      unitPrice: amount,
      total: amount,
    }],
    subtotal: amount,
    tax: 0,
    total: amount,
    currency: (payment.currency || 'usd').toUpperCase(),
    status: payment.status === 'succeeded' ? 'PAID' : payment.status.toUpperCase(),
    paymentId: payment.id,
    stripeInvoiceId: payment.stripe_invoice_id ?? undefined,
  };
}

/** The status badge class, from a fixed set so it never carries caller text. */
export function statusClass(status: string): 'paid' | 'pending' | 'failed' | 'other' {
  const s = status.toLowerCase();
  return s === 'paid' || s === 'pending' || s === 'failed' ? s : 'other';
}

function currencyFormatter(currency: string): (amount: number) => string {
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toLowerCase() });
  } catch {
    // An unknown ISO code throws a RangeError; show the number and the code
    // rather than failing the whole invoice.
    return (amount: number) => `${amount.toFixed(2)} ${currency}`;
  }
  return (amount: number) => fmt.format(amount);
}

export function renderInvoiceHtml(invoice: InvoiceData): string {
  const money = currencyFormatter(invoice.currency);
  const e = escapeHtml;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${e(invoice.invoiceNumber)}</title>
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
        <p class="invoice-number">${e(invoice.invoiceNumber)}</p>
        <span class="status ${statusClass(invoice.status)}">${e(invoice.status)}</span>
      </div>
    </div>

    <div class="details">
      <div class="detail-section">
        <h3>Bill To</h3>
        <p><strong>${e(invoice.customer.name)}</strong></p>
        <p>${e(invoice.customer.email)}</p>
        ${invoice.customer.address ? `<p>${e(invoice.customer.address)}</p>` : ''}
      </div>
      <div class="detail-section" style="text-align: right;">
        <h3>Invoice Details</h3>
        <p><strong>Date:</strong> ${e(invoice.date)}</p>
        <p><strong>Payment ID:</strong> ${e(invoice.paymentId.slice(0, 8))}...</p>
        ${invoice.stripeInvoiceId ? `<p><strong>Reference:</strong> ${e(invoice.stripeInvoiceId.slice(0, 12))}...</p>` : ''}
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
            <td>${e(item.description)}</td>
            <td class="amount">${e(item.quantity)}</td>
            <td class="amount">${e(money(item.unitPrice))}</td>
            <td class="amount">${e(money(item.total))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>${e(money(invoice.subtotal))}</span>
      </div>
      ${invoice.tax > 0 ? `
        <div class="totals-row">
          <span>Tax</span>
          <span>${e(money(invoice.tax))}</span>
        </div>
      ` : ''}
      <div class="totals-row total">
        <span>Total</span>
        <span>${e(money(invoice.total))}</span>
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

export function renderInvoiceEmailHtml(invoice: InvoiceData, siteUrl: string, year: number): string {
  const money = currencyFormatter(invoice.currency);
  const e = escapeHtml;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${e(invoice.invoiceNumber)}</title>
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
              <h2 style="margin: 0 0 10px; color: #1a1a1a; font-size: 24px;">Hi ${e(invoice.customer.name)},</h2>
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
                    <p style="margin: 5px 0 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">${e(invoice.invoiceNumber)}</p>
                  </td>
                  <td style="padding-bottom: 15px; border-bottom: 1px solid #e2e8f0; text-align: right;">
                    <span style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Date</span>
                    <p style="margin: 5px 0 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">${e(invoice.date)}</p>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top: 15px;">
                    <span style="color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Status</span>
                    <p style="margin: 5px 0 0;">
                      <span style="display: inline-block; padding: 4px 12px; background-color: #dcfce7; color: #166534; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                        ${e(invoice.status)}
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
              <td style="padding: 16px 12px; border-bottom: 1px solid #e2e8f0; color: #1a1a1a;">${e(item.description)}</td>
              <td style="padding: 16px 12px; border-bottom: 1px solid #e2e8f0; color: #1a1a1a; text-align: right;">${e(money(item.total))}</td>
            </tr>
          `).join('')}
          <tr>
            <td style="padding: 16px 12px; font-weight: 700; font-size: 18px; color: #1a1a1a;">Total</td>
            <td style="padding: 16px 12px; font-weight: 700; font-size: 18px; color: #4f46e5; text-align: right;">${e(money(invoice.total))}</td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align: center; padding: 30px 0;">
              <p style="margin: 0 0 20px; color: #666; font-size: 14px;">
                You can view and download your invoice from your dashboard.
              </p>
              <a href="${e(siteUrl)}/dashboard/billing"
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
          &copy; ${e(year)} EatPal. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
