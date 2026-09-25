-- Item 39: get_usage_stats answers for the caller only, and reports the plan
-- the limits enforce.
--
-- Before 20260928000002 anon could execute it (US-804's default-ACL finding)
-- and a signed-in user could pass anyone's id to read their plan, child count,
-- pantry size and usage. Its plan lookup also preferred any active Stripe row
-- over effective_plan_id, so Stripe Pro plus an App Store or comped Family Plus
-- showed Pro on the dashboard while enforcement allowed Family Plus.
--
-- Asserts on has_function_privilege and on what a call actually does, never on
-- the migration text.
--
-- Run: bash scripts/dev/local-sql-suite.sh

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

BEGIN;

-- 1. The grants: anon cannot execute, authenticated and service_role can.
DO $a1$
DECLARE fn TEXT := 'public.get_usage_stats(uuid)'; wrong TEXT[] := '{}';
BEGIN
  IF has_function_privilege('anon', fn, 'EXECUTE') THEN
    wrong := wrong || (fn || ' [anon can execute]');
  END IF;
  IF has_function_privilege('public', fn, 'EXECUTE') THEN
    wrong := wrong || (fn || ' [PUBLIC can execute]');
  END IF;
  IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
    wrong := wrong || (fn || ' [authenticated cannot execute]');
  END IF;
  IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    wrong := wrong || (fn || ' [service_role cannot execute]');
  END IF;

  IF array_length(wrong, 1) > 0 THEN
    RAISE EXCEPTION 'assertion 1: %', array_to_string(wrong, ', ');
  END IF;
  RAISE NOTICE 'assertion 1 ok (anon and PUBLIC refused; authenticated and service_role granted)';
END $a1$;

-- 1b. search_path is pinned (20260903000001 had dropped it).
DO $a1b$
DECLARE cfg TEXT[];
BEGIN
  SELECT proconfig INTO cfg FROM pg_proc
   WHERE oid = 'public.get_usage_stats(uuid)'::regprocedure;
  ASSERT cfg IS NOT NULL AND 'search_path=public' = ANY (cfg),
    format('get_usage_stats proconfig is %s, expected search_path=public', cfg);
  RAISE NOTICE 'assertion 1b ok (search_path pinned)';
END $a1b$;

DO $a2$
DECLARE
  user_a  uuid := '92800000-0000-0000-0000-0000000000a1';
  user_b  uuid := '92800000-0000-0000-0000-0000000000b1';  -- Stripe Pro + Apple Family Plus
  user_c  uuid := '92800000-0000-0000-0000-0000000000c1';  -- Stripe Pro + comp Family Plus
  user_d  uuid := '92800000-0000-0000-0000-0000000000d1';  -- Stripe Pro only
  res     jsonb;
  refused boolean;
  expected text;
BEGIN
  DELETE FROM public.apple_subscriptions WHERE user_id IN (user_a, user_b, user_c, user_d);
  DELETE FROM public.complementary_subscriptions WHERE user_id IN (user_a, user_b, user_c, user_d);
  DELETE FROM public.user_subscriptions WHERE user_id IN (user_a, user_b, user_c, user_d);
  DELETE FROM auth.users WHERE id IN (user_a, user_b, user_c, user_d);
  INSERT INTO auth.users (id, email) VALUES
    (user_a, 'gus-a@example.test'),
    (user_b, 'gus-b@example.test'),
    (user_c, 'gus-c@example.test'),
    (user_d, 'gus-d@example.test');
  INSERT INTO public.user_usage_tracking (user_id, date, ai_coach_requests, food_tracker_entries)
    VALUES (user_b, CURRENT_DATE, 2, 3);

  INSERT INTO public.user_subscriptions (user_id, plan_id, status)
  SELECT u, id, 'active' FROM public.subscription_plans, unnest(ARRAY[user_b, user_c, user_d]) u
   WHERE name = 'Pro';
  INSERT INTO public.apple_subscriptions (user_id, original_transaction_id, product_id, status, expires_at)
    VALUES (user_b, 'gus-txn-b', 'com.eatpal.app.familyplus.yearly', 'active', now() + interval '1 year');
  INSERT INTO public.complementary_subscriptions (user_id, plan_id, granted_by, status, end_date)
  SELECT user_c, id, user_a, 'active', NULL FROM public.subscription_plans WHERE name = 'Family Plus';

  -- 2. anon, calling for real, is refused by the grant.
  refused := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    res := public.get_usage_stats(user_b);
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  RESET ROLE;
  ASSERT refused, format('anon read get_usage_stats: %s', res);
  RAISE NOTICE 'assertion 2 ok (anon call refused)';

  -- 3. A signed-in user reading their own stats works as before.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  res := public.get_usage_stats(user_a);
  RESET ROLE;
  ASSERT res->'plan'->>'name' = 'Free', format('A''s own plan came back %s', res->'plan');
  ASSERT (res->'usage'->'ai_coach'->>'current')::int = 0, format('A''s own usage %s', res->'usage');
  ASSERT res ?& ARRAY['plan', 'usage'], format('A''s own stats missing keys: %s', res);
  RAISE NOTICE 'assertion 3 ok (A reads own stats: Free, zero usage)';

  -- 4. A cannot read B's stats.
  refused := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    res := public.get_usage_stats(user_b);
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  RESET ROLE;
  ASSERT refused, format('A read B''s usage stats: %s', res);
  RAISE NOTICE 'assertion 4 ok (A refused B''s get_usage_stats with 42501)';

  -- 5. service_role carries no sub, so auth.uid() is NULL and it may read any
  --    user, as an edge function or cron job would.
  SET LOCAL ROLE service_role;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  res := public.get_usage_stats(user_b);
  RESET ROLE;
  ASSERT (res->'usage'->'ai_coach'->>'current')::int = 2,
    format('service_role read B''s ai_coach as %s, expected 2', res->'usage'->'ai_coach');
  ASSERT (res->'usage'->'food_tracker'->>'current')::int = 3,
    format('service_role read B''s food_tracker as %s, expected 3', res->'usage'->'food_tracker');
  RAISE NOTICE 'assertion 5 ok (service_role reads any user)';

  -- 6. The plan shown is the plan effective_plan_id enforces. B holds Stripe Pro
  --    and App Store Family Plus; C holds Stripe Pro and a comped Family Plus.
  --    The old body stopped at the Stripe row and said Pro for both.
  SELECT name INTO expected FROM public.subscription_plans
   WHERE id = public.effective_plan_id(user_b);
  ASSERT expected = 'Family Plus', format('fixture: effective_plan_id(B) is %s', expected);
  res := public.get_usage_stats(user_b);
  ASSERT res->'plan'->>'name' = expected,
    format('B (Stripe Pro + Apple Family Plus) shown %s, enforced %s', res->'plan'->>'name', expected);
  ASSERT (res->'plan'->>'is_complementary')::boolean = false,
    format('B is_complementary %s, expected false', res->'plan'->>'is_complementary');

  SELECT name INTO expected FROM public.subscription_plans
   WHERE id = public.effective_plan_id(user_c);
  ASSERT expected = 'Family Plus', format('fixture: effective_plan_id(C) is %s', expected);
  res := public.get_usage_stats(user_c);
  ASSERT res->'plan'->>'name' = expected,
    format('C (Stripe Pro + comp Family Plus) shown %s, enforced %s', res->'plan'->>'name', expected);
  ASSERT (res->'plan'->>'is_complementary')::boolean = true,
    format('C is_complementary %s, expected true', res->'plan'->>'is_complementary');

  -- A plain Stripe subscriber is unaffected.
  res := public.get_usage_stats(user_d);
  ASSERT res->'plan'->>'name' = 'Pro', format('D (Stripe Pro) shown %s', res->'plan'->>'name');
  ASSERT (res->'plan'->>'is_complementary')::boolean = false,
    format('D is_complementary %s, expected false', res->'plan'->>'is_complementary');
  RAISE NOTICE 'assertion 6 ok (dashboard plan = effective_plan_id for Apple and comp; Stripe-only unchanged)';
END $a2$;

ROLLBACK;
