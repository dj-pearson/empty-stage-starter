-- 20260929000001_quarantine_suspect_apple_subscriptions: rows a client could
-- have forged before the 20260928000012 trigger stop granting a plan, a copy
-- of each is kept, and real subscriptions are left alone.
--
-- Asserts on effective_plan_id and on the rows, never on the migration text.
--
-- HOW TO RUN: `bash scripts/dev/local-sql-suite.sh`. Never against production.
-- Everything happens in one transaction that is rolled back.

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

BEGIN;

-- 1. The function is not callable by a client; the quarantine has RLS and no policy.
DO $a1$
DECLARE
  fn  TEXT := 'public.quarantine_suspect_apple_subscriptions()';
  cfg TEXT[];
BEGIN
  ASSERT NOT has_function_privilege('anon', fn, 'EXECUTE'), 'anon can execute the quarantine';
  ASSERT NOT has_function_privilege('authenticated', fn, 'EXECUTE'), 'authenticated can execute the quarantine';
  SELECT proconfig INTO cfg FROM pg_proc WHERE oid = fn::regprocedure;
  ASSERT cfg IS NOT NULL AND 'search_path=public' = ANY (cfg), format('proconfig %s', cfg);
  -- The local harness grants every table to the API roles after migrating,
  -- so a table grant proves nothing here. RLS with no policy is what refuses
  -- them; assertion 6 checks that against real rows.
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies
                      WHERE schemaname = 'public' AND tablename = 'apple_subscriptions_quarantine'),
    'the quarantine has a policy';
  ASSERT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.apple_subscriptions_quarantine'::regclass),
    'RLS is off on the quarantine';
  RAISE NOTICE 'assertion 1 ok (function and table are server-only)';
END $a1$;

CREATE TEMP TABLE aq_ids (k text PRIMARY KEY, v uuid);

-- Seeded as the owner, which the 20260928000012 trigger lets through: these
-- stand for rows written before that trigger existed.
DO $fx$
DECLARE
  forever_u  UUID := gen_random_uuid();
  far_u      UUID := gen_random_uuid();
  unknown_u  UUID := gen_random_uuid();
  real_u     UUID := gen_random_uuid();
  lapsed_u   UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (forever_u, 'aq-forever@example.test'),
    (far_u,     'aq-far@example.test'),
    (unknown_u, 'aq-unknown@example.test'),
    (real_u,    'aq-real@example.test'),
    (lapsed_u,  'aq-lapsed@example.test');
  INSERT INTO aq_ids VALUES
    ('forever', forever_u), ('far', far_u), ('unknown', unknown_u),
    ('real', real_u), ('lapsed', lapsed_u);

  INSERT INTO public.apple_subscriptions (user_id, original_transaction_id, product_id, status, expires_at) VALUES
    (forever_u, 'aq-forever', 'com.eatpal.app.professional.yearly', 'active', NULL),
    (far_u,     'aq-far',     'com.eatpal.app.pro.yearly',          'active', now() + interval '5 years'),
    (unknown_u, 'aq-unknown', 'com.eatpal.app.free.forever',        'active', now() + interval '20 days'),
    (real_u,    'aq-real',    'com.eatpal.app.familyplus.yearly',   'active', now() + interval '200 days'),
    -- Already not active: not the function's business, even with a NULL expiry.
    (lapsed_u,  'aq-lapsed',  'com.eatpal.app.pro.monthly',         'expired', NULL);
END $fx$;

-- 2. Before: the forged rows are paid plans.
DO $a2$
BEGIN
  ASSERT public.effective_plan_id((SELECT v FROM aq_ids WHERE k = 'forever')) IS NOT NULL,
    'fixture: the forever row should grant a plan before the quarantine';
  ASSERT public.effective_plan_id((SELECT v FROM aq_ids WHERE k = 'far')) IS NOT NULL,
    'fixture: the five-year row should grant a plan before the quarantine';
  RAISE NOTICE 'assertion 2 ok (fixtures grant plans)';
END $a2$;

-- 3. The quarantine revokes exactly the three suspect rows and keeps copies.
DO $a3$
DECLARE
  n INTEGER;
BEGIN
  n := public.quarantine_suspect_apple_subscriptions();
  ASSERT n = 3, format('revoked %s rows, expected 3', n);

  ASSERT (SELECT count(*) FROM public.apple_subscriptions
           WHERE original_transaction_id IN ('aq-forever', 'aq-far', 'aq-unknown')
             AND status = 'revoked') = 3, 'a suspect row is still not revoked';
  ASSERT (SELECT status FROM public.apple_subscriptions
           WHERE original_transaction_id = 'aq-real') = 'active', 'the real subscription was revoked';
  ASSERT (SELECT status FROM public.apple_subscriptions
           WHERE original_transaction_id = 'aq-lapsed') = 'expired', 'the lapsed row was touched';

  ASSERT (SELECT count(*) FROM public.apple_subscriptions_quarantine
           WHERE original_transaction_id IN ('aq-forever', 'aq-far', 'aq-unknown')) = 3,
    'a revoked row has no quarantine copy';
  ASSERT (SELECT status FROM public.apple_subscriptions_quarantine
           WHERE original_transaction_id = 'aq-forever') = 'active',
    'the quarantine copy should hold the row as it was';
  ASSERT (SELECT reason FROM public.apple_subscriptions_quarantine
           WHERE original_transaction_id = 'aq-unknown') = 'unknown product_id',
    'wrong reason for the unknown product';
  RAISE NOTICE 'assertion 3 ok (three revoked, copies kept, real and lapsed untouched)';
END $a3$;

-- 4. After: no plan from a forged row; the real subscriber keeps theirs.
DO $a4$
BEGIN
  ASSERT public.effective_plan_id((SELECT v FROM aq_ids WHERE k = 'forever')) IS NULL,
    'the forever row still grants a plan';
  ASSERT public.effective_plan_id((SELECT v FROM aq_ids WHERE k = 'far')) IS NULL,
    'the five-year row still grants a plan';
  ASSERT public.effective_plan_id((SELECT v FROM aq_ids WHERE k = 'real')) IS NOT NULL,
    'the real subscriber lost their plan';
  RAISE NOTICE 'assertion 4 ok (forged rows grant nothing; real plan kept)';
END $a4$;

-- 5. Running it again changes nothing.
DO $a5$
BEGIN
  ASSERT public.quarantine_suspect_apple_subscriptions() = 0, 'second run revoked more rows';
  ASSERT (SELECT count(*) FROM public.apple_subscriptions_quarantine
           WHERE original_transaction_id LIKE 'aq-%') = 3, 'second run duplicated quarantine rows';
  RAISE NOTICE 'assertion 5 ok (idempotent)';
END $a5$;

-- 6. A signed-in user cannot read the quarantine, not even their own copy.
DO $a6$
DECLARE
  seen INTEGER;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT v FROM aq_ids WHERE k = 'forever')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO seen FROM public.apple_subscriptions_quarantine;
  RESET ROLE;
  ASSERT seen = 0, format('authenticated saw %s quarantine rows', seen);
  RAISE NOTICE 'assertion 6 ok (quarantine unreadable by a client)';
END $a6$;

ROLLBACK;
