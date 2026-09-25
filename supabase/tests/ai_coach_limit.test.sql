-- AI Coach daily limit on the server (20260928000006, owner decision 1a).
--
-- Pins the two rows the migration seeds, that a replay leaves an owner's
-- change alone, and that the sequence ai-coach-chat runs -- check_feature_limit
-- then increment_usage, as service_role, for a user id taken from the JWT --
-- passes the caller-id guard and turns into a refusal at the plan's limit.
--
-- Run: bash scripts/dev/local-sql-suite.sh

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

BEGIN;

-- 1. The kill switch exists and starts in the grace position.
DO $a1$
DECLARE v_enabled boolean; n int;
BEGIN
  SELECT count(*), bool_or(enabled) INTO n, v_enabled
    FROM public.feature_flags WHERE key = 'ai_coach_limit_enforce_legacy';
  ASSERT n = 1, format('expected one ai_coach_limit_enforce_legacy row, found %s', n);
  ASSERT v_enabled = false, 'ai_coach_limit_enforce_legacy must be seeded disabled (grace on)';
  RAISE NOTICE 'assertion 1 ok (flag seeded, disabled)';
END $a1$;

-- 2. The hourly budget row: 30 on every tier, one-hour window, active.
DO $a2$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.rate_limit_config WHERE endpoint = 'ai-coach-chat';
  ASSERT FOUND, 'no rate_limit_config row for ai-coach-chat';
  ASSERT r.free_tier_limit = 30 AND r.premium_tier_limit = 30 AND r.enterprise_tier_limit = 30,
    format('ai-coach-chat limits are %s/%s/%s, expected 30/30/30',
           r.free_tier_limit, r.premium_tier_limit, r.enterprise_tier_limit);
  ASSERT r.window_minutes = 60, format('window is %s minutes, expected 60', r.window_minutes);
  ASSERT r.is_active IS DISTINCT FROM false, 'ai-coach-chat row is inactive';
  RAISE NOTICE 'assertion 2 ok (ai-coach-chat 30/hr on every tier)';
END $a2$;

-- 3. A replay never undoes what the owner set.
UPDATE public.feature_flags SET enabled = true WHERE key = 'ai_coach_limit_enforce_legacy';
UPDATE public.rate_limit_config SET free_tier_limit = 99 WHERE endpoint = 'ai-coach-chat';

\ir ../migrations/20260928000006_ai_coach_limit.sql

DO $a3$
DECLARE v_enabled boolean; v_free int; n int;
BEGIN
  SELECT enabled INTO v_enabled FROM public.feature_flags WHERE key = 'ai_coach_limit_enforce_legacy';
  ASSERT v_enabled = true, 'replaying the migration switched the grace period back on';
  SELECT free_tier_limit INTO v_free FROM public.rate_limit_config WHERE endpoint = 'ai-coach-chat';
  ASSERT v_free = 99, format('replaying the migration reset a tuned limit to %s', v_free);
  SELECT count(*) INTO n FROM public.feature_flags WHERE key = 'ai_coach_limit_enforce_legacy';
  ASSERT n = 1, format('replay duplicated the flag row (%s)', n);
  RAISE NOTICE 'assertion 3 ok (replay is a no-op)';
END $a3$;

-- 4. The function's sequence, as the function runs it.
DO $a4$
DECLARE
  u   uuid := '92800000-0000-0000-0000-0000000000c1';
  res jsonb;
  n   int;
BEGIN
  DELETE FROM auth.users WHERE id = u;
  INSERT INTO auth.users (id, email) VALUES (u, 'coach-limit@example.test');

  -- Free as seeded: limit 0, refused before any use.
  SET LOCAL ROLE service_role;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  res := public.check_feature_limit(u, 'ai_coach');
  RESET ROLE;
  ASSERT (res->>'allowed')::boolean = false AND (res->>'limit')::int = 0,
    format('Free plan ai_coach check returned %s, expected allowed=false limit=0', res);

  -- Give Free a daily limit of 2 inside this transaction, then walk it.
  UPDATE public.subscription_plans SET ai_coach_daily_limit = 2 WHERE name = 'Free';

  SET LOCAL ROLE service_role;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  res := public.check_feature_limit(u, 'ai_coach');
  ASSERT (res->>'allowed')::boolean = true AND (res->>'current')::int = 0,
    format('first check returned %s', res);
  PERFORM public.increment_usage(u, 'ai_coach');
  PERFORM public.increment_usage(u, 'ai_coach');
  res := public.check_feature_limit(u, 'ai_coach');
  RESET ROLE;
  ASSERT (res->>'allowed')::boolean = false
     AND (res->>'limit')::int = 2
     AND (res->>'current')::int = 2,
    format('check after two replies returned %s, expected allowed=false limit=2 current=2', res);

  SELECT ai_coach_requests INTO n FROM public.user_usage_tracking
   WHERE user_id = u AND date = CURRENT_DATE;
  ASSERT n = 2, format('ai_coach_requests is %s, expected 2', n);
  RAISE NOTICE 'assertion 4 ok (service_role check/increment for the JWT user; refused at the limit)';
END $a4$;

ROLLBACK;
