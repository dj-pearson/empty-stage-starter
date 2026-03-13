-- =============================================================================
-- Migration: pSEO Pages System
-- Description: Creates tables for programmatic SEO page generation, including
--              page storage, generation queue/batches, taxonomy dimensions,
--              and internal linking graph.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. pseo_pages - Main pages table
-- ---------------------------------------------------------------------------
CREATE TABLE public.pseo_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Page identity
  page_type TEXT NOT NULL,                      -- e.g. 'FOOD_CHAINING_GUIDE', 'CHALLENGE_MEAL_OCCASION'
  slug TEXT NOT NULL UNIQUE,                    -- full URL slug e.g. 'food-chaining/chicken-nuggets'
  title TEXT NOT NULL,
  meta_description TEXT,

  -- Dimension values (nullable - only populated for relevant page types)
  safe_food_slug TEXT,
  age_group_slug TEXT,
  challenge_slug TEXT,
  meal_occasion_slug TEXT,
  dietary_restriction_slug TEXT,

  -- Content (stores the full generated page schema)
  content JSONB NOT NULL DEFAULT '{}',

  -- SEO metadata
  canonical_url TEXT,
  schema_markup JSONB,                          -- JSON-LD structured data
  keywords TEXT[],

  -- Generation metadata
  generation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (generation_status IN (
      'pending', 'generating', 'generated',
      'validated', 'published', 'failed', 'archived'
    )),
  generation_prompt_hash TEXT,                  -- hash of prompt used, for cache invalidation
  generated_at TIMESTAMPTZ,
  validated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  generation_error TEXT,
  generation_model TEXT,                        -- which AI model generated this
  generation_cost_cents INTEGER DEFAULT 0,

  -- Quality metrics
  quality_score NUMERIC(3,2),                   -- 0.00 to 1.00
  word_count INTEGER,
  internal_link_count INTEGER,
  has_faq BOOLEAN DEFAULT false,
  has_schema_markup BOOLEAN DEFAULT false,

  -- Freshness tracking
  freshness_days INTEGER DEFAULT 90,            -- how many days before content is considered stale
  last_refreshed_at TIMESTAMPTZ,
  needs_refresh BOOLEAN DEFAULT false,

  -- Priority / ordering
  tier INTEGER DEFAULT 1 CHECK (tier BETWEEN 1 AND 3),  -- 1 = highest priority
  priority_score INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.pseo_pages IS 'Programmatic SEO pages generated from taxonomy dimension combinations';
COMMENT ON COLUMN public.pseo_pages.page_type IS 'Template type key, e.g. FOOD_CHAINING_GUIDE, CHALLENGE_MEAL_OCCASION';
COMMENT ON COLUMN public.pseo_pages.slug IS 'Full URL path slug, must be unique across all page types';
COMMENT ON COLUMN public.pseo_pages.content IS 'Full generated page content stored as JSONB';
COMMENT ON COLUMN public.pseo_pages.generation_prompt_hash IS 'SHA-256 hash of the generation prompt for cache invalidation';
COMMENT ON COLUMN public.pseo_pages.quality_score IS 'Automated quality score from 0.00 (worst) to 1.00 (best)';
COMMENT ON COLUMN public.pseo_pages.tier IS 'Content tier: 1 = high priority/traffic, 2 = medium, 3 = long-tail';
COMMENT ON COLUMN public.pseo_pages.freshness_days IS 'Number of days before content should be regenerated';

-- ---------------------------------------------------------------------------
-- 2. pseo_generation_queue - Queue for batch generation
-- ---------------------------------------------------------------------------
CREATE TABLE public.pseo_generation_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_type TEXT NOT NULL,
  combination JSONB NOT NULL,                   -- the dimension combination to generate
  priority INTEGER DEFAULT 0,                   -- higher = processed first
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'skipped')),
  batch_id UUID,                                -- groups pages into batches
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,                     -- when processing started
  completed_at TIMESTAMPTZ                      -- when processing finished
);

