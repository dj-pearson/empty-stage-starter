-- Migration: Add Login History Table
-- Date: 2026-02-05
-- Description: Creates comprehensive login history tracking for security and analytics

-- ============================================
-- Login History Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.login_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,

  -- Timestamp
  logged_in_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Network info
  ip_address INET,

  -- Raw user agent for reference
  user_agent TEXT,

  -- Parsed device information
  device_type TEXT CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'unknown')),
  browser_name TEXT,
  browser_version TEXT,
  os_name TEXT,
  os_version TEXT,

  -- Geolocation (from IP)
  country TEXT,
  country_code TEXT,
  region TEXT,
  city TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  timezone TEXT,

  -- Login details
  login_method TEXT NOT NULL CHECK (login_method IN ('password', 'google', 'apple', 'magic_link', 'otp', 'unknown')),
  success BOOLEAN DEFAULT true NOT NULL,
  failure_reason TEXT,

  -- Session tracking
  session_id TEXT,
  device_fingerprint TEXT,

  -- Logout tracking
  logged_out_at TIMESTAMPTZ,
  session_duration_seconds INTEGER,

  -- Metadata for additional info
  metadata JSONB DEFAULT '{}'
);

-- ============================================
-- Indexes for efficient querying
-- ============================================

-- Primary lookup indexes
CREATE INDEX idx_login_history_user_id ON public.login_history(user_id);
CREATE INDEX idx_login_history_email ON public.login_history(email);
CREATE INDEX idx_login_history_logged_in_at ON public.login_history(logged_in_at DESC);

-- Security monitoring indexes
CREATE INDEX idx_login_history_ip_address ON public.login_history(ip_address);
CREATE INDEX idx_login_history_success ON public.login_history(success);
CREATE INDEX idx_login_history_device_fingerprint ON public.login_history(device_fingerprint);

-- Analytics indexes
CREATE INDEX idx_login_history_login_method ON public.login_history(login_method);
CREATE INDEX idx_login_history_device_type ON public.login_history(device_type);
CREATE INDEX idx_login_history_country ON public.login_history(country_code);
CREATE INDEX idx_login_history_browser ON public.login_history(browser_name);
CREATE INDEX idx_login_history_os ON public.login_history(os_name);

-- Composite indexes for common queries
CREATE INDEX idx_login_history_user_time
  ON public.login_history(user_id, logged_in_at DESC);
CREATE INDEX idx_login_history_analytics
  ON public.login_history(logged_in_at DESC, login_method, device_type, success);
CREATE INDEX idx_login_history_geo_time
  ON public.login_history(country_code, logged_in_at DESC);

-- ============================================
-- Enable RLS
-- ============================================
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================

-- Users can view their own login history
CREATE POLICY "Users can view own login history"
  ON public.login_history FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all login history
CREATE POLICY "Admins can view all login history"
  ON public.login_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Allow inserts from authenticated users and service role
CREATE POLICY "Allow login history inserts"
  ON public.login_history FOR INSERT
  WITH CHECK (true);

-- Allow updates only by service role (for logout tracking)
CREATE POLICY "Service role can update login history"
  ON public.login_history FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================
-- Helper Views for Analytics
-- ============================================

-- View: Daily login statistics
CREATE OR REPLACE VIEW public.login_stats_daily AS
SELECT
  DATE(logged_in_at) as login_date,
  COUNT(*) as total_logins,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) FILTER (WHERE success = true) as successful_logins,
  COUNT(*) FILTER (WHERE success = false) as failed_logins,
  COUNT(*) FILTER (WHERE login_method = 'password') as password_logins,
  COUNT(*) FILTER (WHERE login_method = 'google') as google_logins,
  COUNT(*) FILTER (WHERE login_method = 'apple') as apple_logins,
  COUNT(*) FILTER (WHERE device_type = 'mobile') as mobile_logins,
  COUNT(*) FILTER (WHERE device_type = 'desktop') as desktop_logins,
  COUNT(*) FILTER (WHERE device_type = 'tablet') as tablet_logins,
  ROUND(AVG(session_duration_seconds)::numeric, 0) as avg_session_seconds
FROM public.login_history
GROUP BY DATE(logged_in_at)
ORDER BY login_date DESC;

-- View: Login by country
CREATE OR REPLACE VIEW public.login_stats_by_country AS
SELECT
  country,
  country_code,
  COUNT(*) as total_logins,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) FILTER (WHERE success = true) as successful_logins,
  MIN(logged_in_at) as first_login,
  MAX(logged_in_at) as last_login
FROM public.login_history
WHERE country IS NOT NULL
GROUP BY country, country_code
ORDER BY total_logins DESC;

-- View: Login by device/browser
CREATE OR REPLACE VIEW public.login_stats_by_platform AS
SELECT
  device_type,
  browser_name,
  os_name,
  COUNT(*) as total_logins,
  COUNT(DISTINCT user_id) as unique_users,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM public.login_history
GROUP BY device_type, browser_name, os_name
ORDER BY total_logins DESC;

-- ============================================
-- Functions
-- ============================================

