/**
 * manage-payment-methods: whose card is this, and is the Stripe customer gone.
 *
 * detach and set-default took a paymentMethodId from the request body and
 * acted on it. stripe.paymentMethods.detach(id) needs nothing but the id and
 * the platform secret key, so any signed-in caller holding another customer's
 * pm_ id could remove that customer's card. Ownership is now read from Stripe
 * (the payment method's own `customer`) and compared with the caller's
 * customer id from user_subscriptions before anything is changed.
 *
 * ensureCustomer treated every failure of customers.retrieve as "the customer
 * is gone", created a new one, and upserted the row with status 'inactive'. A
 * Stripe timeout or 429 therefore replaced a paying parent's customer id and
 * marked the subscription inactive. Only a customer Stripe says is missing or
 * deleted is recreated now; anything else is an error the caller can retry.
 *
 * Pure: no network, no Deno APIs.
 */

/** The subset of a Stripe PaymentMethod this check reads. */
export interface PaymentMethodLike {
  customer: string | { id: string } | null;
}

/** True only when the payment method is attached to exactly this customer. */
export function paymentMethodBelongsTo(pm: PaymentMethodLike | null | undefined, customerId: string | null | undefined): boolean {
  if (!pm || !customerId) return false;
  const owner = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id ?? null;
  return owner !== null && owner === customerId;
}

/** A Stripe error, as far as this module needs to read one. */
interface StripeErrorLike {
  code?: unknown;
  statusCode?: unknown;
  type?: unknown;
}

/** Stripe's answer for an id that does not exist on this account. */
export function isStripeResourceMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as StripeErrorLike;
  return e.code === 'resource_missing' || e.statusCode === 404;
}

export type CustomerCheck = 'use' | 'recreate' | 'fail';

/**
 * What to do after customers.retrieve(existingId).
 *
 * `result` is the retrieved object (Stripe answers a deleted customer with
 * `{ deleted: true }` rather than an error); `error` is what it threw.
 */
export function classifyCustomerRetrieve(result: { deleted?: boolean } | null, error: unknown): CustomerCheck {
  if (error !== undefined && error !== null) {
    return isStripeResourceMissing(error) ? 'recreate' : 'fail';
  }
  if (!result) return 'fail';
  return result.deleted ? 'recreate' : 'use';
}

export type CustomerRowWrite =
  | { kind: 'update'; values: { stripe_customer_id: string; updated_at: string } }
  | { kind: 'insert'; values: { user_id: string; stripe_customer_id: string; status: 'inactive'; updated_at: string } };

/**
 * How to record a newly created Stripe customer.
 *
 * An existing row keeps its status: only the customer id moves. 'inactive'
 * is written only when the row is being created, which is what the column
 * default would have said anyway.
 */
export function customerRowWrite(hasRow: boolean, userId: string, customerId: string, nowIso: string): CustomerRowWrite {
  if (hasRow) {
    return { kind: 'update', values: { stripe_customer_id: customerId, updated_at: nowIso } };
  }
  return {
    kind: 'insert',
    values: { user_id: userId, stripe_customer_id: customerId, status: 'inactive', updated_at: nowIso },
  };
}