COMMENT ON TABLE public.pseo_generation_queue IS 'Work queue for batch pSEO page generation';
COMMENT ON COLUMN public.pseo_generation_queue.combination IS 'JSONB object of dimension slug values for this page';
COMMENT ON COLUMN public.pseo_generation_queue.batch_id IS 'FK to pseo_generation_batches for grouping';

-- ---------------------------------------------------------------------------
-- 3. pseo_generation_batches - Batch tracking
-- ---------------------------------------------------------------------------
CREATE TABLE public.pseo_generation_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  page_type TEXT,                               -- optional: filter batch to a single page type
  total_pages INTEGER DEFAULT 0,
  completed_pages INTEGER DEFAULT 0,
  failed_pages INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'paused', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.pseo_generation_batches IS 'Tracks batches of pSEO page generation runs';

-- Add FK from queue to batches now that both tables exist
ALTER TABLE public.pseo_generation_queue
  ADD CONSTRAINT fk_queue_batch
  FOREIGN KEY (batch_id) REFERENCES public.pseo_generation_batches(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. pseo_taxonomy - Dimension values
-- ---------------------------------------------------------------------------
CREATE TABLE public.pseo_taxonomy (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dimension TEXT NOT NULL,                      -- 'safe_food', 'age_group', 'feeding_challenge', 'meal_occasion', 'dietary_restriction'
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  tier INTEGER DEFAULT 1,                       -- mirrors page tier for priority
  context JSONB DEFAULT '{}',                   -- extra metadata (aliases, synonyms, notes)
  category TEXT,                                -- optional sub-grouping within a dimension
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(dimension, slug)
);

COMMENT ON TABLE public.pseo_taxonomy IS 'Taxonomy dimension values used to generate pSEO page combinations';
COMMENT ON COLUMN public.pseo_taxonomy.dimension IS 'Dimension key: safe_food, age_group, feeding_challenge, meal_occasion, dietary_restriction';
COMMENT ON COLUMN public.pseo_taxonomy.context IS 'Arbitrary metadata: aliases, synonyms, nutritional notes, etc.';

-- ---------------------------------------------------------------------------
-- 5. pseo_internal_links - Internal linking graph
-- ---------------------------------------------------------------------------
CREATE TABLE public.pseo_internal_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_page_id UUID REFERENCES public.pseo_pages(id) ON DELETE CASCADE,
  target_page_id UUID REFERENCES public.pseo_pages(id) ON DELETE CASCADE,
  anchor_text TEXT,
  link_type TEXT DEFAULT 'related'
    CHECK (link_type IN ('related', 'breadcrumb', 'hub', 'sibling', 'parent', 'child')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_page_id, target_page_id)
);

COMMENT ON TABLE public.pseo_internal_links IS 'Tracks internal links between pSEO pages for link graph management';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- pseo_pages: single-column indexes
CREATE INDEX idx_pseo_pages_page_type ON public.pseo_pages(page_type);
CREATE INDEX idx_pseo_pages_generation_status ON public.pseo_pages(generation_status);
CREATE INDEX idx_pseo_pages_tier ON public.pseo_pages(tier);
CREATE INDEX idx_pseo_pages_priority_score ON public.pseo_pages(priority_score DESC);
CREATE INDEX idx_pseo_pages_safe_food_slug ON public.pseo_pages(safe_food_slug) WHERE safe_food_slug IS NOT NULL;
CREATE INDEX idx_pseo_pages_age_group_slug ON public.pseo_pages(age_group_slug) WHERE age_group_slug IS NOT NULL;
CREATE INDEX idx_pseo_pages_challenge_slug ON public.pseo_pages(challenge_slug) WHERE challenge_slug IS NOT NULL;
CREATE INDEX idx_pseo_pages_meal_occasion_slug ON public.pseo_pages(meal_occasion_slug) WHERE meal_occasion_slug IS NOT NULL;
CREATE INDEX idx_pseo_pages_dietary_restriction_slug ON public.pseo_pages(dietary_restriction_slug) WHERE dietary_restriction_slug IS NOT NULL;

