/**
 * Pure decision logic for Stripe webhook idempotency + ordering (US-519).
 *
 * Stripe redelivers events and does not guarantee ordering, so a late
 * `customer.subscription.updated` (created earlier) can arrive AFTER a
 * `customer.subscription.deleted` (created later) and wrongly reactivate a
 * canceled subscription. We guard by comparing Stripe's `event.created`
 * (unix seconds, monotonic per object) against the newest event we have
 * already applied to that subscription row.
 *
 * Kept dependency-free so it is unit-testable without a live DB.
 */

/**
 * True if `eventCreated` is at least as new as the last event already applied
 * to the row. A row that has never been touched (`lastApplied == null`) always
 * accepts the event. A strictly older event is stale and must be skipped.
 */
export function isFreshStripeEvent(
  eventCreated: number | null | undefined,
  lastApplied: number | null | undefined,
): boolean {
  if (lastApplied == null) return true;
  if (eventCreated == null) return false; // no ordering info on a guarded row → skip
  return eventCreated >= lastApplied;
}

/**
 * True if a Supabase insert error represents a unique-violation (duplicate
 * event id) — i.e. the event was already processed and this delivery is a
 * redelivery to be ignored.
 */
export function isDuplicateInsertError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  const code = String(e.code ?? '');
  const message = String(e.message ?? '');
  return code === '23505' || /duplicate key|unique constraint/i.test(message);
}
