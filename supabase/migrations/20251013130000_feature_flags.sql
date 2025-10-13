-- =====================================================
-- FEATURE FLAG MANAGEMENT SYSTEM
-- =====================================================
-- Purpose: Admin-controlled feature rollout and A/B testing
-- Features: Percentage rollouts, user targeting, gradual deployment

-- =====================================================
-- 1. FEATURE FLAGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL CHECK (key ~ '^[a-z0-9_-]+$'),
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT FALSE NOT NULL,
  rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  targeting_rules JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}', -- Additional flag info
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

-- Indexes
CREATE INDEX idx_feature_flags_key ON feature_flags(key);
CREATE INDEX idx_feature_flags_enabled ON feature_flags(enabled);
CREATE INDEX idx_feature_flags_rollout ON feature_flags(rollout_percentage);

-- Enable RLS
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view enabled flags"
  ON feature_flags
  FOR SELECT
  USING (enabled = TRUE);

CREATE POLICY "Admins can manage all flags"
  ON feature_flags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 2. FEATURE FLAG EVALUATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS feature_flag_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_key TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,
  evaluation_reason TEXT, -- 'enabled', 'disabled', 'rollout', 'targeting'
  evaluated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(flag_key, user_id, evaluated_at)
);

-- Indexes for analytics
CREATE INDEX idx_flag_evaluations_flag_key ON feature_flag_evaluations(flag_key);
CREATE INDEX idx_flag_evaluations_user ON feature_flag_evaluations(user_id);
CREATE INDEX idx_flag_evaluations_evaluated ON feature_flag_evaluations(evaluated_at DESC);
CREATE INDEX idx_flag_evaluations_combined ON feature_flag_evaluations(flag_key, enabled, evaluated_at DESC);

-- Enable RLS
ALTER TABLE feature_flag_evaluations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own evaluations"
  ON feature_flag_evaluations
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all evaluations"
  ON feature_flag_evaluations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 3. FLAG ANALYTICS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS feature_flag_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_key TEXT NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'adoption_rate',
    'user_count',
    'error_rate',
    'performance_impact',
    'feedback_score'
  )),
  metric_value NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_flag_analytics_flag_key ON feature_flag_analytics(flag_key);
CREATE INDEX idx_flag_analytics_type ON feature_flag_analytics(metric_type);
CREATE INDEX idx_flag_analytics_recorded ON feature_flag_analytics(recorded_at DESC);

-- Enable RLS
ALTER TABLE feature_flag_analytics ENABLE ROW LEVEL SECURITY;

-- Policy: Admins only
CREATE POLICY "Admins can view flag analytics"
  ON feature_flag_analytics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 4. HELPER FUNCTIONS
-- =====================================================

