-- =====================================================
-- ADMIN LIVE ACTIVITY FEED & ALERTS SYSTEM
-- =====================================================
-- Purpose: Real-time monitoring of user actions and system events
-- Features: Activity stream, automated alerts, system health tracking

-- =====================================================
-- 1. ACTIVITY FEED TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_live_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'signup',
    'login',
    'logout',
    'meal_plan_created',
    'meal_plan_updated',
    'grocery_list_created',
    'recipe_created',
    'pantry_item_added',
    'kid_added',
    'subscription_created',
    'subscription_updated',
    'subscription_cancelled',
    'payment_success',
    'payment_failed',
    'ai_query',
    'error',
    'api_call',
    'feature_used'
  )),
  activity_data JSONB NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}', -- browser, IP, device type, etc.
  severity TEXT CHECK (severity IN ('info', 'warning', 'error', 'critical')) DEFAULT 'info',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast filtering and querying
CREATE INDEX idx_admin_activity_type ON admin_live_activity(activity_type);
CREATE INDEX idx_admin_activity_user ON admin_live_activity(user_id);
CREATE INDEX idx_admin_activity_created ON admin_live_activity(created_at DESC);
CREATE INDEX idx_admin_activity_severity ON admin_live_activity(severity);
CREATE INDEX idx_admin_activity_combined ON admin_live_activity(activity_type, created_at DESC);

-- Enable RLS
ALTER TABLE admin_live_activity ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view activity
CREATE POLICY "Admins can view all activity"
  ON admin_live_activity
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 2. ADMIN ALERTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'error_spike',
    'signup_drop',
    'high_api_cost',
    'payment_failure',
    'abuse_detection',
    'server_downtime',
    'low_activity',
    'feature_adoption'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  alert_data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_admin_alerts_type ON admin_alerts(alert_type);
CREATE INDEX idx_admin_alerts_severity ON admin_alerts(severity);
CREATE INDEX idx_admin_alerts_unread ON admin_alerts(is_read) WHERE is_read = FALSE;
CREATE INDEX idx_admin_alerts_unresolved ON admin_alerts(is_resolved) WHERE is_resolved = FALSE;
CREATE INDEX idx_admin_alerts_created ON admin_alerts(created_at DESC);

-- Enable RLS
ALTER TABLE admin_alerts ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view alerts
CREATE POLICY "Admins can view all alerts"
  ON admin_alerts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Policy: Only admins can update alerts
CREATE POLICY "Admins can update alerts"
  ON admin_alerts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 3. ALERT PREFERENCES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_alert_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  email_enabled BOOLEAN DEFAULT TRUE,
  push_enabled BOOLEAN DEFAULT TRUE,
  threshold_value INTEGER, -- e.g., errors per minute
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(admin_id, alert_type)
);

-- Enable RLS
ALTER TABLE admin_alert_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can manage their own preferences
CREATE POLICY "Admins can manage own alert preferences"
  ON admin_alert_preferences
  FOR ALL
  USING (admin_id = auth.uid());

-- =====================================================
-- 4. SYSTEM HEALTH METRICS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_system_health (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'api_response_time_p50',
    'api_response_time_p95',
    'api_response_time_p99',
    'error_rate',
    'active_users',
    'database_connections',
    'storage_used',
    'ai_api_calls',
    'ai_cost_daily',
    'rate_limit_hits'
  )),
  metric_value NUMERIC NOT NULL,
  metric_unit TEXT, -- ms, %, count, $, etc.
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_system_health_type ON admin_system_health(metric_type);
CREATE INDEX idx_system_health_recorded ON admin_system_health(recorded_at DESC);
CREATE INDEX idx_system_health_combined ON admin_system_health(metric_type, recorded_at DESC);

-- Enable RLS
ALTER TABLE admin_system_health ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view metrics
CREATE POLICY "Admins can view system health"
  ON admin_system_health
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 5. HELPER FUNCTIONS
-- =====================================================

