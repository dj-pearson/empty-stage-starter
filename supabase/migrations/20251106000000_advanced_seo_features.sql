-- =============================================
-- Advanced SEO Features Migration
-- =============================================
-- Features Added:
-- 1. Core Web Vitals Monitoring
-- 2. Backlink Tracking
-- 3. Broken Link Checker
-- 4. SERP Position Tracking
-- 5. Content Optimization Metrics
-- =============================================

-- =============================================
-- 1. CORE WEB VITALS MONITORING
-- =============================================

-- Core Web Vitals history and tracking
CREATE TABLE IF NOT EXISTS seo_core_web_vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Page Information
  page_url TEXT NOT NULL,
  page_id UUID REFERENCES seo_page_scores(id) ON DELETE CASCADE,

  -- Core Web Vitals Metrics (Mobile)
  mobile_lcp DECIMAL(10,2), -- Largest Contentful Paint (seconds)
  mobile_fid DECIMAL(10,2), -- First Input Delay (milliseconds) - deprecated
  mobile_inp DECIMAL(10,2), -- Interaction to Next Paint (milliseconds)
  mobile_cls DECIMAL(10,4), -- Cumulative Layout Shift (score)
  mobile_fcp DECIMAL(10,2), -- First Contentful Paint (seconds)
  mobile_ttfb DECIMAL(10,2), -- Time to First Byte (seconds)
  mobile_speed_index DECIMAL(10,2), -- Speed Index
  mobile_tbt DECIMAL(10,2), -- Total Blocking Time (milliseconds)
  mobile_performance_score INTEGER CHECK (mobile_performance_score BETWEEN 0 AND 100),

  -- Core Web Vitals Metrics (Desktop)
  desktop_lcp DECIMAL(10,2),
  desktop_fid DECIMAL(10,2),
  desktop_inp DECIMAL(10,2),
  desktop_cls DECIMAL(10,4),
  desktop_fcp DECIMAL(10,2),
  desktop_ttfb DECIMAL(10,2),
  desktop_speed_index DECIMAL(10,2),
  desktop_tbt DECIMAL(10,2),
  desktop_performance_score INTEGER CHECK (desktop_performance_score BETWEEN 0 AND 100),

  -- PageSpeed Insights Scores
  accessibility_score INTEGER CHECK (accessibility_score BETWEEN 0 AND 100),
  best_practices_score INTEGER CHECK (best_practices_score BETWEEN 0 AND 100),
  seo_score INTEGER CHECK (seo_score BETWEEN 0 AND 100),

  -- Status Classification
  lcp_status TEXT CHECK (lcp_status IN ('good', 'needs-improvement', 'poor')),
  fid_status TEXT CHECK (fid_status IN ('good', 'needs-improvement', 'poor')),
  inp_status TEXT CHECK (inp_status IN ('good', 'needs-improvement', 'poor')),
  cls_status TEXT CHECK (cls_status IN ('good', 'needs-improvement', 'poor')),

  -- Opportunities and Diagnostics
  opportunities JSONB DEFAULT '[]'::jsonb, -- Array of optimization opportunities
  diagnostics JSONB DEFAULT '[]'::jsonb, -- Array of diagnostic info

  -- Metadata
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_cwv_measurement UNIQUE (page_url, measured_at)
);

-- Indexes for Core Web Vitals
CREATE INDEX idx_cwv_page_url ON seo_core_web_vitals(page_url);
CREATE INDEX idx_cwv_page_id ON seo_core_web_vitals(page_id);
CREATE INDEX idx_cwv_measured_at ON seo_core_web_vitals(measured_at DESC);
CREATE INDEX idx_cwv_mobile_performance ON seo_core_web_vitals(mobile_performance_score DESC);
CREATE INDEX idx_cwv_lcp_status ON seo_core_web_vitals(lcp_status);

-- RLS Policies for Core Web Vitals
ALTER TABLE seo_core_web_vitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view core web vitals"
  ON seo_core_web_vitals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can insert core web vitals"
  ON seo_core_web_vitals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- =============================================
-- 2. BACKLINK TRACKING
-- =============================================

