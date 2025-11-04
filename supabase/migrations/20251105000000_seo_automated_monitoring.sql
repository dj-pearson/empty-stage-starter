-- =====================================================
-- SEO AUTOMATED MONITORING & ALERTS SYSTEM
-- =====================================================
-- This migration adds comprehensive automated monitoring,
-- scheduling, and alert capabilities to the SEO system
-- =====================================================

-- =====================================================
-- TABLE: seo_notification_preferences
-- =====================================================
-- Stores user preferences for how they want to be notified
-- =====================================================

CREATE TABLE IF NOT EXISTS seo_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Email notifications
  email_enabled BOOLEAN DEFAULT true,
  email_address TEXT,

  -- Slack notifications
  slack_enabled BOOLEAN DEFAULT false,
  slack_webhook_url TEXT,
  slack_channel TEXT,

  -- Notification frequency
  immediate_alerts BOOLEAN DEFAULT true,
  daily_digest BOOLEAN DEFAULT true,
  daily_digest_time TIME DEFAULT '09:00:00',
  weekly_digest BOOLEAN DEFAULT true,
  weekly_digest_day TEXT DEFAULT 'monday',
  weekly_digest_time TIME DEFAULT '09:00:00',

  -- What to be notified about
  notify_score_drops BOOLEAN DEFAULT true,
  notify_keyword_changes BOOLEAN DEFAULT true,
  notify_competitor_changes BOOLEAN DEFAULT true,
  notify_gsc_issues BOOLEAN DEFAULT true,
  notify_broken_links BOOLEAN DEFAULT false,
  notify_performance_issues BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- =====================================================
-- TABLE: seo_alert_rules
-- =====================================================
-- User-defined rules for when to trigger alerts
-- =====================================================

CREATE TABLE IF NOT EXISTS seo_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Rule identification
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL, -- 'score_drop', 'keyword_position', 'competitor', 'gsc_issue', 'performance'
  is_enabled BOOLEAN DEFAULT true,

  -- Condition parameters (JSONB for flexibility)
  condition JSONB NOT NULL,
  -- Examples:
  -- {"type": "score_drop", "threshold": 10, "timeframe_hours": 24}
  -- {"type": "keyword_position", "keyword": "meal planning", "position_change": 5}
  -- {"type": "competitor", "competitor_domain": "competitor.com", "threshold": 3}

  -- Alert severity
  severity TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'

  -- Notification settings for this rule
  notification_channels JSONB DEFAULT '["email"]'::jsonb, -- ['email', 'slack']

  -- Throttling to prevent alert spam
  throttle_minutes INTEGER DEFAULT 60,
  last_triggered_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alert_rules_user_enabled ON seo_alert_rules(user_id, is_enabled);
CREATE INDEX idx_alert_rules_type ON seo_alert_rules(rule_type);

-- =====================================================
-- TABLE: seo_alerts
-- =====================================================
-- Actual alerts that have been triggered
-- =====================================================

CREATE TABLE IF NOT EXISTS seo_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_rule_id UUID REFERENCES seo_alert_rules(id) ON DELETE SET NULL,

  -- Alert details
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB, -- Additional structured data

  -- Status
  status TEXT DEFAULT 'active', -- 'active', 'acknowledged', 'resolved', 'dismissed'
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,

  -- Notification tracking
  notifications_sent JSONB DEFAULT '[]'::jsonb,
  -- [{"channel": "email", "sent_at": "2024-11-05T10:00:00Z", "status": "delivered"}]

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_user_status ON seo_alerts(user_id, status);
CREATE INDEX idx_alerts_created ON seo_alerts(created_at DESC);
CREATE INDEX idx_alerts_severity ON seo_alerts(severity, status);

-- =====================================================
-- TABLE: seo_monitoring_schedules
-- =====================================================
-- Defines scheduled monitoring tasks
-- =====================================================

