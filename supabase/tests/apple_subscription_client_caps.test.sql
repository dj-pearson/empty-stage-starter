-- 20260928000012_apple_subscription_client_caps: a client can no longer write
-- itself a forever App Store entitlement, while the rows shipped iOS writes
-- still go through, and the server (service_role) is unrestricted.
--
-- Asserts on what a statement does as the role the app uses, and on what
-- effective_plan_id then answers, never on the migration text.
--
-- HOW TO RUN: `bash scripts/dev/local-sql-suite.sh`. Never against production.
-- Everything happens in one transaction that is rolled back.

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

BEGIN;

-- Supabase grants table privileges on public to the API roles by default; the
-- local shim does not. Stand that in so the statements reach RLS and the
-- trigger, which is what is under test. Rolled back with everything else.
GRANT SELECT, INSERT, UPDATE ON public.apple_subscriptions TO anon, authenticated, service_role;

-- 1. The trigger function is not callable by a client, and search_path is pinned.
DO $a1$
DECLARE
  fn  TEXT := 'public.guard_apple_subscription_client_write()';
  cfg TEXT[];
BEGIN
  ASSERT NOT has_function_privilege('anon', fn, 'EXECUTE'), 'anon can execute the guard';
  ASSERT NOT has_function_privilege('authenticated', fn, 'EXECUTE'), 'authenticated can execute the guard';
  SELECT proconfig INTO cfg FROM pg_proc WHERE oid = fn::regprocedure;
  ASSERT cfg IS NOT NULL AND 'search_path=public' = ANY (cfg), format('proconfig %s', cfg);
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.apple_subscriptions'::regclass
       AND tgname = 'guard_apple_subscription_client_write'
       AND NOT tgisinternal
  ), 'trigger missing on apple_subscriptions';
  RAISE NOTICE 'assertion 1 ok (guard not callable; search_path pinned; trigger present)';
END $a1$;

CREATE TEMP TABLE asc_ids (k text PRIMARY KEY, v uuid);
GRANT SELECT ON asc_ids TO anon, authenticated, service_role;

DO $fx$
DECLARE
  forger UUID := gen_random_uuid();
  buyer  UUID := gen_random_uuid();
  server UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (forger, 'asc-forger@example.test'),
    (buyer,  'asc-buyer@example.test'),
    (server, 'asc-server@example.test');
  INSERT INTO asc_ids VALUES ('forger', forger), ('buyer', buyer), ('server', server);
END $fx$;

-- Runs `stmt` as the signed-in user and returns the error text, or NULL.
CREATE OR REPLACE FUNCTION pg_temp.as_user(uid UUID, stmt TEXT) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  msg TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    msg := SQLERRM;
  END;
  RESET ROLE;
  RETURN msg;
END;
$$;

-- 2. The forged forever row is refused, in every spelling of "forever".
DO $a2$
DECLARE
  forger UUID := (SELECT v FROM asc_ids WHERE k = 'forger');
  msg    TEXT;
BEGIN
  msg := pg_temp.as_user(forger, format(
    $s$INSERT INTO public.apple_subscriptions (user_id, original_transaction_id, product_id, status, expires_at)
       VALUES (%L, 'asc-forged-1', 'com.eatpal.app.professional.yearly', 'active', NULL)$s$, forger));
  ASSERT msg LIKE '%expires_at is required%', format('NULL expiry: %s', msg);

  msg := pg_temp.as_user(forger, format(
    $s$INSERT INTO public.apple_subscriptions (user_id, original_transaction_id, product_id, status, expires_at)
       VALUES (%L, 'asc-forged-2', 'com.eatpal.app.professional.yearly', 'active', now() + interval '10 years')$s$, forger));
  ASSERT msg LIKE '%more than 400 days%', format('ten-year expiry: %s', msg);

  msg := pg_temp.as_user(forger, format(
    $s$INSERT INTO public.apple_subscriptions (user_id, original_transaction_id, product_id, status, expires_at)
       VALUES (%L, 'asc-forged-3', 'com.eatpal.app.professional.lifetime', 'active', now() + interval '30 days')$s$, forger));
  ASSERT msg LIKE '%unknown App Store product%', format('unknown product: %s', msg);

  msg := pg_temp.as_user(forger, format(
    $s$INSERT INTO public.apple_subscriptions (user_id, original_transaction_id, product_id, status, expires_at)
       VALUES (%L, 'asc-forged-4', NULL, 'active', now() + interval '30 days')$s$, forger));
  ASSERT msg LIKE '%unknown App Store product%', format('NULL product: %s', msg);

  ASSERT NOT EXISTS (SELECT 1 FROM public.apple_subscriptions WHERE user_id = forger), 'a forged row landed';
  ASSERT public.effective_plan_id(forger) IS NULL, 'the forger resolves to a paid plan';

  -- The same trick through an UPDATE of a row the forger legitimately owns.
  msg := pg_temp.as_user(forger, format(
    $s$INSERT INTO public.apple_subscriptions (user_id, original_transaction_id, product_id, status, expires_at)
       VALUES (%L, 'asc-forger-real', 'com.eatpal.app.pro.monthly', 'active', now() + interval '30 days')$s$, forger));
  ASSERT msg IS NULL, format('forger''s own monthly row: %s', msg);
  msg := pg_temp.as_user(forger,
    $s$UPDATE public.apple_subscriptions SET expires_at = NULL, product_id = 'com.eatpal.app.professional.yearly'
        WHERE original_transaction_id = 'asc-forger-real'$s$);
  ASSERT msg LIKE '%expires_at is required%', format('UPDATE to forever: %s', msg);
  msg := pg_temp.as_user(forger,
    $s$UPDATE public.apple_subscriptions SET expires_at = now() + interval '5 years'
        WHERE original_transaction_id = 'asc-forger-real'$s$);
  ASSERT msg LIKE '%more than 400 days%', format('UPDATE to five years: %s', msg);

  RAISE NOTICE 'assertion 2 ok (forever rows refused on INSERT and UPDATE; effective plan stays free)';
END $a2$;

