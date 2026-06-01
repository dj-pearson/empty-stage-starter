-- Server-side record of Apple (StoreKit) subscriptions, keyed by the stable
-- originalTransactionId so App Store Server Notifications can map a
-- refund/revocation back to the user.
--
-- WHY a dedicated table (not user_subscriptions): user_subscriptions is the
-- Stripe/web record (UNIQUE(user_id), plan_id, stripe_*). The old iOS sync
-- tried to upsert StoreKit fields there with no user_id and against columns
-- that don't exist, so it silently failed and would have clobbered a user's
-- Stripe row. Apple entitlement lives here instead; iOS gating stays
-- client-side (StoreKit currentEntitlements), and this table is the durable
-- record + the lookup the notification handler uses.

CREATE TABLE IF NOT EXISTS public.apple_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_transaction_id TEXT NOT NULL,
  store_transaction_id TEXT,
  product_id TEXT,
  -- active | revoked (refund/chargeback) | expired
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  environment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (original_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_apple_subscriptions_user
  ON public.apple_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_apple_subscriptions_orig_txn
  ON public.apple_subscriptions(original_transaction_id);

ALTER TABLE public.apple_subscriptions ENABLE ROW LEVEL SECURITY;

-- The device (authenticated user) syncs its own row. Refund/revocation writes
-- come from the App Store Server Notifications handler using the service role,
-- which bypasses RLS — so no user-facing DELETE/admin policy is needed.
CREATE POLICY "Users view own apple subscription"
  ON public.apple_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own apple subscription"
  ON public.apple_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own apple subscription"
  ON public.apple_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.apple_subscriptions IS
  'Durable record of StoreKit subscriptions keyed by originalTransactionId. Synced from the device on transaction updates; refunds/revocations applied by the app-store-notifications edge function.';