-- Backlink tracking and monitoring
CREATE TABLE IF NOT EXISTS seo_backlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link Information
  source_url TEXT NOT NULL, -- URL of the page containing the backlink
  source_domain TEXT NOT NULL, -- Domain of the source
  target_url TEXT NOT NULL, -- URL being linked to (your page)
  anchor_text TEXT, -- The anchor text of the link
  link_type TEXT CHECK (link_type IN ('dofollow', 'nofollow', 'ugc', 'sponsored')),

  -- Link Quality Metrics
  domain_authority INTEGER CHECK (domain_authority BETWEEN 0 AND 100), -- Moz DA or equivalent
  page_authority INTEGER CHECK (page_authority BETWEEN 0 AND 100), -- Moz PA or equivalent
  domain_rating INTEGER CHECK (domain_rating BETWEEN 0 AND 100), -- Ahrefs DR or equivalent
  url_rating INTEGER CHECK (url_rating BETWEEN 0 AND 100), -- Ahrefs UR or equivalent
  spam_score INTEGER CHECK (spam_score BETWEEN 0 AND 100), -- Spam/toxicity score
  trust_score INTEGER CHECK (trust_score BETWEEN 0 AND 100), -- Trust rating

  -- Link Context
  link_position TEXT CHECK (link_position IN ('content', 'sidebar', 'footer', 'header', 'navigation', 'unknown')),
  surrounding_text TEXT, -- Text surrounding the link
  is_image_link BOOLEAN DEFAULT false,

  -- Link Status
  status TEXT CHECK (status IN ('active', 'lost', 'broken', 'redirected', 'toxic')) DEFAULT 'active',
  http_status_code INTEGER,
  last_checked_at TIMESTAMPTZ,

  -- Discovery Information
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lost_at TIMESTAMPTZ, -- When the link was lost/removed
  data_source TEXT CHECK (data_source IN ('ahrefs', 'moz', 'semrush', 'majestic', 'manual', 'google_search_console')),

  -- Competitor Tracking
  is_competitor_link BOOLEAN DEFAULT false,
  competitor_domain TEXT, -- If tracking competitor backlinks

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_backlink UNIQUE (source_url, target_url)
);

-- Indexes for Backlinks
CREATE INDEX idx_backlinks_source_domain ON seo_backlinks(source_domain);
CREATE INDEX idx_backlinks_target_url ON seo_backlinks(target_url);
CREATE INDEX idx_backlinks_status ON seo_backlinks(status);
CREATE INDEX idx_backlinks_first_seen ON seo_backlinks(first_seen_at DESC);
CREATE INDEX idx_backlinks_domain_authority ON seo_backlinks(domain_authority DESC NULLS LAST);
CREATE INDEX idx_backlinks_spam_score ON seo_backlinks(spam_score DESC NULLS LAST);
CREATE INDEX idx_backlinks_competitor ON seo_backlinks(is_competitor_link, competitor_domain) WHERE is_competitor_link = true;

-- RLS Policies for Backlinks
ALTER TABLE seo_backlinks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view backlinks"
  ON seo_backlinks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can manage backlinks"
  ON seo_backlinks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Backlink history for tracking changes
CREATE TABLE IF NOT EXISTS seo_backlink_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backlink_id UUID NOT NULL REFERENCES seo_backlinks(id) ON DELETE CASCADE,

  -- Historical metrics
  domain_authority INTEGER,
  page_authority INTEGER,
  spam_score INTEGER,
  status TEXT,
  http_status_code INTEGER,

  -- Timestamp
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_backlink_history UNIQUE (backlink_id, recorded_at)
);

CREATE INDEX idx_backlink_history_backlink_id ON seo_backlink_history(backlink_id);
CREATE INDEX idx_backlink_history_recorded_at ON seo_backlink_history(recorded_at DESC);

-- RLS for Backlink History
ALTER TABLE seo_backlink_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view backlink history"
  ON seo_backlink_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- =============================================
-- 3. BROKEN LINK CHECKER
-- =============================================

-- Broken links tracking
CREATE TABLE IF NOT EXISTS seo_broken_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link Information
  source_page_url TEXT NOT NULL, -- Page where the broken link was found
  broken_url TEXT NOT NULL, -- The broken link URL
  link_text TEXT, -- Anchor text or image alt text
  link_type TEXT CHECK (link_type IN ('internal', 'external', 'image', 'stylesheet', 'script', 'unknown')),

  -- Error Information
  http_status_code INTEGER, -- 404, 500, etc.
  error_message TEXT, -- Details about the error

  -- Context
  link_position TEXT CHECK (link_position IN ('content', 'navigation', 'sidebar', 'footer', 'header', 'unknown')),
  surrounding_context TEXT, -- HTML context around the link

  -- Resolution Status
  status TEXT CHECK (status IN ('active', 'resolved', 'ignored', 'redirected', 'deleted')) DEFAULT 'active',
  resolution_notes TEXT,
  suggested_replacement TEXT, -- AI or manual suggestion for replacement

  -- Impact Assessment
  priority TEXT CHECK (priority IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  impact_score INTEGER CHECK (impact_score BETWEEN 0 AND 100), -- Based on page importance, link position, etc.

  -- Timestamps
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,

  -- Metadata
  check_frequency_hours INTEGER DEFAULT 24, -- How often to recheck
  consecutive_failures INTEGER DEFAULT 1, -- Times checked and still broken
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_broken_link UNIQUE (source_page_url, broken_url)
);

