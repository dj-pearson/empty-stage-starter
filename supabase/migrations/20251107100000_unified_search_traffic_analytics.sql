-- =====================================================
-- UNIFIED SEARCH TRAFFIC ANALYTICS SYSTEM
-- Integrates: Google Analytics 4, Google Search Console,
--             Bing Webmaster Tools, Yandex Webmaster
-- =====================================================

-- =====================================================
-- 1. PLATFORM CONNECTIONS
-- =====================================================

-- Track connected analytics platforms with OAuth tokens
CREATE TABLE IF NOT EXISTS analytics_platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'google_analytics', 'google_search_console', 'bing_webmaster', 'yandex_webmaster'
  platform_account_id TEXT, -- GA4 Property ID, GSC Property URL, etc.
  platform_account_name TEXT,
  access_token TEXT, -- Encrypted in production
  refresh_token TEXT, -- Encrypted in production
  token_expires_at TIMESTAMPTZ,
  scope TEXT[], -- OAuth scopes granted
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending', -- 'pending', 'syncing', 'success', 'error'
  sync_error TEXT,
  metadata JSONB DEFAULT '{}', -- Platform-specific metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, platform_account_id)
);

CREATE INDEX idx_platform_connections_user ON analytics_platform_connections(user_id);
CREATE INDEX idx_platform_connections_platform ON analytics_platform_connections(platform);
CREATE INDEX idx_platform_connections_sync ON analytics_platform_connections(last_sync_at, is_active);

-- RLS Policies
ALTER TABLE analytics_platform_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own platform connections"
  ON analytics_platform_connections FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all platform connections"
  ON analytics_platform_connections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 2. UNIFIED TRAFFIC DATA
-- =====================================================

-- Aggregated daily traffic metrics from all platforms
CREATE TABLE IF NOT EXISTS unified_traffic_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES analytics_platform_connections(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Traffic Metrics
  sessions INT DEFAULT 0,
  users INT DEFAULT 0,
  new_users INT DEFAULT 0,
  pageviews INT DEFAULT 0,

  -- Engagement Metrics
  bounce_rate DECIMAL(5,2),
  avg_session_duration DECIMAL(10,2), -- seconds
  pages_per_session DECIMAL(5,2),

  -- Search Metrics (from GSC, Bing, Yandex)
  impressions BIGINT DEFAULT 0,
  clicks INT DEFAULT 0,
  ctr DECIMAL(5,2), -- Click-through rate
  avg_position DECIMAL(5,2),

  -- Conversion Metrics
  conversions INT DEFAULT 0,
  conversion_rate DECIMAL(5,2),

  -- Platform-specific raw data
  raw_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(connection_id, date)
);

CREATE INDEX idx_traffic_metrics_connection ON unified_traffic_metrics(connection_id);
CREATE INDEX idx_traffic_metrics_date ON unified_traffic_metrics(date DESC);
CREATE INDEX idx_traffic_metrics_connection_date ON unified_traffic_metrics(connection_id, date DESC);

-- RLS Policies
ALTER TABLE unified_traffic_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own traffic metrics"
  ON unified_traffic_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM analytics_platform_connections
      WHERE analytics_platform_connections.id = unified_traffic_metrics.connection_id
      AND analytics_platform_connections.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all traffic metrics"
  ON unified_traffic_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 3. QUERY/KEYWORD PERFORMANCE
-- =====================================================

