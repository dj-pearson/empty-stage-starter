-- Item 39: check_feature_limit and increment_usage answer for the caller only.
--
-- Both are SECURITY DEFINER and take the user id as an argument. Under US-804's
-- finding (Supabase's default ACL grants EXECUTE directly to anon,
-- authenticated and service_role at creation) both were callable by anon, and
-- neither compared p_user_id to the caller. So anyone holding the anon key
-- could read another account's plan limits and daily AI Coach / monthly food
-- tracker counts, and could bump those counters until the victim was locked
-- out of the feature for the day or month.
--
-- Callers, checked before changing anything:
--   check_feature_limit  src/hooks/useFeatureLimit.ts, src/lib/featureLimits.ts
--   increment_usage      src/hooks/useFeatureLimit.ts, src/hooks/useFoodLadder.ts
-- All of them pass the signed-in user's own id (supabase.auth.getUser() / the
-- session user) and skip the call when signed out. Nothing in app/ (Expo),
-- ios/ (Swift) or supabase/functions/ calls either one, and no other SQL
-- function or trigger calls them (enforce_plan_row_limit mirrors the logic
-- rather than calling it).
--
-- What changes:
--   1. EXECUTE is revoked from PUBLIC and anon, and kept for authenticated and
--      service_role. Naming the roles is the part that does anything (US-804).
--   2. Each function refuses, with SQLSTATE 42501, a call where auth.uid() is
--      set and differs from p_user_id. When auth.uid() is NULL -- service_role,
--      a cron job, a superuser session, the SQL suites -- the call proceeds as
--      before, so a server-side caller can still act for any user.
--
-- What does not change: signatures, argument names and defaults, return types
-- and every branch of check_feature_limit's body, which is reproduced from
-- 20260903000001 with only the guard block inserted after BEGIN. increment_usage
-- is reproduced from 20251008202537 with the guard inserted and search_path
-- pinned. A signed-in iOS or web build calling with its own id sees no
-- difference.