-- Indexes for Broken Links
CREATE INDEX idx_broken_links_source_page ON seo_broken_links(source_page_url);
CREATE INDEX idx_broken_links_broken_url ON seo_broken_links(broken_url);
CREATE INDEX idx_broken_links_status ON seo_broken_links(status);
CREATE INDEX idx_broken_links_priority ON seo_broken_links(priority);
CREATE INDEX idx_broken_links_first_detected ON seo_broken_links(first_detected_at DESC);
CREATE INDEX idx_broken_links_link_type ON seo_broken_links(link_type);

-- RLS Policies for Broken Links
ALTER TABLE seo_broken_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view broken links"
  ON seo_broken_links FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can manage broken links"
  ON seo_broken_links FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- =============================================
-- 4. SERP POSITION TRACKING (Enhanced)
-- =============================================

-- SERP tracking for any keyword (not just your rankings)
CREATE TABLE IF NOT EXISTS seo_serp_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Search Query
  keyword TEXT NOT NULL,
  search_engine TEXT CHECK (search_engine IN ('google', 'bing', 'yahoo', 'duckduckgo')) DEFAULT 'google',
  location TEXT, -- Geographic location of search (e.g., "United States", "New York, NY")
  language TEXT DEFAULT 'en', -- Language code
  device TEXT CHECK (device IN ('mobile', 'desktop', 'tablet')) DEFAULT 'desktop',

  -- Your Ranking
  your_position INTEGER, -- Your position (null if not in top 100)
  your_url TEXT, -- Your URL in SERPs

  -- Competitor Rankings
  competitors JSONB DEFAULT '[]'::jsonb, -- Array of {domain, position, url, title, description}

  -- SERP Features
  has_featured_snippet BOOLEAN DEFAULT false,
  featured_snippet_owner TEXT, -- Domain owning the featured snippet
  has_people_also_ask BOOLEAN DEFAULT false,
  has_knowledge_panel BOOLEAN DEFAULT false,
  has_local_pack BOOLEAN DEFAULT false,
  has_image_pack BOOLEAN DEFAULT false,
  has_video_carousel BOOLEAN DEFAULT false,
  serp_features JSONB DEFAULT '[]'::jsonb, -- Detailed SERP features data

  -- SERP Analysis
  total_results BIGINT, -- Total number of results
  page_results INTEGER, -- Number of results on first page
  avg_title_length INTEGER,
  avg_description_length INTEGER,

  -- Change Tracking
  position_change INTEGER, -- Change from last check
  position_trend TEXT CHECK (position_trend IN ('up', 'down', 'stable', 'new', 'lost')),

  -- Data Source
  data_source TEXT CHECK (data_source IN ('serpapi', 'dataforseo', 'manual', 'gsc', 'scrapingbee', 'zenserp')),
  api_response JSONB, -- Full API response for reference

  -- Timestamps
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_serp_check UNIQUE (keyword, search_engine, location, device, checked_at)
);

-- Indexes for SERP Tracking
CREATE INDEX idx_serp_tracking_keyword ON seo_serp_tracking(keyword);
CREATE INDEX idx_serp_tracking_your_position ON seo_serp_tracking(your_position) WHERE your_position IS NOT NULL;
CREATE INDEX idx_serp_tracking_checked_at ON seo_serp_tracking(checked_at DESC);
CREATE INDEX idx_serp_tracking_device ON seo_serp_tracking(device);
CREATE INDEX idx_serp_tracking_keyword_checked ON seo_serp_tracking(keyword, checked_at DESC);
CREATE INDEX idx_serp_tracking_featured_snippet ON seo_serp_tracking(has_featured_snippet) WHERE has_featured_snippet = true;

