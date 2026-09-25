// Vitest mirror of the Deno tests for manage-payment-methods' ownership and customer-recovery rules.
// Deno twin: supabase/functions/_shared/paymentMethodOwnership.test.ts
import { expect, it } from 'vitest';
import {
  classifyCustomerRetrieve,
  customerRowWrite,
  isStripeResourceMissing,
  paymentMethodBelongsTo,
} from '../../supabase/functions/_shared/paymentMethodOwnership';

const expectEq = (actual: unknown, expected: unknown) => expect(actual).toEqual(expected);

it('a payment method belongs only to the customer it is attached to', () => {
  expectEq(paymentMethodBelongsTo({ customer: 'cus_A' }, 'cus_A'), true);
  expectEq(paymentMethodBelongsTo({ customer: { id: 'cus_A' } }, 'cus_A'), true);
  expectEq(paymentMethodBelongsTo({ customer: 'cus_B' }, 'cus_A'), false);
  expectEq(paymentMethodBelongsTo({ customer: null }, 'cus_A'), false);
  expectEq(paymentMethodBelongsTo(null, 'cus_A'), false);
  expectEq(paymentMethodBelongsTo({ customer: 'cus_A' }, null), false);
});

it('only a missing or deleted customer is recreated', () => {
  expectEq(classifyCustomerRetrieve({ deleted: false }, undefined), 'use');
  expectEq(classifyCustomerRetrieve({ deleted: true }, undefined), 'recreate');
  expectEq(classifyCustomerRetrieve(null, { code: 'resource_missing', statusCode: 404 }), 'recreate');
});

it('a transient Stripe failure is an error, not a missing customer', () => {
  expectEq(classifyCustomerRetrieve(null, { type: 'StripeConnectionError' }), 'fail');
  expectEq(classifyCustomerRetrieve(null, { statusCode: 429, code: 'rate_limit' }), 'fail');
  expectEq(classifyCustomerRetrieve(null, new Error('timeout')), 'fail');
  expectEq(isStripeResourceMissing('resource_missing'), false);
});

it('an existing row keeps its status; only a new row is written inactive', () => {
  const now = '2026-09-25T12:00:00.000Z';
  const update = customerRowWrite(true, 'user-1', 'cus_NEW', now);
  expectEq(update, { kind: 'update', values: { stripe_customer_id: 'cus_NEW', updated_at: now } });
  expectEq('status' in update.values, false);
  expectEq(customerRowWrite(false, 'user-1', 'cus_NEW', now), {
    kind: 'insert',
    values: { user_id: 'user-1', stripe_customer_id: 'cus_NEW', status: 'inactive', updated_at: now },
  });
});
