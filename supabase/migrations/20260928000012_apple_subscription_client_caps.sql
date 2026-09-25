-- Stopgap: cap what a client may write to apple_subscriptions (owner decision
-- "a", 2026-09-25).
--
-- THE HOLE. 20260601000002 lets any signed-in user INSERT and UPDATE their own
-- apple_subscriptions row, because shipped iOS builds sync StoreKit there
-- directly (StoreKitService.swift syncSubscriptionToSupabase). Nothing checks
-- what they write. A row with product com.eatpal.app.professional.yearly,
-- status 'active' and expires_at NULL is accepted, and effective_plan_id
-- (20260918000007) reads "expires_at IS NULL OR expires_at > now()" -- so that
-- row is the Professional plan, forever, for the price of one PostgREST call.
--
-- THE REAL FIX is server-side verification: verify-app-store-transaction takes
-- the device's Apple-signed Transaction.jwsRepresentation and writes the row
-- with the service role. Old builds cannot call it, so their direct writes stay
-- allowed until app_config.min_ios_build passes the release that switches over;
-- a follow-up migration then drops the two client write policies. See
-- docs/ios-storekit-verification.md.
--
-- UNTIL THEN, this trigger refuses, for anon and authenticated only:
--   1. expires_at NULL, or more than 400 days out. Every product is an
--      auto-renewable subscription whose StoreKit expirationDate is at most a
--      year away; 400 leaves room for a leap year and clock skew. iOS always
--      sends expires_at (transaction.expirationDate is never nil for these).
--   2. a product_id the app does not sell. The six ids are SubscriptionProduct
--      in StoreKitService.swift and KNOWN_APP_STORE_PRODUCT_IDS in
--      supabase/functions/_shared/appStoreTransaction.ts; add a new product to
--      all three. (com.eatpal.app.basic.* and .premium.* were retired before
--      this table existed, and map to no plan anyway.)
--   3. an UPDATE that turns a 'revoked', 'expired' or 'refunded' row back to
--      'active'. Only the server (app-store-notifications on SUBSCRIBED,
--      DID_RENEW, RESUBSCRIBE or OFFER_REDEEMED, or verify-app-store-transaction)
--      may re-activate.
--   4. an UPDATE that changes user_id or original_transaction_id.
--
-- WHAT SHIPPED iOS SENDS, checked against each rule: {user_id (its own),
-- original_transaction_id, store_transaction_id, product_id (one of the six),
-- status ('active', or 'revoked' when revocationDate is set), expires_at
-- (expirationDate, ISO-8601)} via upsert onConflict original_transaction_id.
-- A new purchase, a renewal (same original id, later expiry) and a refund
-- marked on the device all pass. The one legitimate write refused is the device
-- re-marking 'active' a row the server already marked 'expired' -- a lapsed
-- subscriber who resubscribes in the same group keeps the original id. That
-- upsert fails into Sentry as storekit_subscription_sync; the RESUBSCRIBE /
-- DID_RENEW notification re-activates the row server-side, and iOS gates its
-- own features on StoreKit, not on this table.
--
-- NOT DONE HERE: rows written before this migration are not touched. A forged
-- row already in the table keeps granting until someone looks, e.g.
--   SELECT * FROM apple_subscriptions
--    WHERE expires_at IS NULL OR expires_at > now() + interval '400 days'
--       OR product_id NOT IN (<the six ids>);
--
-- service_role, the table owner and SECURITY DEFINER code are unaffected
-- (current_user is not a client role), so both edge functions and the SQL
-- suites that seed rows as the owner behave as before.
--
-- Additive: no column, policy or constraint changes.

CREATE OR REPLACE FUNCTION public.guard_apple_subscription_client_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- SECURITY INVOKER on purpose: current_user is the role the statement runs
  -- as. PostgREST sets it to anon or authenticated for an app request.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NEW.expires_at IS NULL THEN
    RAISE EXCEPTION 'apple_subscriptions: expires_at is required from the client'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.expires_at > now() + interval '400 days' THEN
    RAISE EXCEPTION 'apple_subscriptions: expires_at is more than 400 days away'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.product_id IS NULL OR NEW.product_id NOT IN (
    'com.eatpal.app.pro.monthly',
    'com.eatpal.app.pro.yearly',
    'com.eatpal.app.familyplus.monthly',
    'com.eatpal.app.familyplus.yearly',
    'com.eatpal.app.professional.monthly',
    'com.eatpal.app.professional.yearly'
  ) THEN
    RAISE EXCEPTION 'apple_subscriptions: unknown App Store product'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'apple_subscriptions: user_id cannot be changed by the client'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.original_transaction_id IS DISTINCT FROM OLD.original_transaction_id THEN
      RAISE EXCEPTION 'apple_subscriptions: original_transaction_id cannot be changed by the client'
        USING ERRCODE = '42501';
    END IF;
    IF OLD.status IN ('revoked', 'expired', 'refunded') AND NEW.status = 'active' THEN
      RAISE EXCEPTION 'apple_subscriptions: only the server can re-activate a subscription marked %', OLD.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_apple_subscription_client_write() IS
  'Stopgap for direct iOS writes to apple_subscriptions: from anon/authenticated, refuses a NULL or >400-day expires_at, an unknown product_id, re-activating a revoked/expired/refunded row, and changing user_id or original_transaction_id. Server writers (service_role) are unaffected. Retire with the client write policies once app_config.min_ios_build passes the verify-app-store-transaction release.';

REVOKE ALL ON FUNCTION public.guard_apple_subscription_client_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_apple_subscription_client_write ON public.apple_subscriptions;
CREATE TRIGGER guard_apple_subscription_client_write
  BEFORE INSERT OR UPDATE ON public.apple_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_apple_subscription_client_write();