-- Function to clean up old login history (retain configurable days)
CREATE OR REPLACE FUNCTION cleanup_old_login_history(retention_days INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.login_history
  WHERE logged_in_at < NOW() - (retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user login summary
CREATE OR REPLACE FUNCTION get_user_login_summary(target_user_id UUID)
RETURNS TABLE (
  total_logins BIGINT,
  successful_logins BIGINT,
  failed_logins BIGINT,
  unique_devices BIGINT,
  unique_locations BIGINT,
  first_login TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  most_used_device TEXT,
  most_used_browser TEXT,
  most_used_location TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_logins,
    COUNT(*) FILTER (WHERE lh.success = true)::BIGINT as successful_logins,
    COUNT(*) FILTER (WHERE lh.success = false)::BIGINT as failed_logins,
    COUNT(DISTINCT lh.device_fingerprint)::BIGINT as unique_devices,
    COUNT(DISTINCT lh.country_code)::BIGINT as unique_locations,
    MIN(lh.logged_in_at) as first_login,
    MAX(lh.logged_in_at) as last_login,
    (SELECT device_type FROM public.login_history WHERE user_id = target_user_id GROUP BY device_type ORDER BY COUNT(*) DESC LIMIT 1) as most_used_device,
    (SELECT browser_name FROM public.login_history WHERE user_id = target_user_id AND browser_name IS NOT NULL GROUP BY browser_name ORDER BY COUNT(*) DESC LIMIT 1) as most_used_browser,
    (SELECT country FROM public.login_history WHERE user_id = target_user_id AND country IS NOT NULL GROUP BY country ORDER BY COUNT(*) DESC LIMIT 1) as most_used_location
  FROM public.login_history lh
  WHERE lh.user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to detect suspicious login patterns
CREATE OR REPLACE FUNCTION check_suspicious_login(
  p_user_id UUID,
  p_ip_address INET,
  p_device_fingerprint TEXT,
  p_country_code TEXT
)
RETURNS TABLE (
  is_suspicious BOOLEAN,
  reason TEXT,
  risk_score INTEGER
) AS $$
DECLARE
  v_risk_score INTEGER := 0;
  v_reasons TEXT[] := '{}';
  v_last_login RECORD;
  v_known_device BOOLEAN;
  v_known_location BOOLEAN;
  v_failed_recent INTEGER;
BEGIN
  -- Get last successful login
  SELECT * INTO v_last_login
  FROM public.login_history
  WHERE user_id = p_user_id AND success = true
  ORDER BY logged_in_at DESC
  LIMIT 1;

  -- Check if device is known
  SELECT EXISTS (
    SELECT 1 FROM public.login_history
    WHERE user_id = p_user_id
    AND device_fingerprint = p_device_fingerprint
    AND success = true
    LIMIT 1
  ) INTO v_known_device;

  IF NOT v_known_device THEN
    v_risk_score := v_risk_score + 30;
    v_reasons := array_append(v_reasons, 'New device detected');
  END IF;

  -- Check if location is known
  SELECT EXISTS (
    SELECT 1 FROM public.login_history
    WHERE user_id = p_user_id
    AND country_code = p_country_code
    AND success = true
    LIMIT 1
  ) INTO v_known_location;

  IF NOT v_known_location AND p_country_code IS NOT NULL THEN
    v_risk_score := v_risk_score + 25;
    v_reasons := array_append(v_reasons, 'New location detected');
  END IF;

  -- Check for impossible travel (login from different country within 2 hours)
  IF v_last_login IS NOT NULL AND p_country_code IS NOT NULL AND
     v_last_login.country_code IS NOT NULL AND
     v_last_login.country_code != p_country_code AND
     v_last_login.logged_in_at > NOW() - INTERVAL '2 hours' THEN
    v_risk_score := v_risk_score + 50;
    v_reasons := array_append(v_reasons, 'Impossible travel detected');
  END IF;

  -- Check recent failed logins
  SELECT COUNT(*) INTO v_failed_recent
  FROM public.login_history
  WHERE user_id = p_user_id
  AND success = false
  AND logged_in_at > NOW() - INTERVAL '15 minutes';

  IF v_failed_recent >= 3 THEN
    v_risk_score := v_risk_score + 20;
    v_reasons := array_append(v_reasons, 'Multiple recent failed attempts');
  END IF;

  RETURN QUERY SELECT
    v_risk_score >= 50 as is_suspicious,
    array_to_string(v_reasons, '; ') as reason,
    v_risk_score as risk_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE public.login_history IS 'Comprehensive login history tracking for security monitoring and analytics';
COMMENT ON COLUMN public.login_history.device_fingerprint IS 'SHA-256 hash of browser/device characteristics for device identification';
COMMENT ON COLUMN public.login_history.login_method IS 'Authentication method used: password, google, apple, magic_link, otp';
COMMENT ON COLUMN public.login_history.session_duration_seconds IS 'Duration of session in seconds, calculated on logout';
COMMENT ON VIEW public.login_stats_daily IS 'Aggregated daily login statistics for analytics dashboards';
COMMENT ON VIEW public.login_stats_by_country IS 'Login statistics grouped by country for geographic analysis';
COMMENT ON VIEW public.login_stats_by_platform IS 'Login statistics grouped by device, browser, and OS';