-- Function to log activity (can be called from triggers or application code)
CREATE OR REPLACE FUNCTION log_admin_activity(
  p_user_id UUID,
  p_activity_type TEXT,
  p_activity_data JSONB DEFAULT '{}',
  p_metadata JSONB DEFAULT '{}',
  p_severity TEXT DEFAULT 'info'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  INSERT INTO admin_live_activity (
    user_id,
    activity_type,
    activity_data,
    metadata,
    severity
  ) VALUES (
    p_user_id,
    p_activity_type,
    p_activity_data,
    p_metadata,
    p_severity
  )
  RETURNING id INTO v_activity_id;
  
  RETURN v_activity_id;
END;
$$;

-- Function to create alert
CREATE OR REPLACE FUNCTION create_admin_alert(
  p_alert_type TEXT,
  p_severity TEXT,
  p_title TEXT,
  p_message TEXT,
  p_alert_data JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert_id UUID;
BEGIN
  INSERT INTO admin_alerts (
    alert_type,
    severity,
    title,
    message,
    alert_data
  ) VALUES (
    p_alert_type,
    p_severity,
    p_title,
    p_message,
    p_alert_data
  )
  RETURNING id INTO v_alert_id;
  
  RETURN v_alert_id;
END;
$$;

-- Function to get recent activity summary
CREATE OR REPLACE FUNCTION get_activity_summary(
  p_time_window INTERVAL DEFAULT '1 hour'
)
RETURNS TABLE (
  activity_type TEXT,
  count BIGINT,
  severity TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    activity_type,
    COUNT(*) as count,
    severity
  FROM admin_live_activity
  WHERE created_at >= NOW() - p_time_window
  GROUP BY activity_type, severity
  ORDER BY count DESC;
$$;

-- Function to detect error spikes
CREATE OR REPLACE FUNCTION detect_error_spike()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_recent_errors INTEGER;
  v_threshold INTEGER := 10; -- 10 errors per minute
BEGIN
  -- Count errors in last minute
  SELECT COUNT(*) INTO v_recent_errors
  FROM admin_live_activity
  WHERE activity_type = 'error'
    AND created_at >= NOW() - INTERVAL '1 minute';
  
  -- Create alert if threshold exceeded
  IF v_recent_errors >= v_threshold THEN
    PERFORM create_admin_alert(
      'error_spike',
      'critical',
      'Error Spike Detected',
      format('Detected %s errors in the last minute (threshold: %s)', v_recent_errors, v_threshold),
      jsonb_build_object('error_count', v_recent_errors, 'threshold', v_threshold)
    );
  END IF;
END;
$$;

-- =====================================================
-- 6. EXAMPLE TRIGGERS FOR AUTOMATIC LOGGING
-- =====================================================

-- Note: Triggers for meal plans and grocery lists can be added
-- once those tables are created in future migrations.
-- For now, activity logging is done via application code.

-- Example: Log meal creation
-- CREATE OR REPLACE FUNCTION trigger_log_meal_creation()
-- RETURNS TRIGGER
-- LANGUAGE plpgsql
-- AS $$
-- BEGIN
--   PERFORM log_admin_activity(
--     (SELECT user_id FROM kids WHERE id = NEW.kid_id),
--     'meal_plan_created',
--     jsonb_build_object('meal_id', NEW.id, 'kid_id', NEW.kid_id),
--     '{}'::jsonb,
--     'info'
--   );
--   RETURN NEW;
-- END;
-- $$;
-- 
-- CREATE TRIGGER log_meal_creation
--   AFTER INSERT ON kid_meal_creations
--   FOR EACH ROW
--   EXECUTE FUNCTION trigger_log_meal_creation();

-- =====================================================
-- 7. VIEWS FOR ADMIN DASHBOARD
-- =====================================================

-- View: Recent activity with user details
CREATE OR REPLACE VIEW admin_activity_feed AS
SELECT 
  a.id,
  a.user_id,
  u.email,
  p.full_name,
  a.activity_type,
  a.activity_data,
  a.metadata,
  a.severity,
  a.created_at
FROM admin_live_activity a
LEFT JOIN auth.users u ON u.id = a.user_id
LEFT JOIN profiles p ON p.id = a.user_id
ORDER BY a.created_at DESC
LIMIT 1000;

-- View: Unread alerts
CREATE OR REPLACE VIEW admin_unread_alerts AS
SELECT 
  id,
  alert_type,
  severity,
  title,
  message,
  alert_data,
  created_at
FROM admin_alerts
WHERE is_read = FALSE
ORDER BY 
  CASE severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  created_at DESC;

-- View: System health summary
CREATE OR REPLACE VIEW admin_system_health_summary AS
SELECT 
  metric_type,
  metric_value,
  metric_unit,
  recorded_at,
  ROW_NUMBER() OVER (PARTITION BY metric_type ORDER BY recorded_at DESC) as rn
FROM admin_system_health
WHERE recorded_at >= NOW() - INTERVAL '24 hours';

-- =====================================================
-- 8. SCHEDULED JOBS (via pg_cron or edge functions)
-- =====================================================

-- Clean up old activity logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM admin_live_activity
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  DELETE FROM admin_system_health
  WHERE recorded_at < NOW() - INTERVAL '90 days';
END;
$$;

-- =====================================================
-- 9. GRANT PERMISSIONS
-- =====================================================

-- Grant necessary permissions for service role
GRANT ALL ON admin_live_activity TO service_role;
GRANT ALL ON admin_alerts TO service_role;
GRANT ALL ON admin_alert_preferences TO service_role;
GRANT ALL ON admin_system_health TO service_role;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION log_admin_activity TO service_role;
GRANT EXECUTE ON FUNCTION create_admin_alert TO service_role;
GRANT EXECUTE ON FUNCTION get_activity_summary TO service_role;
GRANT EXECUTE ON FUNCTION detect_error_spike TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_activity_logs TO service_role;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Insert initial system health metrics
INSERT INTO admin_system_health (metric_type, metric_value, metric_unit)
VALUES 
  ('active_users', 0, 'count'),
  ('error_rate', 0, '%'),
  ('ai_cost_daily', 0, '$');

COMMENT ON TABLE admin_live_activity IS 'Real-time activity feed for admin monitoring';
COMMENT ON TABLE admin_alerts IS 'Automated alerts for critical system events';
COMMENT ON TABLE admin_alert_preferences IS 'Admin notification preferences per alert type';
COMMENT ON TABLE admin_system_health IS 'System performance and health metrics over time';