CREATE TABLE IF NOT EXISTS seo_monitoring_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Schedule identification
  schedule_name TEXT NOT NULL,
  schedule_type TEXT NOT NULL, -- 'audit', 'keyword_check', 'competitor_check', 'gsc_sync', 'performance_check'
  is_enabled BOOLEAN DEFAULT true,

  -- Cron schedule (standard cron format)
  cron_expression TEXT NOT NULL,
  -- Examples:
  -- '0 3 * * *' - Daily at 3 AM
  -- '0 9 * * MON' - Weekly on Monday at 9 AM
  -- '0 */6 * * *' - Every 6 hours

  -- Schedule parameters
  config JSONB DEFAULT '{}'::jsonb,
  -- Examples:
  -- {"audit_type": "full"}
  -- {"keywords": ["meal planning", "picky eater"]}

  -- Execution tracking
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT, -- 'success', 'failed', 'running'
  last_run_details JSONB,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,

  -- Error tracking
  consecutive_failures INTEGER DEFAULT 0,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_schedules_user_enabled ON seo_monitoring_schedules(user_id, is_enabled);
CREATE INDEX idx_schedules_next_run ON seo_monitoring_schedules(next_run_at) WHERE is_enabled = true;
CREATE INDEX idx_schedules_type ON seo_monitoring_schedules(schedule_type);

-- =====================================================
-- TABLE: seo_notification_log
-- =====================================================
-- Complete history of all notifications sent
-- =====================================================

CREATE TABLE IF NOT EXISTS seo_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id UUID REFERENCES seo_alerts(id) ON DELETE CASCADE,

  -- Notification details
  notification_type TEXT NOT NULL, -- 'immediate', 'daily_digest', 'weekly_digest'
  channel TEXT NOT NULL, -- 'email', 'slack'
  recipient TEXT NOT NULL,

  -- Content
  subject TEXT,
  body TEXT,
  metadata JSONB,

  -- Delivery status
  status TEXT NOT NULL, -- 'queued', 'sending', 'delivered', 'failed', 'bounced'
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_log_user ON seo_notification_log(user_id, created_at DESC);
CREATE INDEX idx_notification_log_status ON seo_notification_log(status, created_at);
CREATE INDEX idx_notification_log_alert ON seo_notification_log(alert_id);

-- =====================================================
-- TABLE: seo_audit_schedule_results
-- =====================================================
-- Stores results from scheduled audits for historical tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS seo_audit_schedule_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES seo_monitoring_schedules(id) ON DELETE CASCADE,
  audit_history_id UUID REFERENCES seo_audit_history(id) ON DELETE SET NULL,

  -- Audit execution details
  execution_time_ms INTEGER,
  total_checks INTEGER,
  passed_checks INTEGER,
  failed_checks INTEGER,
  warning_checks INTEGER,
  overall_score INTEGER,

  -- Change detection
  score_change INTEGER, -- Compared to previous run
  new_issues_count INTEGER,
  resolved_issues_count INTEGER,

  -- Results summary
  issues_summary JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_results_user ON seo_audit_schedule_results(user_id, created_at DESC);
CREATE INDEX idx_audit_results_schedule ON seo_audit_schedule_results(schedule_id, created_at DESC);

-- =====================================================
-- TABLE: seo_keyword_position_history
-- =====================================================
-- Enhanced keyword tracking with automated position checks
-- =====================================================

CREATE TABLE IF NOT EXISTS seo_keyword_position_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword_id UUID REFERENCES seo_keywords(id) ON DELETE CASCADE,

  -- Position data
  position INTEGER,
  previous_position INTEGER,
  position_change INTEGER,

  -- Source of data
  data_source TEXT NOT NULL, -- 'gsc', 'manual', 'automated_check'
  check_method TEXT, -- 'gsc_api', 'serpapi', 'manual'

  -- Additional metrics
  impressions INTEGER,
  clicks INTEGER,
  ctr NUMERIC(5,2),

  -- Context
  search_engine TEXT DEFAULT 'google',
  location TEXT DEFAULT 'us',
  device TEXT DEFAULT 'desktop',

  checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_keyword_history_keyword ON seo_keyword_position_history(keyword_id, checked_at DESC);
