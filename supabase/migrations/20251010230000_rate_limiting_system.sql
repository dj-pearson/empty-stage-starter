-- ============================================================================
-- RATE LIMITING SYSTEM
-- ============================================================================
-- Prevents abuse and controls costs for AI endpoints and sensitive operations

-- Create rate limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint, window_start)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint ON rate_limits(user_id, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup ON rate_limits(created_at);

-- Enable RLS
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own rate limits"
  ON rate_limits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can manage rate limits"
  ON rate_limits FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RATE LIMIT CHECK FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_endpoint TEXT,
  p_max_requests INTEGER,
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(
  allowed BOOLEAN,
  current_count INTEGER,
  limit_exceeded BOOLEAN,
  reset_at TIMESTAMPTZ
) AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  -- Calculate window start (truncated to the minute)
  v_window_start := DATE_TRUNC('minute', NOW()) - (p_window_minutes || ' minutes')::INTERVAL;

  -- Clean up old entries (older than 2 hours)
  DELETE FROM rate_limits
  WHERE created_at < NOW() - INTERVAL '2 hours';

  -- Get current count in the window
  SELECT COALESCE(SUM(request_count), 0)::INTEGER INTO v_count
  FROM rate_limits
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND window_start >= v_window_start;

  -- Check if limit exceeded
  IF v_count >= p_max_requests THEN
    RETURN QUERY SELECT
      FALSE::BOOLEAN,
      v_count,
      TRUE::BOOLEAN,
      (v_window_start + (p_window_minutes || ' minutes')::INTERVAL)::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Increment counter for current minute
  INSERT INTO rate_limits (user_id, endpoint, window_start, request_count)
  VALUES (p_user_id, p_endpoint, DATE_TRUNC('minute', NOW()), 1)
  ON CONFLICT (user_id, endpoint, window_start)
  DO UPDATE SET
    request_count = rate_limits.request_count + 1,
    updated_at = NOW();

  -- Return success
  RETURN QUERY SELECT
    TRUE::BOOLEAN,
    (v_count + 1),
    FALSE::BOOLEAN,
    (v_window_start + (p_window_minutes || ' minutes')::INTERVAL)::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RATE LIMIT CONFIGURATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limit_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT UNIQUE NOT NULL,
  free_tier_limit INTEGER NOT NULL DEFAULT 10,
  premium_tier_limit INTEGER NOT NULL DEFAULT 100,
  enterprise_tier_limit INTEGER NOT NULL DEFAULT 1000,
  window_minutes INTEGER NOT NULL DEFAULT 60,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE rate_limit_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read config
CREATE POLICY "Anyone can read rate limit config"
  ON rate_limit_config FOR SELECT
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage rate limit config"
  ON rate_limit_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Insert default rate limit configurations
INSERT INTO rate_limit_config (endpoint, free_tier_limit, premium_tier_limit, enterprise_tier_limit, window_minutes, description)
VALUES
  ('ai-meal-plan', 5, 50, 500, 60, 'AI meal plan generation'),
  ('suggest-recipe', 10, 100, 1000, 60, 'AI recipe suggestions'),
  ('suggest-recipes-from-pantry', 5, 50, 500, 60, 'AI pantry recipe suggestions'),
  ('suggest-foods', 10, 100, 1000, 60, 'AI food suggestions'),
  ('parse-recipe', 20, 200, 2000, 60, 'Recipe URL parsing'),
  ('identify-food-image', 10, 100, 1000, 60, 'Image food identification'),
  ('lookup-barcode', 50, 500, 5000, 60, 'Barcode lookups'),
  ('calculate-food-similarity', 20, 200, 2000, 60, 'Food chaining calculations')
ON CONFLICT (endpoint) DO NOTHING;

-- ============================================================================
-- SMART RATE LIMIT CHECK (with subscription tier awareness)
-- ============================================================================

CREATE OR REPLACE FUNCTION check_rate_limit_with_tier(
  p_user_id UUID,
  p_endpoint TEXT
)
RETURNS TABLE(
  allowed BOOLEAN,
  current_count INTEGER,
  max_requests INTEGER,
  reset_at TIMESTAMPTZ,
  tier TEXT
) AS $$
DECLARE
  v_config RECORD;
  v_subscription_tier TEXT;
  v_limit INTEGER;
  v_result RECORD;
BEGIN
  -- Get rate limit config
  SELECT * INTO v_config
  FROM rate_limit_config
  WHERE endpoint = p_endpoint
    AND is_active = true;

  IF NOT FOUND THEN
    -- Default fallback if endpoint not configured
    v_limit := 50;
    v_subscription_tier := 'free';
  ELSE
    -- Get user's subscription tier
    -- Note: Defaulting to 'free' tier until subscription columns are added to profiles table
    -- SELECT
    --   CASE
    --     WHEN subscription_tier = 'premium' THEN 'premium'
    --     WHEN subscription_tier = 'enterprise' THEN 'enterprise'
    --     ELSE 'free'
    --   END INTO v_subscription_tier
    -- FROM profiles
    -- WHERE id = p_user_id;
    
    -- Temporary: Default all users to free tier
    v_subscription_tier := 'free';

    -- Set limit based on tier
    v_limit := CASE v_subscription_tier
      WHEN 'enterprise' THEN v_config.enterprise_tier_limit
      WHEN 'premium' THEN v_config.premium_tier_limit
      ELSE v_config.free_tier_limit
    END;
  END IF;

  -- Check rate limit
  SELECT * INTO v_result
  FROM check_rate_limit(p_user_id, p_endpoint, v_limit, COALESCE(v_config.window_minutes, 60));

  -- Return results with tier info
  RETURN QUERY SELECT
    v_result.allowed,
    v_result.current_count,
    v_limit,
    v_result.reset_at,
    v_subscription_tier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RATE LIMIT ANALYTICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW rate_limit_analytics AS
SELECT
  rl.endpoint,
  DATE_TRUNC('hour', rl.window_start) as hour,
  COUNT(DISTINCT rl.user_id) as unique_users,
  SUM(rl.request_count) as total_requests,
  AVG(rl.request_count)::INTEGER as avg_requests_per_user,
  MAX(rl.request_count) as max_requests_by_user,
  COUNT(*) FILTER (WHERE rl.request_count >= (
    SELECT free_tier_limit FROM rate_limit_config WHERE endpoint = rl.endpoint
  )) as users_hitting_limit
FROM rate_limits rl
WHERE rl.window_start >= NOW() - INTERVAL '24 hours'
GROUP BY rl.endpoint, DATE_TRUNC('hour', rl.window_start)
ORDER BY hour DESC, total_requests DESC;

-- ============================================================================
-- CLEANUP JOB FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Delete entries older than 2 hours
  WITH deleted AS (
    DELETE FROM rate_limits
    WHERE created_at < NOW() - INTERVAL '2 hours'
    RETURNING *
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_rate_limits_updated_at
  BEFORE UPDATE ON rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rate_limit_config_updated_at
  BEFORE UPDATE ON rate_limit_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE rate_limits IS 'Tracks API request counts per user per endpoint for rate limiting';
COMMENT ON TABLE rate_limit_config IS 'Configuration for rate limits per endpoint and subscription tier';
COMMENT ON FUNCTION check_rate_limit IS 'Checks if user has exceeded rate limit for endpoint';
COMMENT ON FUNCTION check_rate_limit_with_tier IS 'Smart rate limit check that considers user subscription tier';
COMMENT ON FUNCTION cleanup_rate_limits IS 'Removes old rate limit entries (run hourly)';
COMMENT ON VIEW rate_limit_analytics IS 'Analytics view for monitoring rate limit usage';
