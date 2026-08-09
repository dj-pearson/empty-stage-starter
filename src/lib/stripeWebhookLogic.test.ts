import { describe, it, expect } from 'vitest';

/**
 * US-616 / US-519: the pure decision logic behind Stripe webhook idempotency.
 *
 * The helper lives in the Deno edge-function tree
 * (`supabase/functions/_shared/stripe-webhook-logic.ts`) but is deliberately
 * dependency-free, so vitest can exercise it directly. Same cross-tree pattern
 * as src/lib/syncQueue.test.ts: a dynamic import keeps the file out of
 * tsconfig.app.json's `include: ["src"]` while still running in CI.
 *
 * Why this matters: the deployed webhook had no replay protection at all. The
 * hardened implementation existed only in the non-deployed `functions/` tree,
 * so a redelivered event re-ran every handler — including the append-only
 * insert into `subscription_events`.
 */

const load = () => import('../../supabase/functions/_shared/stripe-webhook-logic');

describe('isDuplicateInsertError — a redelivered event id is a no-op', () => {
  it('recognises the Postgres unique-violation code', async () => {
    const { isDuplicateInsertError } = await load();
    expect(isDuplicateInsertError({ code: '23505' })).toBe(true);
  });

  it('recognises the message PostgREST surfaces for a duplicate primary key', async () => {
    const { isDuplicateInsertError } = await load();
    expect(
      isDuplicateInsertError({
        message: 'duplicate key value violates unique constraint "stripe_webhook_events_pkey"',
      }),
    ).toBe(true);
  });

  it('does not swallow an unrelated failure as a duplicate', async () => {
    const { isDuplicateInsertError } = await load();
    // A connection error must fall through to the fail-open path and still be
    // logged — treating it as "already processed" would silently drop the event.
    expect(isDuplicateInsertError({ code: '08006', message: 'connection failure' })).toBe(false);
  });

  it('tolerates null, undefined and non-objects', async () => {
    const { isDuplicateInsertError } = await load();
    expect(isDuplicateInsertError(null)).toBe(false);
    expect(isDuplicateInsertError(undefined)).toBe(false);
    expect(isDuplicateInsertError('boom')).toBe(false);
  });
});

describe('isFreshStripeEvent — a stale event must not overwrite newer state', () => {
  it('accepts any event against a row that has never been touched', async () => {
    const { isFreshStripeEvent } = await load();
    expect(isFreshStripeEvent(1_700_000_000, null)).toBe(true);
    expect(isFreshStripeEvent(null, null)).toBe(true);
  });

  it('rejects an event older than the last one applied', async () => {
    const { isFreshStripeEvent } = await load();
    // The scenario this exists for: a late subscription.updated (created
    // earlier) arriving after subscription.deleted must not reactivate access.
    expect(isFreshStripeEvent(1_700_000_000, 1_700_000_500)).toBe(false);
  });

  it('accepts an event newer than the last one applied', async () => {
    const { isFreshStripeEvent } = await load();
    expect(isFreshStripeEvent(1_700_000_500, 1_700_000_000)).toBe(true);
  });

  it('accepts an event with the same timestamp, so a same-second pair is not dropped', async () => {
    const { isFreshStripeEvent } = await load();
    expect(isFreshStripeEvent(1_700_000_000, 1_700_000_000)).toBe(true);
  });

  it('skips an event carrying no ordering info once the row is guarded', async () => {
    const { isFreshStripeEvent } = await load();
    expect(isFreshStripeEvent(null, 1_700_000_000)).toBe(false);
    expect(isFreshStripeEvent(undefined, 1_700_000_000)).toBe(false);
  });
});