CREATE INDEX idx_keyword_history_user ON seo_keyword_position_history(user_id, checked_at DESC);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to check if an alert should be throttled
CREATE OR REPLACE FUNCTION should_throttle_alert(
  p_rule_id UUID,
  p_throttle_minutes INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_triggered TIMESTAMPTZ;
BEGIN
  SELECT last_triggered_at INTO v_last_triggered
  FROM seo_alert_rules
  WHERE id = p_rule_id;

  IF v_last_triggered IS NULL THEN
    RETURN false;
  END IF;

  RETURN (EXTRACT(EPOCH FROM (NOW() - v_last_triggered)) / 60) < p_throttle_minutes;
END;
$$;

-- Function to create an alert
CREATE OR REPLACE FUNCTION create_seo_alert(
  p_user_id UUID,
  p_rule_id UUID,
  p_alert_type TEXT,
  p_severity TEXT,
  p_title TEXT,
  p_message TEXT,
  p_details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_alert_id UUID;
BEGIN
  INSERT INTO seo_alerts (
    user_id, alert_rule_id, alert_type, severity,
    title, message, details
  ) VALUES (
    p_user_id, p_rule_id, p_alert_type, p_severity,
    p_title, p_message, p_details
  )
  RETURNING id INTO v_alert_id;

  -- Update rule's last triggered time
  IF p_rule_id IS NOT NULL THEN
    UPDATE seo_alert_rules
    SET last_triggered_at = NOW()
    WHERE id = p_rule_id;
  END IF;

  RETURN v_alert_id;
END;
$$;

-- Function to calculate next cron run time (simplified - edge function will do the heavy lifting)
CREATE OR REPLACE FUNCTION update_schedule_next_run(p_schedule_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Edge function will calculate proper next run based on cron expression
  -- This just marks it as needing calculation
  UPDATE seo_monitoring_schedules
  SET updated_at = NOW()
  WHERE id = p_schedule_id;
END;
$$;

-- Function to get active alerts count for a user
CREATE OR REPLACE FUNCTION get_active_alerts_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM seo_alerts
  WHERE user_id = p_user_id
  AND status = 'active';

  RETURN v_count;
END;
$$;

-- Function to check score drop and create alert
CREATE OR REPLACE FUNCTION check_score_drop_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_previous_score INTEGER;
  v_score_drop INTEGER;
  v_rule RECORD;
BEGIN
  -- Get previous audit score
  SELECT overall_score INTO v_previous_score
  FROM seo_audit_history
  WHERE user_id = NEW.user_id
  AND id != NEW.id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_previous_score IS NOT NULL THEN
    v_score_drop := v_previous_score - NEW.overall_score;

    -- Check if any rules should trigger
    FOR v_rule IN
      SELECT * FROM seo_alert_rules
      WHERE user_id = NEW.user_id
      AND rule_type = 'score_drop'
      AND is_enabled = true
      AND (condition->>'threshold')::INTEGER <= v_score_drop
    LOOP
      -- Check throttling
      IF NOT should_throttle_alert(v_rule.id, v_rule.throttle_minutes) THEN
        PERFORM create_seo_alert(
          NEW.user_id,
          v_rule.id,
          'score_drop',
          v_rule.severity,
          format('SEO Score Dropped by %s Points', v_score_drop),
          format('Your SEO score decreased from %s to %s (-%s points)', v_previous_score, NEW.overall_score, v_score_drop),
          jsonb_build_object(
            'previous_score', v_previous_score,
            'current_score', NEW.overall_score,
            'score_drop', v_score_drop
          )
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger for score drop alerts
CREATE TRIGGER trigger_score_drop_alert
AFTER INSERT ON seo_audit_history
FOR EACH ROW
EXECUTE FUNCTION check_score_drop_alert();

-- Function to check keyword position changes
CREATE OR REPLACE FUNCTION check_keyword_position_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_keyword_data RECORD;
  v_rule RECORD;
  v_position_change INTEGER;
BEGIN
  -- Get keyword details
  SELECT keyword, url INTO v_keyword_data
  FROM seo_keywords
  WHERE id = NEW.keyword_id;

  IF NEW.position_change IS NOT NULL AND NEW.position_change != 0 THEN
    -- Check if any rules should trigger
    FOR v_rule IN
      SELECT * FROM seo_alert_rules
      WHERE user_id = NEW.user_id
      AND rule_type = 'keyword_position'
      AND is_enabled = true
      AND (
        (condition->>'position_change')::INTEGER <= ABS(NEW.position_change)
        OR (condition->>'keyword' = v_keyword_data.keyword)
      )
    LOOP
      IF NOT should_throttle_alert(v_rule.id, v_rule.throttle_minutes) THEN
        PERFORM create_seo_alert(
          NEW.user_id,
          v_rule.id,
          'keyword_position',
          v_rule.severity,
          format('Keyword "%s" Position Changed', v_keyword_data.keyword),
          format('Position changed from #%s to #%s (%s%s positions)',
            NEW.previous_position,
            NEW.position,
            CASE WHEN NEW.position_change > 0 THEN '+' ELSE '' END,
            NEW.position_change
          ),
          jsonb_build_object(
            'keyword', v_keyword_data.keyword,
            'url', v_keyword_data.url,
            'previous_position', NEW.previous_position,
            'current_position', NEW.position,
            'position_change', NEW.position_change
          )
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger for keyword position alerts
CREATE TRIGGER trigger_keyword_position_alert
AFTER INSERT ON seo_keyword_position_history
FOR EACH ROW
EXECUTE FUNCTION check_keyword_position_alert();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

ALTER TABLE seo_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_monitoring_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_audit_schedule_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_keyword_position_history ENABLE ROW LEVEL SECURITY;

-- Notification Preferences Policies
CREATE POLICY "Users can view own notification preferences"
  ON seo_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
  ON seo_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences"
  ON seo_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Alert Rules Policies
CREATE POLICY "Users can manage own alert rules"
  ON seo_alert_rules FOR ALL
  USING (auth.uid() = user_id);

-- Alerts Policies
CREATE POLICY "Users can view own alerts"
  ON seo_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts"
  ON seo_alerts FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can create alerts (for automated systems)
CREATE POLICY "Service can create alerts"
  ON seo_alerts FOR INSERT
  WITH CHECK (true);

-- Monitoring Schedules Policies
CREATE POLICY "Users can manage own schedules"
  ON seo_monitoring_schedules FOR ALL
  USING (auth.uid() = user_id);

-- Notification Log Policies
CREATE POLICY "Users can view own notification log"
  ON seo_notification_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service can create notification logs"
  ON seo_notification_log FOR INSERT
  WITH CHECK (true);

-- Audit Schedule Results Policies
CREATE POLICY "Users can view own audit results"
  ON seo_audit_schedule_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service can create audit results"
  ON seo_audit_schedule_results FOR INSERT
  WITH CHECK (true);

-- Keyword Position History Policies
CREATE POLICY "Users can view own keyword history"
  ON seo_keyword_position_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own keyword history"
  ON seo_keyword_position_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admin access to all monitoring tables
CREATE POLICY "Admins have full access to notification preferences"
  ON seo_notification_preferences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admins have full access to alert rules"
  ON seo_alert_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admins have full access to alerts"
  ON seo_alerts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Create default notification preferences for existing users
-- Note: These will be created automatically when users first access the Monitoring tab
-- or when the first alert is triggered. No pre-population needed.

-- Create default alert rules for existing users
-- Note: Default rules will be created automatically via the UI or when first alert triggers

-- Create default monitoring schedule for existing users
-- Note: Default schedules will be created automatically when users access the Monitoring tab

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON seo_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_type_status ON seo_alerts(alert_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedules_enabled_next_run ON seo_monitoring_schedules(is_enabled, next_run_at) WHERE is_enabled = true;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE seo_notification_preferences IS 'User preferences for SEO notifications (email, Slack, frequency)';
COMMENT ON TABLE seo_alert_rules IS 'User-defined rules for when to trigger SEO alerts';
COMMENT ON TABLE seo_alerts IS 'Active and historical SEO alerts triggered by rules';
COMMENT ON TABLE seo_monitoring_schedules IS 'Cron schedules for automated SEO monitoring tasks';
COMMENT ON TABLE seo_notification_log IS 'Complete log of all notifications sent to users';
COMMENT ON TABLE seo_audit_schedule_results IS 'Results from scheduled automated SEO audits';
COMMENT ON TABLE seo_keyword_position_history IS 'Historical tracking of keyword position changes over time';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