-- RLS Policies for SERP Tracking
ALTER TABLE seo_serp_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view serp tracking"
  ON seo_serp_tracking FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can manage serp tracking"
  ON seo_serp_tracking FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- =============================================
-- 5. CONTENT OPTIMIZATION METRICS
-- =============================================

-- Advanced content analysis
CREATE TABLE IF NOT EXISTS seo_content_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Page Information
  page_url TEXT NOT NULL,
  page_id UUID REFERENCES seo_page_scores(id) ON DELETE CASCADE,
  content_type TEXT CHECK (content_type IN ('blog_post', 'landing_page', 'product_page', 'category_page', 'other')),

  -- Keyword Analysis
  target_keyword TEXT,
  keyword_density DECIMAL(5,2), -- Percentage
  keyword_count INTEGER,
  lsi_keywords JSONB DEFAULT '[]'::jsonb, -- Latent Semantic Indexing keywords found
  keyword_variations JSONB DEFAULT '[]'::jsonb, -- Variations of target keyword

  -- Readability Metrics
  flesch_reading_ease DECIMAL(5,2), -- 0-100 score
  flesch_kincaid_grade DECIMAL(5,2), -- Grade level
  gunning_fog_index DECIMAL(5,2),
  smog_index DECIMAL(5,2),
  coleman_liau_index DECIMAL(5,2),
  automated_readability_index DECIMAL(5,2),

  -- Content Structure
  word_count INTEGER,
  sentence_count INTEGER,
  paragraph_count INTEGER,
  avg_sentence_length DECIMAL(5,2),
  avg_word_length DECIMAL(5,2),

  -- Content Quality
  passive_voice_percentage DECIMAL(5,2),
  transition_words_percentage DECIMAL(5,2),
  complex_words_percentage DECIMAL(5,2),

  -- Heading Analysis
  h1_count INTEGER,
  h2_count INTEGER,
  h3_count INTEGER,
  heading_structure_score INTEGER CHECK (heading_structure_score BETWEEN 0 AND 100),

  -- Link Analysis
  internal_links_count INTEGER,
  external_links_count INTEGER,
  broken_links_count INTEGER,

  -- Image Analysis
  images_count INTEGER,
  images_with_alt_count INTEGER,
  images_optimized_count INTEGER,

  -- AI Content Suggestions
  ai_suggestions JSONB DEFAULT '[]'::jsonb, -- Array of improvement suggestions
  ai_score INTEGER CHECK (ai_score BETWEEN 0 AND 100),
  ai_analysis_provider TEXT CHECK (ai_analysis_provider IN ('openai', 'claude', 'gemini', 'internal')),

  -- Competitor Comparison
  content_gap_analysis JSONB DEFAULT '{}'::jsonb, -- Comparison with top-ranking content
  competitor_avg_word_count INTEGER,
  competitor_avg_heading_count INTEGER,

  -- Overall Scoring
  overall_content_score INTEGER CHECK (overall_content_score BETWEEN 0 AND 100),
  readability_score INTEGER CHECK (readability_score BETWEEN 0 AND 100),
  keyword_optimization_score INTEGER CHECK (keyword_optimization_score BETWEEN 0 AND 100),
  structure_score INTEGER CHECK (structure_score BETWEEN 0 AND 100),

  -- Timestamps
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_content_analysis UNIQUE (page_url, analyzed_at)
);

-- Indexes for Content Analysis
CREATE INDEX idx_content_analysis_page_url ON seo_content_analysis(page_url);
CREATE INDEX idx_content_analysis_page_id ON seo_content_analysis(page_id);
CREATE INDEX idx_content_analysis_target_keyword ON seo_content_analysis(target_keyword);
CREATE INDEX idx_content_analysis_analyzed_at ON seo_content_analysis(analyzed_at DESC);
CREATE INDEX idx_content_analysis_overall_score ON seo_content_analysis(overall_content_score DESC);
CREATE INDEX idx_content_analysis_readability ON seo_content_analysis(flesch_reading_ease DESC);

-- RLS Policies for Content Analysis
ALTER TABLE seo_content_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view content analysis"
  ON seo_content_analysis FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can manage content analysis"
  ON seo_content_analysis FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to get Core Web Vitals trend
