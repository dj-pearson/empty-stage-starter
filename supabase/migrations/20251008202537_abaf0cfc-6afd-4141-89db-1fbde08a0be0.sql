-- Update subscription plans with new pricing tiers

-- First, update the subscription_plans table to support more features
ALTER TABLE subscription_plans 
ADD COLUMN IF NOT EXISTS max_pantry_foods INTEGER,
ADD COLUMN IF NOT EXISTS ai_coach_daily_limit INTEGER,
ADD COLUMN IF NOT EXISTS food_tracker_monthly_limit INTEGER,
ADD COLUMN IF NOT EXISTS has_food_chaining BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_meal_builder BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_nutrition_tracking BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_multi_household BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS max_therapists INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_white_label BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS support_level TEXT DEFAULT 'email';

-- Delete existing plans to avoid conflicts
DELETE FROM subscription_plans;

-- Insert Free tier
INSERT INTO subscription_plans (
  name, 
  price_monthly, 
  price_yearly,
  max_children,
  max_pantry_foods,
  ai_coach_daily_limit,
  food_tracker_monthly_limit,
  has_food_chaining,
  has_meal_builder,
  has_nutrition_tracking,
  has_multi_household,
  max_therapists,
  has_white_label,
  support_level,
  features,
  sort_order,
  is_active
) VALUES (
  'Free',
  0,
  0,
  1,
  50,
  0,
  10,
  false,
  false,
  false,
  false,
  0,
  false,
  'email',
  '["1 child profile", "50 pantry foods", "10 food tracker entries/month", "Email support"]'::jsonb,
  1,
  true
);

-- Insert Pro tier
INSERT INTO subscription_plans (
  name,
  price_monthly,
  price_yearly,
  max_children,
  max_pantry_foods,
  ai_coach_daily_limit,
  food_tracker_monthly_limit,
  has_food_chaining,
  has_meal_builder,
  has_nutrition_tracking,
  has_multi_household,
  max_therapists,
  has_white_label,
  support_level,
  features,
  sort_order,
  is_active
) VALUES (
  'Pro',
  14.99,
  143.90,
  3,
  NULL,
  20,
  NULL,
  true,
  true,
  true,
  false,
  0,
  false,
  'priority',
  '["3 children profiles", "Unlimited pantry foods", "20 AI coach requests/day", "Unlimited food tracking", "Food chaining recommendations", "Kid meal builder", "Nutrition tracking", "Priority support"]'::jsonb,
  2,
  true
);

-- Insert Family Plus tier  
INSERT INTO subscription_plans (
  name,
  price_monthly,
  price_yearly,
  max_children,
  max_pantry_foods,
  ai_coach_daily_limit,
  food_tracker_monthly_limit,
  has_food_chaining,
  has_meal_builder,
  has_nutrition_tracking,
  has_multi_household,
  max_therapists,
  has_white_label,
  support_level,
  features,
  sort_order,
  is_active
) VALUES (
  'Family Plus',
  24.99,
  239.90,
  NULL,
  NULL,
  NULL,
  NULL,
  true,
  true,
  true,
  true,
  1,
  false,
  'priority',
  '["Unlimited children profiles", "Unlimited pantry foods", "Unlimited AI coach", "Unlimited food tracking", "Food chaining recommendations", "Kid meal builder", "Nutrition tracking", "Multi-household sharing", "1 therapist collaboration", "Priority support"]'::jsonb,
  3,
  true
);

-- Insert Professional tier
INSERT INTO subscription_plans (
  name,
  price_monthly,
  price_yearly,
  max_children,
  max_pantry_foods,
  ai_coach_daily_limit,
  food_tracker_monthly_limit,
  has_food_chaining,
  has_meal_builder,
  has_nutrition_tracking,
  has_multi_household,
  max_therapists,
  has_white_label,
  support_level,
  features,
  sort_order,
  is_active
) VALUES (
  'Professional',
  99,
  950,
  NULL,
  NULL,
  NULL,
  NULL,
  true,
  true,
  true,
  false,
  NULL,
  true,
  'phone',
  '["Client management system", "Unlimited pantry foods", "Unlimited AI coach", "Unlimited food tracking", "Food chaining recommendations", "Kid meal builder", "Nutrition tracking", "Full professional portal", "White label branding", "Phone + Email support"]'::jsonb,
  4,
  true
);

-- Create usage tracking table
CREATE TABLE IF NOT EXISTS user_usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  ai_coach_requests INTEGER DEFAULT 0,
  food_tracker_entries INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE user_usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage"
  ON user_usage_tracking FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own usage"
  ON user_usage_tracking FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own usage"
  ON user_usage_tracking FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to check if user has reached feature limit
CREATE OR REPLACE FUNCTION check_feature_limit(
  p_user_id UUID,
  p_feature_type TEXT,
  p_current_count INTEGER DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription RECORD;
  v_plan RECORD;
  v_usage RECORD;
  v_result JSONB;
BEGIN
  -- Get user's active subscription
  SELECT us.*, sp.*
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing')
  LIMIT 1;
  
  -- If no subscription, use Free plan limits
  IF v_subscription IS NULL THEN
    SELECT * INTO v_plan
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;
  ELSE
    v_plan := v_subscription;
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

-- Function to increment usage
CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_feature_type TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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