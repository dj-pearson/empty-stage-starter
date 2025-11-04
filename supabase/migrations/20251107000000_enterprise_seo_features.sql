-- Enterprise SEO Features Migration
-- Self-contained features that don't rely on 3rd party APIs

-- 1. Technical SEO Crawler Results
CREATE TABLE IF NOT EXISTS seo_crawl_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  start_url TEXT NOT NULL,
  pages_crawled INTEGER NOT NULL,
  total_issues INTEGER NOT NULL,
  critical_issues INTEGER NOT NULL DEFAULT 0,
  high_issues INTEGER NOT NULL DEFAULT 0,
  medium_issues INTEGER NOT NULL DEFAULT 0,
  low_issues INTEGER NOT NULL DEFAULT 0,
  orphaned_pages INTEGER NOT NULL DEFAULT 0,
  avg_word_count INTEGER,
  avg_load_time INTEGER,
  crawl_results JSONB NOT NULL,
  link_graph JSONB,
  crawled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Image SEO Analysis
CREATE TABLE IF NOT EXISTS seo_image_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL,
  total_images INTEGER NOT NULL,
  images_without_alt INTEGER NOT NULL DEFAULT 0,
  images_without_dimensions INTEGER NOT NULL DEFAULT 0,
  oversized_images INTEGER NOT NULL DEFAULT 0,
  unoptimized_formats INTEGER NOT NULL DEFAULT 0,
  total_size BIGINT NOT NULL DEFAULT 0,
  avg_size INTEGER NOT NULL DEFAULT 0,
  lazy_loaded_images INTEGER NOT NULL DEFAULT 0,
  total_issues INTEGER NOT NULL DEFAULT 0,
  image_details JSONB NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Redirect Chain Analysis
CREATE TABLE IF NOT EXISTS seo_redirect_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  analyzed_urls TEXT[] NOT NULL,
  total_urls INTEGER NOT NULL,
  urls_with_redirects INTEGER NOT NULL DEFAULT 0,
  urls_with_chains INTEGER NOT NULL DEFAULT 0,
  urls_with_loops INTEGER NOT NULL DEFAULT 0,
  avg_chain_length NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_issues INTEGER NOT NULL DEFAULT 0,
  redirect_details JSONB NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Duplicate Content Detection
CREATE TABLE IF NOT EXISTS seo_duplicate_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  analyzed_urls TEXT[] NOT NULL,
  total_pages INTEGER NOT NULL,
  exact_duplicates INTEGER NOT NULL DEFAULT 0,
  near_duplicates INTEGER NOT NULL DEFAULT 0,
  similar_pages INTEGER NOT NULL DEFAULT 0,
  thin_content INTEGER NOT NULL DEFAULT 0,
  total_issues INTEGER NOT NULL DEFAULT 0,
  avg_word_count INTEGER,
  duplicate_details JSONB NOT NULL,
  page_details JSONB,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Security Headers Analysis
CREATE TABLE IF NOT EXISTS seo_security_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL,
  protocol TEXT NOT NULL,
  is_https BOOLEAN NOT NULL DEFAULT FALSE,
  overall_score INTEGER NOT NULL DEFAULT 0,
  grade TEXT NOT NULL,
  total_issues INTEGER NOT NULL DEFAULT 0,
  critical_issues INTEGER NOT NULL DEFAULT 0,
  high_issues INTEGER NOT NULL DEFAULT 0,
  medium_issues INTEGER NOT NULL DEFAULT 0,
  low_issues INTEGER NOT NULL DEFAULT 0,
  security_checks JSONB NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Internal Link Analysis
CREATE TABLE IF NOT EXISTS seo_link_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  start_url TEXT NOT NULL,
  total_pages INTEGER NOT NULL,
  total_links INTEGER NOT NULL,
  orphaned_pages INTEGER NOT NULL DEFAULT 0,
  hub_pages INTEGER NOT NULL DEFAULT 0,
  authority_pages INTEGER NOT NULL DEFAULT 0,
  avg_inbound_links NUMERIC(10,2) NOT NULL DEFAULT 0,
  avg_outbound_links NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_depth INTEGER NOT NULL DEFAULT 0,
  avg_depth NUMERIC(5,2) NOT NULL DEFAULT 0,
  page_details JSONB NOT NULL,
  link_graph JSONB NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Structured Data Validation
CREATE TABLE IF NOT EXISTS seo_structured_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL,
  has_structured_data BOOLEAN NOT NULL DEFAULT FALSE,
  total_items INTEGER NOT NULL DEFAULT 0,
  valid_items INTEGER NOT NULL DEFAULT 0,
  invalid_items INTEGER NOT NULL DEFAULT 0,
  overall_score INTEGER NOT NULL DEFAULT 0,
  structured_data_items JSONB,
  issues JSONB,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Mobile-First Analysis
