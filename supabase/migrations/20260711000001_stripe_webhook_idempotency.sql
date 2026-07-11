-- US-519: Stripe webhook idempotency + out-of-order event protection.
--
-- Additive & backward-compatible:
--  * New table stripe_webhook_events records every processed Stripe event.id so
--    a redelivered event is a no-op (unique primary key -> insert-or-skip).
--  * New nullable column user_subscriptions.last_stripe_event_created stores the
--    unix `event.created` of the newest Stripe event applied to the row, so a
--    late (older) event cannot overwrite a newer state (e.g. a stale
--    subscription.updated cannot reactivate after subscription.deleted).
-- Old iOS clients never read either object, so this is safe for shipped builds.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id      TEXT PRIMARY KEY,          -- Stripe event.id (evt_...)
  event_type    TEXT,
  event_created BIGINT,                     -- Stripe event.created (unix seconds)
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service-role only: the webhook runs with the service role (which bypasses
-- RLS). Enabling RLS with NO policies denies all anon/authenticated access.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stripe_webhook_events IS
  'US-519: processed Stripe event ids for webhook idempotency. Service-role only (RLS on, no policies).';

-- Ordering guard column (additive, nullable so existing INSERTs are unaffected).
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS last_stripe_event_created BIGINT;

COMMENT ON COLUMN public.user_subscriptions.last_stripe_event_created IS
  'US-519: unix event.created of the newest Stripe event applied to this row; guards out-of-order updates.';
