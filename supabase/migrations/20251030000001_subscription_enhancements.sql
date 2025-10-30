-- Enhanced subscription tracking and notifications

-- Add billing cycle tracking to subscriptions
ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly'));

-- Create subscription notifications table
CREATE TABLE IF NOT EXISTS subscription_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- 'limit_warning', 'limit_reached', 'upgrade_suggestion', 'trial_ending', 'payment_failed', 'subscription_ending'
  feature_type TEXT, -- 'children', 'pantry_foods', 'ai_coach', 'food_tracker', etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  action_label TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscription_notifications_user_id ON subscription_notifications(user_id);
CREATE INDEX idx_subscription_notifications_created_at ON subscription_notifications(created_at DESC);
CREATE INDEX idx_subscription_notifications_is_read ON subscription_notifications(is_read) WHERE is_read = FALSE;

ALTER TABLE subscription_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON subscription_notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON subscription_notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Create usage alerts table
CREATE TABLE IF NOT EXISTS usage_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_type TEXT NOT NULL,
  threshold_percentage INTEGER NOT NULL, -- 75, 90, 100
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  notified BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_usage_alerts_user_id ON usage_alerts(user_id);
CREATE INDEX idx_usage_alerts_notified ON usage_alerts(notified) WHERE notified = FALSE;

-- Create index for efficient lookups (not unique, we handle that in the function)
CREATE INDEX idx_usage_alerts_daily_lookup 
  ON usage_alerts(user_id, feature_type, threshold_percentage, triggered_at);

ALTER TABLE usage_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own alerts"
  ON usage_alerts FOR SELECT
  USING (user_id = auth.uid());