-- pseo_pages: composite indexes for common queries
CREATE INDEX idx_pseo_pages_type_status ON public.pseo_pages(page_type, generation_status);
CREATE INDEX idx_pseo_pages_status_tier_priority ON public.pseo_pages(generation_status, tier, priority_score DESC);
CREATE INDEX idx_pseo_pages_needs_refresh ON public.pseo_pages(needs_refresh, last_refreshed_at) WHERE needs_refresh = true;
CREATE INDEX idx_pseo_pages_published ON public.pseo_pages(published_at DESC) WHERE generation_status = 'published';

-- pseo_pages: GIN index on content JSONB
CREATE INDEX idx_pseo_pages_content_gin ON public.pseo_pages USING GIN (content);

-- pseo_pages: full-text search on title + meta_description
CREATE INDEX idx_pseo_pages_fts ON public.pseo_pages
  USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(meta_description, '')));

-- pseo_generation_queue: status + priority for ordered processing
CREATE INDEX idx_pseo_queue_status_priority ON public.pseo_generation_queue(status, priority DESC)
  WHERE status = 'queued';
CREATE INDEX idx_pseo_queue_batch_id ON public.pseo_generation_queue(batch_id);
CREATE INDEX idx_pseo_queue_page_type ON public.pseo_generation_queue(page_type);

-- pseo_generation_batches
CREATE INDEX idx_pseo_batches_status ON public.pseo_generation_batches(status);
CREATE INDEX idx_pseo_batches_created_by ON public.pseo_generation_batches(created_by);

-- pseo_taxonomy
CREATE INDEX idx_pseo_taxonomy_dimension ON public.pseo_taxonomy(dimension);
CREATE INDEX idx_pseo_taxonomy_dimension_active ON public.pseo_taxonomy(dimension, sort_order) WHERE is_active = true;

-- pseo_internal_links
CREATE INDEX idx_pseo_links_source ON public.pseo_internal_links(source_page_id);
CREATE INDEX idx_pseo_links_target ON public.pseo_internal_links(target_page_id);
CREATE INDEX idx_pseo_links_type ON public.pseo_internal_links(link_type);

-- =============================================================================
-- UPDATED_AT TRIGGERS
-- Reuses existing update_updated_at_column() function from prior migrations
-- =============================================================================

CREATE TRIGGER set_pseo_pages_updated_at
  BEFORE UPDATE ON public.pseo_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_pseo_taxonomy_updated_at
  BEFORE UPDATE ON public.pseo_taxonomy
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.pseo_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pseo_generation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pseo_generation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pseo_taxonomy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pseo_internal_links ENABLE ROW LEVEL SECURITY;

-- ---- pseo_pages ----

-- Public can read published pages (serves the actual pSEO content)
CREATE POLICY "Public can read published pseo pages"
  ON public.pseo_pages FOR SELECT
  USING (generation_status = 'published');

-- Admins have full access
CREATE POLICY "Admins have full access to pseo pages"
  ON public.pseo_pages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- ---- pseo_generation_queue ----

CREATE POLICY "Admins have full access to pseo generation queue"
  ON public.pseo_generation_queue FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- ---- pseo_generation_batches ----

CREATE POLICY "Admins have full access to pseo generation batches"
  ON public.pseo_generation_batches FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- ---- pseo_taxonomy ----

-- Public can read active taxonomy entries (needed for URL resolution / navigation)
CREATE POLICY "Public can read active pseo taxonomy"
  ON public.pseo_taxonomy FOR SELECT
  USING (is_active = true);

-- Admins have full access
CREATE POLICY "Admins have full access to pseo taxonomy"
  ON public.pseo_taxonomy FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- ---- pseo_internal_links ----

-- Public can read links for published pages (needed for rendering related content)
CREATE POLICY "Public can read pseo internal links for published pages"
  ON public.pseo_internal_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pseo_pages
      WHERE pseo_pages.id = pseo_internal_links.source_page_id
      AND pseo_pages.generation_status = 'published'
    )
  );

-- Admins have full access
CREATE POLICY "Admins have full access to pseo internal links"
  ON public.pseo_internal_links FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );
