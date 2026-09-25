-- Revoke the apple_subscriptions rows a client forged before 20260928000012
-- (owner decision "d", 2026-09-25).
--
-- 20260928000012 stops new forged writes but, as its header says, leaves
-- existing rows alone. Until today any signed-in user could upsert their own
-- row with any product_id and expires_at NULL, and effective_plan_id reads
-- "status = 'active' AND (expires_at IS NULL OR expires_at > now())", so such a
-- row is a paid plan with no end date.
--
-- WHAT COUNTS AS SUSPECT: an 'active' row that 20260928000012 would refuse from
-- a client today. That is expires_at NULL, expires_at more than 400 days out,
-- or a product_id outside the six the app sells. Shipped iOS never writes any
-- of those (StoreKit's expirationDate is always set and at most a year away),
-- and neither do app-store-notifications or verify-app-store-transaction,
-- whose rows come from Apple's signed payload. A forged row that copied a real
-- product id and a plausible expiry is indistinguishable here; it runs out on
-- its own expiry date, and closing that needs the iOS release that switches to
-- verify-app-store-transaction (docs/ios-storekit-verification.md).
--
-- WHAT HAPPENS TO THEM: nothing is deleted. Each suspect row is copied, as it
-- was, into apple_subscriptions_quarantine and then set to status 'revoked',
-- which effective_plan_id already treats as no entitlement. A real subscriber
-- caught by mistake is restored by copying the row back, e.g.
--   UPDATE apple_subscriptions a
--      SET status = q.status, expires_at = q.expires_at, updated_at = now()
--     FROM apple_subscriptions_quarantine q
--    WHERE q.id = a.id AND q.id = '<row id>';
-- and Apple's next DID_RENEW notification would re-activate it anyway.
--
-- The work is in a function so the SQL suite can seed rows and run it; the
-- migration calls it once. Re-running it is harmless: a revoked row is no
-- longer 'active', and the quarantine insert skips ids it already holds.
--
-- Backward compatibility: no column, policy or constraint on
-- apple_subscriptions changes. Old iOS builds keep writing through the same
-- policies and the 20260928000012 trigger. The new table is server-only.

CREATE TABLE IF NOT EXISTS public.apple_subscriptions_quarantine (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  original_transaction_id TEXT NOT NULL,
  store_transaction_id TEXT,
  product_id TEXT,
  status TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  environment TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  reason TEXT NOT NULL,
  quarantined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Server-only: RLS on with no policies, and no grants to the API roles.
ALTER TABLE public.apple_subscriptions_quarantine ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apple_subscriptions_quarantine FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.apple_subscriptions_quarantine IS
  'Copies of apple_subscriptions rows revoked by quarantine_suspect_apple_subscriptions() because a client could have forged them (NULL or >400-day expiry, or a product the app does not sell). Kept so a wrongly revoked row can be restored. Server-only.';

CREATE OR REPLACE FUNCTION public.quarantine_suspect_apple_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  WITH suspect AS (
    SELECT a.*,
           CASE
             WHEN a.expires_at IS NULL THEN 'expires_at is null'
             WHEN a.expires_at > now() + interval '400 days' THEN 'expires_at more than 400 days out'
             ELSE 'unknown product_id'
           END AS reason
      FROM apple_subscriptions a
     WHERE a.status = 'active'
       AND (a.expires_at IS NULL
            OR a.expires_at > now() + interval '400 days'
            OR a.product_id IS NULL
            OR a.product_id NOT IN (
              'com.eatpal.app.pro.monthly',
              'com.eatpal.app.pro.yearly',
              'com.eatpal.app.familyplus.monthly',
              'com.eatpal.app.familyplus.yearly',
              'com.eatpal.app.professional.monthly',
              'com.eatpal.app.professional.yearly'))
  ), saved AS (
    INSERT INTO apple_subscriptions_quarantine
      (id, user_id, original_transaction_id, store_transaction_id, product_id,
       status, expires_at, environment, created_at, updated_at, reason)
    SELECT id, user_id, original_transaction_id, store_transaction_id, product_id,
           status, expires_at, environment, created_at, updated_at, reason
      FROM suspect
    ON CONFLICT (id) DO NOTHING
  )
  UPDATE apple_subscriptions a
     SET status = 'revoked', updated_at = now()
    FROM suspect s
   WHERE a.id = s.id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.quarantine_suspect_apple_subscriptions() IS
  'Copies each active apple_subscriptions row a client could have forged (NULL or >400-day expires_at, or a product the app does not sell) into apple_subscriptions_quarantine and marks it revoked. Returns the number revoked. Idempotent. Server-only.';

REVOKE ALL ON FUNCTION public.quarantine_suspect_apple_subscriptions() FROM PUBLIC, anon, authenticated;

DO $run$
DECLARE
  n INTEGER;
BEGIN
  n := public.quarantine_suspect_apple_subscriptions();
  RAISE NOTICE 'quarantine_suspect_apple_subscriptions: % row(s) revoked', n;
END
$run$;