-- 3. What shipped iOS actually sends still lands: a monthly and a yearly
--    purchase, a renewal through the same upsert, and a device-side refund.
--    The statement is the upsert supabase-swift issues for
--    .upsert(payload, onConflict: "original_transaction_id").
DO $a3$
DECLARE
  buyer UUID := (SELECT v FROM asc_ids WHERE k = 'buyer');
  msg   TEXT;
  upsert TEXT := $s$INSERT INTO public.apple_subscriptions
      (user_id, original_transaction_id, store_transaction_id, product_id, status, expires_at)
    VALUES (%L, %L, %L, %L, %L, %L)
    ON CONFLICT (original_transaction_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      store_transaction_id = EXCLUDED.store_transaction_id,
      product_id = EXCLUDED.product_id,
      status = EXCLUDED.status,
      expires_at = EXCLUDED.expires_at$s$;
  st TEXT;
  ex TIMESTAMPTZ;
BEGIN
  msg := pg_temp.as_user(buyer, format(upsert, buyer, 'asc-monthly', 'asc-monthly-t1',
    'com.eatpal.app.familyplus.monthly', 'active', to_char(now() + interval '31 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')));
  ASSERT msg IS NULL, format('monthly purchase: %s', msg);

  msg := pg_temp.as_user(buyer, format(upsert, buyer, 'asc-yearly', 'asc-yearly-t1',
    'com.eatpal.app.professional.yearly', 'active', (now() + interval '366 days')::text));
  ASSERT msg IS NULL, format('yearly purchase: %s', msg);

  -- Renewal: same original id, new transaction id, a month later.
  msg := pg_temp.as_user(buyer, format(upsert, buyer, 'asc-monthly', 'asc-monthly-t2',
    'com.eatpal.app.familyplus.monthly', 'active', (now() + interval '62 days')::text));
  ASSERT msg IS NULL, format('monthly renewal: %s', msg);
  SELECT status, expires_at INTO st, ex FROM public.apple_subscriptions WHERE original_transaction_id = 'asc-monthly';
  ASSERT st = 'active' AND ex > now() + interval '61 days', format('renewal left %s / %s', st, ex);

  ASSERT public.effective_plan_id(buyer) IS NOT NULL, 'a paying App Store subscriber resolves to no plan';

  -- Device-side refund: the app sends 'revoked' once revocationDate is set.
  msg := pg_temp.as_user(buyer, format(upsert, buyer, 'asc-monthly', 'asc-monthly-t2',
    'com.eatpal.app.familyplus.monthly', 'revoked', (now() + interval '62 days')::text));
  ASSERT msg IS NULL, format('device-side revoke: %s', msg);

  RAISE NOTICE 'assertion 3 ok (monthly, yearly, renewal and device revoke all accepted)';
END $a3$;

-- 4. A revoked or expired row cannot be brought back to 'active' by the
--    client, by UPDATE or through the upsert.
DO $a4$
DECLARE
  buyer UUID := (SELECT v FROM asc_ids WHERE k = 'buyer');
  msg   TEXT;
  st    TEXT;
BEGIN
  -- 'asc-monthly' is revoked from assertion 3. Mark the yearly one expired the
  -- way app-store-notifications would, as the owner.
  UPDATE public.apple_subscriptions SET status = 'expired' WHERE original_transaction_id = 'asc-yearly';

  msg := pg_temp.as_user(buyer,
    $s$UPDATE public.apple_subscriptions SET status = 'active' WHERE original_transaction_id = 'asc-monthly'$s$);
  ASSERT msg LIKE '%only the server can re-activate a subscription marked revoked%', format('revoked -> active: %s', msg);

  msg := pg_temp.as_user(buyer, format(
    $s$INSERT INTO public.apple_subscriptions (user_id, original_transaction_id, product_id, status, expires_at)
       VALUES (%L, 'asc-yearly', 'com.eatpal.app.professional.yearly', 'active', now() + interval '300 days')
       ON CONFLICT (original_transaction_id) DO UPDATE SET status = EXCLUDED.status, expires_at = EXCLUDED.expires_at$s$, buyer));
  ASSERT msg LIKE '%only the server can re-activate a subscription marked expired%', format('expired -> active via upsert: %s', msg);

  SELECT status INTO st FROM public.apple_subscriptions WHERE original_transaction_id = 'asc-monthly';
  ASSERT st = 'revoked', format('monthly is %s', st);
  SELECT status INTO st FROM public.apple_subscriptions WHERE original_transaction_id = 'asc-yearly';
  ASSERT st = 'expired', format('yearly is %s', st);

  RAISE NOTICE 'assertion 4 ok (revoked/expired cannot be resurrected by the client)';
END $a4$;

-- 5. A client cannot move a row to another user or another transaction id.
DO $a5$
DECLARE
  buyer  UUID := (SELECT v FROM asc_ids WHERE k = 'buyer');
  forger UUID := (SELECT v FROM asc_ids WHERE k = 'forger');
  msg    TEXT;
BEGIN
  msg := pg_temp.as_user(forger, format(
    $s$UPDATE public.apple_subscriptions SET user_id = %L WHERE original_transaction_id = 'asc-forger-real'$s$, buyer));
  ASSERT msg LIKE '%user_id cannot be changed%', format('user_id change: %s', msg);

  msg := pg_temp.as_user(forger,
    $s$UPDATE public.apple_subscriptions SET original_transaction_id = 'asc-someone-elses'
        WHERE original_transaction_id = 'asc-forger-real'$s$);
  ASSERT msg LIKE '%original_transaction_id cannot be changed%', format('original id change: %s', msg);

  RAISE NOTICE 'assertion 5 ok (user_id and original_transaction_id are fixed for the client)';
END $a5$;

-- 6. service_role is unrestricted: it may write what the client may not,
--    including re-activating a revoked row and an open-ended expiry.
DO $a6$
DECLARE
  server UUID := (SELECT v FROM asc_ids WHERE k = 'server');
  st     TEXT;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.apple_subscriptions (user_id, original_transaction_id, product_id, status, expires_at)
    VALUES (server, 'asc-server', 'com.eatpal.app.professional.yearly', 'revoked', NULL);
  UPDATE public.apple_subscriptions
     SET status = 'active', expires_at = now() + interval '2 years', product_id = 'com.eatpal.app.some.future.product'
   WHERE original_transaction_id = 'asc-server';
  UPDATE public.apple_subscriptions SET status = 'active' WHERE original_transaction_id = 'asc-monthly';
  RESET ROLE;

  SELECT status INTO st FROM public.apple_subscriptions WHERE original_transaction_id = 'asc-server';
  ASSERT st = 'active', format('service_role write left %s', st);
  SELECT status INTO st FROM public.apple_subscriptions WHERE original_transaction_id = 'asc-monthly';
  ASSERT st = 'active', format('service_role re-activation left %s', st);

  RAISE NOTICE 'assertion 6 ok (service_role unrestricted)';
END $a6$;

ROLLBACK;