CREATE OR REPLACE FUNCTION get_core_web_vitals_trend(
  p_page_url TEXT,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  mobile_performance_score INTEGER,
  desktop_performance_score INTEGER,
  mobile_lcp DECIMAL,
  mobile_cls DECIMAL,
  lcp_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(measured_at) as date,
    cwv.mobile_performance_score,
    cwv.desktop_performance_score,
    cwv.mobile_lcp,
    cwv.mobile_cls,
    cwv.lcp_status
  FROM seo_core_web_vitals cwv
  WHERE cwv.page_url = p_page_url
    AND measured_at >= now() - (p_days || ' days')::interval
  ORDER BY measured_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get backlink summary
CREATE OR REPLACE FUNCTION get_backlink_summary()
RETURNS TABLE (
  total_backlinks BIGINT,
  active_backlinks BIGINT,
  lost_backlinks BIGINT,
  toxic_backlinks BIGINT,
  avg_domain_authority DECIMAL,
  new_backlinks_30d BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_backlinks,
    COUNT(*) FILTER (WHERE status = 'active')::BIGINT as active_backlinks,
    COUNT(*) FILTER (WHERE status = 'lost')::BIGINT as lost_backlinks,
    COUNT(*) FILTER (WHERE status = 'toxic')::BIGINT as toxic_backlinks,
    AVG(domain_authority) as avg_domain_authority,
    COUNT(*) FILTER (WHERE first_seen_at >= now() - interval '30 days')::BIGINT as new_backlinks_30d
  FROM seo_backlinks;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get broken links by priority
CREATE OR REPLACE FUNCTION get_broken_links_by_priority()
RETURNS TABLE (
  priority TEXT,
  count BIGINT,
  avg_impact_score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    bl.priority,
    COUNT(*)::BIGINT as count,
    AVG(bl.impact_score) as avg_impact_score
  FROM seo_broken_links bl
  WHERE status = 'active'
  GROUP BY bl.priority
  ORDER BY
    CASE priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get SERP position changes
CREATE OR REPLACE FUNCTION get_serp_position_changes(
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  keyword TEXT,
  current_position INTEGER,
  previous_position INTEGER,
  position_change INTEGER,
  trend TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_positions AS (
    SELECT DISTINCT ON (keyword)
      keyword,
      your_position as current_position,
      position_change,
      position_trend as trend
    FROM seo_serp_tracking
    WHERE checked_at >= now() - (p_days || ' days')::interval
    ORDER BY keyword, checked_at DESC
  ),
  previous_positions AS (
    SELECT DISTINCT ON (keyword)
      keyword,
      your_position as previous_position
    FROM seo_serp_tracking
    WHERE checked_at < now() - (p_days || ' days')::interval
      AND checked_at >= now() - ((p_days * 2) || ' days')::interval
    ORDER BY keyword, checked_at DESC
  )
  SELECT
    lp.keyword,
    lp.current_position,
    pp.previous_position,
    lp.position_change,
    lp.trend
  FROM latest_positions lp
  LEFT JOIN previous_positions pp ON lp.keyword = pp.keyword
  WHERE lp.current_position IS NOT NULL
  ORDER BY ABS(lp.position_change) DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- UPDATE TRIGGERS
-- =============================================

-- Auto-update updated_at timestamp for backlinks
CREATE OR REPLACE FUNCTION update_backlinks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_backlinks_updated_at
  BEFORE UPDATE ON seo_backlinks
  FOR EACH ROW
  EXECUTE FUNCTION update_backlinks_updated_at();

-- Auto-update updated_at timestamp for broken links
CREATE OR REPLACE FUNCTION update_broken_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_broken_links_updated_at
  BEFORE UPDATE ON seo_broken_links
  FOR EACH ROW
  EXECUTE FUNCTION update_broken_links_updated_at();

-- =============================================
-- ALERT TRIGGERS FOR NEW FEATURES
-- =============================================

-- Trigger alert when Core Web Vitals drop significantly
CREATE OR REPLACE FUNCTION trigger_cwv_alert()
RETURNS TRIGGER AS $$
DECLARE
  v_previous_score INTEGER;
  v_score_drop INTEGER;
BEGIN
  -- Get the previous performance score
  SELECT mobile_performance_score INTO v_previous_score
  FROM seo_core_web_vitals
  WHERE page_url = NEW.page_url
    AND measured_at < NEW.measured_at
  ORDER BY measured_at DESC
  LIMIT 1;

  -- Check if score dropped by 10 or more points
  IF v_previous_score IS NOT NULL AND NEW.mobile_performance_score IS NOT NULL THEN
    v_score_drop := v_previous_score - NEW.mobile_performance_score;

    IF v_score_drop >= 10 THEN
      INSERT INTO seo_alerts (
        alert_type,
        severity,
        title,
        message,
        metadata
      ) VALUES (
        'core_web_vitals_drop',
        CASE
          WHEN v_score_drop >= 20 THEN 'critical'
          WHEN v_score_drop >= 15 THEN 'high'
          ELSE 'medium'
        END,
        'Core Web Vitals Performance Drop',
        format('Performance score for %s dropped from %s to %s (-%s points)',
          NEW.page_url, v_previous_score, NEW.mobile_performance_score, v_score_drop),
        jsonb_build_object(
          'page_url', NEW.page_url,
          'previous_score', v_previous_score,
          'current_score', NEW.mobile_performance_score,
          'drop', v_score_drop
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cwv_performance_alert
  AFTER INSERT ON seo_core_web_vitals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_cwv_alert();

-- Trigger alert when new toxic backlinks are found
CREATE OR REPLACE FUNCTION trigger_toxic_backlink_alert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'toxic' AND NEW.spam_score >= 70 THEN
    INSERT INTO seo_alerts (
      alert_type,
      severity,
      title,
      message,
      metadata
    ) VALUES (
      'toxic_backlink_detected',
      CASE
        WHEN NEW.spam_score >= 90 THEN 'critical'
        WHEN NEW.spam_score >= 80 THEN 'high'
        ELSE 'medium'
      END,
      'Toxic Backlink Detected',
      format('Potentially toxic backlink from %s (spam score: %s)',
        NEW.source_domain, NEW.spam_score),
      jsonb_build_object(
        'source_url', NEW.source_url,
        'source_domain', NEW.source_domain,
        'target_url', NEW.target_url,
        'spam_score', NEW.spam_score
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_toxic_backlink_detection
  AFTER INSERT OR UPDATE ON seo_backlinks
  FOR EACH ROW
  WHEN (NEW.status = 'toxic')
  EXECUTE FUNCTION trigger_toxic_backlink_alert();

-- Trigger alert when critical broken links are found
CREATE OR REPLACE FUNCTION trigger_broken_link_alert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.priority IN ('critical', 'high') AND NEW.status = 'active' THEN
    INSERT INTO seo_alerts (
      alert_type,
      severity,
      title,
      message,
      metadata
    ) VALUES (
      'broken_link_detected',
      CASE NEW.priority
        WHEN 'critical' THEN 'high'
        ELSE 'medium'
      END,
      format('%s Priority Broken Link', INITCAP(NEW.priority)),
      format('Broken link found on %s: %s (HTTP %s)',
        NEW.source_page_url, NEW.broken_url, NEW.http_status_code),
      jsonb_build_object(
        'source_page_url', NEW.source_page_url,
        'broken_url', NEW.broken_url,
        'http_status_code', NEW.http_status_code,
        'priority', NEW.priority
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_critical_broken_link_detection
  AFTER INSERT ON seo_broken_links
  FOR EACH ROW
  WHEN (NEW.priority IN ('critical', 'high'))
  EXECUTE FUNCTION trigger_broken_link_alert();

-- =============================================
-- GRANT PERMISSIONS
-- =============================================

-- Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION get_core_web_vitals_trend(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_backlink_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION get_broken_links_by_priority() TO authenticated;
GRANT EXECUTE ON FUNCTION get_serp_position_changes(INTEGER) TO authenticated;

-- =============================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================

COMMENT ON TABLE seo_core_web_vitals IS 'Tracks Core Web Vitals metrics from PageSpeed Insights for performance monitoring';
COMMENT ON TABLE seo_backlinks IS 'Tracks inbound links with quality metrics for link building monitoring';
COMMENT ON TABLE seo_backlink_history IS 'Historical tracking of backlink metrics for trend analysis';
COMMENT ON TABLE seo_broken_links IS 'Identifies and tracks broken links across the website';
COMMENT ON TABLE seo_serp_tracking IS 'Advanced SERP position tracking for keywords with competitor analysis';
COMMENT ON TABLE seo_content_analysis IS 'Comprehensive content analysis including readability and keyword optimization';

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
-- This migration adds 6 new tables:
--   1. seo_core_web_vitals
--   2. seo_backlinks
--   3. seo_backlink_history
--   4. seo_broken_links
--   5. seo_serp_tracking
--   6. seo_content_analysis
-- Plus helper functions and automated alert triggers
-- =============================================
