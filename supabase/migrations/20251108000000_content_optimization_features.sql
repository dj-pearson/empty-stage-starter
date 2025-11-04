-- Content Optimization Features Migration
-- AI-powered content suggestions, LSI keywords, and semantic analysis

-- 1. Content Optimization Results
CREATE TABLE IF NOT EXISTS seo_content_optimization (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_url TEXT NOT NULL,
  target_keyword TEXT,

  -- Title Optimization
  current_title TEXT,
  suggested_title TEXT,

  -- Meta Description Optimization
  current_meta_description TEXT,
  suggested_meta_description TEXT,

  -- Detailed Optimization Suggestions (JSONB for flexibility)
  heading_optimizations JSONB, -- Array of heading improvement suggestions
  lsi_keywords JSONB, -- Array of LSI keyword suggestions
  semantic_clusters JSONB, -- Array of semantic keyword clusters
  content_gaps JSONB, -- Array of missing content topics
  structure_improvements JSONB, -- Array of structural improvement suggestions
  key_rewrites JSONB, -- Array of specific rewrite suggestions

  -- Scoring
  overall_score INTEGER NOT NULL DEFAULT 0,
  priority_actions JSONB, -- Array of top priority actions

  -- Competitor Analysis
  competitor_urls JSONB, -- Array of competitor URLs analyzed

  -- Timestamps
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Semantic Keyword Analysis
CREATE TABLE IF NOT EXISTS seo_semantic_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_url TEXT,
  target_keyword TEXT,

  -- Semantic Analysis Results
  lsi_keywords JSONB NOT NULL, -- Array of LSI keywords with relevance scores
  entities JSONB NOT NULL, -- Array of extracted entities (people, places, organizations)
  topic_clusters JSONB NOT NULL, -- Array of topic clusters with coverage analysis
  semantic_gaps JSONB NOT NULL, -- Array of missing semantic terms
  intent_signals JSONB NOT NULL, -- Search intent analysis

  -- Scoring
  semantic_score INTEGER NOT NULL DEFAULT 0,
  top_recommendations JSONB, -- Array of top recommendations

  -- Timestamps
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_content_optimization_page_url ON seo_content_optimization(page_url);
CREATE INDEX IF NOT EXISTS idx_content_optimization_analyzed_at ON seo_content_optimization(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_optimization_target_keyword ON seo_content_optimization(target_keyword);
CREATE INDEX IF NOT EXISTS idx_content_optimization_overall_score ON seo_content_optimization(overall_score DESC);

CREATE INDEX IF NOT EXISTS idx_semantic_analysis_page_url ON seo_semantic_analysis(page_url);
CREATE INDEX IF NOT EXISTS idx_semantic_analysis_analyzed_at ON seo_semantic_analysis(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_analysis_target_keyword ON seo_semantic_analysis(target_keyword);
CREATE INDEX IF NOT EXISTS idx_semantic_analysis_semantic_score ON seo_semantic_analysis(semantic_score DESC);

-- RLS Policies (Admin only access)
ALTER TABLE seo_content_optimization ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_semantic_analysis ENABLE ROW LEVEL SECURITY;

-- Admin SELECT policies
CREATE POLICY "Admin users can view content optimization"
  ON seo_content_optimization FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can view semantic analysis"
  ON seo_semantic_analysis FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Admin INSERT policies
CREATE POLICY "Admin users can insert content optimization"
  ON seo_content_optimization FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can insert semantic analysis"
  ON seo_semantic_analysis FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Admin UPDATE policies (for re-analysis)
CREATE POLICY "Admin users can update content optimization"
  ON seo_content_optimization FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can update semantic analysis"
  ON seo_semantic_analysis FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Admin DELETE policies (for cleanup)
CREATE POLICY "Admin users can delete content optimization"
  ON seo_content_optimization FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admin users can delete semantic analysis"
  ON seo_semantic_analysis FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::app_role
    )
  );

-- Comments for documentation
COMMENT ON TABLE seo_content_optimization IS 'AI-powered content optimization suggestions with before/after examples';
COMMENT ON TABLE seo_semantic_analysis IS 'Semantic keyword analysis - LSI keywords, entities, topic clusters';

COMMENT ON COLUMN seo_content_optimization.heading_optimizations IS 'Array of heading improvement suggestions with current/suggested/reasoning';
COMMENT ON COLUMN seo_content_optimization.lsi_keywords IS 'Array of LSI keyword suggestions with relevance and placement';
COMMENT ON COLUMN seo_content_optimization.semantic_clusters IS 'Array of semantic keyword clusters with usage tips';
COMMENT ON COLUMN seo_content_optimization.content_gaps IS 'Array of missing content topics compared to competitors';
COMMENT ON COLUMN seo_content_optimization.structure_improvements IS 'Array of content structure improvements (add/expand/rewrite/remove)';
COMMENT ON COLUMN seo_content_optimization.key_rewrites IS 'Array of specific text rewrite suggestions with before/after';
COMMENT ON COLUMN seo_content_optimization.priority_actions IS 'Top 3-5 priority actions to take immediately';

COMMENT ON COLUMN seo_semantic_analysis.lsi_keywords IS 'LSI keywords with relevance, current/suggested mentions, context';
COMMENT ON COLUMN seo_semantic_analysis.entities IS 'Extracted entities (people, places, organizations) with importance';
COMMENT ON COLUMN seo_semantic_analysis.topic_clusters IS 'Topic clusters with keyword groups and coverage status';
COMMENT ON COLUMN seo_semantic_analysis.semantic_gaps IS 'Missing semantic terms with reasons and suggestions';
COMMENT ON COLUMN seo_semantic_analysis.intent_signals IS 'Search intent classification and optimization tips';