-- Function to evaluate a feature flag for a user
CREATE OR REPLACE FUNCTION evaluate_feature_flag(
  p_flag_key TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_flag RECORD;
  v_enabled BOOLEAN := FALSE;
  v_reason TEXT := 'disabled';
  v_user_hash INTEGER;
BEGIN
  -- Get flag configuration
  SELECT * INTO v_flag FROM feature_flags WHERE key = p_flag_key;
  
  -- If flag doesn't exist, return false
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- If flag is disabled globally, return false
  IF v_flag.enabled = FALSE THEN
    v_enabled := FALSE;
    v_reason := 'disabled';
  ELSE
    -- Check targeting rules first
    IF v_flag.targeting_rules IS NOT NULL AND v_flag.targeting_rules != '{}'::jsonb THEN
      -- Check user role targeting
      IF v_flag.targeting_rules ? 'roles' THEN
        IF EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_id = p_user_id
          AND role::text = ANY(
            SELECT jsonb_array_elements_text(v_flag.targeting_rules->'roles')
          )
        ) THEN
          v_enabled := TRUE;
          v_reason := 'targeting_role';
        END IF;
      END IF;
      
      -- Check email domain targeting
      IF NOT v_enabled AND v_flag.targeting_rules ? 'email_domains' THEN
        IF EXISTS (
          SELECT 1 FROM auth.users
          WHERE id = p_user_id
          AND email LIKE ANY(
            SELECT '%@' || jsonb_array_elements_text(v_flag.targeting_rules->'email_domains')
          )
        ) THEN
          v_enabled := TRUE;
          v_reason := 'targeting_email_domain';
        END IF;
      END IF;
      
      -- Check specific user IDs
      IF NOT v_enabled AND v_flag.targeting_rules ? 'user_ids' THEN
        IF v_flag.targeting_rules->'user_ids' ? p_user_id::text THEN
          v_enabled := TRUE;
          v_reason := 'targeting_user_id';
        END IF;
      END IF;
    END IF;
    
    -- If not enabled by targeting, check rollout percentage
    IF NOT v_enabled THEN
      -- Use consistent hashing based on user ID and flag key
      v_user_hash := ABS(HASHTEXT(p_user_id::text || p_flag_key));
      
      IF (v_user_hash % 100) < v_flag.rollout_percentage THEN
        v_enabled := TRUE;
        v_reason := 'rollout';
      ELSE
        v_enabled := FALSE;
        v_reason := 'rollout_excluded';
      END IF;
    END IF;
  END IF;
  
  -- Log evaluation (async, don't fail if logging fails)
  BEGIN
    INSERT INTO feature_flag_evaluations (flag_key, user_id, enabled, evaluation_reason)
    VALUES (p_flag_key, p_user_id, v_enabled, v_reason);
  EXCEPTION WHEN OTHERS THEN
    -- Silently continue if logging fails
    NULL;
  END;
  
  RETURN v_enabled;
END;
$$;

-- Function to get all flags for a user
CREATE OR REPLACE FUNCTION get_user_feature_flags(p_user_id UUID)
RETURNS TABLE (
  flag_key TEXT,
  enabled BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    key as flag_key,
    evaluate_feature_flag(key, p_user_id) as enabled
  FROM feature_flags
  WHERE feature_flags.enabled = TRUE;
$$;

-- Function to get flag analytics
CREATE OR REPLACE FUNCTION get_flag_adoption_stats(p_flag_key TEXT, p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  total_evaluations BIGINT,
  enabled_count BIGINT,
  adoption_rate NUMERIC,
  unique_users BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    COUNT(*) as total_evaluations,
    COUNT(*) FILTER (WHERE enabled = TRUE) as enabled_count,
    ROUND((COUNT(*) FILTER (WHERE enabled = TRUE)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) as adoption_rate,
    COUNT(DISTINCT user_id) as unique_users
  FROM feature_flag_evaluations
  WHERE flag_key = p_flag_key
    AND evaluated_at >= NOW() - (p_days || ' days')::INTERVAL;
$$;

-- =====================================================
-- 5. AUTO-UPDATE TIMESTAMP TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION update_feature_flag_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_feature_flag_timestamp
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_flag_timestamp();

-- =====================================================
-- 6. VIEWS FOR ADMIN DASHBOARD
-- =====================================================

-- View: Flag status summary
CREATE OR REPLACE VIEW feature_flag_summary AS
SELECT 
  ff.id,
  ff.key,
  ff.name,
  ff.description,
  ff.enabled,
  ff.rollout_percentage,
  ff.created_at,
  ff.updated_at,
  COUNT(DISTINCT ffe.user_id) FILTER (WHERE ffe.evaluated_at >= NOW() - INTERVAL '7 days') as users_last_7d,
  COUNT(*) FILTER (WHERE ffe.enabled = TRUE AND ffe.evaluated_at >= NOW() - INTERVAL '7 days') as enabled_count_7d,
  ROUND(
    (COUNT(*) FILTER (WHERE ffe.enabled = TRUE AND ffe.evaluated_at >= NOW() - INTERVAL '7 days')::NUMERIC / 
     NULLIF(COUNT(*) FILTER (WHERE ffe.evaluated_at >= NOW() - INTERVAL '7 days'), 0)) * 100, 
    2
  ) as adoption_rate_7d
FROM feature_flags ff
LEFT JOIN feature_flag_evaluations ffe ON ffe.flag_key = ff.key
GROUP BY ff.id, ff.key, ff.name, ff.description, ff.enabled, ff.rollout_percentage, ff.created_at, ff.updated_at;

-- =====================================================
-- 7. SEED DATA - DEFAULT FLAGS
-- =====================================================

INSERT INTO feature_flags (key, name, description, enabled, rollout_percentage, created_by)
VALUES 
  (
    'gamification_badges',
    'Gamification Badges',
    'Enable achievement badges and progress tracking',
    FALSE,
    0,
    NULL
  ),
  (
    'social_sharing',
    'Social Sharing',
    'Allow users to share meal plans on social media',
    FALSE,
    0,
    NULL
  ),
  (
    'ai_meal_suggestions',
    'AI Meal Suggestions',
    'Enhanced AI-powered meal plan suggestions',
    FALSE,
    0,
    NULL
  ),
  (
    'advanced_analytics',
    'Advanced Analytics',
    'Show detailed analytics and insights',
    FALSE,
    0,
    NULL
  ),
  (
    'push_notifications',
    'Push Notifications',
    'Enable browser push notifications for reminders',
    FALSE,
    0,
    NULL
  )
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

GRANT ALL ON feature_flags TO service_role;
GRANT ALL ON feature_flag_evaluations TO service_role;
GRANT ALL ON feature_flag_analytics TO service_role;

GRANT EXECUTE ON FUNCTION evaluate_feature_flag TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION get_user_feature_flags TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION get_flag_adoption_stats TO service_role;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

COMMENT ON TABLE feature_flags IS 'Feature flags for controlled rollout and A/B testing';
COMMENT ON TABLE feature_flag_evaluations IS 'Log of feature flag evaluations for analytics';
COMMENT ON TABLE feature_flag_analytics IS 'Aggregated analytics for feature flag performance';
COMMENT ON FUNCTION evaluate_feature_flag IS 'Evaluates if a feature flag is enabled for a specific user';
COMMENT ON FUNCTION get_user_feature_flags IS 'Returns all feature flags for a user with their enabled status';