-- Search queries from GSC, Bing, Yandex
CREATE TABLE IF NOT EXISTS unified_query_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES analytics_platform_connections(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  query TEXT NOT NULL,

  -- Performance Metrics
  impressions BIGINT DEFAULT 0,
  clicks INT DEFAULT 0,
  ctr DECIMAL(5,2),
  avg_position DECIMAL(5,2),

  -- Page Association
  landing_page TEXT,

  -- Device Breakdown
  device_type TEXT, -- 'mobile', 'desktop', 'tablet'

  -- Geographic Data
  country TEXT,

  -- Trending
  impressions_change DECIMAL(10,2), -- % change from previous period
  clicks_change DECIMAL(10,2),
  position_change DECIMAL(5,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_query_perf_connection ON unified_query_performance(connection_id);
CREATE INDEX idx_query_perf_date ON unified_query_performance(date DESC);
CREATE INDEX idx_query_perf_query ON unified_query_performance(query);
CREATE INDEX idx_query_perf_clicks ON unified_query_performance(clicks DESC);
CREATE INDEX idx_query_perf_impressions ON unified_query_performance(impressions DESC);
CREATE INDEX idx_query_perf_position ON unified_query_performance(avg_position);

-- RLS Policies
ALTER TABLE unified_query_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own query performance"
  ON unified_query_performance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM analytics_platform_connections
      WHERE analytics_platform_connections.id = unified_query_performance.connection_id
      AND analytics_platform_connections.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all query performance"
  ON unified_query_performance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 4. PAGE PERFORMANCE
-- =====================================================

-- Performance metrics per page/URL
CREATE TABLE IF NOT EXISTS unified_page_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES analytics_platform_connections(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  page_path TEXT NOT NULL,
  page_title TEXT,

  -- Traffic Metrics
  pageviews INT DEFAULT 0,
  unique_pageviews INT DEFAULT 0,
  sessions INT DEFAULT 0,
  users INT DEFAULT 0,

  -- Engagement Metrics
  avg_time_on_page DECIMAL(10,2), -- seconds
  bounce_rate DECIMAL(5,2),
  exit_rate DECIMAL(5,2),

  -- Search Metrics
  impressions BIGINT DEFAULT 0,
  clicks INT DEFAULT 0,
  ctr DECIMAL(5,2),
  avg_position DECIMAL(5,2),

  -- Performance Metrics (from PageSpeed/CWV)
  lcp DECIMAL(8,2), -- Largest Contentful Paint (ms)
  fid DECIMAL(8,2), -- First Input Delay (ms)
  cls DECIMAL(5,3), -- Cumulative Layout Shift

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_page_perf_connection ON unified_page_performance(connection_id);
CREATE INDEX idx_page_perf_date ON unified_page_performance(date DESC);
CREATE INDEX idx_page_perf_page ON unified_page_performance(page_path);
CREATE INDEX idx_page_perf_pageviews ON unified_page_performance(pageviews DESC);

-- RLS Policies
ALTER TABLE unified_page_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own page performance"
  ON unified_page_performance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM analytics_platform_connections
      WHERE analytics_platform_connections.id = unified_page_performance.connection_id
      AND analytics_platform_connections.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all page performance"
  ON unified_page_performance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 5. GEOGRAPHIC TRAFFIC
-- =====================================================

-- Traffic breakdown by country/region
CREATE TABLE IF NOT EXISTS unified_geographic_traffic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES analytics_platform_connections(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Location
  country_code TEXT NOT NULL, -- ISO 3166-1 alpha-2
  country_name TEXT,
  region TEXT,
  city TEXT,

  -- Traffic Metrics
  sessions INT DEFAULT 0,
  users INT DEFAULT 0,
  pageviews INT DEFAULT 0,

  -- Search Metrics
  impressions BIGINT DEFAULT 0,
  clicks INT DEFAULT 0,
  ctr DECIMAL(5,2),

  -- Engagement
  avg_session_duration DECIMAL(10,2),
  bounce_rate DECIMAL(5,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(connection_id, date, country_code, region, city)
);

CREATE INDEX idx_geo_traffic_connection ON unified_geographic_traffic(connection_id);
CREATE INDEX idx_geo_traffic_date ON unified_geographic_traffic(date DESC);
CREATE INDEX idx_geo_traffic_country ON unified_geographic_traffic(country_code);
CREATE INDEX idx_geo_traffic_sessions ON unified_geographic_traffic(sessions DESC);

-- RLS Policies
ALTER TABLE unified_geographic_traffic ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own geographic traffic"
  ON unified_geographic_traffic FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM analytics_platform_connections
      WHERE analytics_platform_connections.id = unified_geographic_traffic.connection_id
      AND analytics_platform_connections.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all geographic traffic"
  ON unified_geographic_traffic FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 6. DEVICE & BROWSER BREAKDOWN
-- =====================================================

CREATE TABLE IF NOT EXISTS unified_device_traffic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES analytics_platform_connections(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Device Info
  device_category TEXT NOT NULL, -- 'mobile', 'desktop', 'tablet'
  device_brand TEXT,
  device_model TEXT,

  -- Browser Info
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  os_version TEXT,

  -- Traffic Metrics
  sessions INT DEFAULT 0,
  users INT DEFAULT 0,
  pageviews INT DEFAULT 0,

  -- Search Metrics
  impressions BIGINT DEFAULT 0,
  clicks INT DEFAULT 0,
  ctr DECIMAL(5,2),

  -- Engagement
  avg_session_duration DECIMAL(10,2),
  bounce_rate DECIMAL(5,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_device_traffic_connection ON unified_device_traffic(connection_id);
CREATE INDEX idx_device_traffic_date ON unified_device_traffic(date DESC);
CREATE INDEX idx_device_traffic_category ON unified_device_traffic(device_category);
CREATE INDEX idx_device_traffic_browser ON unified_device_traffic(browser);

-- RLS Policies
ALTER TABLE unified_device_traffic ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own device traffic"
  ON unified_device_traffic FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM analytics_platform_connections
      WHERE analytics_platform_connections.id = unified_device_traffic.connection_id
      AND analytics_platform_connections.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all device traffic"
  ON unified_device_traffic FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 7. TRAFFIC SOURCES
-- =====================================================

CREATE TABLE IF NOT EXISTS unified_traffic_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES analytics_platform_connections(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Source Classification
  source_medium TEXT NOT NULL, -- e.g., 'google / organic', 'direct / none'
  source TEXT,
  medium TEXT, -- 'organic', 'cpc', 'referral', 'direct', 'social', 'email'
  campaign TEXT,

  -- Referral Details
  referral_path TEXT,

  -- Traffic Metrics
  sessions INT DEFAULT 0,
  users INT DEFAULT 0,
  new_users INT DEFAULT 0,
  pageviews INT DEFAULT 0,

  -- Engagement
  avg_session_duration DECIMAL(10,2),
  bounce_rate DECIMAL(5,2),
  pages_per_session DECIMAL(5,2),

  -- Conversions
  conversions INT DEFAULT 0,
  conversion_rate DECIMAL(5,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_traffic_sources_connection ON unified_traffic_sources(connection_id);
CREATE INDEX idx_traffic_sources_date ON unified_traffic_sources(date DESC);
CREATE INDEX idx_traffic_sources_medium ON unified_traffic_sources(medium);
CREATE INDEX idx_traffic_sources_sessions ON unified_traffic_sources(sessions DESC);

-- RLS Policies
ALTER TABLE unified_traffic_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own traffic sources"
  ON unified_traffic_sources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM analytics_platform_connections
      WHERE analytics_platform_connections.id = unified_traffic_sources.connection_id
      AND analytics_platform_connections.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all traffic sources"
  ON unified_traffic_sources FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 8. SEO OPPORTUNITIES & INSIGHTS
-- =====================================================

CREATE TABLE IF NOT EXISTS seo_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES analytics_platform_connections(id) ON DELETE CASCADE,

  -- Opportunity Type
  opportunity_type TEXT NOT NULL, -- 'low_ctr', 'declining_position', 'high_impressions_low_clicks', 'new_ranking', 'lost_ranking'
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  status TEXT DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'dismissed'

  -- Affected Resource
  page_path TEXT,
  query TEXT,

  -- Metrics
  current_position DECIMAL(5,2),
  previous_position DECIMAL(5,2),
  position_change DECIMAL(5,2),
  current_ctr DECIMAL(5,2),
  expected_ctr DECIMAL(5,2), -- Based on position
  impressions BIGINT,
  clicks INT,

  -- Recommendation
  recommendation TEXT,
  estimated_impact TEXT, -- e.g., "+50 clicks/month"

  -- Actions
  assigned_to UUID REFERENCES auth.users(id),
  notes TEXT,
  resolved_at TIMESTAMPTZ,

  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_seo_opps_connection ON seo_opportunities(connection_id);
CREATE INDEX idx_seo_opps_type ON seo_opportunities(opportunity_type);
CREATE INDEX idx_seo_opps_priority ON seo_opportunities(priority, status);
CREATE INDEX idx_seo_opps_detected ON seo_opportunities(detected_at DESC);

-- RLS Policies
ALTER TABLE seo_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own SEO opportunities"
  ON seo_opportunities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM analytics_platform_connections
      WHERE analytics_platform_connections.id = seo_opportunities.connection_id
      AND analytics_platform_connections.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all SEO opportunities"
  ON seo_opportunities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 9. AUTOMATED INSIGHTS & ANOMALIES
-- =====================================================

CREATE TABLE IF NOT EXISTS analytics_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES analytics_platform_connections(id) ON DELETE CASCADE,

  -- Insight Type
  insight_type TEXT NOT NULL, -- 'anomaly', 'trend', 'milestone', 'alert'
  category TEXT, -- 'traffic', 'engagement', 'seo', 'conversion'
  severity TEXT DEFAULT 'info', -- 'info', 'warning', 'critical'

  -- Content
  title TEXT NOT NULL,
  description TEXT,
  metric_name TEXT,
  metric_value DECIMAL(15,2),
  metric_change DECIMAL(10,2), -- % change

  -- Context
  date_range_start DATE,
  date_range_end DATE,
  affected_pages TEXT[], -- Array of page paths
  affected_queries TEXT[], -- Array of queries

  -- Status
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,

  -- Actions
  recommended_action TEXT,
  action_taken BOOLEAN DEFAULT false,
  action_notes TEXT,

  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_insights_connection ON analytics_insights(connection_id);
CREATE INDEX idx_insights_type ON analytics_insights(insight_type);
CREATE INDEX idx_insights_severity ON analytics_insights(severity);
CREATE INDEX idx_insights_read ON analytics_insights(is_read, is_dismissed);
CREATE INDEX idx_insights_detected ON analytics_insights(detected_at DESC);

-- RLS Policies
ALTER TABLE analytics_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own insights"
  ON analytics_insights FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM analytics_platform_connections
      WHERE analytics_platform_connections.id = analytics_insights.connection_id
      AND analytics_platform_connections.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all insights"
  ON analytics_insights FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 10. FORECASTING DATA
-- =====================================================

CREATE TABLE IF NOT EXISTS traffic_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES analytics_platform_connections(id) ON DELETE CASCADE,

  -- Forecast Details
  forecast_date DATE NOT NULL,
  metric_type TEXT NOT NULL, -- 'sessions', 'users', 'clicks', 'impressions'

  -- Predictions
  predicted_value DECIMAL(15,2),
  confidence_lower DECIMAL(15,2), -- Lower bound of confidence interval
  confidence_upper DECIMAL(15,2), -- Upper bound of confidence interval
  confidence_level DECIMAL(3,2) DEFAULT 0.95, -- 95% confidence

  -- Model Info
  model_type TEXT, -- 'arima', 'prophet', 'linear_regression'
  model_accuracy DECIMAL(5,2), -- R² or similar metric

  -- Context
  based_on_data_from DATE, -- Start date of historical data used
  based_on_data_to DATE, -- End date of historical data used

  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_forecasts_connection ON traffic_forecasts(connection_id);
CREATE INDEX idx_forecasts_date ON traffic_forecasts(forecast_date);
CREATE INDEX idx_forecasts_metric ON traffic_forecasts(metric_type);

-- RLS Policies
ALTER TABLE traffic_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own forecasts"
  ON traffic_forecasts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM analytics_platform_connections
      WHERE analytics_platform_connections.id = traffic_forecasts.connection_id
      AND analytics_platform_connections.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all forecasts"
  ON traffic_forecasts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 11. MATERIALIZED VIEWS FOR PERFORMANCE
-- =====================================================

-- Aggregated daily summary across all connected platforms
CREATE MATERIALIZED VIEW IF NOT EXISTS unified_daily_summary AS
SELECT
  apc.user_id,
  utm.date,
  SUM(utm.sessions) as total_sessions,
  SUM(utm.users) as total_users,
  SUM(utm.new_users) as total_new_users,
  SUM(utm.pageviews) as total_pageviews,
  AVG(utm.bounce_rate) as avg_bounce_rate,
  AVG(utm.avg_session_duration) as avg_session_duration,
  SUM(utm.impressions) as total_impressions,
  SUM(utm.clicks) as total_clicks,
  AVG(utm.ctr) as avg_ctr,
  AVG(utm.avg_position) as avg_position,
  COUNT(DISTINCT apc.id) as connected_platforms
FROM unified_traffic_metrics utm
JOIN analytics_platform_connections apc ON utm.connection_id = apc.id
WHERE apc.is_active = true
GROUP BY apc.user_id, utm.date;

CREATE UNIQUE INDEX idx_daily_summary_user_date ON unified_daily_summary(user_id, date);
CREATE INDEX idx_daily_summary_date ON unified_daily_summary(date DESC);

-- Top performing queries view
CREATE MATERIALIZED VIEW IF NOT EXISTS top_performing_queries AS
SELECT
  apc.user_id,
  uqp.query,
  SUM(uqp.impressions) as total_impressions,
  SUM(uqp.clicks) as total_clicks,
  AVG(uqp.ctr) as avg_ctr,
  AVG(uqp.avg_position) as avg_position,
  MAX(uqp.date) as last_seen_date,
  COUNT(DISTINCT uqp.connection_id) as platforms_count
FROM unified_query_performance uqp
JOIN analytics_platform_connections apc ON uqp.connection_id = apc.id
WHERE apc.is_active = true
  AND uqp.date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY apc.user_id, uqp.query
HAVING SUM(uqp.impressions) > 10;

CREATE INDEX idx_top_queries_user ON top_performing_queries(user_id);
CREATE INDEX idx_top_queries_clicks ON top_performing_queries(total_clicks DESC);
CREATE INDEX idx_top_queries_impressions ON top_performing_queries(total_impressions DESC);

-- =====================================================
-- 12. FUNCTIONS FOR DATA REFRESH
-- =====================================================

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY unified_daily_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY top_performing_queries;
END;
$$;

-- =====================================================
-- 13. AUTOMATED TRIGGERS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
CREATE TRIGGER update_platform_connections_updated_at
  BEFORE UPDATE ON analytics_platform_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_traffic_metrics_updated_at
  BEFORE UPDATE ON unified_traffic_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_query_performance_updated_at
  BEFORE UPDATE ON unified_query_performance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_page_performance_updated_at
  BEFORE UPDATE ON unified_page_performance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_geo_traffic_updated_at
  BEFORE UPDATE ON unified_geographic_traffic
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_device_traffic_updated_at
  BEFORE UPDATE ON unified_device_traffic
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_traffic_sources_updated_at
  BEFORE UPDATE ON unified_traffic_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_seo_opportunities_updated_at
  BEFORE UPDATE ON seo_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_analytics_insights_updated_at
  BEFORE UPDATE ON analytics_insights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 14. INITIAL DATA & COMMENTS
-- =====================================================

COMMENT ON TABLE analytics_platform_connections IS 'OAuth connections to analytics platforms (GA4, GSC, Bing, Yandex)';
COMMENT ON TABLE unified_traffic_metrics IS 'Daily aggregated traffic metrics from all platforms';
COMMENT ON TABLE unified_query_performance IS 'Search query performance data from all search engines';
COMMENT ON TABLE unified_page_performance IS 'Per-page performance metrics and engagement data';
COMMENT ON TABLE unified_geographic_traffic IS 'Geographic breakdown of traffic by country/region/city';
COMMENT ON TABLE unified_device_traffic IS 'Device and browser breakdown of traffic';
COMMENT ON TABLE unified_traffic_sources IS 'Traffic source and medium breakdown';
COMMENT ON TABLE seo_opportunities IS 'Detected SEO opportunities and recommendations';
COMMENT ON TABLE analytics_insights IS 'Automated insights, anomalies, and alerts';
COMMENT ON TABLE traffic_forecasts IS 'Predicted future traffic based on historical data';
