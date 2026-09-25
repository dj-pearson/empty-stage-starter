// Deno tests for manage-payment-methods' ownership and customer-recovery rules.
// Run with: deno test supabase/functions/_shared/paymentMethodOwnership.test.ts
// Vitest mirror: src/lib/paymentMethodOwnershipShared.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classifyCustomerRetrieve,
  customerRowWrite,
  isStripeResourceMissing,
  paymentMethodBelongsTo,
} from './paymentMethodOwnership.ts';

Deno.test('a payment method belongs only to the customer it is attached to', () => {
  assertEquals(paymentMethodBelongsTo({ customer: 'cus_A' }, 'cus_A'), true);
  assertEquals(paymentMethodBelongsTo({ customer: { id: 'cus_A' } }, 'cus_A'), true);
  assertEquals(paymentMethodBelongsTo({ customer: 'cus_B' }, 'cus_A'), false);
  assertEquals(paymentMethodBelongsTo({ customer: null }, 'cus_A'), false);
  assertEquals(paymentMethodBelongsTo(null, 'cus_A'), false);
  assertEquals(paymentMethodBelongsTo({ customer: 'cus_A' }, null), false);
});

Deno.test('only a missing or deleted customer is recreated', () => {
  assertEquals(classifyCustomerRetrieve({ deleted: false }, undefined), 'use');
  assertEquals(classifyCustomerRetrieve({ deleted: true }, undefined), 'recreate');
  assertEquals(classifyCustomerRetrieve(null, { code: 'resource_missing', statusCode: 404 }), 'recreate');
});

Deno.test('a transient Stripe failure is an error, not a missing customer', () => {
  assertEquals(classifyCustomerRetrieve(null, { type: 'StripeConnectionError' }), 'fail');
  assertEquals(classifyCustomerRetrieve(null, { statusCode: 429, code: 'rate_limit' }), 'fail');
  assertEquals(classifyCustomerRetrieve(null, new Error('timeout')), 'fail');
  assertEquals(isStripeResourceMissing('resource_missing'), false);
});

Deno.test('an existing row keeps its status; only a new row is written inactive', () => {
  const now = '2026-09-25T12:00:00.000Z';
  const update = customerRowWrite(true, 'user-1', 'cus_NEW', now);
  assertEquals(update, { kind: 'update', values: { stripe_customer_id: 'cus_NEW', updated_at: now } });
  assertEquals('status' in update.values, false);
  assertEquals(customerRowWrite(false, 'user-1', 'cus_NEW', now), {
    kind: 'insert',
    values: { user_id: 'user-1', stripe_customer_id: 'cus_NEW', status: 'inactive', updated_at: now },
  });
});
