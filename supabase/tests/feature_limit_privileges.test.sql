-- Item 39: check_feature_limit and increment_usage answer for the caller only.
--
-- Both are SECURITY DEFINER and take a user id. Before 20260925000001 anon
-- could execute them (US-804's default-ACL finding) and a signed-in user could
-- pass anyone's id: read their AI Coach / food tracker counts, or bump them
-- until the other account was locked out for the day.
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
DECLARE fn TEXT; wrong TEXT[] := '{}';
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.check_feature_limit(uuid, text, integer)',
    'public.increment_usage(uuid, text)'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN
      wrong := wrong || (fn || ' [anon can execute]');
    END IF;
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      wrong := wrong || (fn || ' [authenticated cannot execute]');
    END IF;
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      wrong := wrong || (fn || ' [service_role cannot execute]');
    END IF;
  END LOOP;

  IF array_length(wrong, 1) > 0 THEN
    RAISE EXCEPTION 'assertion 1: %', array_to_string(wrong, ', ');
  END IF;
  RAISE NOTICE 'assertion 1 ok (anon refused; authenticated and service_role granted)';
END $a1$;

DO $a2$
DECLARE
  user_a  uuid := '92500000-0000-0000-0000-0000000000a1';
  user_b  uuid := '92500000-0000-0000-0000-0000000000b1';
  res     jsonb;
  n       int;
  refused boolean;
BEGIN
  DELETE FROM auth.users WHERE id IN (user_a, user_b);
  INSERT INTO auth.users (id, email) VALUES
    (user_a, 'fl-a@example.test'),
    (user_b, 'fl-b@example.test');
  -- B already has usage today; nothing A does may move it.
  INSERT INTO public.user_usage_tracking (user_id, date, ai_coach_requests, food_tracker_entries)
    VALUES (user_b, CURRENT_DATE, 2, 3);

  -- 2. anon, calling for real, is refused by the grant.
  refused := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM public.increment_usage(user_b, 'ai_coach');
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  RESET ROLE;
  ASSERT refused, 'anon called increment_usage';
  RAISE NOTICE 'assertion 2 ok (anon call refused)';

  -- 3. A signed-in user calling for themselves works as before.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  res := public.check_feature_limit(user_a, 'ai_coach');
  ASSERT res IS NOT NULL AND res ? 'allowed', format('own check_feature_limit returned %s', res);
  PERFORM public.increment_usage(user_a, 'ai_coach');
  PERFORM public.increment_usage(user_a, 'food_tracker');
  RESET ROLE;
  SELECT ai_coach_requests + food_tracker_entries INTO n
    FROM public.user_usage_tracking WHERE user_id = user_a AND date = CURRENT_DATE;
  ASSERT n = 2, format('A''s own increments landed %s, expected 2', n);
  RAISE NOTICE 'assertion 3 ok (A reads and bumps own usage)';

  -- 4. A cannot read B's limits.
  refused := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    res := public.check_feature_limit(user_b, 'ai_coach');
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  RESET ROLE;
  ASSERT refused, format('A read B''s feature limit: %s', res);
  RAISE NOTICE 'assertion 4 ok (A refused B''s check_feature_limit)';

  -- 5. A cannot bump B's counters.
  refused := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    PERFORM public.increment_usage(user_b, 'ai_coach');
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  RESET ROLE;
  ASSERT refused, 'A bumped B''s usage';
  SELECT ai_coach_requests INTO n
    FROM public.user_usage_tracking WHERE user_id = user_b AND date = CURRENT_DATE;
  ASSERT n = 2, format('B''s ai_coach count moved to %s', n);
  RAISE NOTICE 'assertion 5 ok (A refused B''s increment_usage; B unchanged)';

  -- 6. service_role carries no sub, so auth.uid() is NULL and it may act for
  --    any user, as an edge function would.
  SET LOCAL ROLE service_role;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  res := public.check_feature_limit(user_b, 'ai_coach');
  ASSERT res IS NOT NULL AND res ? 'allowed', format('service_role check_feature_limit returned %s', res);
  PERFORM public.increment_usage(user_b, 'ai_coach');
  RESET ROLE;
  SELECT ai_coach_requests INTO n
    FROM public.user_usage_tracking WHERE user_id = user_b AND date = CURRENT_DATE;
  ASSERT n = 3, format('service_role increment left B at %s, expected 3', n);
  RAISE NOTICE 'assertion 6 ok (service_role path works for any user)';
END $a2$;

ROLLBACK;
