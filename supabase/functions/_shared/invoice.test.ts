// Deno tests for generate-invoice's numbering, escaping and rendering.
// Run with: deno test supabase/functions/_shared/invoice.test.ts
// Vitest mirror: src/lib/invoiceShared.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildInvoiceData,
  escapeHtml,
  invoiceNumberFor,
  renderInvoiceEmailHtml,
  renderInvoiceHtml,
  statusClass,
  type PaymentForInvoice,
} from './invoice.ts';

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

Deno.test('escapeHtml escapes the five HTML metacharacters', () => {
  assertEquals(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assertEquals(escapeHtml(null), '');
  assertEquals(escapeHtml(3), '3');
});

Deno.test('the invoice number is the id-based one already issued', () => {
  assertEquals(invoiceNumberFor(PAYMENT.id, PAYMENT.created_at), 'INV-2026-ABCDEF12');
  // Year in UTC: a payment at 00:30 UTC on Jan 1 is that year everywhere.
  assertEquals(invoiceNumberFor(PAYMENT.id, '2027-01-01T00:30:00Z'), 'INV-2027-ABCDEF12');
});

Deno.test('a payment with no subscription still builds an invoice', () => {
  const data = buildInvoiceData(PAYMENT, { name: 'Pat', email: 'pat@example.com' });
  assertEquals(data.items[0].description, 'Subscription');
  assertEquals(data.status, 'PAID');
  assertEquals(data.total, 14.99);
});

Deno.test('no caller-controlled value reaches either document unescaped', () => {
  const data = buildInvoiceData(
    { ...PAYMENT, description: XSS, stripe_invoice_id: XSS, status: XSS },
    { name: XSS, email: XSS },
  );
  for (const html of [renderInvoiceHtml(data), renderInvoiceEmailHtml(data, 'https://tryeatpal.com', 2026)]) {
    assert(!html.includes('<img'), 'raw tag reached the HTML');
    assert(!html.includes(`onerror="`), 'raw attribute reached the HTML');
    assert(html.includes('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;'));
  }
});

Deno.test('the status class comes from a fixed set', () => {
  assertEquals(statusClass('PAID'), 'paid');
  assertEquals(statusClass('" onmouseover="x'), 'other');
});
