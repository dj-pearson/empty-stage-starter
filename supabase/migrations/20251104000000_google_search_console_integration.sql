-- =====================================================
-- GOOGLE SEARCH CONSOLE INTEGRATION
-- =====================================================
-- This migration adds tables and functions for Google Search Console
-- integration, including OAuth credentials, property management,
-- and real keyword/performance data from GSC.
-- =====================================================

-- =====================================================
-- 1. GSC OAUTH CREDENTIALS TABLE
-- =====================================================
-- Stores OAuth tokens for Google Search Console API access

DROP TABLE IF EXISTS gsc_oauth_credentials CASCADE;

CREATE TABLE gsc_oauth_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- OAuth Tokens
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,

  -- Scopes
  scope TEXT, -- e.g., 'https://www.googleapis.com/auth/webmasters.readonly'

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- Index
CREATE INDEX idx_gsc_oauth_user ON gsc_oauth_credentials(user_id);
CREATE INDEX idx_gsc_oauth_expires ON gsc_oauth_credentials(expires_at);

-- =====================================================
-- 2. GSC PROPERTIES TABLE
-- =====================================================
-- Stores verified Google Search Console properties (websites)

DROP TABLE IF EXISTS gsc_properties CASCADE;

CREATE TABLE gsc_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Property Details
  property_url TEXT NOT NULL, -- e.g., 'https://eatpal.com/' or 'sc-domain:eatpal.com'
  property_type TEXT NOT NULL, -- 'URL_PREFIX' or 'DOMAIN'
  display_name TEXT,

  -- Status
  is_verified BOOLEAN DEFAULT false,
  is_primary BOOLEAN DEFAULT false, -- The main property to track
  permission_level TEXT, -- 'OWNER', 'FULL_USER', 'RESTRICTED_USER'

  -- Sync Status
  last_synced_at TIMESTAMPTZ,
  sync_enabled BOOLEAN DEFAULT true,
  sync_frequency TEXT DEFAULT 'daily', -- 'hourly', 'daily', 'weekly'

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_gsc_properties_user ON gsc_properties(user_id);
CREATE INDEX idx_gsc_properties_primary ON gsc_properties(is_primary);
CREATE UNIQUE INDEX idx_gsc_properties_url_user ON gsc_properties(property_url, user_id);

-- =====================================================
-- 3. ENHANCED KEYWORD DATA WITH GSC METRICS
-- =====================================================
-- Update seo_keywords table to include GSC data

ALTER TABLE seo_keywords ADD COLUMN IF NOT EXISTS impressions INTEGER DEFAULT 0;
ALTER TABLE seo_keywords ADD COLUMN IF NOT EXISTS clicks INTEGER DEFAULT 0;
ALTER TABLE seo_keywords ADD COLUMN IF NOT EXISTS ctr DECIMAL(5,2) DEFAULT 0.00;
ALTER TABLE seo_keywords ADD COLUMN IF NOT EXISTS gsc_position DECIMAL(5,2); -- Average position from GSC
ALTER TABLE seo_keywords ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'manual'; -- 'manual', 'gsc', 'hybrid'
ALTER TABLE seo_keywords ADD COLUMN IF NOT EXISTS gsc_last_updated TIMESTAMPTZ;

-- =====================================================
-- 4. GSC KEYWORD PERFORMANCE TABLE
-- =====================================================
-- Historical performance data from GSC for each keyword

DROP TABLE IF EXISTS gsc_keyword_performance CASCADE;

CREATE TABLE gsc_keyword_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  keyword_id UUID REFERENCES seo_keywords(id) ON DELETE CASCADE,
  property_id UUID REFERENCES gsc_properties(id) ON DELETE CASCADE,

  -- Date Range
  date DATE NOT NULL,

  -- Metrics from GSC
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  ctr DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  position DECIMAL(5,2) NOT NULL DEFAULT 0.00,

  -- Top Landing Pages for this keyword
  top_pages JSONB, -- [{ "page": "/blog/...", "clicks": 10, "impressions": 100 }]

  -- Device Breakdown
  desktop_clicks INTEGER DEFAULT 0,
  mobile_clicks INTEGER DEFAULT 0,
  tablet_clicks INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_gsc_keyword_perf_keyword ON gsc_keyword_performance(keyword_id, date DESC);
