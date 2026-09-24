-- Item 39: get_usage_stats answers for the caller only, and agrees with the
-- limits it reports on.
--
-- get_usage_stats is SECURITY DEFINER and takes the user id as an argument.
-- Under US-804's finding (Supabase's default ACL grants EXECUTE directly to
-- anon, authenticated and service_role at creation) it was callable by anon,
-- and it never compared p_user_id to the caller. So anyone holding the anon key
-- could read any account's plan name, child count, pantry size and AI Coach /
-- food tracker usage by uuid. 20260903000001 also re-created it without
-- SET search_path, so the pin it should carry as a definer function was gone.
--
-- Callers, checked before changing anything:
--   src/hooks/useUsageStats.ts   passes supabase.auth.getUser()'s own id and
--                                throws before the call when signed out.
-- Nothing in app/ (Expo), ios/ (Swift) or supabase/functions/ calls it, and no
-- SQL function or trigger calls it. supabase/tests/us780_apple_entitlement
-- calls it as the superuser (auth.uid() NULL), which keeps working.
--
-- What changes:
--   1. SET search_path = public is pinned again.
--   2. A call where auth.uid() is set and differs from p_user_id is refused
--      with SQLSTATE 42501. When auth.uid() is NULL -- service_role, a cron job,
--      a superuser session, the SQL suites -- the call proceeds as before.
--   3. The plan is resolved by public.effective_plan_id, the resolver
--      check_feature_limit and enforce_plan_row_limit use. The old body took
--      the first active Stripe row, then a comp, and only then asked
--      effective_plan_id, so a user holding Stripe Pro plus an App Store or
--      comped Family Plus was shown Pro's 3-child cap while the database let
--      them add more. Now the dashboard shows the plan the limits enforce.
--      is_complementary is true when that resolved plan is the one an active
--      comp (or a Stripe row flagged is_complementary) grants, which is what
--      the two old branches reported for every user they covered.
--   4. EXECUTE is revoked from PUBLIC and anon, and granted to authenticated
--      and service_role. Naming the roles is the part that does anything
--      (US-804).
--
-- What does not change: the signature (p_user_id UUID), the return type
-- (JSONB) and every key of the returned object. The usage counts and the JSON
-- build are carried over verbatim from 20260903000001. A signed-in iOS or web
-- build calling with its own id sees the same shape; types.ts does not change.

CREATE OR REPLACE FUNCTION public.get_usage_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan RECORD;
  v_plan_id UUID;
  v_stats JSONB;
  v_children_count INTEGER;
  v_pantry_foods_count INTEGER;
  v_today_ai_requests INTEGER;
  v_month_food_tracker INTEGER;
  v_is_complementary BOOLEAN := FALSE;
BEGIN
  -- Item 39: a signed-in caller may only ask about themselves. auth.uid() is
  -- NULL for service_role and server-side sessions, which keep acting for any
  -- user.
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'get_usage_stats: may only be called for the signed-in user'
      USING ERRCODE = '42501';
  END IF;

  -- One resolver for the dashboard and the limits: Stripe, admin comp and App
  -- Store, most generous wins (20260903000001, 20260918000007).
  v_plan_id := public.effective_plan_id(p_user_id);

  IF v_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM subscription_plans WHERE id = v_plan_id;

    v_is_complementary :=
      EXISTS (
        SELECT 1 FROM complementary_subscriptions cs
        WHERE cs.user_id = p_user_id
          AND cs.plan_id = v_plan_id
          AND cs.status = 'active'
          AND (cs.end_date IS NULL OR cs.end_date >= NOW())
      )
      OR EXISTS (
        SELECT 1 FROM user_subscriptions us
        WHERE us.user_id = p_user_id
          AND us.plan_id = v_plan_id
          AND us.status IN ('active', 'trialing')
          AND us.is_complementary IS TRUE
      );
  END IF;

  -- If still no subscription, use Free plan
  IF v_plan IS NULL THEN
    SELECT * INTO v_plan
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;
  END IF;

  -- Get actual usage counts
  SELECT COUNT(*) INTO v_children_count
  FROM kids
  WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_pantry_foods_count
  FROM foods
  WHERE user_id = p_user_id;

  SELECT COALESCE(ai_coach_requests, 0) INTO v_today_ai_requests
  FROM user_usage_tracking
  WHERE user_id = p_user_id
    AND date = CURRENT_DATE;

  SELECT COALESCE(SUM(food_tracker_entries), 0) INTO v_month_food_tracker
  FROM user_usage_tracking
  WHERE user_id = p_user_id
    AND date >= date_trunc('month', CURRENT_DATE);

  -- Build response (include complementary status)
  v_stats := jsonb_build_object(
    'plan', jsonb_build_object(
      'name', v_plan.name,
      'max_children', v_plan.max_children,
      'max_pantry_foods', v_plan.max_pantry_foods,
      'ai_coach_daily_limit', v_plan.ai_coach_daily_limit,
      'food_tracker_monthly_limit', v_plan.food_tracker_monthly_limit,
      'has_food_chaining', v_plan.has_food_chaining,
      'has_meal_builder', v_plan.has_meal_builder,
      'has_nutrition_tracking', v_plan.has_nutrition_tracking,
      'is_complementary', v_is_complementary
    ),
    'usage', jsonb_build_object(
      'children', jsonb_build_object(
        'current', v_children_count,
        'limit', v_plan.max_children,
        'percentage', CASE
          WHEN v_plan.max_children IS NULL THEN 0
          ELSE ROUND((v_children_count::DECIMAL / v_plan.max_children) * 100, 0)
        END
      ),
      'pantry_foods', jsonb_build_object(
        'current', v_pantry_foods_count,
        'limit', v_plan.max_pantry_foods,
        'percentage', CASE
          WHEN v_plan.max_pantry_foods IS NULL THEN 0
          ELSE ROUND((v_pantry_foods_count::DECIMAL / v_plan.max_pantry_foods) * 100, 0)
        END
      ),
      'ai_coach', jsonb_build_object(
        'current', COALESCE(v_today_ai_requests, 0),
        'limit', v_plan.ai_coach_daily_limit,
        'percentage', CASE
          WHEN v_plan.ai_coach_daily_limit IS NULL THEN 0
          WHEN v_plan.ai_coach_daily_limit = 0 THEN 100
          ELSE ROUND((COALESCE(v_today_ai_requests, 0)::DECIMAL / v_plan.ai_coach_daily_limit) * 100, 0)
        END,
        'resets_at', (CURRENT_DATE + INTERVAL '1 day')::TEXT
      ),
      'food_tracker', jsonb_build_object(
        'current', COALESCE(v_month_food_tracker, 0),
        'limit', v_plan.food_tracker_monthly_limit,
        'percentage', CASE
          WHEN v_plan.food_tracker_monthly_limit IS NULL THEN 0
          ELSE ROUND((COALESCE(v_month_food_tracker, 0)::DECIMAL / v_plan.food_tracker_monthly_limit) * 100, 0)
        END,
        'resets_at', (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::TEXT
      )
    )
  );

  RETURN v_stats;
END;
$$;

COMMENT ON FUNCTION public.get_usage_stats(UUID) IS
  'Plan and usage for the signed-in user (p_user_id must equal auth.uid() when one is set). Resolves the plan through effective_plan_id so it matches what check_feature_limit and enforce_plan_row_limit enforce. service_role may call it for any user.';

-- --- who may call it (US-804: name the roles) -------------------------------
REVOKE ALL ON FUNCTION public.get_usage_stats(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_usage_stats(UUID) TO authenticated, service_role;
