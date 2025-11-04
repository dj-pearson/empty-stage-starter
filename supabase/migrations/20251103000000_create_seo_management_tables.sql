-- =====================================================
-- SEO MANAGEMENT SYSTEM - DATABASE TABLES
-- =====================================================
-- This migration creates comprehensive tables for SEO management,
-- including audit tracking, fix application, keyword tracking,
-- competitor analysis, and page-level SEO scoring.
-- =====================================================

-- =====================================================
-- 1. SEO SETTINGS TABLE
-- =====================================================
-- Stores global SEO configuration (meta tags, robots.txt, etc.)
-- =====================================================

-- Drop existing table if it has conflicts
DROP TABLE IF EXISTS seo_settings CASCADE;

CREATE TABLE seo_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Meta Tags
  title TEXT NOT NULL DEFAULT 'EatPal - Picky Eater Meal Planning Made Easy',
  description TEXT NOT NULL DEFAULT 'Plan weekly meals for picky eaters with safe foods and daily try bites.',
  keywords TEXT DEFAULT 'meal planning, picky eaters, kid meals, grocery list',

  -- Open Graph
  og_title TEXT,
  og_description TEXT,
  og_image TEXT,
  og_url TEXT,

  -- Twitter Card
  twitter_card TEXT DEFAULT 'summary_large_image',
  twitter_site TEXT,
  twitter_creator TEXT,

  -- Files
  robots_txt TEXT,
  sitemap_xml TEXT,
  llms_txt TEXT,

  -- Structured Data
  structured_data JSONB,

  -- Configuration
  auto_fix_enabled BOOLEAN DEFAULT false,
  auto_heal_ai_enabled BOOLEAN DEFAULT false,
  monitoring_enabled BOOLEAN DEFAULT false,
  monitoring_interval_minutes INTEGER DEFAULT 60,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_audit_at TIMESTAMPTZ
);

-- Create a single row for global settings (with explicit column list)
INSERT INTO seo_settings (
  id,
  title,
  description,
  keywords,
  twitter_card,
  auto_fix_enabled,
  auto_heal_ai_enabled,
  monitoring_enabled,
  monitoring_interval_minutes
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'EatPal - Picky Eater Meal Planning Made Easy',
  'Plan weekly meals for picky eaters with safe foods and daily try bites. Auto-generate grocery lists and track meal results.',
  'meal planning, picky eaters, kid meals, grocery list, meal tracker',
  'summary_large_image',
  false,
  false,
  false,
  60
);

-- =====================================================
-- 2. SEO AUDIT HISTORY TABLE
-- =====================================================
-- Tracks all SEO audit results over time
-- =====================================================

DROP TABLE IF EXISTS seo_audit_history CASCADE;

CREATE TABLE seo_audit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Audit Details
  url TEXT NOT NULL,
  audit_type TEXT NOT NULL DEFAULT 'comprehensive', -- 'comprehensive', 'quick', 'page-specific'

  -- Scores
  overall_score INTEGER NOT NULL,
  technical_score INTEGER NOT NULL,
  onpage_score INTEGER NOT NULL,
  performance_score INTEGER NOT NULL,
  mobile_score INTEGER NOT NULL,
  accessibility_score INTEGER NOT NULL,

  -- Results
  results JSONB NOT NULL, -- Array of audit results

  -- Stats
  total_checks INTEGER NOT NULL,
  passed_checks INTEGER NOT NULL,
  warning_checks INTEGER NOT NULL,
  failed_checks INTEGER NOT NULL,

  -- Metadata
  user_agent TEXT,
  triggered_by TEXT DEFAULT 'manual', -- 'manual', 'scheduled', 'auto'
  duration_ms INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying audit history
CREATE INDEX idx_seo_audit_history_created ON seo_audit_history(created_at DESC);
CREATE INDEX idx_seo_audit_history_url ON seo_audit_history(url);

