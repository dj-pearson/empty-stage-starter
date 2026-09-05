-- US-780 test suite: a subscriber is a subscriber whichever store they bought
-- from.
--
-- The bug: plan limits were resolved from user_subscriptions alone, which holds
-- STRIPE subscriptions. An App Store purchase lands in apple_subscriptions and
-- an admin comp in complementary_subscriptions, and neither check_feature_limit
-- (the client pre-check) nor enforce_plan_row_limit (the authoritative trigger)
-- read either table. Both fell through to the Free row, so a paying App Store
-- customer was capped at one child and 50 pantry foods WHILE PAYING -- and the
-- client agreed with the server, so nothing looked broken.
--
-- HOW TO RUN. There is no SQL test runner in this repo (vitest only collects
-- src/**), so this is run by hand against a throwaway database, never against
-- production. A local postgres 16 works as well as a container:
--
--   docker run -d --name pgtest -e POSTGRES_PASSWORD=scratch -p 55432:5432 postgres:16-alpine
--   export P="psql -h localhost -p 55432 -U postgres -v ON_ERROR_STOP=1 -q"
--   $P -f supabase/tests/us780_apple_entitlement.bootstrap.sql
--   $P -f supabase/migrations/20251008141000_create_subscriptions_tables.sql
--   $P -f supabase/migrations/20251008202537_abaf0cfc-6afd-4141-89db-1fbde08a0be0.sql
--   $P -f supabase/migrations/20251008205036_84aa8701-4e4e-45aa-a2df-22f40ea5b683.sql
--   $P -f supabase/migrations/20260601000002_apple_subscriptions.sql
--   $P -f supabase/migrations/20260723123300_enforce_plan_row_limits.sql
--   $P -f supabase/migrations/20251107000001_fix_complementary_subscriptions.sql
--   $P -f supabase/migrations/20260903000001_apple_subscribers_count_as_paid.sql
--   $P -f supabase/tests/us780_apple_entitlement.test.sql
--   docker rm -f pgtest
--
-- Three of those files stop partway on an object this bootstrap does not stand
-- up (has_role, a billing_cycle view column, a Supabase-only role). That is
-- expected and harmless: every function and table this suite touches is created
-- before the failing statement. Run without ON_ERROR_STOP if you would rather
-- see them all through.
--
-- RUN IT WITHOUT 20260903000001 TOO. Cases 1, 2, 6 and 8 fail there, which is
-- the whole point of the migration; if they pass without it, this suite is
-- measuring nothing.
--
-- Every check prints EXPECTED alongside the value.

\pset format unaligned
\pset tuples_only on

-- ---------------------------------------------------------------- fixtures --
TRUNCATE kids, foods, apple_subscriptions, user_subscriptions,
         complementary_subscriptions CASCADE;
DELETE FROM auth.users;

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-0000000000f1'),  -- no entitlement
  ('00000000-0000-0000-0000-0000000000f2'),  -- Stripe Pro
  ('00000000-0000-0000-0000-0000000000f3'),  -- Apple Family Plus
  ('00000000-0000-0000-0000-0000000000f4'),  -- Apple, expired
  ('00000000-0000-0000-0000-0000000000f5'),  -- Apple, revoked (refund)
  ('00000000-0000-0000-0000-0000000000f6'),  -- admin comp, Family Plus
  ('00000000-0000-0000-0000-0000000000f7'),  -- Stripe, canceled
  ('00000000-0000-0000-0000-0000000000f8');  -- Apple Professional, no expiry

INSERT INTO user_subscriptions (user_id, plan_id, status)
SELECT '00000000-0000-0000-0000-0000000000f2', id, 'active'
FROM subscription_plans WHERE name = 'Pro';

INSERT INTO user_subscriptions (user_id, plan_id, status)
SELECT '00000000-0000-0000-0000-0000000000f7', id, 'canceled'
FROM subscription_plans WHERE name = 'Family Plus';

INSERT INTO apple_subscriptions (user_id, original_transaction_id, product_id, status, expires_at) VALUES
  ('00000000-0000-0000-0000-0000000000f3', 'txn-3', 'com.eatpal.app.familyplus.monthly',  'active',  now() + interval '20 days'),
  ('00000000-0000-0000-0000-0000000000f4', 'txn-4', 'com.eatpal.app.familyplus.monthly',  'active',  now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000f5', 'txn-5', 'com.eatpal.app.familyplus.monthly',  'revoked', now() + interval '20 days'),
  ('00000000-0000-0000-0000-0000000000f8', 'txn-8', 'com.eatpal.app.professional.yearly', 'active',  NULL);

INSERT INTO complementary_subscriptions (user_id, plan_id, granted_by, status, end_date)
SELECT '00000000-0000-0000-0000-0000000000f6', id,
       '00000000-0000-0000-0000-0000000000f1', 'active', NULL
FROM subscription_plans WHERE name = 'Family Plus';

-- How many kids can this user actually insert before the trigger stops them?
-- Rolls its own rows back, so the suite is re-runnable.
CREATE OR REPLACE FUNCTION pg_temp.kid_capacity(p_user UUID, p_probe INTEGER DEFAULT 6)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE i INTEGER; hh UUID := gen_random_uuid();
BEGIN
  FOR i IN 1..p_probe LOOP
    BEGIN
      INSERT INTO kids (user_id, household_id, name) VALUES (p_user, hh, 'k' || i);
    EXCEPTION WHEN OTHERS THEN
      DELETE FROM kids WHERE household_id = hh;
      RETURN (i - 1)::TEXT;
    END;
  END LOOP;
  DELETE FROM kids WHERE household_id = hh;
  RETURN p_probe || '+ (unlimited)';
END;
$$;

SELECT '';
SELECT '=== CASE 1: an App Store subscriber is not treated as free ===';
SELECT '  kid capacity           = ' || pg_temp.kid_capacity('00000000-0000-0000-0000-0000000000f3')
    || '   EXPECTED 6+ (unlimited)';
SELECT '  check_feature_limit    = ' || check_feature_limit('00000000-0000-0000-0000-0000000000f3', 'children', 1)::TEXT
    || E'\n  EXPECTED allowed true, limit null';
SELECT '  plan name              = ' || (SELECT name FROM subscription_plans WHERE id = effective_plan_id('00000000-0000-0000-0000-0000000000f3'))
    || '   EXPECTED Family Plus';

SELECT '';
SELECT '=== CASE 2: an admin comp is not treated as free either ===';
SELECT '  kid capacity           = ' || pg_temp.kid_capacity('00000000-0000-0000-0000-0000000000f6')
    || '   EXPECTED 6+ (unlimited)';

SELECT '';
SELECT '=== CASE 3: NO REGRESSION -- a Stripe subscriber resolves exactly as before ===';
SELECT '  kid capacity           = ' || pg_temp.kid_capacity('00000000-0000-0000-0000-0000000000f2')
    || '   EXPECTED 3 (the Pro seed cap)';
SELECT '  plan name              = ' || (SELECT name FROM subscription_plans WHERE id = effective_plan_id('00000000-0000-0000-0000-0000000000f2'))
    || '   EXPECTED Pro';

SELECT '';
SELECT '=== CASE 4: a free user is still capped ===';
SELECT '  kid capacity           = ' || pg_temp.kid_capacity('00000000-0000-0000-0000-0000000000f1')
    || '   EXPECTED 1';
SELECT '  effective_plan_id      = ' || COALESCE(effective_plan_id('00000000-0000-0000-0000-0000000000f1')::TEXT, 'NULL')
    || '   EXPECTED NULL (callers fall back to Free)';

SELECT '';
SELECT '=== CASE 5: a lapsed entitlement grants nothing ===';
SELECT '  apple expired          = ' || pg_temp.kid_capacity('00000000-0000-0000-0000-0000000000f4') || '   EXPECTED 1';
SELECT '  apple revoked (refund) = ' || pg_temp.kid_capacity('00000000-0000-0000-0000-0000000000f5') || '   EXPECTED 1';
SELECT '  stripe canceled        = ' || pg_temp.kid_capacity('00000000-0000-0000-0000-0000000000f7') || '   EXPECTED 1';

SELECT '';
SELECT '=== CASE 6: the usage dashboard agrees with the limits ===';
SELECT '  ' || rpad(label, 20) || ' = ' || rpad(s->'plan'->>'name', 13)
    || ' children.limit=' || COALESCE(s->'usage'->'children'->>'limit', 'unlimited')
    || '   EXPECTED ' || expected
FROM (SELECT label, expected, get_usage_stats(uid) AS s FROM (VALUES
  ('free',           '00000000-0000-0000-0000-0000000000f1'::UUID, 'Free / 1'),
  ('stripe Pro',     '00000000-0000-0000-0000-0000000000f2'::UUID, 'Pro / 3'),
  ('apple FamPlus',  '00000000-0000-0000-0000-0000000000f3'::UUID, 'Family Plus / unlimited'),
  ('apple Professnl','00000000-0000-0000-0000-0000000000f8'::UUID, 'Professional / unlimited'),
  ('comp FamPlus',   '00000000-0000-0000-0000-0000000000f6'::UUID, 'Family Plus / unlimited'),
  ('apple revoked',  '00000000-0000-0000-0000-0000000000f5'::UUID, 'Free / 1')
) t(label, uid, expected)) q;

SELECT '';
SELECT '=== CASE 7: every StoreKit product id maps to a plan ===';
SELECT '  ' || rpad(p, 37) || ' -> ' || rpad(COALESCE(plan_name_for_apple_product(p), 'NULL'), 13)
    || '   EXPECTED ' || e
FROM (VALUES
  ('com.eatpal.app.pro.monthly',          'Pro'),
  ('com.eatpal.app.pro.yearly',           'Pro'),
  ('com.eatpal.app.familyplus.monthly',   'Family Plus'),
  ('com.eatpal.app.familyplus.yearly',    'Family Plus'),
  -- 'professional' contains 'pro'. A naive map returns Pro here and silently
  -- downgrades the most expensive tier, so the CASE checks it first.
  ('com.eatpal.app.professional.monthly', 'Professional'),
  ('com.eatpal.app.professional.yearly',  'Professional'),
  ('com.eatpal.app.something.else',       'NULL')
) AS t(p, e);

SELECT '';
SELECT '=== CASE 8: holding two entitlements never returns the smaller one ===';
INSERT INTO apple_subscriptions (user_id, original_transaction_id, product_id, status, expires_at)
VALUES ('00000000-0000-0000-0000-0000000000f2', 'txn-2', 'com.eatpal.app.familyplus.yearly', 'active', now() + interval '1 year');
SELECT '  stripe Pro + apple Family Plus -> '
    || (SELECT name FROM subscription_plans WHERE id = effective_plan_id('00000000-0000-0000-0000-0000000000f2'))
    || '   EXPECTED Family Plus';
DELETE FROM apple_subscriptions WHERE original_transaction_id = 'txn-2';

-- Both a legacy 'Family' seed and 'Family Plus' can match one purchase. Without
-- the generosity ordering, LIMIT 1 picks between them arbitrarily.
INSERT INTO subscription_plans (name, price_monthly, max_children, max_pantry_foods)
VALUES ('Family', 9.99, 2, 200);
SELECT '  ambiguous Family/Family Plus   -> '
    || (SELECT name FROM subscription_plans WHERE id = effective_plan_id('00000000-0000-0000-0000-0000000000f3'))
    || ', ' || (SELECT count(DISTINCT effective_plan_id('00000000-0000-0000-0000-0000000000f3'))
                FROM generate_series(1, 20)) || ' distinct result(s) over 20 calls'
    || '   EXPECTED Family Plus, 1';
DELETE FROM subscription_plans WHERE name = 'Family';

SELECT '';
SELECT '=== CASE 9: the branches copied verbatim from 20251008202537 still work ===';
INSERT INTO user_usage_tracking (user_id, date, ai_coach_requests, food_tracker_entries)
VALUES ('00000000-0000-0000-0000-0000000000f1', CURRENT_DATE, 4, 10);
SELECT '  free  ai_coach      allowed=' || (check_feature_limit('00000000-0000-0000-0000-0000000000f1', 'ai_coach') ->> 'allowed')          || '   EXPECTED false';
SELECT '  free  food_tracker  allowed=' || (check_feature_limit('00000000-0000-0000-0000-0000000000f1', 'food_tracker') ->> 'allowed')      || '   EXPECTED false';
SELECT '  free  food_chaining allowed=' || (check_feature_limit('00000000-0000-0000-0000-0000000000f1', 'food_chaining') ->> 'allowed')     || '   EXPECTED false';
SELECT '  apple food_chaining allowed=' || (check_feature_limit('00000000-0000-0000-0000-0000000000f3', 'food_chaining') ->> 'allowed')     || '   EXPECTED true';
SELECT '  free  pantry@50     allowed=' || (check_feature_limit('00000000-0000-0000-0000-0000000000f1', 'pantry_foods', 50) ->> 'allowed')  || '   EXPECTED false';
SELECT '  apple pantry@50     allowed=' || (check_feature_limit('00000000-0000-0000-0000-0000000000f3', 'pantry_foods', 50) ->> 'allowed')  || '   EXPECTED true';
SELECT '  unknown feature     allowed=' || (check_feature_limit('00000000-0000-0000-0000-0000000000f1', 'not_a_feature') ->> 'allowed')     || '   EXPECTED true';
DELETE FROM user_usage_tracking WHERE user_id = '00000000-0000-0000-0000-0000000000f1';

SELECT '';
SELECT '=== CASE 10: effective_plan_id cannot be called directly by a client ===';
SELECT '  PUBLIC has EXECUTE = ' || has_function_privilege('public', 'public.effective_plan_id(uuid)', 'EXECUTE')::TEXT
    || '   EXPECTED false (it would report any user''s plan; the two SECURITY';
SELECT '                       DEFINER callers reach it regardless)';
SELECT '  PUBLIC may call current_user_plan_name() = '
    || has_function_privilege('public', 'public.current_user_plan_name()', 'EXECUTE')::TEXT
    || '   EXPECTED true (argument-free, so it only ever reports on the caller)';

SELECT '';
SELECT '=== CASE 11: the Professional-gated RLS policy sees App Store buyers ===';
-- Custom domains and brand settings gate INSERT on being on Professional, and
-- did so through a Stripe-only EXISTS. com.eatpal.app.professional.* are real
-- StoreKit products, so an App Store Professional subscriber was refused a
-- feature they pay for.
--
-- Needs a non-superuser to observe: a superuser bypasses RLS. Requires
-- 20251111000000_add_custom_domains.sql to have been applied; skipped if not.
DO $case11$
DECLARE
  v_result TEXT;
  v_expected TEXT;
BEGIN
  IF to_regclass('public.professional_custom_domains') IS NULL THEN
    RAISE NOTICE '  SKIPPED -- apply 20251111000000_add_custom_domains.sql to run this case';
    RETURN;
  END IF;

  BEGIN
    CREATE ROLE us780_client NOLOGIN;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  GRANT USAGE ON SCHEMA public TO us780_client;
  GRANT SELECT, INSERT ON public.professional_custom_domains TO us780_client;
  GRANT SELECT ON public.subscription_plans, public.user_subscriptions,
                  public.user_roles TO us780_client;
  GRANT EXECUTE ON FUNCTION public.current_user_plan_name() TO us780_client;

  FOR v_result, v_expected IN
    SELECT * FROM (VALUES
      ('00000000-0000-0000-0000-0000000000f8', 'apple Professional  EXPECTED inserted'),
      ('00000000-0000-0000-0000-0000000000f3', 'apple Family Plus   EXPECTED refused'),
      ('00000000-0000-0000-0000-0000000000f1', 'free                EXPECTED refused')
    ) t(uid, label)
  LOOP
    DECLARE v_ok TEXT;
    BEGIN
      SET LOCAL ROLE us780_client;
      PERFORM set_config('request.jwt.claim.sub', v_result, true);
      BEGIN
        INSERT INTO public.professional_custom_domains (user_id, domain_name)
        VALUES (v_result::UUID, 'case11-' || right(v_result, 2) || '.example.com');
        v_ok := 'inserted';
      EXCEPTION WHEN insufficient_privilege OR check_violation THEN
        v_ok := 'refused';
      END;
      RESET ROLE;
      RAISE NOTICE '  % -> %', v_expected, v_ok;
    END;
  END LOOP;

  DELETE FROM public.professional_custom_domains WHERE domain_name LIKE 'case11-%';
END
$case11$;