CREATE INDEX idx_gsc_keyword_perf_property ON gsc_keyword_performance(property_id, date DESC);
CREATE INDEX idx_gsc_keyword_perf_date ON gsc_keyword_performance(date DESC);
CREATE UNIQUE INDEX idx_gsc_keyword_perf_unique ON gsc_keyword_performance(keyword_id, property_id, date);

-- =====================================================
-- 5. GSC PAGE PERFORMANCE TABLE
-- =====================================================
-- Performance data for individual pages from GSC

DROP TABLE IF EXISTS gsc_page_performance CASCADE;

CREATE TABLE gsc_page_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  property_id UUID REFERENCES gsc_properties(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,

  -- Date Range
  date DATE NOT NULL,

  -- Metrics
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  ctr DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  position DECIMAL(5,2) NOT NULL DEFAULT 0.00,

  -- Top Queries for this page
  top_queries JSONB, -- [{ "query": "meal planning", "clicks": 5, "impressions": 50 }]

  -- Device Breakdown
  desktop_impressions INTEGER DEFAULT 0,
  mobile_impressions INTEGER DEFAULT 0,
  tablet_impressions INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_gsc_page_perf_property ON gsc_page_performance(property_id, date DESC);
CREATE INDEX idx_gsc_page_perf_page ON gsc_page_performance(page_url, date DESC);
CREATE INDEX idx_gsc_page_perf_date ON gsc_page_performance(date DESC);
CREATE UNIQUE INDEX idx_gsc_page_perf_unique ON gsc_page_performance(property_id, page_url, date);

-- =====================================================
-- 6. GSC ISSUES TABLE
-- =====================================================
-- Store issues reported by Google Search Console

DROP TABLE IF EXISTS gsc_issues CASCADE;

CREATE TABLE gsc_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  property_id UUID REFERENCES gsc_properties(id) ON DELETE CASCADE,

  -- Issue Details
  issue_type TEXT NOT NULL, -- 'MOBILE_USABILITY', 'CRAWL_ERROR', 'SECURITY', 'MANUAL_ACTION'
  issue_category TEXT NOT NULL, -- 'ERROR', 'WARNING', 'INFO'
  issue_name TEXT NOT NULL,
  issue_description TEXT,

  -- Affected URLs
  affected_urls TEXT[], -- Array of URLs with this issue
  affected_count INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'OPEN', -- 'OPEN', 'FIXED', 'ACKNOWLEDGED'
  severity TEXT, -- 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'

  -- Resolution
  fixed_at TIMESTAMPTZ,
  fixed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  first_detected TIMESTAMPTZ DEFAULT NOW(),
  last_detected TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_gsc_issues_property ON gsc_issues(property_id);
CREATE INDEX idx_gsc_issues_status ON gsc_issues(status);
CREATE INDEX idx_gsc_issues_type ON gsc_issues(issue_type);
CREATE INDEX idx_gsc_issues_severity ON gsc_issues(severity);

-- =====================================================
-- 7. GSC SYNC LOG TABLE
-- =====================================================
-- Track GSC data synchronization events

DROP TABLE IF EXISTS gsc_sync_log CASCADE;

CREATE TABLE gsc_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  property_id UUID REFERENCES gsc_properties(id) ON DELETE CASCADE,

  -- Sync Details
  sync_type TEXT NOT NULL, -- 'keyword_performance', 'page_performance', 'issues', 'full'
  sync_status TEXT NOT NULL, -- 'started', 'completed', 'failed'

  -- Date Range Synced
  start_date DATE,
  end_date DATE,

  -- Results
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  error_details JSONB,

  -- Duration
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- Indexes
CREATE INDEX idx_gsc_sync_log_property ON gsc_sync_log(property_id, started_at DESC);
CREATE INDEX idx_gsc_sync_log_status ON gsc_sync_log(sync_status);
CREATE INDEX idx_gsc_sync_log_date ON gsc_sync_log(started_at DESC);

-- =====================================================
-- 8. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE gsc_oauth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_keyword_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_page_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_sync_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 9. CREATE RLS POLICIES
-- =====================================================

-- OAuth Credentials: Users can only see their own
CREATE POLICY "Users can view their own GSC credentials"
  ON gsc_oauth_credentials
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own GSC credentials"
  ON gsc_oauth_credentials
  FOR ALL
  USING (user_id = auth.uid());

-- Properties: Users can view their own, admins can view all
CREATE POLICY "Users can view their own properties"
  ON gsc_properties
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Users can manage their own properties"
  ON gsc_properties
  FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all properties"
  ON gsc_properties
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Keyword Performance: Read access for property owners and admins
CREATE POLICY "Users can view keyword performance for their properties"
  ON gsc_keyword_performance
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM gsc_properties
      WHERE gsc_properties.id = gsc_keyword_performance.property_id
      AND gsc_properties.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Page Performance: Read access for property owners and admins
CREATE POLICY "Users can view page performance for their properties"
  ON gsc_page_performance
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM gsc_properties
      WHERE gsc_properties.id = gsc_page_performance.property_id
      AND gsc_properties.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Issues: Admin only
CREATE POLICY "Admins can view GSC issues"
  ON gsc_issues
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Sync Log: Admin only
CREATE POLICY "Admins can view sync logs"
  ON gsc_sync_log
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- =====================================================
-- 10. HELPER FUNCTIONS
-- =====================================================

-- Function to check if OAuth token is expired
CREATE OR REPLACE FUNCTION is_gsc_token_expired(user_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
  token_expires TIMESTAMPTZ;
BEGIN
  SELECT expires_at INTO token_expires
  FROM gsc_oauth_credentials
  WHERE user_id = user_id_param
    AND is_active = true;

  IF token_expires IS NULL THEN
    RETURN true; -- No token found, consider expired
  END IF;

  RETURN token_expires < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get primary GSC property
CREATE OR REPLACE FUNCTION get_primary_gsc_property(user_id_param UUID)
RETURNS UUID AS $$
DECLARE
  property_id_result UUID;
BEGIN
  SELECT id INTO property_id_result
  FROM gsc_properties
  WHERE user_id = user_id_param
    AND is_primary = true
    AND sync_enabled = true
  LIMIT 1;

  RETURN property_id_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update keyword with GSC data
CREATE OR REPLACE FUNCTION update_keyword_with_gsc_data(
  keyword_id_param UUID,
  impressions_param INTEGER,
  clicks_param INTEGER,
  ctr_param DECIMAL,
  position_param DECIMAL
)
RETURNS VOID AS $$
BEGIN
  UPDATE seo_keywords
  SET
    impressions = impressions_param,
    clicks = clicks_param,
    ctr = ctr_param,
    gsc_position = position_param,
    current_position = ROUND(position_param),
    data_source = 'gsc',
    gsc_last_updated = NOW(),
    last_checked_at = NOW()
  WHERE id = keyword_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update gsc_oauth_credentials.updated_at
CREATE OR REPLACE FUNCTION update_gsc_oauth_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_gsc_oauth_updated_at
  BEFORE UPDATE ON gsc_oauth_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_gsc_oauth_updated_at();

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

COMMENT ON TABLE gsc_oauth_credentials IS 'OAuth credentials for Google Search Console API';
COMMENT ON TABLE gsc_properties IS 'Verified Google Search Console properties (websites)';
COMMENT ON TABLE gsc_keyword_performance IS 'Historical keyword performance data from GSC';
COMMENT ON TABLE gsc_page_performance IS 'Historical page performance data from GSC';
COMMENT ON TABLE gsc_issues IS 'Issues reported by Google Search Console';
COMMENT ON TABLE gsc_sync_log IS 'Log of GSC data synchronization events';