CREATE OR REPLACE FUNCTION public.check_feature_limit(
  p_user_id UUID,
  p_feature_type TEXT,
  p_current_count INTEGER DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
  v_plan RECORD;
  v_usage RECORD;
  v_result JSONB;
BEGIN
  -- Item 39: a signed-in caller may only ask about themselves. auth.uid() is
  -- NULL for service_role and server-side sessions, which keep acting for any
  -- user.
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'check_feature_limit: may only be called for the signed-in user'
      USING ERRCODE = '42501';
  END IF;

  -- Resolve the plan from ANY store (the Apple gap, 2026-09-03).
  --
  -- This block, plus the schema qualification and SET search_path in the header
  -- above, are the ONLY changes from migration 20251008202537. Everything below
  -- it -- children, pantry_foods, ai_coach's daily usage limit, food_tracker's
  -- monthly usage limit, and the capability flags -- is carried over verbatim,
  -- because rewriting the body is how the ai_coach and food_tracker branches
  -- would get silently dropped.
  --
  -- The old code selected `us.*, sp.*` into one record; this selects the plan
  -- row alone. Every field the branches below read (max_children,
  -- max_pantry_foods, ai_coach_daily_limit, food_tracker_monthly_limit,
  -- has_food_chaining, has_meal_builder, has_nutrition_tracking) is a
  -- subscription_plans column, so nothing loses a value.
  v_plan_id := public.effective_plan_id(p_user_id);

  IF v_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM subscription_plans WHERE id = v_plan_id;
  END IF;

  -- No paid plan, or a plan row that has gone missing: Free limits.
  IF v_plan IS NULL THEN
    SELECT * INTO v_plan
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;
  END IF;
  
  -- Check based on feature type
  CASE p_feature_type
    WHEN 'children' THEN
      IF v_plan.max_children IS NULL THEN
        RETURN jsonb_build_object('allowed', true, 'limit', NULL, 'current', p_current_count);
      ELSIF p_current_count >= v_plan.max_children THEN
        RETURN jsonb_build_object('allowed', false, 'limit', v_plan.max_children, 'current', p_current_count, 'message', 'You have reached your child profile limit. Upgrade to add more children.');
      ELSE
        RETURN jsonb_build_object('allowed', true, 'limit', v_plan.max_children, 'current', p_current_count);
      END IF;
      
    WHEN 'pantry_foods' THEN
      IF v_plan.max_pantry_foods IS NULL THEN
        RETURN jsonb_build_object('allowed', true, 'limit', NULL, 'current', p_current_count);
      ELSIF p_current_count >= v_plan.max_pantry_foods THEN
        RETURN jsonb_build_object('allowed', false, 'limit', v_plan.max_pantry_foods, 'current', p_current_count, 'message', 'You have reached your pantry food limit. Upgrade for unlimited foods.');
      ELSE
        RETURN jsonb_build_object('allowed', true, 'limit', v_plan.max_pantry_foods, 'current', p_current_count);
      END IF;
      
    WHEN 'ai_coach' THEN
      -- Get today's usage
      SELECT * INTO v_usage
      FROM user_usage_tracking
      WHERE user_id = p_user_id
        AND date = CURRENT_DATE;
        
      IF v_plan.ai_coach_daily_limit IS NULL THEN
        RETURN jsonb_build_object('allowed', true, 'limit', NULL, 'current', COALESCE(v_usage.ai_coach_requests, 0));
      ELSIF v_plan.ai_coach_daily_limit = 0 THEN
        RETURN jsonb_build_object('allowed', false, 'limit', 0, 'current', 0, 'message', 'AI Coach is not available on your plan. Upgrade to access this feature.');
      ELSIF COALESCE(v_usage.ai_coach_requests, 0) >= v_plan.ai_coach_daily_limit THEN
        RETURN jsonb_build_object('allowed', false, 'limit', v_plan.ai_coach_daily_limit, 'current', v_usage.ai_coach_requests, 'message', 'You have reached your daily AI Coach limit. Upgrade for more requests or try again tomorrow.');
      ELSE
        RETURN jsonb_build_object('allowed', true, 'limit', v_plan.ai_coach_daily_limit, 'current', COALESCE(v_usage.ai_coach_requests, 0));
      END IF;
      
    WHEN 'food_tracker' THEN
      -- Get this month's usage
      SELECT SUM(food_tracker_entries) as total INTO v_usage
      FROM user_usage_tracking
      WHERE user_id = p_user_id
        AND date >= date_trunc('month', CURRENT_DATE);
        
      IF v_plan.food_tracker_monthly_limit IS NULL THEN
        RETURN jsonb_build_object('allowed', true, 'limit', NULL, 'current', COALESCE(v_usage.total, 0));
      ELSIF COALESCE(v_usage.total, 0) >= v_plan.food_tracker_monthly_limit THEN
        RETURN jsonb_build_object('allowed', false, 'limit', v_plan.food_tracker_monthly_limit, 'current', v_usage.total, 'message', 'You have reached your monthly food tracking limit. Upgrade for unlimited tracking.');
      ELSE
        RETURN jsonb_build_object('allowed', true, 'limit', v_plan.food_tracker_monthly_limit, 'current', COALESCE(v_usage.total, 0));
      END IF;
      
    WHEN 'food_chaining', 'meal_builder', 'nutrition_tracking' THEN
      CASE p_feature_type
        WHEN 'food_chaining' THEN
          IF NOT v_plan.has_food_chaining THEN
            RETURN jsonb_build_object('allowed', false, 'message', 'Food Chaining is not available on your plan. Upgrade to access this feature.');
          END IF;
        WHEN 'meal_builder' THEN
          IF NOT v_plan.has_meal_builder THEN
            RETURN jsonb_build_object('allowed', false, 'message', 'Meal Builder is not available on your plan. Upgrade to access this feature.');
          END IF;
        WHEN 'nutrition_tracking' THEN
          IF NOT v_plan.has_nutrition_tracking THEN
            RETURN jsonb_build_object('allowed', false, 'message', 'Nutrition Tracking is not available on your plan. Upgrade to access this feature.');
          END IF;
      END CASE;
      RETURN jsonb_build_object('allowed', true);
      
    ELSE
      RETURN jsonb_build_object('allowed', true);
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.check_feature_limit(UUID, TEXT, INTEGER) IS
  'Client-facing plan-limit pre-check for the signed-in user (p_user_id must equal auth.uid() when one is set). Resolves the plan through effective_plan_id so App Store subscribers are not treated as free. The authoritative gate is the enforce_plan_row_limit trigger.';

CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id UUID,
  p_feature_type TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Item 39: a signed-in caller may only bump their own counters.
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'increment_usage: may only be called for the signed-in user'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO user_usage_tracking (user_id, date, ai_coach_requests, food_tracker_entries)
  VALUES (
    p_user_id,
    CURRENT_DATE,
    CASE WHEN p_feature_type = 'ai_coach' THEN 1 ELSE 0 END,
    CASE WHEN p_feature_type = 'food_tracker' THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    ai_coach_requests = user_usage_tracking.ai_coach_requests + CASE WHEN p_feature_type = 'ai_coach' THEN 1 ELSE 0 END,
    food_tracker_entries = user_usage_tracking.food_tracker_entries + CASE WHEN p_feature_type = 'food_tracker' THEN 1 ELSE 0 END,
    updated_at = NOW();
END;
$$;

COMMENT ON FUNCTION public.increment_usage(UUID, TEXT) IS
  'Bumps the daily usage counter for the signed-in user (p_user_id must equal auth.uid() when one is set). service_role may call it for any user.';

-- --- who may call them (US-804: name the roles) -----------------------------
REVOKE ALL ON FUNCTION public.check_feature_limit(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_usage(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_feature_limit(UUID, TEXT, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_usage(UUID, TEXT) TO authenticated, service_role;