-- =====================================================
-- 3. SEO FIXES APPLIED TABLE
-- =====================================================
-- Tracks SEO fixes that have been applied
-- =====================================================

DROP TABLE IF EXISTS seo_fixes_applied CASCADE;

CREATE TABLE seo_fixes_applied (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Fix Details
  audit_id UUID REFERENCES seo_audit_history(id) ON DELETE SET NULL,
  issue_category TEXT NOT NULL, -- 'Technical SEO', 'On-Page SEO', etc.
  issue_item TEXT NOT NULL,
  issue_description TEXT NOT NULL,

  -- Fix Information
  fix_description TEXT NOT NULL,
  fix_type TEXT NOT NULL, -- 'automatic', 'manual', 'ai-suggested'
  fix_status TEXT NOT NULL DEFAULT 'applied', -- 'applied', 'reverted', 'failed'

  -- Impact
  impact_level TEXT NOT NULL, -- 'high', 'medium', 'low'
  before_score INTEGER,
  after_score INTEGER,

  -- Changes Made
  changes_made JSONB, -- Detailed changes (e.g., {"field": "meta_description", "old": "...", "new": "..."})

  -- AI Details (if AI-powered)
  ai_confidence DECIMAL(5,2), -- 0-100
  ai_model TEXT,
  ai_prompt TEXT,

  -- Metadata
  applied_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_via TEXT DEFAULT 'web', -- 'web', 'api', 'cron'

  -- Timestamps
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  reverted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_seo_fixes_audit ON seo_fixes_applied(audit_id);
CREATE INDEX idx_seo_fixes_status ON seo_fixes_applied(fix_status);
CREATE INDEX idx_seo_fixes_applied_at ON seo_fixes_applied(applied_at DESC);

-- =====================================================
-- 4. SEO KEYWORDS TABLE
-- =====================================================
-- Tracks keyword rankings and performance
-- =====================================================

DROP TABLE IF EXISTS seo_keywords CASCADE;

CREATE TABLE seo_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Keyword Details
  keyword TEXT NOT NULL UNIQUE,
  target_url TEXT NOT NULL,

  -- Current Metrics
  current_position INTEGER,
  search_volume INTEGER,
  difficulty INTEGER, -- 0-100
  cpc DECIMAL(10,2), -- Cost per click

  -- Tracking
  best_position INTEGER,
  worst_position INTEGER,
  position_trend TEXT, -- 'up', 'down', 'stable'

  -- Metadata
  is_primary BOOLEAN DEFAULT false,
  priority TEXT DEFAULT 'medium', -- 'high', 'medium', 'low'
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying keywords
CREATE INDEX idx_seo_keywords_keyword ON seo_keywords(keyword);
CREATE INDEX idx_seo_keywords_priority ON seo_keywords(priority);

-- =====================================================
-- 5. SEO KEYWORD HISTORY TABLE
-- =====================================================
-- Tracks keyword position changes over time
-- =====================================================

DROP TABLE IF EXISTS seo_keyword_history CASCADE;

CREATE TABLE seo_keyword_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  keyword_id UUID NOT NULL REFERENCES seo_keywords(id) ON DELETE CASCADE,

  -- Metrics at this point in time
  position INTEGER NOT NULL,
  search_volume INTEGER,
  difficulty INTEGER,

  -- Timestamp
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying keyword history
CREATE INDEX idx_seo_keyword_history_keyword ON seo_keyword_history(keyword_id, checked_at DESC);

-- =====================================================
-- 6. SEO COMPETITOR ANALYSIS TABLE
-- =====================================================
-- Stores competitor SEO analysis results
-- =====================================================

DROP TABLE IF EXISTS seo_competitor_analysis CASCADE;

CREATE TABLE seo_competitor_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Competitor Details
  competitor_url TEXT NOT NULL,
  competitor_name TEXT,

  -- Scores
  overall_score INTEGER NOT NULL,
  technical_score INTEGER,
  onpage_score INTEGER,
  performance_score INTEGER,
  mobile_score INTEGER,

  -- Analysis Results
  analysis JSONB NOT NULL, -- Full audit results

  -- Comparison vs Our Site
  our_score INTEGER,
  score_difference INTEGER, -- Competitor score - our score
  competitive_advantage TEXT[], -- Areas where competitor is better
  our_advantage TEXT[], -- Areas where we're better

  -- Status
  status_code INTEGER,
  content_type TEXT,

  -- Metadata
  analyzed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_seo_competitor_url ON seo_competitor_analysis(competitor_url);
CREATE INDEX idx_seo_competitor_active ON seo_competitor_analysis(is_active);
CREATE INDEX idx_seo_competitor_analyzed ON seo_competitor_analysis(analyzed_at DESC);

-- =====================================================
-- 7. SEO PAGE SCORES TABLE
-- =====================================================
-- Tracks SEO scores for individual pages
-- =====================================================

DROP TABLE IF EXISTS seo_page_scores CASCADE;

CREATE TABLE seo_page_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Page Details
  page_url TEXT NOT NULL,
  page_title TEXT,
  page_type TEXT, -- 'homepage', 'blog_post', 'landing_page', 'static'

  -- Scores
  overall_score INTEGER NOT NULL,
  technical_score INTEGER,
  onpage_score INTEGER,
  performance_score INTEGER,
  mobile_score INTEGER,
  content_score INTEGER,

  -- Metrics
  word_count INTEGER,
  internal_links_count INTEGER,
  external_links_count INTEGER,
  images_count INTEGER,
  images_with_alt_count INTEGER,

  -- SEO Elements
  has_title_tag BOOLEAN DEFAULT false,
  has_meta_description BOOLEAN DEFAULT false,
  has_h1 BOOLEAN DEFAULT false,
  has_canonical BOOLEAN DEFAULT false,
  has_og_tags BOOLEAN DEFAULT false,
  has_structured_data BOOLEAN DEFAULT false,

  -- Issues
  issues_count INTEGER DEFAULT 0,
  high_priority_issues INTEGER DEFAULT 0,
  medium_priority_issues INTEGER DEFAULT 0,
  low_priority_issues INTEGER DEFAULT 0,

  -- Detailed Issues
  issues JSONB, -- Array of specific issues for this page

  -- Timestamps
  last_analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_seo_page_scores_url ON seo_page_scores(page_url);
CREATE INDEX idx_seo_page_scores_type ON seo_page_scores(page_type);
CREATE INDEX idx_seo_page_scores_score ON seo_page_scores(overall_score DESC);
CREATE INDEX idx_seo_page_scores_analyzed ON seo_page_scores(last_analyzed_at DESC);

-- =====================================================
-- 8. SEO MONITORING LOG TABLE
-- =====================================================
-- Tracks automated SEO monitoring events
-- =====================================================

DROP TABLE IF EXISTS seo_monitoring_log CASCADE;

CREATE TABLE seo_monitoring_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event Details
  event_type TEXT NOT NULL, -- 'audit_scheduled', 'fix_applied', 'keyword_check', 'competitor_check'
  event_status TEXT NOT NULL, -- 'success', 'failed', 'warning'

  -- Details
  message TEXT,
  details JSONB,

  -- Error Handling
  error_message TEXT,
  error_stack TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying logs
CREATE INDEX idx_seo_monitoring_log_created ON seo_monitoring_log(created_at DESC);
CREATE INDEX idx_seo_monitoring_log_type ON seo_monitoring_log(event_type);
CREATE INDEX idx_seo_monitoring_log_status ON seo_monitoring_log(event_status);

-- =====================================================
-- 9. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE seo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_audit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_fixes_applied ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_keyword_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_competitor_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_page_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_monitoring_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 10. CREATE RLS POLICIES
-- =====================================================
-- Using user_roles table to check for admin access

-- SEO Settings: Admin only
CREATE POLICY "Allow admin full access to seo_settings"
  ON seo_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Audit History: Admin read
CREATE POLICY "Allow admin read seo_audit_history"
  ON seo_audit_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Allow admin insert seo_audit_history"
  ON seo_audit_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Fixes Applied: Admin only
CREATE POLICY "Allow admin full access to seo_fixes_applied"
  ON seo_fixes_applied
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Keywords: Admin only
CREATE POLICY "Allow admin full access to seo_keywords"
  ON seo_keywords
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Keyword History: Admin only
CREATE POLICY "Allow admin full access to seo_keyword_history"
  ON seo_keyword_history
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Competitor Analysis: Admin only
CREATE POLICY "Allow admin full access to seo_competitor_analysis"
  ON seo_competitor_analysis
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Page Scores: Admin only
CREATE POLICY "Allow admin full access to seo_page_scores"
  ON seo_page_scores
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Monitoring Log: Admin read only
CREATE POLICY "Allow admin read seo_monitoring_log"
  ON seo_monitoring_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- =====================================================
-- 11. CREATE HELPER FUNCTIONS
-- =====================================================

-- Function to update seo_settings.updated_at
CREATE OR REPLACE FUNCTION update_seo_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_seo_settings_updated_at
  BEFORE UPDATE ON seo_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_seo_settings_updated_at();

-- Function to calculate trend for keywords
CREATE OR REPLACE FUNCTION calculate_keyword_trend(keyword_id_param UUID)
RETURNS TEXT AS $$
DECLARE
  latest_position INTEGER;
  previous_position INTEGER;
  trend TEXT;
BEGIN
  -- Get latest two positions
  SELECT position INTO latest_position
  FROM seo_keyword_history
  WHERE keyword_id = keyword_id_param
  ORDER BY checked_at DESC
  LIMIT 1;

  SELECT position INTO previous_position
  FROM seo_keyword_history
  WHERE keyword_id = keyword_id_param
  ORDER BY checked_at DESC
  LIMIT 1 OFFSET 1;

  IF previous_position IS NULL THEN
    RETURN 'stable';
  END IF;

  IF latest_position < previous_position THEN
    RETURN 'up'; -- Lower position number = higher rank
  ELSIF latest_position > previous_position THEN
    RETURN 'down';
  ELSE
    RETURN 'stable';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get SEO improvement suggestions
CREATE OR REPLACE FUNCTION get_seo_improvement_suggestions()
RETURNS TABLE (
  category TEXT,
  suggestion TEXT,
  priority TEXT,
  estimated_impact INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    'Keywords' as category,
    'Add tracking for keyword: ' || keyword as suggestion,
    'high' as priority,
    15 as estimated_impact
  FROM seo_keywords
  WHERE current_position IS NULL
    AND priority = 'high'
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 12. CREATE INITIAL DATA
-- =====================================================

-- Insert default keywords
INSERT INTO seo_keywords (keyword, target_url, priority, is_primary)
VALUES
  ('picky eater meal planning', '/', 'high', true),
  ('kid meal planner', '/planner', 'high', true),
  ('safe foods for picky eaters', '/pantry', 'medium', false),
  ('meal planning app', '/', 'medium', false)
ON CONFLICT (keyword) DO NOTHING;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

COMMENT ON TABLE seo_settings IS 'Global SEO configuration and settings';
COMMENT ON TABLE seo_audit_history IS 'Historical record of all SEO audits performed';
COMMENT ON TABLE seo_fixes_applied IS 'Track applied SEO fixes and their impact';
COMMENT ON TABLE seo_keywords IS 'Tracked keywords with current rankings';
COMMENT ON TABLE seo_keyword_history IS 'Historical keyword position data';
COMMENT ON TABLE seo_competitor_analysis IS 'Competitor SEO analysis results';
COMMENT ON TABLE seo_page_scores IS 'Individual page SEO performance scores';
COMMENT ON TABLE seo_monitoring_log IS 'Automated monitoring event log';