-- Function to get user's current usage stats
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
BEGIN
  -- Get user's plan
  SELECT sp.*
  INTO v_plan
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing')
  LIMIT 1;
  
  -- If no subscription, use Free plan
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
  
  -- Build response
  v_stats := jsonb_build_object(
    'plan', jsonb_build_object(
      'name', v_plan.name,
      'max_children', v_plan.max_children,
      'max_pantry_foods', v_plan.max_pantry_foods,
      'ai_coach_daily_limit', v_plan.ai_coach_daily_limit,
      'food_tracker_monthly_limit', v_plan.food_tracker_monthly_limit,
      'has_food_chaining', v_plan.has_food_chaining,
      'has_meal_builder', v_plan.has_meal_builder,
      'has_nutrition_tracking', v_plan.has_nutrition_tracking
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

-- Function to create usage alert
CREATE OR REPLACE FUNCTION create_usage_alert(
  p_user_id UUID,
  p_feature_type TEXT,
  p_threshold_percentage INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
  v_title TEXT;
  v_message TEXT;
  v_existing_alert UUID;
BEGIN
  -- Check if alert already exists for today
  SELECT id INTO v_existing_alert
  FROM usage_alerts
  WHERE user_id = p_user_id
    AND feature_type = p_feature_type
    AND threshold_percentage = p_threshold_percentage
    AND triggered_at::date = CURRENT_DATE;
  
  -- Only create if it doesn't exist
  IF v_existing_alert IS NULL THEN
    INSERT INTO usage_alerts (user_id, feature_type, threshold_percentage)
    VALUES (p_user_id, p_feature_type, p_threshold_percentage);
  END IF;
  
  -- Create appropriate notification
  CASE p_threshold_percentage
    WHEN 75 THEN
      v_title := 'Approaching Limit';
      v_message := 'You''ve used 75% of your ' || p_feature_type || ' limit. Consider upgrading for more.';
    WHEN 90 THEN
      v_title := 'Limit Almost Reached';
      v_message := 'You''ve used 90% of your ' || p_feature_type || ' limit. Upgrade now to avoid interruption.';
    WHEN 100 THEN
      v_title := 'Limit Reached';
      v_message := 'You''ve reached your ' || p_feature_type || ' limit. Upgrade to continue using this feature.';
  END CASE;
  
  -- Insert notification
  INSERT INTO subscription_notifications (
    user_id,
    notification_type,
    feature_type,
    title,
    message,
    action_url,
    action_label,
    metadata
  ) VALUES (
    p_user_id,
    CASE WHEN p_threshold_percentage = 100 THEN 'limit_reached' ELSE 'limit_warning' END,
    p_feature_type,
    v_title,
    v_message,
    '/pricing',
    'Upgrade Now',
    jsonb_build_object('threshold', p_threshold_percentage)
  );
END;
$$;

-- Trigger to check usage thresholds
CREATE OR REPLACE FUNCTION check_usage_thresholds()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_usage_stats JSONB;
  v_feature_usage JSONB;
  v_percentage INTEGER;
BEGIN
  -- Get current usage stats
  v_usage_stats := get_usage_stats(NEW.user_id);
  
  -- Check AI coach usage
  v_feature_usage := v_usage_stats->'usage'->'ai_coach';
  v_percentage := (v_feature_usage->>'percentage')::INTEGER;
  
  IF v_percentage >= 75 AND v_percentage < 90 THEN
    PERFORM create_usage_alert(NEW.user_id, 'ai_coach', 75);
  ELSIF v_percentage >= 90 AND v_percentage < 100 THEN
    PERFORM create_usage_alert(NEW.user_id, 'ai_coach', 90);
  ELSIF v_percentage >= 100 THEN
    PERFORM create_usage_alert(NEW.user_id, 'ai_coach', 100);
  END IF;
  
  -- Check food tracker usage
  v_feature_usage := v_usage_stats->'usage'->'food_tracker';
  v_percentage := (v_feature_usage->>'percentage')::INTEGER;
  
  IF v_percentage >= 75 AND v_percentage < 90 THEN
    PERFORM create_usage_alert(NEW.user_id, 'food_tracker', 75);
  ELSIF v_percentage >= 90 AND v_percentage < 100 THEN
    PERFORM create_usage_alert(NEW.user_id, 'food_tracker', 90);
  ELSIF v_percentage >= 100 THEN
    PERFORM create_usage_alert(NEW.user_id, 'food_tracker', 100);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on usage tracking
DROP TRIGGER IF EXISTS usage_threshold_check ON user_usage_tracking;
CREATE TRIGGER usage_threshold_check
  AFTER INSERT OR UPDATE ON user_usage_tracking
  FOR EACH ROW
  EXECUTE FUNCTION check_usage_thresholds();

-- Function to get unread notifications count
CREATE OR REPLACE FUNCTION get_unread_notifications_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER
  FROM subscription_notifications
  WHERE user_id = p_user_id
    AND is_read = FALSE
    AND dismissed_at IS NULL;
$$;

-- View for subscription dashboard
CREATE OR REPLACE VIEW user_subscription_dashboard AS
SELECT 
  us.user_id,
  sp.name as plan_name,
  sp.price_monthly,
  sp.price_yearly,
  us.status,
  us.billing_cycle,
  us.current_period_start,
  us.current_period_end,
  us.cancel_at_period_end,
  us.trial_end,
  sp.max_children,
  sp.max_pantry_foods,
  sp.ai_coach_daily_limit,
  sp.food_tracker_monthly_limit,
  sp.has_food_chaining,
  sp.has_meal_builder,
  sp.has_nutrition_tracking,
  sp.has_multi_household,
  -- Calculate days until renewal/cancellation
  CASE 
    WHEN us.current_period_end IS NOT NULL THEN
      EXTRACT(DAY FROM (us.current_period_end - NOW()))::INTEGER
    ELSE NULL
  END as days_until_renewal,
  -- Unread notifications
  (SELECT COUNT(*) FROM subscription_notifications 
   WHERE user_id = us.user_id AND is_read = FALSE AND dismissed_at IS NULL) as unread_notifications
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.status IN ('active', 'trialing', 'past_due');

-- Grant access to view
GRANT SELECT ON user_subscription_dashboard TO authenticated;