CREATE TABLE IF NOT EXISTS seo_mobile_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL,
  overall_score INTEGER NOT NULL DEFAULT 0,
  grade TEXT NOT NULL,
  total_issues INTEGER NOT NULL DEFAULT 0,
  high_issues INTEGER NOT NULL DEFAULT 0,
  medium_issues INTEGER NOT NULL DEFAULT 0,
  low_issues INTEGER NOT NULL DEFAULT 0,
  mobile_checks JSONB NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Performance Budget Monitoring
CREATE TABLE IF NOT EXISTS seo_performance_budget (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL,
  total_page_size BIGINT NOT NULL,
  total_requests INTEGER NOT NULL,
  third_party_resources INTEGER NOT NULL DEFAULT 0,
  violations_count INTEGER NOT NULL DEFAULT 0,
  passed_budget BOOLEAN NOT NULL DEFAULT TRUE,
  score INTEGER NOT NULL DEFAULT 100,
  resource_metrics JSONB NOT NULL,
  violations JSONB,
  budget_settings JSONB,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_crawl_results_start_url ON seo_crawl_results(start_url);
CREATE INDEX IF NOT EXISTS idx_crawl_results_crawled_at ON seo_crawl_results(crawled_at DESC);
CREATE INDEX IF NOT EXISTS idx_image_analysis_url ON seo_image_analysis(url);
CREATE INDEX IF NOT EXISTS idx_image_analysis_analyzed_at ON seo_image_analysis(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_redirect_analysis_analyzed_at ON seo_redirect_analysis(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_duplicate_content_analyzed_at ON seo_duplicate_content(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_analysis_url ON seo_security_analysis(url);
CREATE INDEX IF NOT EXISTS idx_security_analysis_analyzed_at ON seo_security_analysis(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_analysis_start_url ON seo_link_analysis(start_url);
CREATE INDEX IF NOT EXISTS idx_link_analysis_analyzed_at ON seo_link_analysis(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_structured_data_url ON seo_structured_data(url);
CREATE INDEX IF NOT EXISTS idx_structured_data_validated_at ON seo_structured_data(validated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mobile_analysis_url ON seo_mobile_analysis(url);
CREATE INDEX IF NOT EXISTS idx_mobile_analysis_analyzed_at ON seo_mobile_analysis(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_performance_budget_url ON seo_performance_budget(url);
CREATE INDEX IF NOT EXISTS idx_performance_budget_analyzed_at ON seo_performance_budget(analyzed_at DESC);

-- RLS Policies (Admin only access)
ALTER TABLE seo_crawl_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_image_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_redirect_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_duplicate_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_security_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_link_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_structured_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_mobile_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_performance_budget ENABLE ROW LEVEL SECURITY;

-- Admin SELECT policies
CREATE POLICY "Admin users can view crawl results"
  ON seo_crawl_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can view image analysis"
  ON seo_image_analysis FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can view redirect analysis"
  ON seo_redirect_analysis FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can view duplicate content"
  ON seo_duplicate_content FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can view security analysis"
  ON seo_security_analysis FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can view link analysis"
  ON seo_link_analysis FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can view structured data"
  ON seo_structured_data FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can view mobile analysis"
  ON seo_mobile_analysis FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can view performance budget"
  ON seo_performance_budget FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Admin INSERT policies
CREATE POLICY "Admin users can insert crawl results"
  ON seo_crawl_results FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can insert image analysis"
  ON seo_image_analysis FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can insert redirect analysis"
  ON seo_redirect_analysis FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can insert duplicate content"
  ON seo_duplicate_content FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can insert security analysis"
  ON seo_security_analysis FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can insert link analysis"
  ON seo_link_analysis FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can insert structured data"
  ON seo_structured_data FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can insert mobile analysis"
  ON seo_mobile_analysis FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can insert performance budget"
  ON seo_performance_budget FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Comments for documentation
COMMENT ON TABLE seo_crawl_results IS 'Technical SEO crawler results - comprehensive site analysis';
COMMENT ON TABLE seo_image_analysis IS 'Image SEO analysis - alt text, file sizes, formats';
COMMENT ON TABLE seo_redirect_analysis IS 'Redirect chain detection - chains, loops, latency';
COMMENT ON TABLE seo_duplicate_content IS 'Duplicate content detection - exact, near-duplicate, similar';
COMMENT ON TABLE seo_security_analysis IS 'Security headers analysis - HTTPS, CSP, HSTS, etc.';
COMMENT ON TABLE seo_link_analysis IS 'Internal link analysis - PageRank scores, orphaned pages';
COMMENT ON TABLE seo_structured_data IS 'Structured data validation - JSON-LD Schema.org';
COMMENT ON TABLE seo_mobile_analysis IS 'Mobile-first analysis - viewport, touch targets, responsive';
COMMENT ON TABLE seo_performance_budget IS 'Performance budget monitoring - page size, requests, resources';
