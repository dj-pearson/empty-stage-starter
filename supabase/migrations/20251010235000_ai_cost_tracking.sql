-- ============================================================================
-- AI COST TRACKING SYSTEM
-- ============================================================================
-- Track and monitor AI API costs with budgets and alerts

-- ============================================================================
-- AI USAGE LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  model TEXT, -- e.g., 'gpt-4', 'gpt-3.5-turbo', 'claude-3-opus'

  -- Token usage
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,

  -- Cost tracking (in cents)
  prompt_cost_cents DECIMAL(10, 4),
  completion_cost_cents DECIMAL(10, 4),
  total_cost_cents DECIMAL(10, 4),

  -- Request details
  request_duration_ms INTEGER,
  status TEXT, -- 'success', 'error', 'timeout'
  error_message TEXT,

  -- Metadata
  request_metadata JSONB,
  response_metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user ON ai_usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_endpoint ON ai_usage_logs(endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_date ON ai_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_cost ON ai_usage_logs(total_cost_cents DESC);

-- Enable RLS
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own logs
CREATE POLICY "Users can view their own AI usage logs"
  ON ai_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all logs
CREATE POLICY "Admins can view all AI usage logs"
  ON ai_usage_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- System can insert logs
CREATE POLICY "System can insert AI usage logs"
  ON ai_usage_logs FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- AI COST BUDGETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_cost_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_name TEXT NOT NULL,
  budget_type TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'

  -- Budget limits (in cents)
  free_tier_limit_cents INTEGER NOT NULL DEFAULT 100, -- $1.00
  premium_tier_limit_cents INTEGER NOT NULL DEFAULT 1000, -- $10.00
  enterprise_tier_limit_cents INTEGER NOT NULL DEFAULT 10000, -- $100.00

  -- Alert thresholds (percentage of limit)
  warning_threshold_pct INTEGER DEFAULT 80,
  critical_threshold_pct INTEGER DEFAULT 95,

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ai_cost_budgets ENABLE ROW LEVEL SECURITY;

-- Anyone can read active budgets
CREATE POLICY "Anyone can read active budgets"
  ON ai_cost_budgets FOR SELECT
  USING (is_active = true);

-- Only admins can manage budgets
CREATE POLICY "Admins can manage budgets"
  ON ai_cost_budgets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Insert default budget
INSERT INTO ai_cost_budgets (budget_name, budget_type, free_tier_limit_cents, premium_tier_limit_cents, enterprise_tier_limit_cents)
VALUES ('Daily AI Budget', 'daily', 100, 1000, 10000)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- AI MODEL PRICING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL, -- 'openai', 'anthropic', etc.

  -- Pricing per 1M tokens (in cents)
  prompt_price_per_1m_tokens INTEGER NOT NULL,
  completion_price_per_1m_tokens INTEGER NOT NULL,

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ai_model_pricing ENABLE ROW LEVEL SECURITY;

-- Anyone can read pricing
CREATE POLICY "Anyone can read AI model pricing"
  ON ai_model_pricing FOR SELECT
  USING (true);

-- Only admins can manage pricing
CREATE POLICY "Admins can manage AI model pricing"
  ON ai_model_pricing FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Insert default pricing (OpenAI GPT-4 Turbo as of 2024)
INSERT INTO ai_model_pricing (model_name, provider, prompt_price_per_1m_tokens, completion_price_per_1m_tokens) VALUES
('gpt-4-turbo', 'openai', 1000, 3000), -- $10/$30 per 1M tokens
('gpt-4', 'openai', 3000, 6000), -- $30/$60 per 1M tokens
('gpt-3.5-turbo', 'openai', 50, 150), -- $0.50/$1.50 per 1M tokens
('claude-3-opus', 'anthropic', 1500, 7500), -- $15/$75 per 1M tokens
('claude-3-sonnet', 'anthropic', 300, 1500), -- $3/$15 per 1M tokens
('claude-3-haiku', 'anthropic', 25, 125) -- $0.25/$1.25 per 1M tokens
ON CONFLICT (model_name) DO NOTHING;

-- ============================================================================
-- FUNCTION: LOG AI USAGE
-- ============================================================================

CREATE OR REPLACE FUNCTION log_ai_usage(
  p_user_id UUID,
  p_endpoint TEXT,
  p_model TEXT,
  p_prompt_tokens INTEGER,
  p_completion_tokens INTEGER,
  p_request_duration_ms INTEGER DEFAULT NULL,
  p_status TEXT DEFAULT 'success',
  p_error_message TEXT DEFAULT NULL,
  p_request_metadata JSONB DEFAULT '{}'::jsonb,
  p_response_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_pricing RECORD;
  v_prompt_cost_cents DECIMAL(10, 4);
  v_completion_cost_cents DECIMAL(10, 4);
  v_total_cost_cents DECIMAL(10, 4);
  v_log_id UUID;
BEGIN
  -- Get pricing for model
  SELECT * INTO v_pricing
  FROM ai_model_pricing
  WHERE model_name = p_model
    AND is_active = true;

  IF FOUND THEN
    -- Calculate costs
    v_prompt_cost_cents := (p_prompt_tokens::DECIMAL / 1000000) * v_pricing.prompt_price_per_1m_tokens;
    v_completion_cost_cents := (p_completion_tokens::DECIMAL / 1000000) * v_pricing.completion_price_per_1m_tokens;
    v_total_cost_cents := v_prompt_cost_cents + v_completion_cost_cents;
  ELSE
    -- Default fallback cost estimation if model not found
    v_prompt_cost_cents := (p_prompt_tokens::DECIMAL / 1000000) * 1000; -- $10 per 1M tokens
    v_completion_cost_cents := (p_completion_tokens::DECIMAL / 1000000) * 3000; -- $30 per 1M tokens
    v_total_cost_cents := v_prompt_cost_cents + v_completion_cost_cents;
  END IF;

  -- Insert usage log
  INSERT INTO ai_usage_logs (
    user_id,
    endpoint,
    model,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    prompt_cost_cents,
    completion_cost_cents,
    total_cost_cents,
    request_duration_ms,
    status,
    error_message,
    request_metadata,
    response_metadata
  ) VALUES (
    p_user_id,
    p_endpoint,
    p_model,
    p_prompt_tokens,
    p_completion_tokens,
    p_prompt_tokens + p_completion_tokens,
    v_prompt_cost_cents,
    v_completion_cost_cents,
    v_total_cost_cents,
    p_request_duration_ms,
    p_status,
    p_error_message,
    p_request_metadata,
    p_response_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: CHECK AI BUDGET
-- ============================================================================

CREATE OR REPLACE FUNCTION check_ai_budget(
  p_user_id UUID,
  p_budget_type TEXT DEFAULT 'daily'
)
RETURNS TABLE(
  within_budget BOOLEAN,
  current_spend_cents DECIMAL(10, 4),
  budget_limit_cents INTEGER,
  percentage_used DECIMAL(5, 2),
  alert_level TEXT
) AS $$
DECLARE
  v_budget RECORD;
  v_subscription_tier TEXT;
  v_limit_cents INTEGER;
  v_current_spend DECIMAL(10, 4);
  v_period_start TIMESTAMPTZ;
  v_percentage DECIMAL(5, 2);
  v_alert_level TEXT;
BEGIN
  -- Get budget configuration
  SELECT * INTO v_budget
  FROM ai_cost_budgets
  WHERE budget_type = p_budget_type
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    -- Return default values if no budget configured
    RETURN QUERY SELECT true, 0::DECIMAL, 0, 0::DECIMAL, 'none'::TEXT;
    RETURN;
  END IF;

  -- Get user's subscription tier (default to free if not set)
  v_subscription_tier := 'free';

  -- Set limit based on tier
  v_limit_cents := CASE v_subscription_tier
    WHEN 'enterprise' THEN v_budget.enterprise_tier_limit_cents
    WHEN 'premium' THEN v_budget.premium_tier_limit_cents
    ELSE v_budget.free_tier_limit_cents
  END;

  -- Calculate period start
  v_period_start := CASE p_budget_type
    WHEN 'daily' THEN DATE_TRUNC('day', NOW())
    WHEN 'weekly' THEN DATE_TRUNC('week', NOW())
    WHEN 'monthly' THEN DATE_TRUNC('month', NOW())
    ELSE DATE_TRUNC('day', NOW())
  END;

  -- Get current spend for period
  SELECT COALESCE(SUM(total_cost_cents), 0) INTO v_current_spend
  FROM ai_usage_logs
  WHERE user_id = p_user_id
    AND created_at >= v_period_start
    AND status = 'success';

  -- Calculate percentage
  v_percentage := (v_current_spend / NULLIF(v_limit_cents, 0)) * 100;

  -- Determine alert level
  v_alert_level := CASE
    WHEN v_percentage >= v_budget.critical_threshold_pct THEN 'critical'
    WHEN v_percentage >= v_budget.warning_threshold_pct THEN 'warning'
    ELSE 'ok'
  END;

  -- Return result
  RETURN QUERY SELECT
    v_current_spend < v_limit_cents,
    v_current_spend,
    v_limit_cents,
    v_percentage,
    v_alert_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- AI COST ANALYTICS VIEWS
-- ============================================================================

-- Daily cost summary
CREATE OR REPLACE VIEW ai_cost_daily_summary AS
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_requests,
  COUNT(DISTINCT user_id) as unique_users,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost_cents) as total_cost_cents,
  ROUND(SUM(total_cost_cents) / 100.0, 2) as total_cost_dollars,
  AVG(total_cost_cents) as avg_cost_per_request_cents,
  AVG(request_duration_ms) as avg_duration_ms,
  COUNT(*) FILTER (WHERE status = 'error') as error_count
FROM ai_usage_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Cost by endpoint
CREATE OR REPLACE VIEW ai_cost_by_endpoint AS
SELECT
  endpoint,
  COUNT(*) as total_requests,
  COUNT(DISTINCT user_id) as unique_users,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost_cents) as total_cost_cents,
  ROUND(SUM(total_cost_cents) / 100.0, 2) as total_cost_dollars,
  AVG(total_cost_cents) as avg_cost_per_request_cents,
  AVG(total_tokens) as avg_tokens_per_request,
  AVG(request_duration_ms) as avg_duration_ms
FROM ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY endpoint
ORDER BY total_cost_cents DESC;

-- Cost by user
CREATE OR REPLACE VIEW ai_cost_by_user AS
SELECT
  al.user_id,
  p.full_name,
  COUNT(*) as total_requests,
  SUM(al.total_tokens) as total_tokens,
  SUM(al.total_cost_cents) as total_cost_cents,
  ROUND(SUM(al.total_cost_cents) / 100.0, 2) as total_cost_dollars,
  MAX(al.created_at) as last_request_at,

  -- Current month spend
  SUM(al.total_cost_cents) FILTER (WHERE al.created_at >= DATE_TRUNC('month', NOW())) as current_month_cost_cents,

  -- Budget check
  (SELECT budget_limit_cents FROM check_ai_budget(al.user_id, 'monthly') LIMIT 1) as monthly_budget_cents
FROM ai_usage_logs al
JOIN profiles p ON p.id = al.user_id
WHERE al.created_at >= NOW() - INTERVAL '90 days'
GROUP BY al.user_id, p.full_name
ORDER BY total_cost_cents DESC;

-- Cost by model
CREATE OR REPLACE VIEW ai_cost_by_model AS
SELECT
  model,
  COUNT(*) as total_requests,
  COUNT(DISTINCT user_id) as unique_users,
  SUM(total_tokens) as total_tokens,
  SUM(prompt_tokens) as total_prompt_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  SUM(total_cost_cents) as total_cost_cents,
  ROUND(SUM(total_cost_cents) / 100.0, 2) as total_cost_dollars,
  AVG(total_cost_cents) as avg_cost_per_request_cents,
  AVG(request_duration_ms) as avg_duration_ms
FROM ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND model IS NOT NULL
GROUP BY model
ORDER BY total_cost_cents DESC;

-- ============================================================================
-- TRIGGER: CHECK BUDGET ON NEW REQUEST
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_budget_alert()
RETURNS TRIGGER AS $$
DECLARE
  v_budget_check RECORD;
BEGIN
  -- Check daily budget
  SELECT * INTO v_budget_check
  FROM check_ai_budget(NEW.user_id, 'daily');

  -- Create alert if critical threshold reached
  IF v_budget_check.alert_level = 'critical' THEN
    PERFORM create_admin_notification(
      'alert',
      'high',
      'AI Budget Critical',
      'User has exceeded ' || v_budget_check.percentage_used || '% of daily AI budget',
      jsonb_build_object(
        'user_id', NEW.user_id,
        'current_spend_cents', v_budget_check.current_spend_cents,
        'budget_limit_cents', v_budget_check.budget_limit_cents,
        'percentage_used', v_budget_check.percentage_used
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_ai_usage_check_budget
  AFTER INSERT ON ai_usage_logs
  FOR EACH ROW
  WHEN (NEW.status = 'success')
  EXECUTE FUNCTION trigger_budget_alert();

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_ai_cost_budgets_updated_at
  BEFORE UPDATE ON ai_cost_budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_model_pricing_updated_at
  BEFORE UPDATE ON ai_model_pricing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE ai_usage_logs IS 'Detailed logs of AI API usage with token and cost tracking';
COMMENT ON TABLE ai_cost_budgets IS 'Budget limits and alert thresholds for AI spending';
COMMENT ON TABLE ai_model_pricing IS 'Pricing information for AI models';
COMMENT ON FUNCTION log_ai_usage IS 'Log AI API usage with automatic cost calculation';
COMMENT ON FUNCTION check_ai_budget IS 'Check if user is within AI budget and return alert level';
COMMENT ON VIEW ai_cost_daily_summary IS 'Daily AI cost and usage summary';
COMMENT ON VIEW ai_cost_by_endpoint IS 'AI cost breakdown by endpoint';
COMMENT ON VIEW ai_cost_by_user IS 'AI cost breakdown by user';
COMMENT ON VIEW ai_cost_by_model IS 'AI cost breakdown by AI model';
