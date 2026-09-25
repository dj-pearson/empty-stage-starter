// Vitest mirror of the Deno tests for generate-invoice's numbering, escaping and rendering.
// Deno twin: supabase/functions/_shared/invoice.test.ts
import { expect, it } from 'vitest';
import {
  buildInvoiceData,
  escapeHtml,
  invoiceNumberFor,
  renderInvoiceEmailHtml,
  renderInvoiceHtml,
  statusClass,
  type PaymentForInvoice,
} from '../../supabase/functions/_shared/invoice';

const expectEq = (actual: unknown, expected: unknown) => expect(actual).toEqual(expected);
const expectTrue = (value: boolean, message?: string) => expect(value, message).toBe(true);

const PAYMENT: PaymentForInvoice = {
  id: 'abcdef12-3456-7890-abcd-ef1234567890',
  amount: 14.99,
  currency: 'usd',
  status: 'succeeded',
  description: null,
  stripe_invoice_id: 'in_XXXXXXXXXXXXXXXX',
  created_at: '2026-03-04T10:00:00Z',
  subscription: null,
};

const XSS = `<img src=x onerror="alert('x')">&`;

it('escapeHtml escapes the five HTML metacharacters', () => {
  expectEq(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  expectEq(escapeHtml(null), '');
  expectEq(escapeHtml(3), '3');
});

it('the invoice number is the id-based one already issued', () => {
  expectEq(invoiceNumberFor(PAYMENT.id, PAYMENT.created_at), 'INV-2026-ABCDEF12');
  // Year in UTC: a payment at 00:30 UTC on Jan 1 is that year everywhere.
  expectEq(invoiceNumberFor(PAYMENT.id, '2027-01-01T00:30:00Z'), 'INV-2027-ABCDEF12');
});

it('a payment with no subscription still builds an invoice', () => {
  const data = buildInvoiceData(PAYMENT, { name: 'Pat', email: 'pat@example.com' });
  expectEq(data.items[0].description, 'Subscription');
  expectEq(data.status, 'PAID');
  expectEq(data.total, 14.99);
});

it('no caller-controlled value reaches either document unescaped', () => {
  const data = buildInvoiceData(
    { ...PAYMENT, description: XSS, stripe_invoice_id: XSS, status: XSS },
    { name: XSS, email: XSS },
  );
  for (const html of [renderInvoiceHtml(data), renderInvoiceEmailHtml(data, 'https://tryeatpal.com', 2026)]) {
    expectTrue(!html.includes('<img'), 'raw tag reached the HTML');
    expectTrue(!html.includes(`onerror="`), 'raw attribute reached the HTML');
    expectTrue(html.includes('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;'));
  }
});

it('the status class comes from a fixed set', () => {
  expectEq(statusClass('PAID'), 'paid');
  expectEq(statusClass('" onmouseover="x'), 'other');
});
