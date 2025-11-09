-- Fix subscription system to properly handle complementary subscriptions
-- and improve usage stat checking

-- Update get_usage_stats to check for complementary subscriptions
CREATE OR REPLACE FUNCTION get_usage_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan RECORD;
  v_stats JSONB;
  v_children_count INTEGER;
  v_pantry_foods_count INTEGER;
  v_today_ai_requests INTEGER;
  v_month_food_tracker INTEGER;
  v_is_complementary BOOLEAN := FALSE;
BEGIN
  -- Get user's plan (check for active complementary subscription first)
  SELECT sp.*, us.is_complementary
  INTO v_plan
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing')
  LIMIT 1;

  -- Store complementary status
  IF v_plan IS NOT NULL THEN
    v_is_complementary := COALESCE(v_plan.is_complementary, FALSE);
  END IF;

  -- If no paid/trial subscription, check for active complementary subscription
  IF v_plan IS NULL THEN
    SELECT sp.*, TRUE as is_complementary
    INTO v_plan
    FROM complementary_subscriptions cs
    JOIN subscription_plans sp ON cs.plan_id = sp.id
    WHERE cs.user_id = p_user_id
      AND cs.status = 'active'
      AND (cs.end_date IS NULL OR cs.end_date >= NOW())
    ORDER BY cs.created_at DESC
    LIMIT 1;

    IF v_plan IS NOT NULL THEN
      v_is_complementary := TRUE;
    END IF;
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

-- Function to check if user has active complementary subscription
CREATE OR REPLACE FUNCTION has_active_complementary_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_complementary BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM complementary_subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND (end_date IS NULL OR end_date >= NOW())
  ) INTO v_has_complementary;

  RETURN COALESCE(v_has_complementary, FALSE);
END;
$$;

-- Function to get complementary subscription details
-- Drop existing function first to allow return type change
DROP FUNCTION IF EXISTS get_complementary_subscription(UUID);

CREATE OR REPLACE FUNCTION get_complementary_subscription(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  plan_id UUID,
  plan_name TEXT,
  is_permanent BOOLEAN,
  end_date TIMESTAMPTZ,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cs.id,
    cs.plan_id,
    sp.name as plan_name,
    cs.is_permanent,
    cs.end_date,
    cs.reason
  FROM complementary_subscriptions cs
  JOIN subscription_plans sp ON cs.plan_id = sp.id
  WHERE cs.user_id = p_user_id
    AND cs.status = 'active'
    AND (cs.end_date IS NULL OR cs.end_date >= NOW())
  ORDER BY cs.created_at DESC
  LIMIT 1;
END;
$$;

-- Update user_subscription_dashboard view to include complementary info
DROP VIEW IF EXISTS user_subscription_dashboard;
CREATE OR REPLACE VIEW user_subscription_dashboard AS
SELECT
  us.user_id,
  us.plan_id,
  sp.name as plan_name,
  us.status,
  us.billing_cycle,
  us.current_period_end,
  us.cancel_at_period_end,
  us.trial_end,
  us.is_complementary,
  us.complementary_subscription_id,
  CASE
    WHEN us.current_period_end IS NOT NULL THEN
      EXTRACT(DAY FROM (us.current_period_end - NOW()))::INTEGER
    ELSE NULL
  END as days_until_renewal,
  (
    SELECT COUNT(*)::INTEGER
    FROM subscription_notifications sn
    WHERE sn.user_id = us.user_id
      AND sn.is_read = FALSE
      AND sn.dismissed_at IS NULL
  ) as unread_notifications_count,
  -- Add complementary subscription details if applicable
  CASE
    WHEN us.is_complementary = TRUE THEN (
      SELECT jsonb_build_object(
        'is_permanent', cs.is_permanent,
        'end_date', cs.end_date,
        'reason', cs.reason
      )
      FROM complementary_subscriptions cs
      WHERE cs.id = us.complementary_subscription_id
    )
    ELSE NULL
  END as complementary_details
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id;

COMMENT ON VIEW user_subscription_dashboard IS 'Comprehensive view of user subscriptions including complementary access';
