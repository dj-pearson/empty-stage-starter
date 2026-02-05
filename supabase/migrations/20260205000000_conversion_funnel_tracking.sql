-- Conversion Funnel Tracking Tables
-- This migration adds proper tracking for conversion funnel analytics

-- ============================================================================
-- PAGE VIEWS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  page_path TEXT NOT NULL,
  page_title TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  device_type TEXT, -- desktop, mobile, tablet
  browser TEXT,
  os TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  ip_hash TEXT, -- hashed IP for privacy
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- FUNNEL EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- landing_view, quiz_start, quiz_complete, email_capture, signup, trial_start, paid_conversion
  event_data JSONB DEFAULT '{}'::jsonb,
  page_path TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SESSION TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_page TEXT,
  last_page TEXT,
  page_count INTEGER DEFAULT 1,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  country TEXT,
  converted BOOLEAN DEFAULT FALSE,
  conversion_type TEXT, -- email_capture, signup, trial, paid
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_page_views_session_id ON page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_page_views_user_id ON page_views(user_id);
CREATE INDEX IF NOT EXISTS idx_page_views_page_path ON page_views(page_path);
CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_utm_source ON page_views(utm_source);

CREATE INDEX IF NOT EXISTS idx_funnel_events_session_id ON funnel_events(session_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_user_id ON funnel_events(user_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_event_type ON funnel_events(event_type);
CREATE INDEX IF NOT EXISTS idx_funnel_events_created_at ON funnel_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_converted ON user_sessions(converted);
CREATE INDEX IF NOT EXISTS idx_user_sessions_started_at ON user_sessions(started_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Allow public inserts via service role or anon for tracking
CREATE POLICY "Allow anonymous tracking inserts on page_views"
  ON page_views FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow anonymous tracking inserts on funnel_events"
  ON funnel_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow anonymous session tracking inserts"
  ON user_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow session updates via service role"
  ON user_sessions FOR UPDATE
  USING (auth.role() = 'service_role' OR auth.role() = 'anon');

-- Admin read access
CREATE POLICY "Admins can read page_views"
  ON page_views FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can read funnel_events"
  ON funnel_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can read user_sessions"
  ON user_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- ============================================================================
-- TRACKING FUNCTIONS
-- ============================================================================

-- Function to track a page view
CREATE OR REPLACE FUNCTION track_page_view(
  p_session_id TEXT,
  p_page_path TEXT,
  p_page_title TEXT DEFAULT NULL,
  p_referrer TEXT DEFAULT NULL,
  p_utm_source TEXT DEFAULT NULL,
  p_utm_medium TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL,
  p_utm_content TEXT DEFAULT NULL,
  p_utm_term TEXT DEFAULT NULL,
  p_device_type TEXT DEFAULT NULL,
  p_browser TEXT DEFAULT NULL,
  p_os TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Insert page view
  INSERT INTO page_views (
    session_id, user_id, page_path, page_title, referrer,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    device_type, browser, os
  ) VALUES (
    p_session_id, p_user_id, p_page_path, p_page_title, p_referrer,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    p_device_type, p_browser, p_os
  )
  RETURNING id INTO v_id;

  -- Update or create session
  INSERT INTO user_sessions (
    session_id, user_id, first_page, last_page, page_count,
    utm_source, utm_medium, utm_campaign, referrer, device_type, browser, os
  ) VALUES (
    p_session_id, p_user_id, p_page_path, p_page_path, 1,
    p_utm_source, p_utm_medium, p_utm_campaign, p_referrer, p_device_type, p_browser, p_os
  )
  ON CONFLICT (session_id) DO UPDATE SET
    last_page = p_page_path,
    page_count = user_sessions.page_count + 1,
    user_id = COALESCE(EXCLUDED.user_id, user_sessions.user_id),
    ended_at = NOW(),
    duration_seconds = EXTRACT(EPOCH FROM (NOW() - user_sessions.started_at))::INTEGER;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to track a funnel event
CREATE OR REPLACE FUNCTION track_funnel_event(
  p_session_id TEXT,
  p_event_type TEXT,
  p_event_data JSONB DEFAULT '{}'::jsonb,
  p_page_path TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_utm_source TEXT DEFAULT NULL,
  p_utm_medium TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Insert funnel event
  INSERT INTO funnel_events (
    session_id, user_id, event_type, event_data, page_path,
    utm_source, utm_medium, utm_campaign
  ) VALUES (
    p_session_id, p_user_id, p_event_type, p_event_data, p_page_path,
    p_utm_source, p_utm_medium, p_utm_campaign
  )
  RETURNING id INTO v_id;

  -- Update session conversion status if applicable
  IF p_event_type IN ('email_capture', 'signup', 'trial_start', 'paid_conversion') THEN
    UPDATE user_sessions
    SET
      converted = TRUE,
      conversion_type = p_event_type,
      user_id = COALESCE(p_user_id, user_sessions.user_id)
    WHERE session_id = p_session_id;
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ANALYTICS VIEWS
-- ============================================================================

-- Conversion funnel summary view
CREATE OR REPLACE VIEW conversion_funnel_summary AS
SELECT
  date_trunc('day', created_at)::date AS date,
  COUNT(*) FILTER (WHERE event_type = 'landing_view') AS landing_views,
  COUNT(*) FILTER (WHERE event_type = 'quiz_start') AS quiz_starts,
  COUNT(*) FILTER (WHERE event_type = 'quiz_complete') AS quiz_completes,
  COUNT(*) FILTER (WHERE event_type = 'email_capture') AS email_captures,
  COUNT(*) FILTER (WHERE event_type = 'signup') AS signups,
  COUNT(*) FILTER (WHERE event_type = 'trial_start') AS trial_starts,
  COUNT(*) FILTER (WHERE event_type = 'paid_conversion') AS paid_conversions,
  -- Conversion rates
  CASE WHEN COUNT(*) FILTER (WHERE event_type = 'landing_view') > 0
    THEN ROUND((COUNT(*) FILTER (WHERE event_type = 'quiz_start')::DECIMAL /
                COUNT(*) FILTER (WHERE event_type = 'landing_view')) * 100, 2)
    ELSE 0
  END AS landing_to_quiz_rate,
  CASE WHEN COUNT(*) FILTER (WHERE event_type = 'quiz_start') > 0
    THEN ROUND((COUNT(*) FILTER (WHERE event_type = 'quiz_complete')::DECIMAL /
                COUNT(*) FILTER (WHERE event_type = 'quiz_start')) * 100, 2)
    ELSE 0
  END AS quiz_completion_rate,
  CASE WHEN COUNT(*) FILTER (WHERE event_type = 'quiz_complete') > 0
    THEN ROUND((COUNT(*) FILTER (WHERE event_type = 'email_capture')::DECIMAL /
                COUNT(*) FILTER (WHERE event_type = 'quiz_complete')) * 100, 2)
    ELSE 0
  END AS email_capture_rate,
  CASE WHEN COUNT(*) FILTER (WHERE event_type = 'landing_view') > 0
    THEN ROUND((COUNT(*) FILTER (WHERE event_type = 'paid_conversion')::DECIMAL /
                COUNT(*) FILTER (WHERE event_type = 'landing_view')) * 100, 2)
    ELSE 0
  END AS overall_conversion_rate
FROM funnel_events
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY date_trunc('day', created_at)::date
ORDER BY date DESC;

-- Daily page views summary
CREATE OR REPLACE VIEW daily_page_views AS
SELECT
  date_trunc('day', created_at)::date AS date,
  COUNT(*) AS total_views,
  COUNT(DISTINCT session_id) AS unique_sessions,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS authenticated_users,
  COUNT(*) FILTER (WHERE page_path = '/' OR page_path = '/landing') AS landing_page_views,
  COUNT(*) FILTER (WHERE page_path LIKE '/quiz%') AS quiz_page_views,
  COUNT(*) FILTER (WHERE page_path LIKE '/dashboard%') AS dashboard_views
FROM page_views
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY date_trunc('day', created_at)::date
ORDER BY date DESC;

-- UTM source performance
CREATE OR REPLACE VIEW utm_source_performance AS
SELECT
  COALESCE(utm_source, 'direct') AS source,
  COALESCE(utm_medium, 'none') AS medium,
  COALESCE(utm_campaign, 'none') AS campaign,
  COUNT(DISTINCT session_id) AS sessions,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS users,
  SUM(CASE WHEN converted THEN 1 ELSE 0 END) AS conversions,
  ROUND(
    SUM(CASE WHEN converted THEN 1 ELSE 0 END)::DECIMAL /
    NULLIF(COUNT(DISTINCT session_id), 0) * 100, 2
  ) AS conversion_rate
FROM user_sessions
WHERE started_at >= NOW() - INTERVAL '90 days'
GROUP BY utm_source, utm_medium, utm_campaign
ORDER BY sessions DESC;

-- Grant access to views for admins
GRANT SELECT ON conversion_funnel_summary TO authenticated;
GRANT SELECT ON daily_page_views TO authenticated;
GRANT SELECT ON utm_source_performance TO authenticated;
