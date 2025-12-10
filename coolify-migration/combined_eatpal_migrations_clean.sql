-- ============================================
-- EatPal Clean Migrations (No Error Wrappers)
-- Generated: 2025-12-08 23:10:55
-- Total Migrations: 88
-- ============================================

-- Create migrations tracking table
CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================
-- Migration 1: 20250109000000_add_featured_image_to_blog.sql
-- ============================================

-- Add featured_image column to blog_posts table
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS featured_image TEXT;

-- Add comment to document the column
COMMENT ON COLUMN blog_posts.featured_image IS 'URL or path to the blog post featured image. Used for Open Graph and social media previews. Falls back to Cover.png if not set.';

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts(published_at);


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20250109000000_add_featured_image_to_blog.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 2: 20250112000000_blog_advanced_features.sql
-- ============================================

-- =====================================================
-- ADVANCED BLOG SYSTEM MIGRATION
-- Complete enhancement of blog system with world-class features
-- =====================================================

-- =====================================================
-- PHASE 1: CONTENT STRATEGY & PLANNING
-- =====================================================

-- Editorial calendar for content planning
CREATE TABLE IF NOT EXISTS blog_content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planned_publish_date DATE NOT NULL,
  title_suggestion TEXT,
  topic_cluster_id UUID,
  assigned_to UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'planned', -- planned, in_progress, review, scheduled, published
  priority INTEGER DEFAULT 0,
  target_keywords TEXT[],
  target_search_volume INTEGER,
  content_pillar TEXT, -- cornerstone, supporting, updating
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Topic clustering for SEO strategy
CREATE TABLE IF NOT EXISTS blog_topic_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pillar_title TEXT NOT NULL,
  pillar_post_id UUID REFERENCES blog_posts(id) ON DELETE SET NULL,
  cluster_keywords TEXT[],
  target_audience_segment TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraint
ALTER TABLE blog_content_calendar
  ADD CONSTRAINT fk_topic_cluster
  FOREIGN KEY (topic_cluster_id)
  REFERENCES blog_topic_clusters(id) ON DELETE SET NULL;

-- A/B testing for titles and content
CREATE TABLE IF NOT EXISTS blog_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  variant_type TEXT NOT NULL, -- title, excerpt, featured_image, intro
  variant_a TEXT NOT NULL,
  variant_b TEXT NOT NULL,
  variant_a_views INTEGER DEFAULT 0,
  variant_b_views INTEGER DEFAULT 0,
  variant_a_clicks INTEGER DEFAULT 0,
  variant_b_clicks INTEGER DEFAULT 0,
  variant_a_conversions INTEGER DEFAULT 0,
  variant_b_conversions INTEGER DEFAULT 0,
  variant_a_time_on_page INTEGER DEFAULT 0,
  variant_b_time_on_page INTEGER DEFAULT 0,
  winner TEXT, -- a, b, undecided
  confidence_level NUMERIC, -- Statistical confidence (0-100%)
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Content refresh tracking
CREATE TABLE IF NOT EXISTS blog_refresh_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  last_refreshed_at TIMESTAMPTZ DEFAULT NOW(),
  refresh_reason TEXT,
  content_diff JSONB,
  refreshed_by UUID REFERENCES auth.users(id),
  performance_before JSONB,
  performance_after JSONB
);

-- =====================================================
-- PHASE 2: ADVANCED ANALYTICS & PERFORMANCE TRACKING
-- =====================================================

-- Detailed performance metrics
CREATE TABLE IF NOT EXISTS blog_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  pageviews INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  avg_time_on_page INTEGER, -- seconds
  bounce_rate NUMERIC,
  scroll_depth_avg NUMERIC, -- percentage
  cta_clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  organic_traffic INTEGER DEFAULT 0,
  direct_traffic INTEGER DEFAULT 0,
  social_traffic INTEGER DEFAULT 0,
  referral_traffic INTEGER DEFAULT 0,
  UNIQUE(post_id, date)
);

-- SEO position tracking
CREATE TABLE IF NOT EXISTS blog_seo_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  position INTEGER,
  search_volume INTEGER,
  competition_level TEXT, -- low, medium, high
  url_shown TEXT,
  featured_snippet BOOLEAN DEFAULT FALSE,
  tracked_date DATE DEFAULT CURRENT_DATE,
  change_7d INTEGER,
  change_30d INTEGER,
  UNIQUE(post_id, keyword, tracked_date)
);

-- Real-time engagement tracking
CREATE TABLE IF NOT EXISTS blog_engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  session_id TEXT,
  event_type TEXT NOT NULL, -- scroll_25, scroll_50, scroll_75, scroll_100, comment_opened, share_clicked, cta_clicked
  event_timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  referrer TEXT,
  user_id UUID REFERENCES auth.users(id)
);

-- Conversion attribution
CREATE TABLE IF NOT EXISTS blog_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  conversion_type TEXT NOT NULL, -- email_signup, tool_usage, premium_upgrade, purchase
  conversion_value NUMERIC,
  session_id TEXT,
  converted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Core Web Vitals tracking
CREATE TABLE IF NOT EXISTS blog_core_web_vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  lcp_avg NUMERIC, -- Largest Contentful Paint (ms)
  fid_avg NUMERIC, -- First Input Delay (ms)
  cls_avg NUMERIC, -- Cumulative Layout Shift (score)
  ttfb_avg NUMERIC, -- Time to First Byte (ms)
  fcp_avg NUMERIC, -- First Contentful Paint (ms)
  sample_size INTEGER,
  UNIQUE(post_id, date)
);

-- =====================================================
-- PHASE 3: ADVANCED CONTENT FEATURES
-- =====================================================

-- Internal linking intelligence
CREATE TABLE IF NOT EXISTS blog_internal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  target_post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  anchor_text TEXT NOT NULL,
  link_position TEXT, -- intro, body, conclusion, sidebar
  is_automatic BOOLEAN DEFAULT FALSE,
  click_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_post_id, target_post_id, anchor_text)
);

-- Content versioning for rollback capability
CREATE TABLE IF NOT EXISTS blog_post_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  meta_title TEXT,
  meta_description TEXT,
  saved_by UUID REFERENCES auth.users(id),
  change_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, version_number)
);

-- Content quality scoring
CREATE TABLE IF NOT EXISTS blog_content_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  readability_score NUMERIC, -- Flesch-Kincaid
  seo_score NUMERIC, -- 0-100
  engagement_score NUMERIC, -- 0-100
  uniqueness_score NUMERIC, -- 0-100
  comprehensiveness_score NUMERIC, -- 0-100
  overall_score NUMERIC, -- Weighted average
  issues JSONB, -- Array of issues found
  suggestions JSONB, -- Array of improvement suggestions
  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Keyword optimization tracking
CREATE TABLE IF NOT EXISTS blog_target_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  keyword_type TEXT DEFAULT 'secondary', -- primary, secondary, LSI
  search_volume INTEGER,
  competition_score NUMERIC,
  current_density NUMERIC,
  optimal_density_min NUMERIC DEFAULT 1.0,
  optimal_density_max NUMERIC DEFAULT 2.5,
  current_position INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, keyword)
);

-- Multi-author support
CREATE TABLE IF NOT EXISTS blog_authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  social_links JSONB, -- {twitter, linkedin, website, etc}
  expertise TEXT[],
  post_count INTEGER DEFAULT 0,
  is_guest BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add author_id to blog_posts if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blog_posts' AND column_name = 'author_bio_id'
  ) THEN
    ALTER TABLE blog_posts ADD COLUMN author_bio_id UUID REFERENCES blog_authors(id);
  END IF;
END $$;

-- Guest post submission workflow
CREATE TABLE IF NOT EXISTS blog_guest_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by_email TEXT NOT NULL,
  submitted_by_name TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  author_bio TEXT,
  author_social_links JSONB,
  status TEXT DEFAULT 'pending', -- pending, under_review, approved, rejected, published
  reviewed_by UUID REFERENCES auth.users(id),
  review_notes TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  published_post_id UUID REFERENCES blog_posts(id)
);

-- =====================================================
-- PHASE 4: MULTI-FORMAT CONTENT SYSTEM
-- =====================================================

-- Different content formats from same source
CREATE TABLE IF NOT EXISTS blog_content_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  format_type TEXT NOT NULL, -- summary, listicle, infographic_script, video_script, podcast_notes, email_newsletter
  content TEXT NOT NULL,
  generated_by TEXT DEFAULT 'ai', -- ai, manual
  status TEXT DEFAULT 'draft',
  metadata JSONB, -- Format-specific metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cross-platform content repurposing
CREATE TABLE IF NOT EXISTS blog_repurposed_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  repurpose_type TEXT NOT NULL, -- twitter_thread, instagram_carousel, youtube_description, newsletter, ebook_chapter, linkedin_article
  content JSONB NOT NULL, -- Structured content for each platform
  auto_generated BOOLEAN DEFAULT TRUE,
  published_to TEXT[], -- Platforms where published
  performance_metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PHASE 5: RECOMMENDATION ENGINE
-- =====================================================

-- User reading behavior tracking
CREATE TABLE IF NOT EXISTS blog_user_reading_behavior (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  read_percentage NUMERIC CHECK (read_percentage >= 0 AND read_percentage <= 100),
  time_spent_seconds INTEGER,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  completed BOOLEAN DEFAULT FALSE,
  device_type TEXT, -- desktop, mobile, tablet
  UNIQUE(user_id, post_id, read_at)
);

-- =====================================================
-- PHASE 6: PERFORMANCE OPTIMIZATION
-- =====================================================

-- Cache for related posts (updated periodically)
CREATE TABLE IF NOT EXISTS blog_related_posts_cache (
  post_id UUID PRIMARY KEY REFERENCES blog_posts(id) ON DELETE CASCADE,
  related_post_ids UUID[] NOT NULL,
  relevance_scores NUMERIC[],
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PHASE 7: SOCIAL & DISTRIBUTION
-- =====================================================

-- Multi-platform distribution tracking
CREATE TABLE IF NOT EXISTS blog_distribution_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- medium, linkedin, dev.to, hashnode, facebook, twitter, instagram
  platform_post_id TEXT,
  platform_url TEXT,
  published_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- pending, scheduled, published, failed
  metrics JSONB, -- Platform-specific engagement metrics
  auto_published BOOLEAN DEFAULT FALSE
);

-- Social media scheduling
CREATE TABLE IF NOT EXISTS blog_social_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  content TEXT NOT NULL,
  media_urls TEXT[],
  scheduled_for TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled', -- scheduled, published, failed, cancelled
  engagement_metrics JSONB,
  error_message TEXT
);

-- RSS feed configurations
CREATE TABLE IF NOT EXISTS blog_rss_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_name TEXT NOT NULL UNIQUE,
  feed_slug TEXT NOT NULL UNIQUE,
  description TEXT,
  filter_type TEXT, -- all, category, tag, author
  filter_value TEXT, -- category_slug, tag_slug, author_id
  include_full_content BOOLEAN DEFAULT TRUE,
  max_items INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PHASE 8: MONETIZATION & GROWTH
-- =====================================================

-- Lead magnets linked to posts
CREATE TABLE IF NOT EXISTS blog_lead_magnets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  magnet_type TEXT NOT NULL, -- checklist, ebook, template, tool, quiz, guide
  magnet_title TEXT NOT NULL,
  magnet_description TEXT,
  file_url TEXT,
  downloads_count INTEGER DEFAULT 0,
  conversion_rate NUMERIC,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email captures from blog posts
CREATE TABLE IF NOT EXISTS blog_email_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT,
  lead_magnet_id UUID REFERENCES blog_lead_magnets(id),
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  converted_to_user BOOLEAN DEFAULT FALSE,
  source TEXT -- inline_form, exit_intent, content_gate
);

-- Exit-intent popup configurations
CREATE TABLE IF NOT EXISTS blog_exit_intent_popups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  cta_text TEXT DEFAULT 'Subscribe',
  offer_text TEXT,
  target_posts UUID[], -- Specific posts, or null for all
  target_categories UUID[],
  show_delay_seconds INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  conversion_rate NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content gating for email unlock
CREATE TABLE IF NOT EXISTS blog_content_gating (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  gate_after_percentage INTEGER DEFAULT 50, -- Show gate after X% of content
  gate_title TEXT NOT NULL,
  gate_message TEXT NOT NULL,
  unlock_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PHASE 9: SEO & COMPETITIVE INTELLIGENCE
-- =====================================================

-- Backlink monitoring
CREATE TABLE IF NOT EXISTS blog_backlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  anchor_text TEXT,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  domain_authority INTEGER,
  link_type TEXT, -- dofollow, nofollow
  UNIQUE(post_id, source_url)
);

-- Competitor content tracking
CREATE TABLE IF NOT EXISTS blog_competitor_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_domain TEXT NOT NULL,
  competitor_post_url TEXT NOT NULL UNIQUE,
  title TEXT,
  published_date DATE,
  target_keywords TEXT[],
  estimated_traffic INTEGER,
  word_count INTEGER,
  our_competing_post_id UUID REFERENCES blog_posts(id),
  notes TEXT,
  tracked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content gap analysis
CREATE TABLE IF NOT EXISTS blog_content_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  search_volume INTEGER,
  keyword_difficulty INTEGER,
  current_ranking_position INTEGER,
  competitor_urls TEXT[],
  opportunity_score NUMERIC, -- Calculated score (0-100)
  priority TEXT DEFAULT 'medium', -- low, medium, high
  assigned_to UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'identified', -- identified, planned, in_progress, completed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PHASE 10: ENHANCED COMMENT SYSTEM
-- =====================================================

-- Add parent_comment_id for threading if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blog_comments' AND column_name = 'parent_comment_id'
  ) THEN
    ALTER TABLE blog_comments ADD COLUMN parent_comment_id UUID REFERENCES blog_comments(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blog_comments' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE blog_comments ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Comment voting system
CREATE TABLE IF NOT EXISTS blog_comment_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES blog_comments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  vote_type TEXT CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);

-- Add vote counts to comments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'blog_comments' AND column_name = 'upvotes'
  ) THEN
    ALTER TABLE blog_comments
      ADD COLUMN upvotes INTEGER DEFAULT 0,
      ADD COLUMN downvotes INTEGER DEFAULT 0;
  END IF;
END $$;

-- =====================================================
-- PHASE 11: NEWSLETTER INTEGRATION
-- =====================================================

-- Newsletter subscribers
CREATE TABLE IF NOT EXISTS blog_newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  preferences JSONB, -- {frequency: 'weekly', categories: [...]}
  source TEXT -- blog_post, homepage, lead_magnet
);

-- Newsletter campaigns
CREATE TABLE IF NOT EXISTS blog_newsletter_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name TEXT NOT NULL,
  campaign_type TEXT, -- new_post, digest, promotional
  subject_line TEXT NOT NULL,
  preview_text TEXT,
  content_html TEXT NOT NULL,
  featured_posts UUID[], -- Array of blog_posts.id
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'draft', -- draft, scheduled, sent, cancelled
  sent_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  unsubscribe_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PHASE 12: IMAGE & MEDIA LIBRARY
-- =====================================================

-- Media asset management
CREATE TABLE IF NOT EXISTS blog_media_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL UNIQUE,
  file_type TEXT, -- image/jpeg, image/png, video/mp4, etc
  file_size INTEGER, -- bytes
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  caption TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  used_in_posts UUID[], -- Array of post IDs using this media
  tags TEXT[],
  is_optimized BOOLEAN DEFAULT FALSE,
  optimized_variants JSONB -- {webp_url, thumbnail_url, etc}
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Content Calendar indexes
CREATE INDEX IF NOT EXISTS idx_content_calendar_date ON blog_content_calendar(planned_publish_date);
CREATE INDEX IF NOT EXISTS idx_content_calendar_status ON blog_content_calendar(status);
CREATE INDEX IF NOT EXISTS idx_content_calendar_assigned ON blog_content_calendar(assigned_to);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_blog_analytics_post_date ON blog_analytics(post_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_blog_analytics_date ON blog_analytics(date DESC);
CREATE INDEX IF NOT EXISTS idx_seo_rankings_post ON blog_seo_rankings(post_id);
CREATE INDEX IF NOT EXISTS idx_seo_rankings_keyword ON blog_seo_rankings(keyword);
CREATE INDEX IF NOT EXISTS idx_seo_rankings_date ON blog_seo_rankings(tracked_date DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_events_post ON blog_engagement_events(post_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_session ON blog_engagement_events(session_id);

-- Internal links indexes
CREATE INDEX IF NOT EXISTS idx_internal_links_source ON blog_internal_links(source_post_id);
CREATE INDEX IF NOT EXISTS idx_internal_links_target ON blog_internal_links(target_post_id);

-- Versioning indexes
CREATE INDEX IF NOT EXISTS idx_post_versions_post ON blog_post_versions(post_id, version_number DESC);

-- User behavior indexes
CREATE INDEX IF NOT EXISTS idx_reading_behavior_user ON blog_user_reading_behavior(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_behavior_post ON blog_user_reading_behavior(post_id);

-- Distribution indexes
CREATE INDEX IF NOT EXISTS idx_distribution_post ON blog_distribution_channels(post_id);
CREATE INDEX IF NOT EXISTS idx_distribution_platform ON blog_distribution_channels(platform);
CREATE INDEX IF NOT EXISTS idx_social_schedule_scheduled ON blog_social_schedule(scheduled_for);

-- Newsletter indexes
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_active ON blog_newsletter_subscribers(is_active);
CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_status ON blog_newsletter_campaigns(status);

-- Media library indexes
CREATE INDEX IF NOT EXISTS idx_media_library_type ON blog_media_library(file_type);
CREATE INDEX IF NOT EXISTS idx_media_library_uploaded ON blog_media_library(uploaded_at DESC);

-- Comment indexes
CREATE INDEX IF NOT EXISTS idx_comment_votes_comment ON blog_comment_votes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON blog_comments(parent_comment_id);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Function to detect stale content
CREATE OR REPLACE FUNCTION detect_stale_content()
RETURNS TABLE (
  post_id UUID,
  post_title TEXT,
  days_since_update INTEGER,
  last_refresh TIMESTAMPTZ,
  organic_traffic_30d INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    bp.id,
    bp.title,
    EXTRACT(DAY FROM NOW() - COALESCE(brt.last_refreshed_at, bp.updated_at))::INTEGER as days_old,
    brt.last_refreshed_at,
    COALESCE(SUM(ba.organic_traffic), 0)::INTEGER as traffic
  FROM blog_posts bp
  LEFT JOIN blog_refresh_tracking brt ON bp.id = brt.post_id
  LEFT JOIN blog_analytics ba ON bp.id = ba.post_id
    AND ba.date > CURRENT_DATE - INTERVAL '30 days'
  WHERE bp.status = 'published'
    AND COALESCE(brt.last_refreshed_at, bp.updated_at) < NOW() - INTERVAL '6 months'
  GROUP BY bp.id, bp.title, brt.last_refreshed_at, bp.updated_at
  ORDER BY days_old DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for intelligent internal link suggestions
CREATE OR REPLACE FUNCTION suggest_internal_links(
  for_post_id UUID,
  limit_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  suggested_post_id UUID,
  suggested_title TEXT,
  relevance_score NUMERIC,
  suggested_anchor TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH post_keywords AS (
    SELECT topic_keywords
    FROM blog_content_tracking
    WHERE post_id = for_post_id
  )
  SELECT
    bp.id,
    bp.title,
    -- Calculate keyword overlap as relevance score
    (
      SELECT COUNT(DISTINCT keyword)::NUMERIC / GREATEST(
        COALESCE(array_length((SELECT topic_keywords FROM post_keywords), 1), 1),
        1
      )
      FROM unnest((SELECT topic_keywords FROM post_keywords)) AS keyword
      WHERE keyword = ANY(bct.topic_keywords)
    ) as relevance,
    substring(bp.title, 1, 60) as anchor
  FROM blog_posts bp
  JOIN blog_content_tracking bct ON bp.id = bct.post_id
  WHERE bp.id != for_post_id
    AND bp.status = 'published'
    AND NOT EXISTS (
      -- Exclude already linked posts
      SELECT 1 FROM blog_internal_links
      WHERE source_post_id = for_post_id AND target_post_id = bp.id
    )
  ORDER BY relevance DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for personalized post recommendations
CREATE OR REPLACE FUNCTION get_personalized_recommendations(
  for_user_id UUID,
  limit_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  post_id UUID,
  post_title TEXT,
  post_slug TEXT,
  relevance_score NUMERIC,
  reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH user_interests AS (
    SELECT
      unnest(bct.topic_keywords) as keyword,
      COUNT(*) as engagement_count
    FROM blog_user_reading_behavior burb
    JOIN blog_content_tracking bct ON burb.post_id = bct.post_id
    WHERE burb.user_id = for_user_id
      AND burb.read_percentage > 50
    GROUP BY keyword
  ),
  unread_posts AS (
    SELECT bp.id, bp.title, bp.slug, bct.topic_keywords
    FROM blog_posts bp
    JOIN blog_content_tracking bct ON bp.id = bct.post_id
    WHERE bp.status = 'published'
      AND bp.id NOT IN (
        SELECT post_id
        FROM blog_user_reading_behavior
        WHERE user_id = for_user_id
      )
  )
  SELECT
    up.id,
    up.title,
    up.slug,
    COALESCE(
      (
        SELECT SUM(ui.engagement_count)::NUMERIC
        FROM unnest(up.topic_keywords) AS keyword
        JOIN user_interests ui ON keyword = ui.keyword
      ),
      0
    ) as score,
    'Based on your reading history' as reason
  FROM unread_posts up
  ORDER BY score DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-create version on significant content updates
CREATE OR REPLACE FUNCTION create_post_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Only create version if content actually changed
  IF OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title THEN
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_version
    FROM blog_post_versions
    WHERE post_id = OLD.id;

    INSERT INTO blog_post_versions (
      post_id, version_number, title, content, excerpt,
      meta_title, meta_description, saved_by
    ) VALUES (
      OLD.id, next_version, OLD.title, OLD.content, OLD.excerpt,
      OLD.meta_title, OLD.meta_description, auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS blog_post_version_trigger ON blog_posts;
CREATE TRIGGER blog_post_version_trigger
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION create_post_version();

-- Update comment vote counts
CREATE OR REPLACE FUNCTION update_comment_votes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vote_type = 'up' THEN
      UPDATE blog_comments SET upvotes = upvotes + 1 WHERE id = NEW.comment_id;
    ELSE
      UPDATE blog_comments SET downvotes = downvotes + 1 WHERE id = NEW.comment_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.vote_type = 'up' THEN
      UPDATE blog_comments SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = OLD.comment_id;
    ELSE
      UPDATE blog_comments SET downvotes = GREATEST(downvotes - 1, 0) WHERE id = OLD.comment_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.vote_type != NEW.vote_type THEN
      IF OLD.vote_type = 'up' THEN
        UPDATE blog_comments SET upvotes = GREATEST(upvotes - 1, 0), downvotes = downvotes + 1 WHERE id = NEW.comment_id;
      ELSE
        UPDATE blog_comments SET downvotes = GREATEST(downvotes - 1, 0), upvotes = upvotes + 1 WHERE id = NEW.comment_id;
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comment_vote_trigger ON blog_comment_votes;
CREATE TRIGGER comment_vote_trigger
  AFTER INSERT OR UPDATE OR DELETE ON blog_comment_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_votes();

-- Update author post count
CREATE OR REPLACE FUNCTION update_author_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.author_bio_id IS NOT NULL THEN
    UPDATE blog_authors SET post_count = post_count + 1 WHERE id = NEW.author_bio_id;
  ELSIF TG_OP = 'DELETE' AND OLD.author_bio_id IS NOT NULL THEN
    UPDATE blog_authors SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.author_bio_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.author_bio_id != NEW.author_bio_id THEN
    IF OLD.author_bio_id IS NOT NULL THEN
      UPDATE blog_authors SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.author_bio_id;
    END IF;
    IF NEW.author_bio_id IS NOT NULL THEN
      UPDATE blog_authors SET post_count = post_count + 1 WHERE id = NEW.author_bio_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS author_post_count_trigger ON blog_posts;
CREATE TRIGGER author_post_count_trigger
  AFTER INSERT OR UPDATE OF author_bio_id OR DELETE ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_author_post_count();

-- =====================================================
-- MATERIALIZED VIEWS FOR PERFORMANCE
-- =====================================================

-- Popular posts view (refresh periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS blog_popular_posts AS
SELECT
  bp.id,
  bp.title,
  bp.slug,
  bp.excerpt,
  bp.featured_image_url,
  COALESCE(SUM(ba.pageviews), 0)::BIGINT as total_views,
  COALESCE(AVG(ba.avg_time_on_page), 0)::INTEGER as avg_time,
  COUNT(DISTINCT bc.id)::INTEGER as comment_count,
  COALESCE(AVG(ba.scroll_depth_avg), 0)::NUMERIC as avg_engagement
FROM blog_posts bp
LEFT JOIN blog_analytics ba ON bp.id = ba.post_id
  AND ba.date > CURRENT_DATE - INTERVAL '30 days'
LEFT JOIN blog_comments bc ON bp.id = bc.post_id AND bc.status = 'approved'
WHERE bp.status = 'published'
GROUP BY bp.id
ORDER BY total_views DESC, avg_engagement DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_popular_posts_id ON blog_popular_posts (id);
CREATE INDEX IF NOT EXISTS idx_popular_posts_views ON blog_popular_posts (total_views DESC);

-- Function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_blog_materialized_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY blog_popular_posts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE blog_content_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_topic_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_refresh_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_seo_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_core_web_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_internal_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_post_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_content_quality_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_target_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_guest_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_content_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_repurposed_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_user_reading_behavior ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_related_posts_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_distribution_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_social_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_rss_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_lead_magnets ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_email_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_exit_intent_popups ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_content_gating ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_backlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_competitor_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_content_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_comment_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_newsletter_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_media_library ENABLE ROW LEVEL SECURITY;

-- Admin-only policies (most tables)
CREATE POLICY "Admins manage content calendar"
  ON blog_content_calendar FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins manage topic clusters"
  ON blog_topic_clusters FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins manage AB tests"
  ON blog_ab_tests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins view analytics"
  ON blog_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins view SEO rankings"
  ON blog_seo_rankings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Public read policies
CREATE POLICY "Anyone can view authors"
  ON blog_authors FOR SELECT
  USING (true);

CREATE POLICY "Anyone can submit guest posts"
  ON blog_guest_submissions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins manage guest submissions"
  ON blog_guest_submissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Users can track their own reading behavior
CREATE POLICY "Users track their reading"
  ON blog_user_reading_behavior FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view their reading history"
  ON blog_user_reading_behavior FOR SELECT
  USING (auth.uid() = user_id);

-- Comment voting policies
CREATE POLICY "Authenticated users can vote"
  ON blog_comment_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage their votes"
  ON blog_comment_votes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete their votes"
  ON blog_comment_votes FOR DELETE
  USING (auth.uid() = user_id);

-- Newsletter subscription policies
CREATE POLICY "Anyone can subscribe"
  ON blog_newsletter_subscribers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users manage their subscription"
  ON blog_newsletter_subscribers FOR UPDATE
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Email capture policy
CREATE POLICY "Anyone can submit email"
  ON blog_email_captures FOR INSERT
  WITH CHECK (true);

-- Engagement events - anyone can track
CREATE POLICY "Track engagement events"
  ON blog_engagement_events FOR INSERT
  WITH CHECK (true);

-- Public read for lead magnets
CREATE POLICY "Anyone can view active lead magnets"
  ON blog_lead_magnets FOR SELECT
  USING (is_active = true);

-- Admins manage everything else
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT table_name::TEXT
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name LIKE 'blog_%'
    AND table_name NOT IN (
      'blog_posts', 'blog_categories', 'blog_tags', 'blog_post_tags',
      'blog_comments', 'blog_authors', 'blog_guest_submissions',
      'blog_user_reading_behavior', 'blog_comment_votes',
      'blog_newsletter_subscribers', 'blog_email_captures',
      'blog_engagement_events', 'blog_lead_magnets'
    )
  LOOP
    BEGIN
      EXECUTE format('
        CREATE POLICY "Admins manage %I"
        ON %I FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role = ''admin''
          )
        )', tbl, tbl);
    EXCEPTION WHEN duplicate_object THEN
      -- Policy already exists, skip
      NULL;
    END;
  END LOOP;
END $$;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE blog_content_calendar IS 'Editorial calendar for planning and scheduling blog content';
COMMENT ON TABLE blog_topic_clusters IS 'SEO topic clusters with pillar content strategy';
COMMENT ON TABLE blog_ab_tests IS 'A/B testing for titles, excerpts, and content variations';
COMMENT ON TABLE blog_analytics IS 'Detailed post performance metrics and traffic data';
COMMENT ON TABLE blog_seo_rankings IS 'Search engine ranking positions for target keywords';
COMMENT ON TABLE blog_internal_links IS 'Smart internal linking between related posts';
COMMENT ON TABLE blog_post_versions IS 'Version control for post content with rollback capability';
COMMENT ON TABLE blog_content_quality_scores IS 'AI-powered content quality scoring and suggestions';
COMMENT ON TABLE blog_authors IS 'Multi-author support with bio and expertise tracking';
COMMENT ON TABLE blog_user_reading_behavior IS 'User engagement and reading pattern tracking';
COMMENT ON TABLE blog_lead_magnets IS 'Lead generation assets linked to blog posts';
COMMENT ON TABLE blog_newsletter_subscribers IS 'Email newsletter subscriber management';
COMMENT ON TABLE blog_media_library IS 'Centralized media asset management with optimization';

COMMENT ON FUNCTION suggest_internal_links IS 'Intelligently suggest related posts for internal linking based on keyword overlap';
COMMENT ON FUNCTION get_personalized_recommendations IS 'Generate personalized post recommendations based on user reading history';
COMMENT ON FUNCTION detect_stale_content IS 'Identify posts that need refreshing based on age and traffic decline';
COMMENT ON FUNCTION refresh_blog_materialized_views IS 'Refresh all blog-related materialized views for updated analytics';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20250112000000_blog_advanced_features.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 3: 20251008012402_c8f3da2d-2ed2-4cce-8478-2fd697a46260.sql
-- ============================================

-- Create tables for Kid Meal Planner

-- Kids table
CREATE TABLE IF NOT EXISTS public.kids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  age INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Foods table
CREATE TABLE IF NOT EXISTS public.foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack')),
  is_safe BOOLEAN NOT NULL DEFAULT false,
  is_try_bite BOOLEAN NOT NULL DEFAULT false,
  allergens TEXT[],
  aisle TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Plan entries table
CREATE TABLE IF NOT EXISTS public.plan_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kid_id UUID NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack1', 'snack2', 'try_bite')),
  food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  result TEXT CHECK (result IN ('ate', 'tasted', 'refused') OR result IS NULL),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Grocery items table
CREATE TABLE IF NOT EXISTS public.grocery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'servings',
  checked BOOLEAN NOT NULL DEFAULT false,
  category TEXT NOT NULL CHECK (category IN ('protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack')),
  source_plan_entry_id UUID REFERENCES public.plan_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Recipes table
CREATE TABLE IF NOT EXISTS public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  food_ids UUID[] NOT NULL DEFAULT '{}',
  category TEXT CHECK (category IN ('protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.kids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for kids table
CREATE POLICY "Users can view their own kids"
  ON public.kids FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own kids"
  ON public.kids FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own kids"
  ON public.kids FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own kids"
  ON public.kids FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for foods table
CREATE POLICY "Users can view their own foods"
  ON public.foods FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own foods"
  ON public.foods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own foods"
  ON public.foods FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own foods"
  ON public.foods FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for plan_entries table
CREATE POLICY "Users can view their own plan entries"
  ON public.plan_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own plan entries"
  ON public.plan_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own plan entries"
  ON public.plan_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own plan entries"
  ON public.plan_entries FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for grocery_items table
CREATE POLICY "Users can view their own grocery items"
  ON public.grocery_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own grocery items"
  ON public.grocery_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own grocery items"
  ON public.grocery_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own grocery items"
  ON public.grocery_items FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for recipes table
CREATE POLICY "Users can view their own recipes"
  ON public.recipes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recipes"
  ON public.recipes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recipes"
  ON public.recipes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recipes"
  ON public.recipes FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_kids_updated_at
  BEFORE UPDATE ON public.kids
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_foods_updated_at
  BEFORE UPDATE ON public.foods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_plan_entries_updated_at
  BEFORE UPDATE ON public.plan_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_grocery_items_updated_at
  BEFORE UPDATE ON public.grocery_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008012402_c8f3da2d-2ed2-4cce-8478-2fd697a46260.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 4: 20251008013812_d9ef4871-2f4c-4f46-bd5c-eb6502b88b5c.sql
-- ============================================

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents infinite recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create nutrition table (community food bank)
CREATE TABLE public.nutrition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  serving_size TEXT,
  ingredients TEXT,
  calories INTEGER,
  protein_g NUMERIC(5,1),
  carbs_g NUMERIC(5,1),
  fat_g NUMERIC(5,1),
  allergens TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on nutrition
ALTER TABLE public.nutrition ENABLE ROW LEVEL SECURITY;

-- RLS policies for nutrition table
CREATE POLICY "Everyone can view nutrition data"
  ON public.nutrition
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert nutrition data"
  ON public.nutrition
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update nutrition data"
  ON public.nutrition
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete nutrition data"
  ON public.nutrition
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Add updated_at trigger for nutrition
CREATE TRIGGER update_nutrition_updated_at
  BEFORE UPDATE ON public.nutrition
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster queries
CREATE INDEX idx_nutrition_category ON public.nutrition(category);
CREATE INDEX idx_nutrition_name ON public.nutrition(name);

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008013812_d9ef4871-2f4c-4f46-bd5c-eb6502b88b5c.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 5: 20251008013822_e4b47634-8a88-4308-83e0-40b79e62126a.sql
-- ============================================

-- Fix the has_role function to have immutable search_path
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
END;
$$;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008013822_e4b47634-8a88-4308-83e0-40b79e62126a.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 6: 20251008013843_23f5522d-3b4f-4e52-8b61-b356c7bf8bd6.sql
-- ============================================

-- Fix the has_role function with empty search_path and fully qualified references
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
END;
$$;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008013843_23f5522d-3b4f-4e52-8b61-b356c7bf8bd6.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 7: 20251008013852_4b7a7057-56d0-4de1-947f-3606ee7e56c2.sql
-- ============================================

-- Fix the update_updated_at_column function with proper search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008013852_4b7a7057-56d0-4de1-947f-3606ee7e56c2.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 8: 20251008015952_75b210cc-eba3-4a02-97c9-0cad18462aa6.sql
-- ============================================

-- Add admin role for user
INSERT INTO public.user_roles (user_id, role)
VALUES ('dc48c711-f059-443a-b4f2-585be6683c63', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008015952_75b210cc-eba3-4a02-97c9-0cad18462aa6.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 9: 20251008023303_bbb977b2-65ba-44b0-a13d-396ac2f81c9e.sql
-- ============================================

-- Add quantity and unit columns to foods table
ALTER TABLE public.foods 
ADD COLUMN quantity integer DEFAULT 0,
ADD COLUMN unit text DEFAULT 'servings';

-- Add helpful comment
COMMENT ON COLUMN public.foods.quantity IS 'Current inventory quantity in pantry';
COMMENT ON COLUMN public.foods.unit IS 'Unit of measurement (servings, count, oz, lbs, etc.)';

-- Create function to deduct food quantity
CREATE OR REPLACE FUNCTION public.deduct_food_quantity(
  _food_id uuid,
  _amount integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.foods
  SET quantity = GREATEST(0, quantity - _amount)
  WHERE id = _food_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.deduct_food_quantity TO authenticated;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008023303_bbb977b2-65ba-44b0-a13d-396ac2f81c9e.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 10: 20251008023632_948365b0-0399-43db-a3fa-2c715f8321e5.sql
-- ============================================

-- Add allergens column to kids table
ALTER TABLE public.kids 
ADD COLUMN allergens text[] DEFAULT '{}';

-- Add helpful comment
COMMENT ON COLUMN public.kids.allergens IS 'List of allergens this child needs to avoid (e.g., peanuts, dairy, gluten)';

-- Create a function to check if a food is safe for a kid based on allergens
CREATE OR REPLACE FUNCTION public.is_food_safe_for_kid(
  _food_allergens text[],
  _kid_allergens text[]
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- If kid has no allergens, all foods are safe
  IF _kid_allergens IS NULL OR array_length(_kid_allergens, 1) IS NULL THEN
    RETURN true;
  END IF;
  
  -- If food has no allergens listed, consider it safe
  IF _food_allergens IS NULL OR array_length(_food_allergens, 1) IS NULL THEN
    RETURN true;
  END IF;
  
  -- Check if any food allergen matches kid's allergens
  RETURN NOT (_food_allergens && _kid_allergens);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_food_safe_for_kid TO authenticated;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008023632_948365b0-0399-43db-a3fa-2c715f8321e5.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 11: 20251008023643_a4d9b74e-39c5-4bc5-b0e5-81894fe991f8.sql
-- ============================================

-- Fix the function to set search_path
CREATE OR REPLACE FUNCTION public.is_food_safe_for_kid(
  _food_allergens text[],
  _kid_allergens text[]
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
BEGIN
  -- If kid has no allergens, all foods are safe
  IF _kid_allergens IS NULL OR array_length(_kid_allergens, 1) IS NULL THEN
    RETURN true;
  END IF;
  
  -- If food has no allergens listed, consider it safe
  IF _food_allergens IS NULL OR array_length(_food_allergens, 1) IS NULL THEN
    RETURN true;
  END IF;
  
  -- Check if any food allergen matches kid's allergens
  RETURN NOT (_food_allergens && _kid_allergens);
END;
$$;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008023643_a4d9b74e-39c5-4bc5-b0e5-81894fe991f8.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 12: 20251008024530_b810b648-92cd-40a7-aef2-882363055120.sql
-- ============================================

-- Create AI settings table
CREATE TABLE public.ai_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  provider text NOT NULL, -- 'claude', 'openai', 'gemini', etc.
  model_name text NOT NULL,
  api_key_env_var text NOT NULL, -- Name of the environment variable containing the API key
  auth_type text NOT NULL DEFAULT 'bearer', -- 'bearer', 'x-api-key', 'api-key'
  endpoint_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  temperature numeric,
  max_tokens integer,
  additional_params jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage AI settings
CREATE POLICY "Admins can view AI settings"
  ON public.ai_settings FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert AI settings"
  ON public.ai_settings FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update AI settings"
  ON public.ai_settings FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete AI settings"
  ON public.ai_settings FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_ai_settings_updated_at
  BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default Claude Sonnet 4.5 configuration
INSERT INTO public.ai_settings (
  name,
  provider,
  model_name,
  api_key_env_var,
  auth_type,
  endpoint_url,
  is_active,
  temperature,
  max_tokens
) VALUES (
  'Claude Sonnet 4.5',
  'claude',
  'claude-sonnet-4-5-20250929',
  'CLAUDE_API_KEY',
  'x-api-key',
  'https://api.anthropic.com/v1/messages',
  true,
  0.7,
  4096
);

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008024530_b810b648-92cd-40a7-aef2-882363055120.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 13: 20251008025307_8faf3224-9a40-415e-9176-ccaa98641861.sql
-- ============================================

-- Create storage bucket for profile pictures
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-pictures', 'profile-pictures', true);

-- Create RLS policies for profile pictures
CREATE POLICY "Users can view all profile pictures"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-pictures');

CREATE POLICY "Users can upload their own profile pictures"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profile-pictures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own profile pictures"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profile-pictures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own profile pictures"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'profile-pictures' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Add profile_picture_url column to kids table
ALTER TABLE public.kids
ADD COLUMN profile_picture_url text;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008025307_8faf3224-9a40-415e-9176-ccaa98641861.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 14: 20251008025502_a2c7d4dd-23dc-4b3c-ace1-8c1eb4361bdc.sql
-- ============================================

-- Add date_of_birth and favorite_foods columns to kids table
ALTER TABLE public.kids
ADD COLUMN date_of_birth date,
ADD COLUMN favorite_foods text[] DEFAULT '{}';

-- Create index for date_of_birth for performance
CREATE INDEX idx_kids_date_of_birth ON public.kids(date_of_birth);

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008025502_a2c7d4dd-23dc-4b3c-ace1-8c1eb4361bdc.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 15: 20251008030206_c9b6c7c6-6d3a-4a04-b000-ad390c8eff9f.sql
-- ============================================

-- Add servings_per_container to foods table
ALTER TABLE public.foods
ADD COLUMN servings_per_container numeric,
ADD COLUMN package_quantity text;

-- Add serving information to nutrition table
ALTER TABLE public.nutrition
ADD COLUMN servings_per_container numeric,
ADD COLUMN package_quantity text;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008030206_c9b6c7c6-6d3a-4a04-b000-ad390c8eff9f.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 16: 20251008035425_74570939-d012-4a64-b5f0-649f6c8c7b35.sql
-- ============================================

-- Create profiles table for parents/users
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Create trigger to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'User')
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Add updated_at trigger for profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008035425_74570939-d012-4a64-b5f0-649f6c8c7b35.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 17: 20251008035758_e86c8db4-3460-43e4-b9c5-e03b5ca24f29.sql
-- ============================================

-- Create households table
CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'My Family',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create household_members junction table
CREATE TABLE public.household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL DEFAULT 'parent' CHECK (role IN ('parent', 'guardian')),
  invited_by uuid REFERENCES auth.users(id),
  joined_at timestamp with time zone DEFAULT now(),
  UNIQUE(household_id, user_id)
);

-- Create invitations table
CREATE TABLE public.household_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  invited_by uuid REFERENCES auth.users(id) NOT NULL,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(household_id, email)
);

-- Enable RLS
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invitations ENABLE ROW LEVEL SECURITY;

-- Households policies
CREATE POLICY "Members can view their households"
  ON public.households FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members
      WHERE household_members.household_id = households.id
      AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update their households"
  ON public.households FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members
      WHERE household_members.household_id = households.id
      AND household_members.user_id = auth.uid()
    )
  );

-- Household members policies
CREATE POLICY "Members can view household members"
  ON public.household_members FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert household members"
  ON public.household_members FOR INSERT
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete household members"
  ON public.household_members FOR DELETE
  USING (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid()
    )
  );

-- Invitation policies
CREATE POLICY "Members can view their household invitations"
  ON public.household_invitations FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid()
    )
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Members can create invitations"
  ON public.household_invitations FOR INSERT
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete invitations"
  ON public.household_invitations FOR DELETE
  USING (
    household_id IN (
      SELECT household_id FROM public.household_members
      WHERE user_id = auth.uid()
    )
  );

-- Add household_id to existing tables
ALTER TABLE public.kids ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.foods ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.recipes ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.grocery_items ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;
ALTER TABLE public.plan_entries ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX idx_household_members_user ON public.household_members(user_id);
CREATE INDEX idx_household_members_household ON public.household_members(household_id);
CREATE INDEX idx_kids_household ON public.kids(household_id);
CREATE INDEX idx_foods_household ON public.foods(household_id);

-- Update trigger for households
CREATE TRIGGER update_households_updated_at
  BEFORE UPDATE ON public.households
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create household when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id uuid;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'User')
  );
  
  -- Create household
  INSERT INTO public.households (name)
  VALUES (COALESCE(new.raw_user_meta_data->>'full_name', 'User') || '''s Family')
  RETURNING id INTO new_household_id;
  
  -- Add user as household member
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (new_household_id, new.id, 'parent');
  
  RETURN new;
END;
$$;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008035758_e86c8db4-3460-43e4-b9c5-e03b5ca24f29.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 18: 20251008035900_41c8b71a-5c17-4777-8bc1-fc1e0825a7a3.sql
-- ============================================

-- Create helper function to get user's household
CREATE OR REPLACE FUNCTION public.get_user_household_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id
  FROM public.household_members
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Update RLS policies for kids table
DROP POLICY IF EXISTS "Users can view their own kids" ON public.kids;
DROP POLICY IF EXISTS "Users can insert their own kids" ON public.kids;
DROP POLICY IF EXISTS "Users can update their own kids" ON public.kids;
DROP POLICY IF EXISTS "Users can delete their own kids" ON public.kids;

CREATE POLICY "Household members can view kids"
  ON public.kids FOR SELECT
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can insert kids"
  ON public.kids FOR INSERT
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can update kids"
  ON public.kids FOR UPDATE
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can delete kids"
  ON public.kids FOR DELETE
  USING (household_id = public.get_user_household_id(auth.uid()));

-- Update RLS policies for foods table
DROP POLICY IF EXISTS "Users can view their own foods" ON public.foods;
DROP POLICY IF EXISTS "Users can insert their own foods" ON public.foods;
DROP POLICY IF EXISTS "Users can update their own foods" ON public.foods;
DROP POLICY IF EXISTS "Users can delete their own foods" ON public.foods;

CREATE POLICY "Household members can view foods"
  ON public.foods FOR SELECT
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can insert foods"
  ON public.foods FOR INSERT
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can update foods"
  ON public.foods FOR UPDATE
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can delete foods"
  ON public.foods FOR DELETE
  USING (household_id = public.get_user_household_id(auth.uid()));

-- Update RLS policies for recipes table
DROP POLICY IF EXISTS "Users can view their own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Users can insert their own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Users can update their own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Users can delete their own recipes" ON public.recipes;

CREATE POLICY "Household members can view recipes"
  ON public.recipes FOR SELECT
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can insert recipes"
  ON public.recipes FOR INSERT
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can update recipes"
  ON public.recipes FOR UPDATE
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can delete recipes"
  ON public.recipes FOR DELETE
  USING (household_id = public.get_user_household_id(auth.uid()));

-- Update RLS policies for plan_entries table
DROP POLICY IF EXISTS "Users can view their own plan entries" ON public.plan_entries;
DROP POLICY IF EXISTS "Users can insert their own plan entries" ON public.plan_entries;
DROP POLICY IF EXISTS "Users can update their own plan entries" ON public.plan_entries;
DROP POLICY IF EXISTS "Users can delete their own plan entries" ON public.plan_entries;

CREATE POLICY "Household members can view plan entries"
  ON public.plan_entries FOR SELECT
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can insert plan entries"
  ON public.plan_entries FOR INSERT
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can update plan entries"
  ON public.plan_entries FOR UPDATE
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can delete plan entries"
  ON public.plan_entries FOR DELETE
  USING (household_id = public.get_user_household_id(auth.uid()));

-- Update RLS policies for grocery_items table
DROP POLICY IF EXISTS "Users can view their own grocery items" ON public.grocery_items;
DROP POLICY IF EXISTS "Users can insert their own grocery items" ON public.grocery_items;
DROP POLICY IF EXISTS "Users can update their own grocery items" ON public.grocery_items;
DROP POLICY IF EXISTS "Users can delete their own grocery items" ON public.grocery_items;

CREATE POLICY "Household members can view grocery items"
  ON public.grocery_items FOR SELECT
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can insert grocery items"
  ON public.grocery_items FOR INSERT
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can update grocery items"
  ON public.grocery_items FOR UPDATE
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can delete grocery items"
  ON public.grocery_items FOR DELETE
  USING (household_id = public.get_user_household_id(auth.uid()));

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008035900_41c8b71a-5c17-4777-8bc1-fc1e0825a7a3.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 19: 20251008121540_9fd634cb-b47d-4035-8ac4-4d0c53b62c8d.sql
-- ============================================

-- Enable automatic household/profile creation on signup and backfill existing users

-- 1) Create trigger to run the existing function on new auth users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'on_auth_user_created'
      AND n.nspname = 'auth'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE PROCEDURE public.handle_new_user();
  END IF;
END $$;

-- 2) Backfill: create missing profiles, households, and memberships for existing users
DO $$
DECLARE
  rec RECORD;
  new_household_id uuid;
  full_name text;
BEGIN
  FOR rec IN (
    SELECT u.id,
           COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)) AS fn
    FROM auth.users u
    LEFT JOIN public.household_members hm ON hm.user_id = u.id
    WHERE hm.user_id IS NULL
  ) LOOP
    full_name := COALESCE(rec.fn, 'User');

    -- Create profile if missing
    INSERT INTO public.profiles (id, full_name)
    VALUES (rec.id, full_name)
    ON CONFLICT (id) DO NOTHING;

    -- Create household
    INSERT INTO public.households (name)
    VALUES (full_name || '''s Family')
    RETURNING id INTO new_household_id;

    -- Add user as household member
    INSERT INTO public.household_members (household_id, user_id, role)
    VALUES (new_household_id, rec.id, 'parent');
  END LOOP;
END $$;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008121540_9fd634cb-b47d-4035-8ac4-4d0c53b62c8d.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 20: 20251008140000_add_onboarding_to_profiles.sql
-- ============================================

-- Add onboarding_completed column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding ON profiles(onboarding_completed);

-- Update existing users to have onboarding completed (they're already using the app)
UPDATE profiles
SET onboarding_completed = TRUE
WHERE onboarding_completed IS NULL OR onboarding_completed = FALSE;


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008140000_add_onboarding_to_profiles.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 21: 20251008141000_create_subscriptions_tables.sql
-- ============================================

-- Create subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  stripe_price_id TEXT UNIQUE,
  price_monthly DECIMAL(10,2) NOT NULL,
  price_yearly DECIMAL(10,2),
  features JSONB DEFAULT '[]'::jsonb,
  max_children INTEGER DEFAULT 1,
  max_recipes INTEGER,
  max_meal_plans INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES subscription_plans(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'inactive', -- active, canceled, past_due, trialing, incomplete
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create subscription events log table (for audit trail)
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- subscribed, canceled, renewed, upgraded, downgraded, payment_failed
  old_plan_id UUID REFERENCES subscription_plans(id),
  new_plan_id UUID REFERENCES subscription_plans(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create payment history table
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL, -- succeeded, pending, failed, refunded
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer ON user_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at ON subscription_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_created_at ON payment_history(created_at DESC);

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Subscription plans: Everyone can read active plans
CREATE POLICY "Anyone can view active subscription plans"
  ON subscription_plans FOR SELECT
  USING (is_active = true);

-- Admins can manage subscription plans
CREATE POLICY "Admins can manage subscription plans"
  ON subscription_plans FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- User subscriptions: Users can view their own
CREATE POLICY "Users can view their own subscriptions"
  ON user_subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- Admins can view all subscriptions
CREATE POLICY "Admins can view all subscriptions"
  ON user_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Only system can insert/update subscriptions (via webhooks)
CREATE POLICY "Service role can manage subscriptions"
  ON user_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- Subscription events: Users can view their own
CREATE POLICY "Users can view their own subscription events"
  ON subscription_events FOR SELECT
  USING (user_id = auth.uid());

-- Admins can view all events
CREATE POLICY "Admins can view all subscription events"
  ON subscription_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Payment history: Users can view their own
CREATE POLICY "Users can view their own payment history"
  ON payment_history FOR SELECT
  USING (user_id = auth.uid());

-- Admins can view all payments
CREATE POLICY "Admins can view all payment history"
  ON payment_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Insert default subscription plans
INSERT INTO subscription_plans (name, price_monthly, price_yearly, features, max_children, max_recipes, max_meal_plans, sort_order)
VALUES
  (
    'Free',
    0.00,
    0.00,
    '["1 child profile", "Up to 20 foods in pantry", "Basic meal planning", "Grocery list generation"]'::jsonb,
    1,
    10,
    4,
    1
  ),
  (
    'Pro',
    9.99,
    99.00,
    '["Up to 3 children", "Unlimited foods", "AI meal suggestions", "Advanced analytics", "Recipe builder", "Priority support"]'::jsonb,
    3,
    NULL,
    NULL,
    2
  ),
  (
    'Family',
    19.99,
    199.00,
    '["Unlimited children", "Everything in Pro", "Multiple parent accounts", "Family sharing", "Custom meal templates", "Dedicated support"]'::jsonb,
    NULL,
    NULL,
    NULL,
    3
  )
ON CONFLICT DO NOTHING;

-- Function to get user's current subscription
CREATE OR REPLACE FUNCTION get_user_subscription(user_uuid UUID)
RETURNS TABLE (
  plan_name TEXT,
  status TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.name,
    us.status,
    us.current_period_end,
    us.cancel_at_period_end
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = user_uuid
  AND us.status IN ('active', 'trialing');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can add more children
CREATE OR REPLACE FUNCTION can_add_child(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_children_count INTEGER;
  max_allowed INTEGER;
BEGIN
  -- Get current number of children
  SELECT COUNT(*) INTO current_children_count
  FROM kids
  WHERE user_id = user_uuid;

  -- Get max allowed children for user's plan
  SELECT sp.max_children INTO max_allowed
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = user_uuid
  AND us.status IN ('active', 'trialing');

  -- If no subscription found or unlimited (NULL), allow
  IF max_allowed IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Check if under limit
  RETURN current_children_count < max_allowed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008141000_create_subscriptions_tables.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 22: 20251008142000_create_leads_tables.sql
-- ============================================

-- Create lead sources enum
CREATE TYPE lead_source AS ENUM (
  'landing_page',
  'signup_form',
  'trial_signup',
  'newsletter',
  'contact_form',
  'referral',
  'social_media',
  'organic_search',
  'paid_ad',
  'other'
);

-- Create lead status enum
CREATE TYPE lead_status AS ENUM (
  'new',
  'contacted',
  'qualified',
  'converted',
  'unqualified',
  'lost'
);

-- Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  source lead_source NOT NULL,
  utm_campaign TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_content TEXT,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  conversion_goal TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  source lead_source NOT NULL DEFAULT 'landing_page',
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  status lead_status NOT NULL DEFAULT 'new',
  score INTEGER DEFAULT 0, -- Lead scoring 0-100
  metadata JSONB DEFAULT '{}'::jsonb, -- Custom fields, UTM params, etc.
  notes TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create lead interactions table (activity log)
CREATE TABLE IF NOT EXISTS lead_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL, -- email, call, meeting, form_submission, page_view
  subject TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create campaign analytics table
CREATE TABLE IF NOT EXISTS campaign_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  cost DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_id ON lead_interactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_created_at ON lead_interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_is_active ON campaigns(is_active);
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_campaign_date ON campaign_analytics(campaign_id, date DESC);

-- Enable RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Campaigns: Only admins can manage
CREATE POLICY "Admins can manage campaigns"
  ON campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Leads: Only admins can manage
CREATE POLICY "Admins can manage leads"
  ON leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Allow public insert for lead capture forms (service role will be used)
CREATE POLICY "Public can create leads via service role"
  ON leads FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'anon');

-- Lead interactions: Only admins
CREATE POLICY "Admins can manage lead interactions"
  ON lead_interactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Campaign analytics: Only admins
CREATE POLICY "Admins can view campaign analytics"
  ON campaign_analytics FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Function to automatically score leads
CREATE OR REPLACE FUNCTION calculate_lead_score(lead_id UUID)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
  lead_record RECORD;
  interaction_count INTEGER;
BEGIN
  SELECT * INTO lead_record FROM leads WHERE id = lead_id;

  -- Base score for having required fields
  IF lead_record.email IS NOT NULL THEN score := score + 10; END IF;
  IF lead_record.full_name IS NOT NULL THEN score := score + 10; END IF;
  IF lead_record.phone IS NOT NULL THEN score := score + 15; END IF;

  -- Score based on source quality
  CASE lead_record.source
    WHEN 'referral' THEN score := score + 20;
    WHEN 'trial_signup' THEN score := score + 25;
    WHEN 'paid_ad' THEN score := score + 10;
    WHEN 'organic_search' THEN score := score + 15;
    ELSE score := score + 5;
  END CASE;

  -- Score based on interactions
  SELECT COUNT(*) INTO interaction_count
  FROM lead_interactions
  WHERE lead_interactions.lead_id = lead_id;

  score := score + LEAST(interaction_count * 5, 30);

  -- Recency bonus (contacted in last 7 days)
  IF lead_record.last_contacted_at > NOW() - INTERVAL '7 days' THEN
    score := score + 10;
  END IF;

  RETURN LEAST(score, 100); -- Cap at 100
END;
$$ LANGUAGE plpgsql;

-- Trigger to update lead score on changes
CREATE OR REPLACE FUNCTION update_lead_score()
RETURNS TRIGGER AS $$
BEGIN
  NEW.score := calculate_lead_score(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_lead_score
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_score();

-- Function to update updated_at timestamp
CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to get campaign conversion rate
CREATE OR REPLACE FUNCTION get_campaign_stats(campaign_uuid UUID)
RETURNS TABLE (
  total_leads INTEGER,
  converted_leads INTEGER,
  conversion_rate DECIMAL,
  avg_score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_leads,
    COUNT(*) FILTER (WHERE status = 'converted')::INTEGER as converted_leads,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND((COUNT(*) FILTER (WHERE status = 'converted')::DECIMAL / COUNT(*)) * 100, 2)
      ELSE 0
    END as conversion_rate,
    ROUND(AVG(score), 2) as avg_score
  FROM leads
  WHERE campaign_id = campaign_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default campaign
INSERT INTO campaigns (name, description, source, is_active)
VALUES
  ('General Lead Capture', 'Default campaign for leads without specific attribution', 'landing_page', true),
  ('Free Trial Signups', 'Track users who start free trials', 'trial_signup', true),
  ('Newsletter Subscribers', 'Email newsletter signups', 'newsletter', true)
ON CONFLICT DO NOTHING;


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008142000_create_leads_tables.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 23: 20251008143000_create_social_posts_tables.sql
-- ============================================

-- Create social platforms enum
CREATE TYPE social_platform AS ENUM (
  'facebook',
  'instagram',
  'twitter',
  'linkedin',
  'tiktok',
  'pinterest'
);

-- Create post status enum
CREATE TYPE post_status AS ENUM (
  'draft',
  'scheduled',
  'published',
  'failed',
  'deleted'
);

-- Create social accounts table
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform social_platform NOT NULL,
  account_name TEXT NOT NULL,
  account_id TEXT, -- Platform-specific account ID
  webhook_url TEXT, -- Webhook for posting (Zapier, Make, etc.)
  access_token TEXT, -- Encrypted access token if using direct API
  is_active BOOLEAN DEFAULT TRUE,
  last_posted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, account_name)
);

-- Create social posts table
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  content TEXT NOT NULL,
  platforms social_platform[] NOT NULL, -- Can post to multiple platforms
  status post_status NOT NULL DEFAULT 'draft',
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  image_urls TEXT[],
  video_url TEXT,
  link_url TEXT,
  hashtags TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb, -- Platform-specific data
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create post analytics table
CREATE TABLE IF NOT EXISTS post_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  platform_post_id TEXT, -- ID from the social platform
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,2) DEFAULT 0,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, platform)
);

-- Create post queue table (for scheduled posts)
CREATE TABLE IF NOT EXISTS post_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create webhook logs table
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  platform social_platform NOT NULL,
  webhook_url TEXT NOT NULL,
  request_payload JSONB,
  response_status INTEGER,
  response_body TEXT,
  success BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled ON social_posts(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_social_posts_created_at ON social_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_analytics_post_id ON post_analytics(post_id);
CREATE INDEX IF NOT EXISTS idx_post_queue_scheduled ON post_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- Enable RLS
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Social accounts: Only admins can manage
CREATE POLICY "Admins can manage social accounts"
  ON social_accounts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Social posts: Only admins can manage
CREATE POLICY "Admins can manage social posts"
  ON social_posts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Post analytics: Admins only
CREATE POLICY "Admins can view post analytics"
  ON post_analytics FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Post queue: Admins only
CREATE POLICY "Admins can manage post queue"
  ON post_queue FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Webhook logs: Admins only
CREATE POLICY "Admins can view webhook logs"
  ON webhook_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Function to update updated_at timestamp
CREATE TRIGGER update_social_accounts_updated_at
  BEFORE UPDATE ON social_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_social_posts_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_post_queue_updated_at
  BEFORE UPDATE ON post_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to get post engagement stats
CREATE OR REPLACE FUNCTION get_post_engagement_summary()
RETURNS TABLE (
  total_posts INTEGER,
  scheduled_posts INTEGER,
  published_posts INTEGER,
  total_impressions BIGINT,
  total_engagement BIGINT,
  avg_engagement_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT sp.id)::INTEGER as total_posts,
    COUNT(DISTINCT sp.id) FILTER (WHERE sp.status = 'scheduled')::INTEGER as scheduled_posts,
    COUNT(DISTINCT sp.id) FILTER (WHERE sp.status = 'published')::INTEGER as published_posts,
    COALESCE(SUM(pa.impressions), 0)::BIGINT as total_impressions,
    COALESCE(SUM(pa.likes + pa.comments + pa.shares), 0)::BIGINT as total_engagement,
    COALESCE(AVG(pa.engagement_rate), 0)::DECIMAL as avg_engagement_rate
  FROM social_posts sp
  LEFT JOIN post_analytics pa ON sp.id = pa.post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to schedule post to queue
CREATE OR REPLACE FUNCTION schedule_post_to_queue(
  _post_id UUID,
  _platforms social_platform[]
)
RETURNS VOID AS $$
DECLARE
  _platform social_platform;
  _scheduled_time TIMESTAMPTZ;
BEGIN
  -- Get scheduled time from post
  SELECT scheduled_for INTO _scheduled_time
  FROM social_posts
  WHERE id = _post_id;

  -- Create queue entries for each platform
  FOREACH _platform IN ARRAY _platforms
  LOOP
    INSERT INTO post_queue (post_id, platform, scheduled_for, status)
    VALUES (_post_id, _platform, _scheduled_time, 'pending')
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default social accounts (examples)
INSERT INTO social_accounts (platform, account_name, is_active)
VALUES
  ('facebook', 'EatPal Official', false),
  ('instagram', '@eatpal', false),
  ('twitter', '@eatpal_app', false),
  ('linkedin', 'EatPal Company Page', false)
ON CONFLICT DO NOTHING;


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008143000_create_social_posts_tables.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 24: 20251008144000_create_blog_tables.sql
-- ============================================

-- Create blog categories table
CREATE TABLE IF NOT EXISTS blog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  post_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create blog tags table
CREATE TABLE IF NOT EXISTS blog_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create blog posts table
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  featured_image_url TEXT,
  category_id UUID REFERENCES blog_categories(id) ON DELETE SET NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft', -- draft, published, scheduled
  published_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  meta_title TEXT,
  meta_description TEXT,
  og_image_url TEXT,
  views INTEGER DEFAULT 0,
  reading_time_minutes INTEGER,
  ai_generated BOOLEAN DEFAULT FALSE,
  ai_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create post tags junction table
CREATE TABLE IF NOT EXISTS blog_post_tags (
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- Create blog comments table
CREATE TABLE IF NOT EXISTS blog_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, approved, spam
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_author ON blog_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_blog_categories_slug ON blog_categories(slug);
CREATE INDEX IF NOT EXISTS idx_blog_tags_slug ON blog_tags(slug);
CREATE INDEX IF NOT EXISTS idx_blog_comments_post ON blog_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_blog_comments_status ON blog_comments(status);

-- Enable RLS
ALTER TABLE blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_post_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Categories: Admin manage, anyone can view
CREATE POLICY "Admins can manage blog categories"
  ON blog_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can view categories"
  ON blog_categories FOR SELECT
  USING (true);

-- Tags: Admin manage, anyone can view
CREATE POLICY "Admins can manage blog tags"
  ON blog_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can view tags"
  ON blog_tags FOR SELECT
  USING (true);

-- Posts: Admin manage, anyone can view published
CREATE POLICY "Admins can manage blog posts"
  ON blog_posts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can view published posts"
  ON blog_posts FOR SELECT
  USING (status = 'published' AND published_at <= NOW());

-- Post tags: Follow post permissions
CREATE POLICY "Admins can manage post tags"
  ON blog_post_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can view post tags"
  ON blog_post_tags FOR SELECT
  USING (true);

-- Comments: Admin manage, anyone can submit (pending approval)
CREATE POLICY "Admins can manage comments"
  ON blog_comments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can view approved comments"
  ON blog_comments FOR SELECT
  USING (status = 'approved');

CREATE POLICY "Anyone can submit comments"
  ON blog_comments FOR INSERT
  WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_blog_categories_updated_at
  BEFORE UPDATE ON blog_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to update category post count
CREATE OR REPLACE FUNCTION update_category_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.category_id IS NOT NULL THEN
    UPDATE blog_categories SET post_count = post_count + 1 WHERE id = NEW.category_id;
  ELSIF TG_OP = 'DELETE' AND OLD.category_id IS NOT NULL THEN
    UPDATE blog_categories SET post_count = post_count - 1 WHERE id = OLD.category_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.category_id IS NOT NULL AND OLD.category_id != NEW.category_id THEN
      UPDATE blog_categories SET post_count = post_count - 1 WHERE id = OLD.category_id;
    END IF;
    IF NEW.category_id IS NOT NULL AND OLD.category_id != NEW.category_id THEN
      UPDATE blog_categories SET post_count = post_count + 1 WHERE id = NEW.category_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_posts_category_count
  AFTER INSERT OR UPDATE OR DELETE ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_category_post_count();

-- Function to calculate reading time (roughly 200 words per minute)
CREATE OR REPLACE FUNCTION calculate_reading_time()
RETURNS TRIGGER AS $$
BEGIN
  NEW.reading_time_minutes := GREATEST(1, (LENGTH(NEW.content) / 1000)::INTEGER);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_posts_reading_time
  BEFORE INSERT OR UPDATE OF content ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION calculate_reading_time();

-- Function to auto-generate slug from title
CREATE OR REPLACE FUNCTION generate_slug_from_title()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := lower(regexp_replace(regexp_replace(NEW.title, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_posts_generate_slug
  BEFORE INSERT OR UPDATE OF title ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION generate_slug_from_title();

-- Function to get blog stats
CREATE OR REPLACE FUNCTION get_blog_stats()
RETURNS TABLE (
  total_posts INTEGER,
  published_posts INTEGER,
  draft_posts INTEGER,
  scheduled_posts INTEGER,
  total_views BIGINT,
  total_comments BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_posts,
    COUNT(*) FILTER (WHERE status = 'published')::INTEGER as published_posts,
    COUNT(*) FILTER (WHERE status = 'draft')::INTEGER as draft_posts,
    COUNT(*) FILTER (WHERE status = 'scheduled')::INTEGER as scheduled_posts,
    COALESCE(SUM(views), 0)::BIGINT as total_views,
    (SELECT COUNT(*) FROM blog_comments)::BIGINT as total_comments
  FROM blog_posts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default categories
INSERT INTO blog_categories (name, slug, description)
VALUES
  ('Picky Eaters', 'picky-eaters', 'Tips and strategies for dealing with picky eaters'),
  ('Meal Planning', 'meal-planning', 'Meal planning advice and recipes'),
  ('Nutrition', 'nutrition', 'Nutritional information and healthy eating tips'),
  ('Parenting', 'parenting', 'General parenting advice related to food and meals'),
  ('Recipes', 'recipes', 'Kid-friendly recipes and meal ideas')
ON CONFLICT DO NOTHING;

-- Insert default tags
INSERT INTO blog_tags (name, slug)
VALUES
  ('Tips', 'tips'),
  ('Recipes', 'recipes'),
  ('Nutrition', 'nutrition'),
  ('Meal Prep', 'meal-prep'),
  ('Quick Meals', 'quick-meals'),
  ('Healthy Eating', 'healthy-eating'),
  ('Food Safety', 'food-safety'),
  ('Allergies', 'allergies')
ON CONFLICT DO NOTHING;


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008144000_create_blog_tables.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 25: 20251008145000_create_email_marketing_tables.sql
-- ============================================

-- Create email lists table
CREATE TABLE IF NOT EXISTS email_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  subscriber_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email subscribers table
CREATE TABLE IF NOT EXISTS email_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  status TEXT DEFAULT 'active', -- active, unsubscribed, bounced, complained
  source TEXT DEFAULT 'manual', -- manual, signup_form, import, api
  confirmed BOOLEAN DEFAULT FALSE,
  confirmation_token TEXT,
  unsubscribe_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  metadata JSONB DEFAULT '{}'::jsonb,
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email)
);

-- Create list subscribers junction table
CREATE TABLE IF NOT EXISTS list_subscribers (
  list_id UUID REFERENCES email_lists(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES email_subscribers(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active', -- active, unsubscribed
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  PRIMARY KEY (list_id, subscriber_id)
);

-- Create email campaigns table
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  preview_text TEXT,
  from_name TEXT NOT NULL DEFAULT 'EatPal',
  from_email TEXT NOT NULL,
  reply_to TEXT,
  content_html TEXT NOT NULL,
  content_text TEXT,
  status TEXT DEFAULT 'draft', -- draft, scheduled, sending, sent, paused, cancelled
  list_ids UUID[] NOT NULL,
  segment_criteria JSONB, -- Optional filters for subscribers
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_recipients INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_opens INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_bounces INTEGER DEFAULT 0,
  total_complaints INTEGER DEFAULT 0,
  total_unsubscribes INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2) DEFAULT 0,
  click_rate DECIMAL(5,2) DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email events table (opens, clicks, bounces, etc)
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES email_subscribers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- sent, delivered, opened, clicked, bounced, complained, unsubscribed
  event_data JSONB DEFAULT '{}'::jsonb, -- Additional data like link clicked, user agent, etc
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  subject_template TEXT NOT NULL,
  content_html TEXT NOT NULL,
  content_text TEXT,
  variables JSONB DEFAULT '[]'::jsonb, -- List of template variables like {{first_name}}
  category TEXT DEFAULT 'general', -- general, promotional, transactional, newsletter
  is_default BOOLEAN DEFAULT FALSE,
  thumbnail_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create automation workflows table
CREATE TABLE IF NOT EXISTS email_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL, -- user_signup, subscription_created, trial_ending, etc
  trigger_config JSONB DEFAULT '{}'::jsonb,
  list_id UUID REFERENCES email_lists(id) ON DELETE SET NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  delay_hours INTEGER DEFAULT 0, -- How long after trigger to send
  is_active BOOLEAN DEFAULT TRUE,
  total_triggered INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_subscribers_email ON email_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_status ON email_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_list_subscribers_list ON list_subscribers(list_id);
CREATE INDEX IF NOT EXISTS idx_list_subscribers_subscriber ON list_subscribers(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_sent_at ON email_campaigns(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_subscriber ON email_events(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_automations_active ON email_automations(is_active);

-- Enable RLS
ALTER TABLE email_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_automations ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Admin only for management)

CREATE POLICY "Admins can manage email lists"
  ON email_lists FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage subscribers"
  ON email_subscribers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage list subscribers"
  ON list_subscribers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage campaigns"
  ON email_campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view events"
  ON email_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage templates"
  ON email_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage automations"
  ON email_automations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_email_lists_updated_at
  BEFORE UPDATE ON email_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_subscribers_updated_at
  BEFORE UPDATE ON email_subscribers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_campaigns_updated_at
  BEFORE UPDATE ON email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_automations_updated_at
  BEFORE UPDATE ON email_automations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to update list subscriber count
CREATE OR REPLACE FUNCTION update_list_subscriber_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE email_lists
    SET subscriber_count = subscriber_count + 1
    WHERE id = NEW.list_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE email_lists
    SET subscriber_count = subscriber_count - 1
    WHERE id = OLD.list_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER list_subscribers_count
  AFTER INSERT OR DELETE ON list_subscribers
  FOR EACH ROW
  EXECUTE FUNCTION update_list_subscriber_count();

-- Function to calculate campaign metrics
CREATE OR REPLACE FUNCTION update_campaign_metrics()
RETURNS TRIGGER AS $$
DECLARE
  campaign_record RECORD;
BEGIN
  -- Get campaign totals
  SELECT
    c.id,
    c.total_sent,
    COUNT(e.id) FILTER (WHERE e.event_type = 'opened') as opens,
    COUNT(e.id) FILTER (WHERE e.event_type = 'clicked') as clicks
  INTO campaign_record
  FROM email_campaigns c
  LEFT JOIN email_events e ON e.campaign_id = c.id
  WHERE c.id = NEW.campaign_id
  GROUP BY c.id, c.total_sent;

  -- Update campaign with calculated rates
  IF campaign_record.total_sent > 0 THEN
    UPDATE email_campaigns
    SET
      total_opens = campaign_record.opens,
      total_clicks = campaign_record.clicks,
      open_rate = (campaign_record.opens::DECIMAL / campaign_record.total_sent * 100),
      click_rate = (campaign_record.clicks::DECIMAL / campaign_record.total_sent * 100)
    WHERE id = NEW.campaign_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaign_metrics_trigger
  AFTER INSERT ON email_events
  FOR EACH ROW
  WHEN (NEW.event_type IN ('opened', 'clicked'))
  EXECUTE FUNCTION update_campaign_metrics();

-- Function to get email marketing stats
CREATE OR REPLACE FUNCTION get_email_marketing_stats()
RETURNS TABLE (
  total_subscribers INTEGER,
  active_subscribers INTEGER,
  total_campaigns INTEGER,
  sent_campaigns INTEGER,
  avg_open_rate DECIMAL,
  avg_click_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT es.id)::INTEGER as total_subscribers,
    COUNT(DISTINCT es.id) FILTER (WHERE es.status = 'active')::INTEGER as active_subscribers,
    COUNT(DISTINCT ec.id)::INTEGER as total_campaigns,
    COUNT(DISTINCT ec.id) FILTER (WHERE ec.status = 'sent')::INTEGER as sent_campaigns,
    COALESCE(AVG(ec.open_rate) FILTER (WHERE ec.status = 'sent'), 0)::DECIMAL as avg_open_rate,
    COALESCE(AVG(ec.click_rate) FILTER (WHERE ec.status = 'sent'), 0)::DECIMAL as avg_click_rate
  FROM email_subscribers es
  CROSS JOIN email_campaigns ec;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default email list
INSERT INTO email_lists (name, description)
VALUES
  ('General Subscribers', 'Main email list for all subscribers'),
  ('Trial Users', 'Users currently on trial'),
  ('Paid Subscribers', 'Active paying subscribers'),
  ('Newsletter', 'Users who opted in to newsletter')
ON CONFLICT DO NOTHING;

-- Insert default email templates
INSERT INTO email_templates (name, description, subject_template, content_html, content_text, category, variables)
VALUES
  (
    'Welcome Email',
    'Sent to new users after signup',
    'Welcome to EatPal, {{first_name}}!',
    '<html><body><h1>Welcome to EatPal!</h1><p>Hi {{first_name}},</p><p>We''re excited to have you join our community of parents making mealtime easier.</p></body></html>',
    'Welcome to EatPal! Hi {{first_name}}, We''re excited to have you join our community.',
    'transactional',
    '["first_name", "email"]'::jsonb
  ),
  (
    'Weekly Newsletter',
    'Weekly tips and recipes',
    'ðŸ½ï¸ This Week''s Meal Planning Tips',
    '<html><body><h1>This Week at EatPal</h1><p>Hi {{first_name}},</p><p>Here are this week''s top meal planning tips and recipes...</p></body></html>',
    'This Week at EatPal. Hi {{first_name}}, Here are this week''s top meal planning tips...',
    'newsletter',
    '["first_name"]'::jsonb
  ),
  (
    'Trial Ending Soon',
    'Reminder that trial is ending',
    'Your EatPal trial ends in {{days_remaining}} days',
    '<html><body><h1>Trial Ending Soon</h1><p>Hi {{first_name}},</p><p>Your free trial ends in {{days_remaining}} days. Upgrade now to continue enjoying all features!</p></body></html>',
    'Trial Ending Soon. Hi {{first_name}}, Your free trial ends in {{days_remaining}} days.',
    'promotional',
    '["first_name", "days_remaining"]'::jsonb
  )
ON CONFLICT DO NOTHING;


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008145000_create_email_marketing_tables.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 26: 20251008150000_create_food_tracking_features.sql
-- ============================================

-- ============================================================================
-- FOOD CHAINING ALGORITHM & SUCCESS TRACKING
-- ============================================================================

-- Create food properties table for chaining algorithm
CREATE TABLE IF NOT EXISTS food_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id UUID REFERENCES foods(id) ON DELETE CASCADE,
  -- Texture properties
  texture_primary TEXT, -- crunchy, soft, chewy, smooth, crispy, creamy, etc.
  texture_secondary TEXT,
  texture_score INTEGER DEFAULT 50, -- 0-100 (0=very soft, 100=very crunchy)
  -- Flavor properties
  flavor_profile TEXT[], -- sweet, savory, salty, sour, bitter, umami
  flavor_intensity INTEGER DEFAULT 50, -- 0-100 (0=very mild, 100=very strong)
  spice_level INTEGER DEFAULT 0, -- 0-10
  -- Visual properties
  color_primary TEXT,
  color_secondary TEXT,
  visual_complexity TEXT, -- simple, moderate, complex (mixed colors/shapes)
  -- Temperature properties
  typical_temperature TEXT, -- hot, warm, room_temp, cold, frozen
  -- Other sensory
  smell_intensity INTEGER DEFAULT 50, -- 0-100
  requires_chewing BOOLEAN DEFAULT TRUE,
  messy_factor INTEGER DEFAULT 50, -- 0-100 (how messy to eat)
  -- Nutritional category
  food_category TEXT, -- protein, vegetable, fruit, grain, dairy, snack
  protein_source BOOLEAN DEFAULT FALSE,
  vegetable_source BOOLEAN DEFAULT FALSE,
  -- Additional metadata
  common_brands TEXT[], -- ["Brand A", "Brand B"]
  similar_foods TEXT[], -- Manual override for similar foods
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create food attempts/success tracking table
CREATE TABLE IF NOT EXISTS food_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  food_id UUID REFERENCES foods(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  -- Attempt stage (for structured exposure)
  stage TEXT DEFAULT 'full_bite', -- looking, touching, smelling, licking, tiny_taste, small_bite, full_bite, full_portion
  -- Outcome
  outcome TEXT NOT NULL, -- success, partial, refused, tantrum
  bites_taken INTEGER DEFAULT 0,
  amount_consumed TEXT, -- none, quarter, half, most, all
  -- Context
  meal_slot TEXT, -- breakfast, lunch, dinner, snack
  preparation_method TEXT, -- raw, steamed, baked, fried, etc.
  presentation_notes TEXT,
  -- Child response
  mood_before TEXT, -- happy, neutral, anxious, resistant
  mood_after TEXT,
  reaction_notes TEXT,
  -- Parent notes
  parent_notes TEXT,
  strategies_used TEXT[], -- ["positive_reinforcement", "modeling", "play", "hunger"]
  -- Photos
  photo_urls TEXT[],
  -- Success metrics
  is_milestone BOOLEAN DEFAULT FALSE, -- Mark significant breakthroughs
  celebration_unlocked TEXT, -- Badge or reward earned
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create food chain suggestions cache (for performance)
CREATE TABLE IF NOT EXISTS food_chain_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_food_id UUID REFERENCES foods(id) ON DELETE CASCADE,
  target_food_id UUID REFERENCES foods(id) ON DELETE CASCADE,
  similarity_score DECIMAL(5,2) DEFAULT 0, -- 0-100
  chain_reason TEXT[], -- ["similar_texture", "similar_flavor", "same_category"]
  recommended_order INTEGER DEFAULT 1, -- Order to try in chain
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_food_id, target_food_id)
);

-- ============================================================================
-- AI MEAL COACH
-- ============================================================================

-- Create conversation history for AI coach
CREATE TABLE IF NOT EXISTS ai_coach_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kid_id UUID REFERENCES kids(id) ON DELETE SET NULL,
  conversation_title TEXT, -- Auto-generated from first message
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT FALSE
);

-- Create individual messages
CREATE TABLE IF NOT EXISTS ai_coach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES ai_coach_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- user, assistant, system
  content TEXT NOT NULL,
  -- Context at time of message (for better responses)
  context_snapshot JSONB, -- Snapshot of kid's safe foods, allergens, recent meals
  -- AI metadata
  model_used TEXT,
  tokens_used INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- VISUAL MEAL BUILDER
-- ============================================================================

-- Create saved kid meal creations
CREATE TABLE IF NOT EXISTS kid_meal_creations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  creation_name TEXT NOT NULL,
  creation_type TEXT DEFAULT 'plate', -- plate, face, shape, custom
  -- Meal composition
  foods JSONB NOT NULL, -- [{"food_id": "uuid", "position": {"x": 10, "y": 20}, "size": "medium", "section": "main"}]
  plate_template TEXT DEFAULT 'standard', -- standard, divided, bento, etc.
  -- Visual data
  thumbnail_url TEXT,
  screenshot_data TEXT, -- Base64 or URL
  -- Engagement
  kid_approved BOOLEAN DEFAULT TRUE,
  times_requested INTEGER DEFAULT 0,
  last_requested_at TIMESTAMPTZ,
  -- Rewards/Gamification
  stars_earned INTEGER DEFAULT 0,
  badges_earned TEXT[],
  -- Sharing
  is_shared_with_family BOOLEAN DEFAULT FALSE,
  shared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create meal builder badges/achievements
CREATE TABLE IF NOT EXISTS kid_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL, -- tried_new_food, completed_week, ate_vegetable, etc.
  achievement_name TEXT NOT NULL,
  achievement_description TEXT,
  icon_name TEXT,
  color TEXT DEFAULT 'primary',
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  points_value INTEGER DEFAULT 10,
  -- What triggered it
  triggered_by_food_id UUID REFERENCES foods(id) ON DELETE SET NULL,
  triggered_by_creation_id UUID REFERENCES kid_meal_creations(id) ON DELETE SET NULL
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_food_properties_food ON food_properties(food_id);
CREATE INDEX IF NOT EXISTS idx_food_properties_texture ON food_properties(texture_primary);
CREATE INDEX IF NOT EXISTS idx_food_properties_category ON food_properties(food_category);

CREATE INDEX IF NOT EXISTS idx_food_attempts_kid ON food_attempts(kid_id);
CREATE INDEX IF NOT EXISTS idx_food_attempts_food ON food_attempts(food_id);
CREATE INDEX IF NOT EXISTS idx_food_attempts_date ON food_attempts(attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_food_attempts_outcome ON food_attempts(outcome);
CREATE INDEX IF NOT EXISTS idx_food_attempts_stage ON food_attempts(stage);

CREATE INDEX IF NOT EXISTS idx_food_chain_source ON food_chain_suggestions(source_food_id);
CREATE INDEX IF NOT EXISTS idx_food_chain_score ON food_chain_suggestions(similarity_score DESC);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_coach_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_kid ON ai_coach_conversations(kid_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_date ON ai_coach_conversations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_coach_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_date ON ai_coach_messages(created_at ASC);

CREATE INDEX IF NOT EXISTS idx_kid_creations_kid ON kid_meal_creations(kid_id);
CREATE INDEX IF NOT EXISTS idx_kid_creations_requested ON kid_meal_creations(times_requested DESC);

CREATE INDEX IF NOT EXISTS idx_kid_achievements_kid ON kid_achievements(kid_id);
CREATE INDEX IF NOT EXISTS idx_kid_achievements_date ON kid_achievements(earned_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE food_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_chain_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_coach_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_coach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE kid_meal_creations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kid_achievements ENABLE ROW LEVEL SECURITY;

-- Food properties: Everyone can read, admins can write
CREATE POLICY "Anyone can view food properties"
  ON food_properties FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage food properties"
  ON food_properties FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Food attempts: Users can manage their own kids' attempts
CREATE POLICY "Users can manage their kids' food attempts"
  ON food_attempts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM kids
      WHERE kids.id = food_attempts.kid_id
      AND kids.user_id = auth.uid()
    )
  );

-- Food chain suggestions: Everyone can read
CREATE POLICY "Anyone can view food chain suggestions"
  ON food_chain_suggestions FOR SELECT
  USING (true);

-- AI conversations: Users can manage their own conversations
CREATE POLICY "Users can manage their own conversations"
  ON ai_coach_conversations FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own messages"
  ON ai_coach_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM ai_coach_conversations
      WHERE ai_coach_conversations.id = ai_coach_messages.conversation_id
      AND ai_coach_conversations.user_id = auth.uid()
    )
  );

-- Kid meal creations: Users can manage their own kids' creations
CREATE POLICY "Users can manage their kids' meal creations"
  ON kid_meal_creations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM kids
      WHERE kids.id = kid_meal_creations.kid_id
      AND kids.user_id = auth.uid()
    )
  );

-- Kid achievements: Users can view and insert for their kids
CREATE POLICY "Users can manage their kids' achievements"
  ON kid_achievements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM kids
      WHERE kids.id = kid_achievements.kid_id
      AND kids.user_id = auth.uid()
    )
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_food_properties_updated_at
  BEFORE UPDATE ON food_properties
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_conversations_updated_at
  BEFORE UPDATE ON ai_coach_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate food chain similarity score
CREATE OR REPLACE FUNCTION calculate_food_similarity(
  food1_id UUID,
  food2_id UUID
)
RETURNS DECIMAL AS $$
DECLARE
  score DECIMAL := 0;
  props1 RECORD;
  props2 RECORD;
BEGIN
  -- Get properties for both foods
  SELECT * INTO props1 FROM food_properties WHERE food_id = food1_id;
  SELECT * INTO props2 FROM food_properties WHERE food_id = food2_id;

  IF props1 IS NULL OR props2 IS NULL THEN
    RETURN 0;
  END IF;

  -- Texture similarity (40% weight)
  IF props1.texture_primary = props2.texture_primary THEN
    score := score + 40;
  ELSIF props1.texture_secondary = props2.texture_primary OR props1.texture_primary = props2.texture_secondary THEN
    score := score + 20;
  END IF;

  -- Category similarity (30% weight)
  IF props1.food_category = props2.food_category THEN
    score := score + 30;
  END IF;

  -- Flavor similarity (20% weight)
  IF props1.flavor_profile && props2.flavor_profile THEN -- Array overlap
    score := score + 20;
  END IF;

  -- Temperature similarity (10% weight)
  IF props1.typical_temperature = props2.typical_temperature THEN
    score := score + 10;
  END IF;

  RETURN score;
END;
$$ LANGUAGE plpgsql;

-- Function to get food chain suggestions
CREATE OR REPLACE FUNCTION get_food_chain_suggestions(
  source_food UUID,
  limit_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  food_id UUID,
  food_name TEXT,
  similarity_score DECIMAL,
  reasons TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.name,
    fcs.similarity_score,
    fcs.chain_reason
  FROM food_chain_suggestions fcs
  JOIN foods f ON f.id = fcs.target_food_id
  WHERE fcs.source_food_id = source_food
  ORDER BY fcs.similarity_score DESC, fcs.recommended_order ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to track achievement unlock
CREATE OR REPLACE FUNCTION check_and_unlock_achievements(
  p_kid_id UUID,
  p_food_id UUID DEFAULT NULL,
  p_attempt_outcome TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  total_attempts INTEGER;
  successful_attempts INTEGER;
  new_foods_tried INTEGER;
BEGIN
  -- Count attempts
  SELECT COUNT(*) INTO total_attempts FROM food_attempts WHERE kid_id = p_kid_id;
  SELECT COUNT(*) INTO successful_attempts FROM food_attempts WHERE kid_id = p_kid_id AND outcome IN ('success', 'partial');
  SELECT COUNT(DISTINCT food_id) INTO new_foods_tried FROM food_attempts WHERE kid_id = p_kid_id AND outcome IN ('success', 'partial');

  -- First attempt achievement
  IF total_attempts = 1 THEN
    INSERT INTO kid_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_value)
    VALUES (p_kid_id, 'first_attempt', 'Brave Beginner', 'Made your first food attempt!', 'star', 10)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 10 foods tried achievement
  IF new_foods_tried = 10 THEN
    INSERT INTO kid_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_value)
    VALUES (p_kid_id, 'foods_milestone', 'Food Explorer', 'Tried 10 different foods!', 'trophy', 50)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 50 foods tried achievement
  IF new_foods_tried = 50 THEN
    INSERT INTO kid_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_value)
    VALUES (p_kid_id, 'foods_milestone', 'Adventurous Eater', 'Tried 50 different foods!', 'medal', 100)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Success rate achievements
  IF total_attempts >= 20 AND successful_attempts::DECIMAL / total_attempts >= 0.75 THEN
    INSERT INTO kid_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_value)
    VALUES (p_kid_id, 'success_rate', 'Super Taster', '75% success rate!', 'crown', 75)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-check achievements after food attempt
CREATE OR REPLACE FUNCTION trigger_achievement_check()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM check_and_unlock_achievements(NEW.kid_id, NEW.food_id, NEW.outcome);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_food_attempt_insert
  AFTER INSERT ON food_attempts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_achievement_check();

-- ============================================================================
-- SEED DATA - Default food properties
-- ============================================================================

-- This will be populated as users add foods, but we can seed common ones
-- Example insertions (can be expanded based on existing foods)
INSERT INTO food_properties (food_id, texture_primary, texture_secondary, texture_score, flavor_profile, flavor_intensity, food_category, typical_temperature)
SELECT
  id,
  CASE
    WHEN name ILIKE '%nugget%' OR name ILIKE '%chip%' OR name ILIKE '%cracker%' THEN 'crunchy'
    WHEN name ILIKE '%yogurt%' OR name ILIKE '%pudding%' OR name ILIKE '%applesauce%' THEN 'smooth'
    WHEN name ILIKE '%pasta%' OR name ILIKE '%noodle%' THEN 'soft'
    WHEN name ILIKE '%bread%' OR name ILIKE '%toast%' THEN 'chewy'
    WHEN name ILIKE '%cheese%' THEN 'creamy'
    ELSE 'soft'
  END,
  NULL,
  CASE
    WHEN name ILIKE '%nugget%' OR name ILIKE '%chip%' OR name ILIKE '%cracker%' THEN 75
    WHEN name ILIKE '%yogurt%' OR name ILIKE '%pudding%' THEN 10
    ELSE 50
  END,
  CASE
    WHEN name ILIKE '%sweet%' OR name ILIKE '%fruit%' OR name ILIKE '%apple%' THEN ARRAY['sweet']
    WHEN name ILIKE '%cheese%' OR name ILIKE '%meat%' OR name ILIKE '%chicken%' THEN ARRAY['savory']
    ELSE ARRAY['savory']
  END,
  50,
  CASE
    WHEN name ILIKE '%chicken%' OR name ILIKE '%meat%' OR name ILIKE '%beef%' OR name ILIKE '%nugget%' THEN 'protein'
    WHEN name ILIKE '%carrot%' OR name ILIKE '%broccoli%' OR name ILIKE '%vegetable%' THEN 'vegetable'
    WHEN name ILIKE '%apple%' OR name ILIKE '%banana%' OR name ILIKE '%fruit%' THEN 'fruit'
    WHEN name ILIKE '%bread%' OR name ILIKE '%pasta%' OR name ILIKE '%rice%' THEN 'grain'
    WHEN name ILIKE '%cheese%' OR name ILIKE '%yogurt%' OR name ILIKE '%milk%' THEN 'dairy'
    ELSE 'snack'
  END,
  'warm'
FROM foods
WHERE NOT EXISTS (
  SELECT 1 FROM food_properties WHERE food_properties.food_id = foods.id
);

-- ============================================================================
-- VIEWS FOR EASY QUERYING
-- ============================================================================

-- View for kid's food success rate
CREATE OR REPLACE VIEW kid_food_success_stats AS
SELECT
  k.id as kid_id,
  k.name as kid_name,
  f.id as food_id,
  f.name as food_name,
  COUNT(*) as total_attempts,
  COUNT(*) FILTER (WHERE fa.outcome = 'success') as successful_attempts,
  COUNT(*) FILTER (WHERE fa.outcome = 'partial') as partial_attempts,
  COUNT(*) FILTER (WHERE fa.outcome = 'refused') as refused_attempts,
  MAX(fa.attempted_at) as last_attempted,
  ROUND(COUNT(*) FILTER (WHERE fa.outcome IN ('success', 'partial'))::DECIMAL / COUNT(*) * 100, 2) as success_rate
FROM kids k
CROSS JOIN foods f
LEFT JOIN food_attempts fa ON fa.kid_id = k.id AND fa.food_id = f.id
GROUP BY k.id, k.name, f.id, f.name;


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008150000_create_food_tracking_features.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 27: 20251008202537_abaf0cfc-6afd-4141-89db-1fbde08a0be0.sql
-- ============================================

-- Update subscription plans with new pricing tiers

-- First, update the subscription_plans table to support more features
ALTER TABLE subscription_plans 
ADD COLUMN IF NOT EXISTS max_pantry_foods INTEGER,
ADD COLUMN IF NOT EXISTS ai_coach_daily_limit INTEGER,
ADD COLUMN IF NOT EXISTS food_tracker_monthly_limit INTEGER,
ADD COLUMN IF NOT EXISTS has_food_chaining BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_meal_builder BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_nutrition_tracking BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_multi_household BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS max_therapists INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_white_label BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS support_level TEXT DEFAULT 'email';

-- Delete existing plans to avoid conflicts
DELETE FROM subscription_plans;

-- Insert Free tier
INSERT INTO subscription_plans (
  name, 
  price_monthly, 
  price_yearly,
  max_children,
  max_pantry_foods,
  ai_coach_daily_limit,
  food_tracker_monthly_limit,
  has_food_chaining,
  has_meal_builder,
  has_nutrition_tracking,
  has_multi_household,
  max_therapists,
  has_white_label,
  support_level,
  features,
  sort_order,
  is_active
) VALUES (
  'Free',
  0,
  0,
  1,
  50,
  0,
  10,
  false,
  false,
  false,
  false,
  0,
  false,
  'email',
  '["1 child profile", "50 pantry foods", "10 food tracker entries/month", "Email support"]'::jsonb,
  1,
  true
);

-- Insert Pro tier
INSERT INTO subscription_plans (
  name,
  price_monthly,
  price_yearly,
  max_children,
  max_pantry_foods,
  ai_coach_daily_limit,
  food_tracker_monthly_limit,
  has_food_chaining,
  has_meal_builder,
  has_nutrition_tracking,
  has_multi_household,
  max_therapists,
  has_white_label,
  support_level,
  features,
  sort_order,
  is_active
) VALUES (
  'Pro',
  14.99,
  143.90,
  3,
  NULL,
  20,
  NULL,
  true,
  true,
  true,
  false,
  0,
  false,
  'priority',
  '["3 children profiles", "Unlimited pantry foods", "20 AI coach requests/day", "Unlimited food tracking", "Food chaining recommendations", "Kid meal builder", "Nutrition tracking", "Priority support"]'::jsonb,
  2,
  true
);

-- Insert Family Plus tier  
INSERT INTO subscription_plans (
  name,
  price_monthly,
  price_yearly,
  max_children,
  max_pantry_foods,
  ai_coach_daily_limit,
  food_tracker_monthly_limit,
  has_food_chaining,
  has_meal_builder,
  has_nutrition_tracking,
  has_multi_household,
  max_therapists,
  has_white_label,
  support_level,
  features,
  sort_order,
  is_active
) VALUES (
  'Family Plus',
  24.99,
  239.90,
  NULL,
  NULL,
  NULL,
  NULL,
  true,
  true,
  true,
  true,
  1,
  false,
  'priority',
  '["Unlimited children profiles", "Unlimited pantry foods", "Unlimited AI coach", "Unlimited food tracking", "Food chaining recommendations", "Kid meal builder", "Nutrition tracking", "Multi-household sharing", "1 therapist collaboration", "Priority support"]'::jsonb,
  3,
  true
);

-- Insert Professional tier
INSERT INTO subscription_plans (
  name,
  price_monthly,
  price_yearly,
  max_children,
  max_pantry_foods,
  ai_coach_daily_limit,
  food_tracker_monthly_limit,
  has_food_chaining,
  has_meal_builder,
  has_nutrition_tracking,
  has_multi_household,
  max_therapists,
  has_white_label,
  support_level,
  features,
  sort_order,
  is_active
) VALUES (
  'Professional',
  99,
  950,
  NULL,
  NULL,
  NULL,
  NULL,
  true,
  true,
  true,
  false,
  NULL,
  true,
  'phone',
  '["Client management system", "Unlimited pantry foods", "Unlimited AI coach", "Unlimited food tracking", "Food chaining recommendations", "Kid meal builder", "Nutrition tracking", "Full professional portal", "White label branding", "Phone + Email support"]'::jsonb,
  4,
  true
);

-- Create usage tracking table
CREATE TABLE IF NOT EXISTS user_usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  ai_coach_requests INTEGER DEFAULT 0,
  food_tracker_entries INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE user_usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage"
  ON user_usage_tracking FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own usage"
  ON user_usage_tracking FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own usage"
  ON user_usage_tracking FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to check if user has reached feature limit
CREATE OR REPLACE FUNCTION check_feature_limit(
  p_user_id UUID,
  p_feature_type TEXT,
  p_current_count INTEGER DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription RECORD;
  v_plan RECORD;
  v_usage RECORD;
  v_result JSONB;
BEGIN
  -- Get user's active subscription
  SELECT us.*, sp.*
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing')
  LIMIT 1;
  
  -- If no subscription, use Free plan limits
  IF v_subscription IS NULL THEN
    SELECT * INTO v_plan
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;
  ELSE
    v_plan := v_subscription;
  END IF;
  
  -- Check based on feature type
  CASE p_feature_type
    WHEN 'children' THEN
      IF v_plan.max_children IS NULL THEN
        RETURN jsonb_build_object('allowed', true, 'limit', NULL, 'current', p_current_count);
      ELSIF p_current_count >= v_plan.max_children THEN
        RETURN jsonb_build_object('allowed', false, 'limit', v_plan.max_children, 'current', p_current_count, 'message', 'You have reached your child profile limit. Upgrade to add more children.');
      ELSE
        RETURN jsonb_build_object('allowed', true, 'limit', v_plan.max_children, 'current', p_current_count);
      END IF;
      
    WHEN 'pantry_foods' THEN
      IF v_plan.max_pantry_foods IS NULL THEN
        RETURN jsonb_build_object('allowed', true, 'limit', NULL, 'current', p_current_count);
      ELSIF p_current_count >= v_plan.max_pantry_foods THEN
        RETURN jsonb_build_object('allowed', false, 'limit', v_plan.max_pantry_foods, 'current', p_current_count, 'message', 'You have reached your pantry food limit. Upgrade for unlimited foods.');
      ELSE
        RETURN jsonb_build_object('allowed', true, 'limit', v_plan.max_pantry_foods, 'current', p_current_count);
      END IF;
      
    WHEN 'ai_coach' THEN
      -- Get today's usage
      SELECT * INTO v_usage
      FROM user_usage_tracking
      WHERE user_id = p_user_id
        AND date = CURRENT_DATE;
        
      IF v_plan.ai_coach_daily_limit IS NULL THEN
        RETURN jsonb_build_object('allowed', true, 'limit', NULL, 'current', COALESCE(v_usage.ai_coach_requests, 0));
      ELSIF v_plan.ai_coach_daily_limit = 0 THEN
        RETURN jsonb_build_object('allowed', false, 'limit', 0, 'current', 0, 'message', 'AI Coach is not available on your plan. Upgrade to access this feature.');
      ELSIF COALESCE(v_usage.ai_coach_requests, 0) >= v_plan.ai_coach_daily_limit THEN
        RETURN jsonb_build_object('allowed', false, 'limit', v_plan.ai_coach_daily_limit, 'current', v_usage.ai_coach_requests, 'message', 'You have reached your daily AI Coach limit. Upgrade for more requests or try again tomorrow.');
      ELSE
        RETURN jsonb_build_object('allowed', true, 'limit', v_plan.ai_coach_daily_limit, 'current', COALESCE(v_usage.ai_coach_requests, 0));
      END IF;
      
    WHEN 'food_tracker' THEN
      -- Get this month's usage
      SELECT SUM(food_tracker_entries) as total INTO v_usage
      FROM user_usage_tracking
      WHERE user_id = p_user_id
        AND date >= date_trunc('month', CURRENT_DATE);
        
      IF v_plan.food_tracker_monthly_limit IS NULL THEN
        RETURN jsonb_build_object('allowed', true, 'limit', NULL, 'current', COALESCE(v_usage.total, 0));
      ELSIF COALESCE(v_usage.total, 0) >= v_plan.food_tracker_monthly_limit THEN
        RETURN jsonb_build_object('allowed', false, 'limit', v_plan.food_tracker_monthly_limit, 'current', v_usage.total, 'message', 'You have reached your monthly food tracking limit. Upgrade for unlimited tracking.');
      ELSE
        RETURN jsonb_build_object('allowed', true, 'limit', v_plan.food_tracker_monthly_limit, 'current', COALESCE(v_usage.total, 0));
      END IF;
      
    WHEN 'food_chaining', 'meal_builder', 'nutrition_tracking' THEN
      CASE p_feature_type
        WHEN 'food_chaining' THEN
          IF NOT v_plan.has_food_chaining THEN
            RETURN jsonb_build_object('allowed', false, 'message', 'Food Chaining is not available on your plan. Upgrade to access this feature.');
          END IF;
        WHEN 'meal_builder' THEN
          IF NOT v_plan.has_meal_builder THEN
            RETURN jsonb_build_object('allowed', false, 'message', 'Meal Builder is not available on your plan. Upgrade to access this feature.');
          END IF;
        WHEN 'nutrition_tracking' THEN
          IF NOT v_plan.has_nutrition_tracking THEN
            RETURN jsonb_build_object('allowed', false, 'message', 'Nutrition Tracking is not available on your plan. Upgrade to access this feature.');
          END IF;
      END CASE;
      RETURN jsonb_build_object('allowed', true);
      
    ELSE
      RETURN jsonb_build_object('allowed', true);
  END CASE;
END;
$$;

-- Function to increment usage
CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id UUID,
  p_feature_type TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_usage_tracking (user_id, date, ai_coach_requests, food_tracker_entries)
  VALUES (
    p_user_id,
    CURRENT_DATE,
    CASE WHEN p_feature_type = 'ai_coach' THEN 1 ELSE 0 END,
    CASE WHEN p_feature_type = 'food_tracker' THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    ai_coach_requests = user_usage_tracking.ai_coach_requests + CASE WHEN p_feature_type = 'ai_coach' THEN 1 ELSE 0 END,
    food_tracker_entries = user_usage_tracking.food_tracker_entries + CASE WHEN p_feature_type = 'food_tracker' THEN 1 ELSE 0 END,
    updated_at = NOW();
END;
$$;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008202537_abaf0cfc-6afd-4141-89db-1fbde08a0be0.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 28: 20251008203700_13e32f11-8e5a-4361-bd61-bfdcb38ad9bd.sql
-- ============================================

-- Create email marketing tables

-- Email lists table
CREATE TABLE public.email_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  subscriber_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Email subscribers table
CREATE TABLE public.email_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  status TEXT DEFAULT 'active',
  source TEXT,
  confirmed BOOLEAN DEFAULT false,
  list_id UUID REFERENCES public.email_lists(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}'::jsonb,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Email campaigns table  
CREATE TABLE public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  template_id UUID,
  list_id UUID REFERENCES public.email_lists(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft',
  total_recipients INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_opens INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  open_rate DECIMAL DEFAULT 0,
  click_rate DECIMAL DEFAULT 0,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Email templates table
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  subject_template TEXT NOT NULL,
  content_template TEXT NOT NULL,
  category TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admins only
CREATE POLICY "Admins can manage email lists"
  ON public.email_lists FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage email subscribers"
  ON public.email_subscribers FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage email campaigns"
  ON public.email_campaigns FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage email templates"
  ON public.email_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to get email marketing stats
CREATE OR REPLACE FUNCTION public.get_email_marketing_stats()
RETURNS TABLE(
  total_subscribers INTEGER,
  active_subscribers INTEGER,
  total_campaigns INTEGER,
  sent_campaigns INTEGER,
  avg_open_rate DECIMAL,
  avg_click_rate DECIMAL
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_subscribers,
    COUNT(*) FILTER (WHERE status = 'active')::INTEGER as active_subscribers,
    (SELECT COUNT(*)::INTEGER FROM email_campaigns) as total_campaigns,
    (SELECT COUNT(*) FILTER (WHERE status = 'sent')::INTEGER FROM email_campaigns) as sent_campaigns,
    COALESCE((SELECT AVG(open_rate) FROM email_campaigns WHERE status = 'sent'), 0)::DECIMAL as avg_open_rate,
    COALESCE((SELECT AVG(click_rate) FROM email_campaigns WHERE status = 'sent'), 0)::DECIMAL as avg_click_rate
  FROM email_subscribers;
END;
$$;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008203700_13e32f11-8e5a-4361-bd61-bfdcb38ad9bd.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 29: 20251008205036_84aa8701-4e4e-45aa-a2df-22f40ea5b683.sql
-- ============================================

-- Create promotional campaigns table
CREATE TABLE IF NOT EXISTS public.promotional_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  affected_plan_ids UUID[] NOT NULL DEFAULT '{}',
  discount_duration_type TEXT NOT NULL DEFAULT 'campaign_only' CHECK (discount_duration_type IN ('campaign_only', 'first_period', 'forever')),
  stripe_coupon_id TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create complementary subscriptions table
CREATE TABLE IF NOT EXISTS public.complementary_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  granted_by UUID NOT NULL,
  reason TEXT,
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date TIMESTAMPTZ,
  is_permanent BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add campaign tracking to user subscriptions
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS promotional_campaign_id UUID REFERENCES public.promotional_campaigns(id),
ADD COLUMN IF NOT EXISTS is_complementary BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS complementary_subscription_id UUID REFERENCES public.complementary_subscriptions(id);

-- Enable RLS
ALTER TABLE public.promotional_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complementary_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for promotional_campaigns
CREATE POLICY "Admins can manage promotional campaigns"
ON public.promotional_campaigns
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active campaigns"
ON public.promotional_campaigns
FOR SELECT
USING (is_active = true AND start_date <= now() AND (end_date IS NULL OR end_date >= now()));

-- RLS Policies for complementary_subscriptions
CREATE POLICY "Admins can manage complementary subscriptions"
ON public.complementary_subscriptions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own complementary subscriptions"
ON public.complementary_subscriptions
FOR SELECT
USING (user_id = auth.uid());

-- Create trigger for updating updated_at
CREATE TRIGGER update_promotional_campaigns_updated_at
BEFORE UPDATE ON public.promotional_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_complementary_subscriptions_updated_at
BEFORE UPDATE ON public.complementary_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get active promotional campaigns for a plan
CREATE OR REPLACE FUNCTION public.get_active_campaign_for_plan(p_plan_id UUID)
RETURNS TABLE(
  campaign_id UUID,
  discount_type TEXT,
  discount_value NUMERIC,
  discount_duration_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.id,
    pc.discount_type,
    pc.discount_value,
    pc.discount_duration_type
  FROM public.promotional_campaigns pc
  WHERE pc.is_active = true
    AND pc.start_date <= now()
    AND (pc.end_date IS NULL OR pc.end_date >= now())
    AND p_plan_id = ANY(pc.affected_plan_ids)
  ORDER BY pc.created_at DESC
  LIMIT 1;
END;
$$;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251008205036_84aa8701-4e4e-45aa-a2df-22f40ea5b683.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 30: 20251009013519_73dc92eb-0536-415c-aab4-27eeef0b5679.sql
-- ============================================

-- Add barcode column to foods table for user pantry items
ALTER TABLE public.foods 
ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Add index for fast barcode lookups in user pantry
CREATE INDEX IF NOT EXISTS idx_foods_barcode ON public.foods(barcode) WHERE barcode IS NOT NULL;

-- Add barcode column to nutrition table for community reference
ALTER TABLE public.nutrition 
ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Add index for fast barcode lookups in nutrition database
CREATE INDEX IF NOT EXISTS idx_nutrition_barcode ON public.nutrition(barcode) WHERE barcode IS NOT NULL;

-- Add comments
COMMENT ON COLUMN public.foods.barcode IS 'UPC/EAN barcode for product identification and quick lookups';
COMMENT ON COLUMN public.nutrition.barcode IS 'UPC/EAN barcode for product identification and quick lookups';

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251009013519_73dc92eb-0536-415c-aab4-27eeef0b5679.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 31: 20251009160000_add_social_content_versions.sql
-- ============================================

-- Add short_form_content and long_form_content to social_posts table
-- This allows storing different versions of content for different platforms

ALTER TABLE social_posts
ADD COLUMN IF NOT EXISTS short_form_content TEXT,
ADD COLUMN IF NOT EXISTS long_form_content TEXT;

-- Add webhook_url to store a global webhook URL for automation
ALTER TABLE social_posts
ADD COLUMN IF NOT EXISTS webhook_url TEXT;

COMMENT ON COLUMN social_posts.short_form_content IS 'Short form content for Twitter/X and similar platforms (under 280 chars)';
COMMENT ON COLUMN social_posts.long_form_content IS 'Long form content for Facebook, LinkedIn and similar platforms';
COMMENT ON COLUMN social_posts.webhook_url IS 'Global webhook URL to send all post data when published';

-- Update social_accounts table to support a single webhook configuration
ALTER TABLE social_accounts
ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN social_accounts.is_global IS 'If true, this is a global webhook that receives all posts regardless of platform';



-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251009160000_add_social_content_versions.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 32: 20251010151519_f7548433-05f9-4d84-8c6e-f86ed7a731f3.sql
-- ============================================

-- Add 'webhook' to social_platform enum
ALTER TYPE social_platform ADD VALUE IF NOT EXISTS 'webhook';

-- Allow null platform for webhook-only accounts
ALTER TABLE social_accounts ALTER COLUMN platform DROP NOT NULL;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251010151519_f7548433-05f9-4d84-8c6e-f86ed7a731f3.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 33: 20251010200227_03548bf8-efb9-4405-b3c3-bf50f25dad2d.sql
-- ============================================

-- Add comprehensive child preference fields to kids table
ALTER TABLE public.kids
ADD COLUMN IF NOT EXISTS gender text,
ADD COLUMN IF NOT EXISTS height_cm numeric,
ADD COLUMN IF NOT EXISTS weight_kg numeric,
ADD COLUMN IF NOT EXISTS dietary_restrictions text[],
ADD COLUMN IF NOT EXISTS health_goals text[],
ADD COLUMN IF NOT EXISTS nutrition_concerns text[],
ADD COLUMN IF NOT EXISTS eating_behavior text,
ADD COLUMN IF NOT EXISTS new_food_willingness text,
ADD COLUMN IF NOT EXISTS helpful_strategies text[],
ADD COLUMN IF NOT EXISTS texture_preferences text[],
ADD COLUMN IF NOT EXISTS texture_dislikes text[],
ADD COLUMN IF NOT EXISTS flavor_preferences text[],
ADD COLUMN IF NOT EXISTS always_eats_foods text[],
ADD COLUMN IF NOT EXISTS disliked_foods text[],
ADD COLUMN IF NOT EXISTS allergen_severity jsonb,
ADD COLUMN IF NOT EXISTS cross_contamination_sensitive boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS behavioral_notes text,
ADD COLUMN IF NOT EXISTS profile_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS profile_last_reviewed timestamp with time zone;

-- Add comment to explain the schema
COMMENT ON COLUMN public.kids.allergen_severity IS 'JSON object mapping allergen names to severity levels (mild, moderate, severe)';
COMMENT ON COLUMN public.kids.dietary_restrictions IS 'Array of dietary restrictions like vegetarian, vegan, halal, kosher';
COMMENT ON COLUMN public.kids.health_goals IS 'Array of parent-defined goals like maintain_balance, gain_weight, try_new_foods, reduce_sugar, improve_variety';
COMMENT ON COLUMN public.kids.nutrition_concerns IS 'Array of concerns like underweight, overweight, low_appetite, sugar_intake, protein_intake, constipation, iron_deficiency';
COMMENT ON COLUMN public.kids.eating_behavior IS 'very_picky, somewhat_selective, eats_most_foods';
COMMENT ON COLUMN public.kids.new_food_willingness IS 'rarely, only_when_forced, sometimes, willing_to_explore';
COMMENT ON COLUMN public.kids.helpful_strategies IS 'Array of strategies that help the child try new foods';
COMMENT ON COLUMN public.kids.texture_preferences IS 'Array of preferred textures like crunchy, soft, smooth, mixed, slippery, warm, cold';
COMMENT ON COLUMN public.kids.flavor_preferences IS 'Array of preferred flavors like sweet, salty, mild, savory, tangy, spicy';

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251010200227_03548bf8-efb9-4405-b3c3-bf50f25dad2d.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 34: 20251010220000_link_planner_food_tracker.sql
-- ============================================

-- ============================================================================
-- PHASE 1: LINK PLANNER AND FOOD TRACKER
-- ============================================================================
-- This migration creates bidirectional integration between plan_entries and food_attempts
-- to unify quick tracking (Planner) with detailed tracking (Food Tracker)

-- Add food_attempt_id to plan_entries (optional link to detailed tracking)
ALTER TABLE plan_entries
ADD COLUMN IF NOT EXISTS food_attempt_id UUID REFERENCES food_attempts(id) ON DELETE SET NULL;

-- Add plan_entry_id to food_attempts (optional link to scheduled meal)
ALTER TABLE food_attempts
ADD COLUMN IF NOT EXISTS plan_entry_id UUID REFERENCES plan_entries(id) ON DELETE SET NULL;

-- Add recipe_id to plan_entries to track when food is part of a recipe
ALTER TABLE plan_entries
ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_primary_dish BOOLEAN DEFAULT true;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_plan_entries_food_attempt ON plan_entries(food_attempt_id);
CREATE INDEX IF NOT EXISTS idx_plan_entries_recipe ON plan_entries(recipe_id);
CREATE INDEX IF NOT EXISTS idx_food_attempts_plan_entry ON food_attempts(plan_entry_id);

-- ============================================================================
-- HELPER FUNCTIONS FOR UNIFIED TRACKING
-- ============================================================================

-- Function to create a food attempt from a plan entry result
CREATE OR REPLACE FUNCTION create_attempt_from_plan_result()
RETURNS TRIGGER AS $$
DECLARE
  v_attempt_id UUID;
  v_stage TEXT;
  v_outcome TEXT;
  v_amount_consumed TEXT;
BEGIN
  -- Only create attempt if result is being set and no attempt exists yet
  IF NEW.result IS NOT NULL AND OLD.result IS NULL AND NEW.food_attempt_id IS NULL THEN

    -- Map plan entry result to food attempt fields
    CASE NEW.result
      WHEN 'ate' THEN
        v_outcome := 'success';
        v_stage := 'full_portion';
        v_amount_consumed := 'all';
      WHEN 'tasted' THEN
        v_outcome := 'partial';
        v_stage := 'small_bite';
        v_amount_consumed := 'quarter';
      WHEN 'refused' THEN
        v_outcome := 'refused';
        v_stage := 'looking';
        v_amount_consumed := 'none';
      ELSE
        RETURN NEW;
    END CASE;

    -- Create the food attempt
    INSERT INTO food_attempts (
      kid_id,
      food_id,
      attempted_at,
      stage,
      outcome,
      bites_taken,
      amount_consumed,
      meal_slot,
      mood_before,
      parent_notes,
      plan_entry_id
    ) VALUES (
      NEW.kid_id,
      NEW.food_id,
      NOW(),
      v_stage,
      v_outcome,
      CASE NEW.result WHEN 'ate' THEN 5 WHEN 'tasted' THEN 1 ELSE 0 END,
      v_amount_consumed,
      NEW.meal_slot,
      'neutral',
      NEW.notes,
      NEW.id
    )
    RETURNING id INTO v_attempt_id;

    -- Link the attempt back to the plan entry
    NEW.food_attempt_id := v_attempt_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create food attempts when plan entries are marked
DROP TRIGGER IF EXISTS plan_result_creates_attempt ON plan_entries;
CREATE TRIGGER plan_result_creates_attempt
  BEFORE UPDATE ON plan_entries
  FOR EACH ROW
  EXECUTE FUNCTION create_attempt_from_plan_result();

-- Function to sync plan entry result when food attempt is updated
CREATE OR REPLACE FUNCTION sync_plan_result_from_attempt()
RETURNS TRIGGER AS $$
DECLARE
  v_result TEXT;
BEGIN
  -- Only sync if this attempt is linked to a plan entry
  IF NEW.plan_entry_id IS NOT NULL THEN

    -- Map food attempt outcome to plan entry result
    CASE NEW.outcome
      WHEN 'success' THEN
        v_result := 'ate';
      WHEN 'partial' THEN
        v_result := 'tasted';
      WHEN 'refused', 'tantrum' THEN
        v_result := 'refused';
      ELSE
        v_result := NULL;
    END CASE;

    -- Update the plan entry
    UPDATE plan_entries
    SET
      result = v_result,
      notes = COALESCE(NEW.parent_notes, notes),
      updated_at = NOW()
    WHERE id = NEW.plan_entry_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to sync plan entry when attempt is updated
DROP TRIGGER IF EXISTS attempt_syncs_plan_result ON food_attempts;
CREATE TRIGGER attempt_syncs_plan_result
  AFTER INSERT OR UPDATE ON food_attempts
  FOR EACH ROW
  EXECUTE FUNCTION sync_plan_result_from_attempt();

-- ============================================================================
-- RECIPE SCHEDULING HELPERS
-- ============================================================================

-- Function to schedule a complete recipe to the meal plan
CREATE OR REPLACE FUNCTION schedule_recipe_to_plan(
  p_kid_id UUID,
  p_recipe_id UUID,
  p_date DATE,
  p_meal_slot TEXT
)
RETURNS INTEGER AS $$
DECLARE
  v_food_id UUID;
  v_food_ids UUID[];
  v_user_id UUID;
  v_count INTEGER := 0;
  v_is_primary BOOLEAN := true;
BEGIN
  -- Get user_id from kid
  SELECT user_id INTO v_user_id FROM kids WHERE id = p_kid_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Kid not found';
  END IF;

  -- Get recipe food_ids
  SELECT food_ids INTO v_food_ids FROM recipes WHERE id = p_recipe_id;

  IF v_food_ids IS NULL OR array_length(v_food_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Recipe has no foods';
  END IF;

  -- Delete any existing entries for this kid/date/slot/recipe combination
  DELETE FROM plan_entries
  WHERE kid_id = p_kid_id
    AND date = p_date
    AND meal_slot = p_meal_slot
    AND recipe_id = p_recipe_id;

  -- Insert plan entries for each food in recipe
  FOREACH v_food_id IN ARRAY v_food_ids
  LOOP
    INSERT INTO plan_entries (
      user_id,
      kid_id,
      date,
      meal_slot,
      food_id,
      recipe_id,
      is_primary_dish
    ) VALUES (
      v_user_id,
      p_kid_id,
      p_date,
      p_meal_slot,
      v_food_id,
      p_recipe_id,
      v_is_primary
    );

    v_count := v_count + 1;
    v_is_primary := false; -- Only first food is primary
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS FOR UNIFIED TRACKING
-- ============================================================================

-- View showing all tracking data (quick + detailed) for a kid
CREATE OR REPLACE VIEW unified_meal_tracking AS
SELECT
  pe.id as plan_entry_id,
  pe.kid_id,
  pe.date,
  pe.meal_slot,
  pe.food_id,
  f.name as food_name,
  f.category as food_category,
  pe.recipe_id,
  r.name as recipe_name,
  pe.is_primary_dish,
  -- Quick tracking data from plan_entries
  pe.result as quick_result,
  pe.notes as quick_notes,
  -- Detailed tracking data from food_attempts (if exists)
  fa.id as food_attempt_id,
  fa.stage,
  fa.outcome,
  fa.bites_taken,
  fa.amount_consumed,
  fa.mood_before,
  fa.mood_after,
  fa.reaction_notes,
  fa.parent_notes as detailed_notes,
  fa.strategies_used,
  fa.is_milestone,
  fa.attempted_at,
  -- Combined fields
  COALESCE(pe.result,
    CASE fa.outcome
      WHEN 'success' THEN 'ate'
      WHEN 'partial' THEN 'tasted'
      WHEN 'refused' THEN 'refused'
      WHEN 'tantrum' THEN 'refused'
    END
  ) as combined_result,
  CASE WHEN fa.id IS NOT NULL THEN true ELSE false END as has_detailed_tracking,
  pe.created_at,
  pe.updated_at
FROM plan_entries pe
JOIN foods f ON f.id = pe.food_id
LEFT JOIN recipes r ON r.id = pe.recipe_id
LEFT JOIN food_attempts fa ON fa.id = pe.food_attempt_id
ORDER BY pe.date DESC, pe.meal_slot;

-- View for recipe success tracking
CREATE OR REPLACE VIEW recipe_success_stats AS
SELECT
  r.id as recipe_id,
  r.name as recipe_name,
  COUNT(DISTINCT pe.date) as times_scheduled,
  COUNT(DISTINCT pe.id) as total_food_entries,
  COUNT(DISTINCT pe.id) FILTER (WHERE pe.result = 'ate') as foods_eaten,
  COUNT(DISTINCT pe.id) FILTER (WHERE pe.result IN ('ate', 'tasted')) as foods_accepted,
  ROUND(
    COUNT(DISTINCT pe.id) FILTER (WHERE pe.result IN ('ate', 'tasted'))::DECIMAL
    / NULLIF(COUNT(DISTINCT pe.id), 0) * 100,
    2
  ) as acceptance_rate,
  MAX(pe.date) as last_scheduled
FROM recipes r
LEFT JOIN plan_entries pe ON pe.recipe_id = r.id
GROUP BY r.id, r.name;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN plan_entries.food_attempt_id IS 'Links to detailed food tracking if parent wants more detail';
COMMENT ON COLUMN plan_entries.recipe_id IS 'Links to recipe if this food is part of a meal template';
COMMENT ON COLUMN plan_entries.is_primary_dish IS 'True if this is the main dish in a recipe (first food)';
COMMENT ON COLUMN food_attempts.plan_entry_id IS 'Links to planned meal if this was a scheduled attempt';

COMMENT ON FUNCTION create_attempt_from_plan_result() IS 'Auto-creates detailed food attempt when user marks plan entry result';
COMMENT ON FUNCTION sync_plan_result_from_attempt() IS 'Syncs plan entry result when food attempt is updated';
COMMENT ON FUNCTION schedule_recipe_to_plan IS 'Schedules all foods from a recipe to the meal plan';

COMMENT ON VIEW unified_meal_tracking IS 'Combines quick tracking (plan_entries) and detailed tracking (food_attempts) into single view';
COMMENT ON VIEW recipe_success_stats IS 'Shows recipe-level success metrics';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251010220000_link_planner_food_tracker.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 35: 20251010221000_smart_grocery_restock.sql
-- ============================================

-- ============================================================================
-- SMART GROCERY RESTOCK SYSTEM
-- ============================================================================
-- Automatically detects when foods need restocking based on:
-- 1. Low/out of stock items with upcoming plan entries
-- 2. High consumption velocity foods
-- 3. Foods eaten frequently in the past week

-- Add metadata to grocery_items for smarter management
ALTER TABLE grocery_items
ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS restock_reason TEXT,
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
ADD COLUMN IF NOT EXISTS aisle TEXT;

-- Create index for auto-generated items
CREATE INDEX IF NOT EXISTS idx_grocery_items_auto ON grocery_items(auto_generated, checked);

-- ============================================================================
-- RESTOCK DETECTION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION detect_restock_needs(
  p_user_id UUID,
  p_kid_id UUID DEFAULT NULL
)
RETURNS TABLE (
  food_id UUID,
  food_name TEXT,
  current_quantity INTEGER,
  recommended_quantity INTEGER,
  reason TEXT,
  priority TEXT,
  category TEXT,
  aisle TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH upcoming_meals AS (
    -- Get foods in upcoming plan (next 7 days)
    SELECT
      pe.food_id,
      COUNT(*) as times_planned
    FROM plan_entries pe
    WHERE pe.user_id = p_user_id
      AND (p_kid_id IS NULL OR pe.kid_id = p_kid_id)
      AND pe.date >= CURRENT_DATE
      AND pe.date <= CURRENT_DATE + INTERVAL '7 days'
    GROUP BY pe.food_id
  ),
  recent_consumption AS (
    -- Get foods eaten in last 7 days
    SELECT
      pe.food_id,
      COUNT(*) as times_eaten
    FROM plan_entries pe
    WHERE pe.user_id = p_user_id
      AND (p_kid_id IS NULL OR pe.kid_id = p_kid_id)
      AND pe.date >= CURRENT_DATE - INTERVAL '7 days'
      AND pe.date < CURRENT_DATE
      AND pe.result = 'ate'
    GROUP BY pe.food_id
  ),
  food_stats AS (
    SELECT
      f.id,
      f.name,
      f.category,
      f.aisle,
      COALESCE(f.quantity, 0) as current_qty,
      COALESCE(um.times_planned, 0) as planned,
      COALESCE(rc.times_eaten, 0) as eaten,
      -- Calculate recommended quantity
      GREATEST(
        COALESCE(um.times_planned, 0) - COALESCE(f.quantity, 0),
        CASE
          WHEN COALESCE(rc.times_eaten, 0) >= 5 THEN 7  -- Frequently eaten
          WHEN COALESCE(rc.times_eaten, 0) >= 3 THEN 5  -- Regularly eaten
          WHEN COALESCE(um.times_planned, 0) > 0 THEN 3  -- Planned but low stock
          ELSE 0
        END
      ) as recommended,
      -- Determine reason and priority
      CASE
        WHEN COALESCE(f.quantity, 0) = 0 AND COALESCE(um.times_planned, 0) > 0
          THEN 'Out of stock with upcoming meals'
        WHEN COALESCE(f.quantity, 0) <= 2 AND COALESCE(um.times_planned, 0) > 0
          THEN 'Low stock with ' || COALESCE(um.times_planned, 0) || ' meals planned'
        WHEN COALESCE(rc.times_eaten, 0) >= 5
          THEN 'Frequently eaten (' || COALESCE(rc.times_eaten, 0) || ' times last week)'
        WHEN COALESCE(rc.times_eaten, 0) >= 3
          THEN 'Regularly eaten (' || COALESCE(rc.times_eaten, 0) || ' times last week)'
        ELSE 'Proactive restock'
      END as restock_reason,
      CASE
        WHEN COALESCE(f.quantity, 0) = 0 AND COALESCE(um.times_planned, 0) > 0
          THEN 'high'
        WHEN COALESCE(f.quantity, 0) <= 2 AND COALESCE(um.times_planned, 0) > 0
          THEN 'high'
        WHEN COALESCE(rc.times_eaten, 0) >= 5
          THEN 'high'
        WHEN COALESCE(rc.times_eaten, 0) >= 3
          THEN 'medium'
        ELSE 'low'
      END as priority_level
    FROM foods f
    LEFT JOIN upcoming_meals um ON um.food_id = f.id
    LEFT JOIN recent_consumption rc ON rc.food_id = f.id
    WHERE f.user_id = p_user_id
      AND f.is_safe = true  -- Only restock safe foods
      AND (
        -- Include if: out of stock OR low stock OR frequently eaten
        COALESCE(f.quantity, 0) = 0
        OR COALESCE(f.quantity, 0) <= 2
        OR COALESCE(rc.times_eaten, 0) >= 3
      )
  )
  SELECT
    fs.id,
    fs.name,
    fs.current_qty,
    fs.recommended::INTEGER,
    fs.restock_reason,
    fs.priority_level,
    fs.category,
    fs.aisle
  FROM food_stats fs
  WHERE fs.recommended > 0
  ORDER BY
    CASE fs.priority_level
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      ELSE 3
    END,
    fs.recommended DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AUTO-ADD RESTOCK ITEMS TO GROCERY LIST
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_add_restock_items(
  p_user_id UUID,
  p_kid_id UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_restock_record RECORD;
  v_existing_item RECORD;
  v_items_added INTEGER := 0;
BEGIN
  -- Loop through restock recommendations
  FOR v_restock_record IN
    SELECT * FROM detect_restock_needs(p_user_id, p_kid_id)
  LOOP
    -- Check if item already exists in grocery list (unchecked)
    SELECT * INTO v_existing_item
    FROM grocery_items
    WHERE user_id = p_user_id
      AND LOWER(name) = LOWER(v_restock_record.food_name)
      AND checked = false;

    IF v_existing_item.id IS NOT NULL THEN
      -- Update existing item if recommended quantity is higher
      IF v_restock_record.recommended_quantity > v_existing_item.quantity THEN
        UPDATE grocery_items
        SET
          quantity = v_restock_record.recommended_quantity,
          restock_reason = v_restock_record.reason,
          priority = v_restock_record.priority,
          auto_generated = true,
          updated_at = NOW()
        WHERE id = v_existing_item.id;

        v_items_added := v_items_added + 1;
      END IF;
    ELSE
      -- Insert new grocery item
      INSERT INTO grocery_items (
        user_id,
        name,
        quantity,
        unit,
        category,
        aisle,
        checked,
        auto_generated,
        restock_reason,
        priority
      ) VALUES (
        p_user_id,
        v_restock_record.food_name,
        v_restock_record.recommended_quantity,
        'servings',
        v_restock_record.category,
        v_restock_record.aisle,
        false,
        true,
        v_restock_record.reason,
        v_restock_record.priority
      );

      v_items_added := v_items_added + 1;
    END IF;
  END LOOP;

  RETURN v_items_added;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SCHEDULED AUTO-RESTOCK (Called by cron or manually)
-- ============================================================================

-- Function to be called daily/weekly to auto-restock all users
CREATE OR REPLACE FUNCTION scheduled_auto_restock()
RETURNS TABLE (
  user_id UUID,
  items_added INTEGER
) AS $$
DECLARE
  v_user RECORD;
  v_count INTEGER;
BEGIN
  -- Loop through all users with recent activity
  FOR v_user IN
    SELECT DISTINCT u.id
    FROM auth.users u
    JOIN plan_entries pe ON pe.user_id = u.id
    WHERE pe.date >= CURRENT_DATE - INTERVAL '7 days'
  LOOP
    SELECT auto_add_restock_items(v_user.id) INTO v_count;

    RETURN QUERY SELECT v_user.id, v_count;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEW FOR GROCERY LIST WITH RESTOCK INFO
-- ============================================================================

CREATE OR REPLACE VIEW grocery_list_with_context AS
SELECT
  gi.*,
  f.quantity as current_pantry_quantity,
  CASE
    WHEN gi.priority = 'high' THEN 1
    WHEN gi.priority = 'medium' THEN 2
    ELSE 3
  END as sort_priority
FROM grocery_items gi
LEFT JOIN foods f ON f.name = gi.name AND f.user_id = gi.user_id
ORDER BY
  gi.checked ASC,
  sort_priority ASC,
  CASE WHEN gi.aisle IS NOT NULL THEN 0 ELSE 1 END,
  gi.aisle,
  gi.category;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN grocery_items.auto_generated IS 'True if item was auto-added by restock system';
COMMENT ON COLUMN grocery_items.restock_reason IS 'Why this item was recommended for restock';
COMMENT ON COLUMN grocery_items.priority IS 'Urgency level: high, medium, or low';

COMMENT ON FUNCTION detect_restock_needs IS 'Analyzes pantry, plan, and consumption to recommend restock items';
COMMENT ON FUNCTION auto_add_restock_items IS 'Automatically adds restock recommendations to grocery list';
COMMENT ON FUNCTION scheduled_auto_restock IS 'Cron job function to auto-restock all active users';

COMMENT ON VIEW grocery_list_with_context IS 'Grocery list with pantry context and smart sorting';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251010221000_smart_grocery_restock.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 36: 20251010230000_rate_limiting_system.sql
-- ============================================

-- ============================================================================
-- RATE LIMITING SYSTEM
-- ============================================================================
-- Prevents abuse and controls costs for AI endpoints and sensitive operations

-- Create rate limits table
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint, window_start)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint ON rate_limits(user_id, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup ON rate_limits(created_at);

-- Enable RLS
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own rate limits"
  ON rate_limits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can manage rate limits"
  ON rate_limits FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RATE LIMIT CHECK FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_endpoint TEXT,
  p_max_requests INTEGER,
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(
  allowed BOOLEAN,
  current_count INTEGER,
  limit_exceeded BOOLEAN,
  reset_at TIMESTAMPTZ
) AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  -- Calculate window start (truncated to the minute)
  v_window_start := DATE_TRUNC('minute', NOW()) - (p_window_minutes || ' minutes')::INTERVAL;

  -- Clean up old entries (older than 2 hours)
  DELETE FROM rate_limits
  WHERE created_at < NOW() - INTERVAL '2 hours';

  -- Get current count in the window
  SELECT COALESCE(SUM(request_count), 0)::INTEGER INTO v_count
  FROM rate_limits
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND window_start >= v_window_start;

  -- Check if limit exceeded
  IF v_count >= p_max_requests THEN
    RETURN QUERY SELECT
      FALSE::BOOLEAN,
      v_count,
      TRUE::BOOLEAN,
      (v_window_start + (p_window_minutes || ' minutes')::INTERVAL)::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Increment counter for current minute
  INSERT INTO rate_limits (user_id, endpoint, window_start, request_count)
  VALUES (p_user_id, p_endpoint, DATE_TRUNC('minute', NOW()), 1)
  ON CONFLICT (user_id, endpoint, window_start)
  DO UPDATE SET
    request_count = rate_limits.request_count + 1,
    updated_at = NOW();

  -- Return success
  RETURN QUERY SELECT
    TRUE::BOOLEAN,
    (v_count + 1),
    FALSE::BOOLEAN,
    (v_window_start + (p_window_minutes || ' minutes')::INTERVAL)::TIMESTAMPTZ;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RATE LIMIT CONFIGURATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limit_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT UNIQUE NOT NULL,
  free_tier_limit INTEGER NOT NULL DEFAULT 10,
  premium_tier_limit INTEGER NOT NULL DEFAULT 100,
  enterprise_tier_limit INTEGER NOT NULL DEFAULT 1000,
  window_minutes INTEGER NOT NULL DEFAULT 60,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE rate_limit_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read config
CREATE POLICY "Anyone can read rate limit config"
  ON rate_limit_config FOR SELECT
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage rate limit config"
  ON rate_limit_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Insert default rate limit configurations
INSERT INTO rate_limit_config (endpoint, free_tier_limit, premium_tier_limit, enterprise_tier_limit, window_minutes, description)
VALUES
  ('ai-meal-plan', 5, 50, 500, 60, 'AI meal plan generation'),
  ('suggest-recipe', 10, 100, 1000, 60, 'AI recipe suggestions'),
  ('suggest-recipes-from-pantry', 5, 50, 500, 60, 'AI pantry recipe suggestions'),
  ('suggest-foods', 10, 100, 1000, 60, 'AI food suggestions'),
  ('parse-recipe', 20, 200, 2000, 60, 'Recipe URL parsing'),
  ('identify-food-image', 10, 100, 1000, 60, 'Image food identification'),
  ('lookup-barcode', 50, 500, 5000, 60, 'Barcode lookups'),
  ('calculate-food-similarity', 20, 200, 2000, 60, 'Food chaining calculations')
ON CONFLICT (endpoint) DO NOTHING;

-- ============================================================================
-- SMART RATE LIMIT CHECK (with subscription tier awareness)
-- ============================================================================

CREATE OR REPLACE FUNCTION check_rate_limit_with_tier(
  p_user_id UUID,
  p_endpoint TEXT
)
RETURNS TABLE(
  allowed BOOLEAN,
  current_count INTEGER,
  max_requests INTEGER,
  reset_at TIMESTAMPTZ,
  tier TEXT
) AS $$
DECLARE
  v_config RECORD;
  v_subscription_tier TEXT;
  v_limit INTEGER;
  v_result RECORD;
BEGIN
  -- Get rate limit config
  SELECT * INTO v_config
  FROM rate_limit_config
  WHERE endpoint = p_endpoint
    AND is_active = true;

  IF NOT FOUND THEN
    -- Default fallback if endpoint not configured
    v_limit := 50;
    v_subscription_tier := 'free';
  ELSE
    -- Get user's subscription tier
    -- Note: Defaulting to 'free' tier until subscription columns are added to profiles table
    -- SELECT
    --   CASE
    --     WHEN subscription_tier = 'premium' THEN 'premium'
    --     WHEN subscription_tier = 'enterprise' THEN 'enterprise'
    --     ELSE 'free'
    --   END INTO v_subscription_tier
    -- FROM profiles
    -- WHERE id = p_user_id;
    
    -- Temporary: Default all users to free tier
    v_subscription_tier := 'free';

    -- Set limit based on tier
    v_limit := CASE v_subscription_tier
      WHEN 'enterprise' THEN v_config.enterprise_tier_limit
      WHEN 'premium' THEN v_config.premium_tier_limit
      ELSE v_config.free_tier_limit
    END;
  END IF;

  -- Check rate limit
  SELECT * INTO v_result
  FROM check_rate_limit(p_user_id, p_endpoint, v_limit, COALESCE(v_config.window_minutes, 60));

  -- Return results with tier info
  RETURN QUERY SELECT
    v_result.allowed,
    v_result.current_count,
    v_limit,
    v_result.reset_at,
    v_subscription_tier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RATE LIMIT ANALYTICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW rate_limit_analytics AS
SELECT
  rl.endpoint,
  DATE_TRUNC('hour', rl.window_start) as hour,
  COUNT(DISTINCT rl.user_id) as unique_users,
  SUM(rl.request_count) as total_requests,
  AVG(rl.request_count)::INTEGER as avg_requests_per_user,
  MAX(rl.request_count) as max_requests_by_user,
  COUNT(*) FILTER (WHERE rl.request_count >= (
    SELECT free_tier_limit FROM rate_limit_config WHERE endpoint = rl.endpoint
  )) as users_hitting_limit
FROM rate_limits rl
WHERE rl.window_start >= NOW() - INTERVAL '24 hours'
GROUP BY rl.endpoint, DATE_TRUNC('hour', rl.window_start)
ORDER BY hour DESC, total_requests DESC;

-- ============================================================================
-- CLEANUP JOB FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Delete entries older than 2 hours
  WITH deleted AS (
    DELETE FROM rate_limits
    WHERE created_at < NOW() - INTERVAL '2 hours'
    RETURNING *
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_rate_limits_updated_at
  BEFORE UPDATE ON rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rate_limit_config_updated_at
  BEFORE UPDATE ON rate_limit_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE rate_limits IS 'Tracks API request counts per user per endpoint for rate limiting';
COMMENT ON TABLE rate_limit_config IS 'Configuration for rate limits per endpoint and subscription tier';
COMMENT ON FUNCTION check_rate_limit IS 'Checks if user has exceeded rate limit for endpoint';
COMMENT ON FUNCTION check_rate_limit_with_tier IS 'Smart rate limit check that considers user subscription tier';
COMMENT ON FUNCTION cleanup_rate_limits IS 'Removes old rate limit entries (run hourly)';
COMMENT ON VIEW rate_limit_analytics IS 'Analytics view for monitoring rate limit usage';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251010230000_rate_limiting_system.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 37: 20251010231000_performance_indexes.sql
-- ============================================

-- ============================================================================
-- PERFORMANCE OPTIMIZATION INDEXES
-- ============================================================================
-- Strategic indexes to improve query performance across the platform

-- ============================================================================
-- ENABLE TRIGRAM EXTENSION (for fuzzy text search)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- PLAN ENTRIES INDEXES
-- ============================================================================

-- Most common query: Get plan entries for a kid within a date range
CREATE INDEX IF NOT EXISTS idx_plan_entries_kid_date_desc
  ON plan_entries(kid_id, date DESC)
  WHERE result IS NOT NULL;

-- Query: Get entries by user (for multi-kid households)
CREATE INDEX IF NOT EXISTS idx_plan_entries_user_date
  ON plan_entries(user_id, date DESC);

-- Query: Find entries by recipe
CREATE INDEX IF NOT EXISTS idx_plan_entries_recipe
  ON plan_entries(recipe_id)
  WHERE recipe_id IS NOT NULL;

-- Query: Find entries with detailed tracking
CREATE INDEX IF NOT EXISTS idx_plan_entries_with_attempts
  ON plan_entries(kid_id, food_attempt_id)
  WHERE food_attempt_id IS NOT NULL;

-- Composite index for analytics queries
CREATE INDEX IF NOT EXISTS idx_plan_entries_analytics
  ON plan_entries(kid_id, date, meal_slot, result);

-- ============================================================================
-- FOOD ATTEMPTS INDEXES
-- ============================================================================

-- Most common query: Get attempts for a kid
CREATE INDEX IF NOT EXISTS idx_food_attempts_kid_date_desc
  ON food_attempts(kid_id, attempted_at DESC);

-- Query: Find attempts by food
CREATE INDEX IF NOT EXISTS idx_food_attempts_food
  ON food_attempts(food_id);

-- Query: Success tracking
CREATE INDEX IF NOT EXISTS idx_food_attempts_outcome
  ON food_attempts(kid_id, outcome, attempted_at DESC)
  WHERE outcome IN ('success', 'partial');

-- Query: Find milestones
CREATE INDEX IF NOT EXISTS idx_food_attempts_milestones
  ON food_attempts(kid_id, attempted_at DESC)
  WHERE is_milestone = true;

-- Query: Food chaining analysis
CREATE INDEX IF NOT EXISTS idx_food_attempts_stage_progression
  ON food_attempts(kid_id, food_id, attempted_at DESC);

-- ============================================================================
-- FOODS INDEXES
-- ============================================================================

-- Most common query: Get user's safe foods by category
CREATE INDEX IF NOT EXISTS idx_foods_user_safe_category
  ON foods(user_id, category, name)
  WHERE is_safe = true;

-- Query: Try bites
CREATE INDEX IF NOT EXISTS idx_foods_try_bites
  ON foods(user_id, name)
  WHERE is_try_bite = true;

-- Query: Foods with inventory
CREATE INDEX IF NOT EXISTS idx_foods_inventory
  ON foods(user_id, quantity DESC NULLS LAST)
  WHERE quantity IS NOT NULL;

-- Full-text search on food names
CREATE INDEX IF NOT EXISTS idx_foods_name_trgm
  ON foods USING gin(name gin_trgm_ops);

-- ============================================================================
-- GROCERY ITEMS INDEXES
-- ============================================================================

-- Most common query: Get unchecked items for user
CREATE INDEX IF NOT EXISTS idx_grocery_unchecked
  ON grocery_items(user_id, created_at DESC)
  WHERE checked = false;

-- Query: Auto-generated restock items
CREATE INDEX IF NOT EXISTS idx_grocery_auto_generated
  ON grocery_items(user_id, priority, created_at DESC)
  WHERE auto_generated = true;

-- Query: Items by aisle (for shopping)
CREATE INDEX IF NOT EXISTS idx_grocery_aisle
  ON grocery_items(user_id, aisle, category)
  WHERE checked = false AND aisle IS NOT NULL;

-- ============================================================================
-- RECIPES INDEXES
-- ============================================================================

-- Query: User's recipes by category
CREATE INDEX IF NOT EXISTS idx_recipes_user_category
  ON recipes(user_id, category NULLS LAST, created_at DESC);

-- Query: Recipes containing specific food
CREATE INDEX IF NOT EXISTS idx_recipes_food_ids
  ON recipes USING gin(food_ids);

-- Full-text search on recipe names
CREATE INDEX IF NOT EXISTS idx_recipes_name_trgm
  ON recipes USING gin(name gin_trgm_ops);

-- ============================================================================
-- KIDS INDEXES
-- ============================================================================

-- Query: User's kids
CREATE INDEX IF NOT EXISTS idx_kids_user_created
  ON kids(user_id, created_at ASC);

-- ============================================================================
-- AI COACH INDEXES
-- ============================================================================

-- Query: User's conversations
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_date
  ON ai_coach_conversations(user_id, updated_at DESC)
  WHERE is_archived = false;

-- Query: Messages in conversation
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_date
  ON ai_coach_messages(conversation_id, created_at ASC);

-- ============================================================================
-- FOOD PROPERTIES INDEXES (for chaining)
-- ============================================================================

-- Query: Find similar foods by properties
CREATE INDEX IF NOT EXISTS idx_food_properties_texture
  ON food_properties(texture_primary, food_category);

CREATE INDEX IF NOT EXISTS idx_food_properties_category
  ON food_properties(food_category, flavor_intensity);

-- ============================================================================
-- FOOD CHAIN SUGGESTIONS INDEXES
-- ============================================================================

-- Query: Get suggestions for a food
CREATE INDEX IF NOT EXISTS idx_food_chain_source_score
  ON food_chain_suggestions(source_food_id, similarity_score DESC, recommended_order ASC);

-- ============================================================================
-- MEAL BUILDER INDEXES
-- ============================================================================

-- Query: Kid's meal creations
CREATE INDEX IF NOT EXISTS idx_meal_creations_kid_date
  ON kid_meal_creations(kid_id, created_at DESC);

-- Query: Most requested meals
CREATE INDEX IF NOT EXISTS idx_meal_creations_popular
  ON kid_meal_creations(kid_id, times_requested DESC, kid_approved)
  WHERE kid_approved = true;

-- ============================================================================
-- ACHIEVEMENTS INDEXES
-- ============================================================================

-- Query: Kid's recent achievements
CREATE INDEX IF NOT EXISTS idx_achievements_kid_date
  ON kid_achievements(kid_id, earned_at DESC);

-- ============================================================================
-- USER MANAGEMENT INDEXES
-- ============================================================================

-- Query: Find users by role
CREATE INDEX IF NOT EXISTS idx_user_roles_role
  ON user_roles(role, user_id);

-- Note: Subscription-related indexes commented out until subscription columns are added to profiles table
-- -- Query: Find user's subscription
-- CREATE INDEX IF NOT EXISTS idx_profiles_subscription
--   ON profiles(subscription_tier, subscription_status)
--   WHERE subscription_tier IS NOT NULL;

-- ============================================================================
-- PARTIAL INDEXES FOR COMMON FILTERS
-- ============================================================================

-- Note: Subscription index commented out until subscription columns are added to profiles table
-- -- Active subscriptions only
-- CREATE INDEX IF NOT EXISTS idx_profiles_active_subscription
--   ON profiles(id, subscription_tier)
--   WHERE subscription_status = 'active';

-- Recent plan entries (last 90 days)
CREATE INDEX IF NOT EXISTS idx_plan_entries_recent
  ON plan_entries(kid_id, date DESC, result);

-- Recent food attempts (last 90 days)
CREATE INDEX IF NOT EXISTS idx_food_attempts_recent
  ON food_attempts(kid_id, attempted_at DESC, outcome);

-- ============================================================================
-- ANALYZE TABLES
-- ============================================================================

-- Update table statistics for query planner
ANALYZE plan_entries;
ANALYZE food_attempts;
ANALYZE foods;
ANALYZE grocery_items;
ANALYZE recipes;
ANALYZE kids;
ANALYZE ai_coach_conversations;
ANALYZE ai_coach_messages;
ANALYZE food_properties;
ANALYZE food_chain_suggestions;
ANALYZE kid_meal_creations;
ANALYZE kid_achievements;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_plan_entries_kid_date_desc IS 'Optimizes queries for kid meal plans by date';
COMMENT ON INDEX idx_food_attempts_outcome IS 'Optimizes success rate analytics queries';
COMMENT ON INDEX idx_foods_user_safe_category IS 'Optimizes pantry browsing by category';
COMMENT ON INDEX idx_grocery_unchecked IS 'Optimizes grocery list display';
COMMENT ON INDEX idx_recipes_food_ids IS 'Optimizes recipe search by ingredients';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251010231000_performance_indexes.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 38: 20251010232000_automated_backups.sql
-- ============================================

-- ============================================================================
-- AUTOMATED BACKUP SYSTEM
-- ============================================================================
-- Daily automated backups with compression and retention management

-- ============================================================================
-- BACKUP LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  backup_type TEXT NOT NULL, -- 'daily', 'weekly', 'manual', 'export'
  status TEXT NOT NULL, -- 'pending', 'in_progress', 'completed', 'failed'
  file_path TEXT,
  file_size_bytes BIGINT,
  compressed_size_bytes BIGINT,
  compression_ratio DECIMAL(5,2),
  records_count JSONB, -- { "foods": 100, "recipes": 50, "plan_entries": 200, ... }
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  retention_days INTEGER DEFAULT 30,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_backup_logs_user_date ON backup_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_logs_status ON backup_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_logs_expires ON backup_logs(expires_at) WHERE status = 'completed';

-- Enable RLS
ALTER TABLE backup_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own backup logs"
  ON backup_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can manage backup logs"
  ON backup_logs FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- BACKUP CONFIGURATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS backup_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  frequency TEXT DEFAULT 'daily', -- 'daily', 'weekly', 'monthly'
  retention_days INTEGER DEFAULT 30,
  include_images BOOLEAN DEFAULT false, -- Whether to backup profile pictures
  auto_cleanup BOOLEAN DEFAULT true,
  last_backup_at TIMESTAMPTZ,
  next_backup_at TIMESTAMPTZ,
  email_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE backup_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own backup config"
  ON backup_config FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- BACKUP DATA EXTRACTION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION extract_user_backup_data(
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_backup JSONB;
  v_kids_data JSONB;
  v_foods_data JSONB;
  v_recipes_data JSONB;
  v_plan_entries_data JSONB;
  v_food_attempts_data JSONB;
  v_grocery_data JSONB;
  v_meal_creations_data JSONB;
  v_achievements_data JSONB;
  v_ai_conversations_data JSONB;
  v_profile_data JSONB;
BEGIN
  -- Extract profile
  SELECT jsonb_build_object(
    'id', p.id,
    'email', u.email,
    'full_name', p.full_name,
    'created_at', p.created_at
  ) INTO v_profile_data
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_user_id;

  -- Extract kids
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', k.id,
      'name', k.name,
      'age', k.age,
      'date_of_birth', k.date_of_birth,
      'allergens', k.allergens,
      'pickiness_level', k.pickiness_level,
      'favorite_foods', k.favorite_foods,
      'texture_preferences', k.texture_preferences,
      'texture_dislikes', k.texture_dislikes,
      'flavor_preferences', k.flavor_preferences,
      'dietary_restrictions', k.dietary_restrictions,
      'created_at', k.created_at
    )
  ) INTO v_kids_data
  FROM kids k
  WHERE k.user_id = p_user_id;

  -- Extract foods
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'name', f.name,
      'category', f.category,
      'is_safe', f.is_safe,
      'is_try_bite', f.is_try_bite,
      'allergens', f.allergens,
      'aisle', f.aisle,
      'quantity', f.quantity,
      'unit', f.unit,
      'created_at', f.created_at
    )
  ) INTO v_foods_data
  FROM foods f
  WHERE f.user_id = p_user_id;

  -- Extract recipes
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'description', r.description,
      'food_ids', r.food_ids,
      'category', r.category,
      'instructions', r.instructions,
      'prep_time', r.prep_time,
      'cook_time', r.cook_time,
      'servings', r.servings,
      'created_at', r.created_at
    )
  ) INTO v_recipes_data
  FROM recipes r
  WHERE r.user_id = p_user_id;

  -- Extract plan entries (last 90 days)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pe.id,
      'kid_id', pe.kid_id,
      'date', pe.date,
      'meal_slot', pe.meal_slot,
      'food_id', pe.food_id,
      'recipe_id', pe.recipe_id,
      'result', pe.result,
      'notes', pe.notes,
      'created_at', pe.created_at
    )
  ) INTO v_plan_entries_data
  FROM plan_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.date >= CURRENT_DATE - INTERVAL '90 days';

  -- Extract food attempts (last 90 days)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', fa.id,
      'kid_id', fa.kid_id,
      'food_id', fa.food_id,
      'attempted_at', fa.attempted_at,
      'stage', fa.stage,
      'outcome', fa.outcome,
      'bites_taken', fa.bites_taken,
      'amount_consumed', fa.amount_consumed,
      'mood_before', fa.mood_before,
      'mood_after', fa.mood_after,
      'parent_notes', fa.parent_notes,
      'is_milestone', fa.is_milestone
    )
  ) INTO v_food_attempts_data
  FROM food_attempts fa
  WHERE fa.user_id = p_user_id
    AND fa.attempted_at >= NOW() - INTERVAL '90 days';

  -- Extract grocery items
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', gi.id,
      'name', gi.name,
      'quantity', gi.quantity,
      'unit', gi.unit,
      'category', gi.category,
      'aisle', gi.aisle,
      'checked', gi.checked,
      'priority', gi.priority,
      'created_at', gi.created_at
    )
  ) INTO v_grocery_data
  FROM grocery_items gi
  WHERE gi.user_id = p_user_id
    AND gi.checked = false;

  -- Extract meal creations
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', kmc.id,
      'kid_id', kmc.kid_id,
      'name', kmc.name,
      'description', kmc.description,
      'food_ids', kmc.food_ids,
      'times_requested', kmc.times_requested,
      'kid_approved', kmc.kid_approved,
      'created_at', kmc.created_at
    )
  ) INTO v_meal_creations_data
  FROM kid_meal_creations kmc
  JOIN kids k ON k.id = kmc.kid_id
  WHERE k.user_id = p_user_id;

  -- Extract achievements
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ka.id,
      'kid_id', ka.kid_id,
      'achievement_type', ka.achievement_type,
      'title', ka.title,
      'description', ka.description,
      'earned_at', ka.earned_at
    )
  ) INTO v_achievements_data
  FROM kid_achievements ka
  JOIN kids k ON k.id = ka.kid_id
  WHERE k.user_id = p_user_id;

  -- Extract AI conversations (last 30 days, without full message history)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ac.id,
      'title', ac.title,
      'message_count', (
        SELECT COUNT(*) FROM ai_coach_messages acm WHERE acm.conversation_id = ac.id
      ),
      'created_at', ac.created_at,
      'updated_at', ac.updated_at
    )
  ) INTO v_ai_conversations_data
  FROM ai_coach_conversations ac
  WHERE ac.user_id = p_user_id
    AND ac.updated_at >= NOW() - INTERVAL '30 days';

  -- Build final backup structure
  v_backup := jsonb_build_object(
    'version', '1.0',
    'backup_date', NOW(),
    'profile', v_profile_data,
    'kids', COALESCE(v_kids_data, '[]'::jsonb),
    'foods', COALESCE(v_foods_data, '[]'::jsonb),
    'recipes', COALESCE(v_recipes_data, '[]'::jsonb),
    'plan_entries', COALESCE(v_plan_entries_data, '[]'::jsonb),
    'food_attempts', COALESCE(v_food_attempts_data, '[]'::jsonb),
    'grocery_items', COALESCE(v_grocery_data, '[]'::jsonb),
    'meal_creations', COALESCE(v_meal_creations_data, '[]'::jsonb),
    'achievements', COALESCE(v_achievements_data, '[]'::jsonb),
    'ai_conversations', COALESCE(v_ai_conversations_data, '[]'::jsonb),
    'record_counts', jsonb_build_object(
      'kids', COALESCE(jsonb_array_length(v_kids_data), 0),
      'foods', COALESCE(jsonb_array_length(v_foods_data), 0),
      'recipes', COALESCE(jsonb_array_length(v_recipes_data), 0),
      'plan_entries', COALESCE(jsonb_array_length(v_plan_entries_data), 0),
      'food_attempts', COALESCE(jsonb_array_length(v_food_attempts_data), 0),
      'grocery_items', COALESCE(jsonb_array_length(v_grocery_data), 0),
      'meal_creations', COALESCE(jsonb_array_length(v_meal_creations_data), 0),
      'achievements', COALESCE(jsonb_array_length(v_achievements_data), 0),
      'ai_conversations', COALESCE(jsonb_array_length(v_ai_conversations_data), 0)
    )
  );

  RETURN v_backup;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- BACKUP CLEANUP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_backups()
RETURNS TABLE(
  deleted_count INTEGER,
  freed_bytes BIGINT
) AS $$
DECLARE
  v_deleted_count INTEGER;
  v_freed_bytes BIGINT;
BEGIN
  -- Calculate space freed
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(file_size_bytes), 0)
  INTO v_deleted_count, v_freed_bytes
  FROM backup_logs
  WHERE expires_at < NOW()
    AND status = 'completed';

  -- Delete expired backups
  DELETE FROM backup_logs
  WHERE expires_at < NOW()
    AND status = 'completed';

  RETURN QUERY SELECT v_deleted_count, v_freed_bytes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SCHEDULE NEXT BACKUP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION schedule_next_backup()
RETURNS INTEGER AS $$
DECLARE
  v_scheduled_count INTEGER := 0;
  v_user RECORD;
BEGIN
  -- For each user with backups enabled
  FOR v_user IN
    SELECT user_id, frequency, retention_days
    FROM backup_config
    WHERE enabled = true
      AND (next_backup_at IS NULL OR next_backup_at <= NOW())
  LOOP
    -- Create backup log entry
    INSERT INTO backup_logs (
      user_id,
      backup_type,
      status,
      retention_days,
      expires_at
    ) VALUES (
      v_user.user_id,
      v_user.frequency,
      'pending',
      v_user.retention_days,
      NOW() + (v_user.retention_days || ' days')::INTERVAL
    );

    -- Update next backup time
    UPDATE backup_config
    SET
      next_backup_at = CASE v_user.frequency
        WHEN 'daily' THEN NOW() + INTERVAL '1 day'
        WHEN 'weekly' THEN NOW() + INTERVAL '7 days'
        WHEN 'monthly' THEN NOW() + INTERVAL '30 days'
        ELSE NOW() + INTERVAL '1 day'
      END,
      updated_at = NOW()
    WHERE user_id = v_user.user_id;

    v_scheduled_count := v_scheduled_count + 1;
  END LOOP;

  RETURN v_scheduled_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- BACKUP STATISTICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW backup_statistics AS
SELECT
  bl.user_id,
  COUNT(*) as total_backups,
  COUNT(*) FILTER (WHERE bl.status = 'completed') as successful_backups,
  COUNT(*) FILTER (WHERE bl.status = 'failed') as failed_backups,
  MAX(bl.completed_at) as last_successful_backup,
  SUM(bl.file_size_bytes) FILTER (WHERE bl.status = 'completed') as total_size_bytes,
  AVG(bl.compression_ratio) FILTER (WHERE bl.status = 'completed') as avg_compression_ratio,
  AVG(EXTRACT(EPOCH FROM (bl.completed_at - bl.started_at))) FILTER (WHERE bl.status = 'completed') as avg_duration_seconds
FROM backup_logs bl
JOIN profiles p ON p.id = bl.user_id
GROUP BY bl.user_id;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_backup_logs_updated_at
  BEFORE UPDATE ON backup_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_backup_config_updated_at
  BEFORE UPDATE ON backup_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIALIZE DEFAULT BACKUP CONFIGS FOR EXISTING USERS
-- ============================================================================

INSERT INTO backup_config (user_id, next_backup_at)
SELECT id, NOW() + INTERVAL '1 day'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE backup_logs IS 'Tracks backup operations for users';
COMMENT ON TABLE backup_config IS 'User backup preferences and scheduling';
COMMENT ON FUNCTION extract_user_backup_data IS 'Extracts all user data in JSON format for backup';
COMMENT ON FUNCTION cleanup_expired_backups IS 'Removes expired backup records';
COMMENT ON FUNCTION schedule_next_backup IS 'Creates pending backup jobs for users';
COMMENT ON VIEW backup_statistics IS 'Aggregated backup statistics per user';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251010232000_automated_backups.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 39: 20251010233000_email_automation.sql
-- ============================================

-- ============================================================================
-- EMAIL AUTOMATION SYSTEM
-- ============================================================================
-- Automated email campaigns, transactional emails, and notifications
-- Note: Using "automation_" prefix to avoid conflicts with existing email marketing tables

-- ============================================================================
-- EMAIL TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT UNIQUE NOT NULL,
  template_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  category TEXT NOT NULL, -- 'transactional', 'marketing', 'notification'
  variables JSONB, -- List of available template variables
  is_active BOOLEAN DEFAULT true,
  send_delay_minutes INTEGER DEFAULT 0, -- Delay before sending (for drip campaigns)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_automation_email_templates_key ON automation_email_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_automation_email_templates_category ON automation_email_templates(category, is_active);

-- Enable RLS
ALTER TABLE automation_email_templates ENABLE ROW LEVEL SECURITY;

-- Anyone can read active templates
CREATE POLICY "Anyone can read active templates"
  ON automation_email_templates FOR SELECT
  USING (is_active = true);

-- Only admins can manage templates
CREATE POLICY "Admins can manage templates"
  ON automation_email_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- ============================================================================
-- EMAIL QUEUE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL REFERENCES automation_email_templates(template_key),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  template_variables JSONB,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'cancelled'
  priority INTEGER DEFAULT 5, -- 1-10, higher = more important
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_automation_email_queue_user ON automation_email_queue(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_email_queue_status ON automation_email_queue(status, scheduled_for, priority DESC);
CREATE INDEX IF NOT EXISTS idx_automation_email_queue_pending ON automation_email_queue(scheduled_for, priority DESC) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE automation_email_queue ENABLE ROW LEVEL SECURITY;

-- Users can view their own emails
CREATE POLICY "Users can view their own email queue"
  ON automation_email_queue FOR SELECT
  USING (auth.uid() = user_id);

-- System can manage emails
CREATE POLICY "System can manage email queue"
  ON automation_email_queue FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- EMAIL SUBSCRIPTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_email_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  welcome_emails BOOLEAN DEFAULT true,
  milestone_emails BOOLEAN DEFAULT true,
  weekly_summary BOOLEAN DEFAULT true,
  tips_and_advice BOOLEAN DEFAULT true,
  marketing_emails BOOLEAN DEFAULT false,
  unsubscribe_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_automation_email_subscriptions_user ON automation_email_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_email_subscriptions_token ON automation_email_subscriptions(unsubscribe_token);

-- Enable RLS
ALTER TABLE automation_email_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can manage their own subscriptions
CREATE POLICY "Users can manage their own email subscriptions"
  ON automation_email_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- EMAIL EVENTS TABLE (for tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES automation_email_queue(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_automation_email_events_email ON automation_email_events(email_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_email_events_type ON automation_email_events(event_type, created_at DESC);

-- Enable RLS
ALTER TABLE automation_email_events ENABLE ROW LEVEL SECURITY;

-- System manages events
CREATE POLICY "System can manage email events"
  ON automation_email_events FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- QUEUE EMAIL FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION queue_email(
  p_user_id UUID,
  p_template_key TEXT,
  p_to_email TEXT,
  p_template_variables JSONB DEFAULT '{}'::jsonb,
  p_priority INTEGER DEFAULT 5,
  p_delay_minutes INTEGER DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
  v_template RECORD;
  v_subject TEXT;
  v_html_body TEXT;
  v_text_body TEXT;
  v_email_id UUID;
  v_key TEXT;
  v_value TEXT;
BEGIN
  -- Get template
  SELECT * INTO v_template
  FROM automation_email_templates
  WHERE template_key = p_template_key
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email template not found: %', p_template_key;
  END IF;

  -- Replace variables in subject
  v_subject := v_template.subject;
  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_template_variables)
  LOOP
    v_subject := REPLACE(v_subject, '{{' || v_key || '}}', v_value);
  END LOOP;

  -- Replace variables in HTML body
  v_html_body := v_template.html_body;
  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_template_variables)
  LOOP
    v_html_body := REPLACE(v_html_body, '{{' || v_key || '}}', v_value);
  END LOOP;

  -- Replace variables in text body
  v_text_body := v_template.text_body;
  IF v_text_body IS NOT NULL THEN
    FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_template_variables)
    LOOP
      v_text_body := REPLACE(v_text_body, '{{' || v_key || '}}', v_value);
    END LOOP;
  END IF;

  -- Insert into queue
  INSERT INTO automation_email_queue (
    user_id,
    template_key,
    to_email,
    subject,
    html_body,
    text_body,
    template_variables,
    priority,
    scheduled_for
  ) VALUES (
    p_user_id,
    p_template_key,
    p_to_email,
    v_subject,
    v_html_body,
    v_text_body,
    p_template_variables,
    p_priority,
    NOW() + (COALESCE(p_delay_minutes, v_template.send_delay_minutes, 0) || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_email_id;

  RETURN v_email_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- CHECK EMAIL SUBSCRIPTION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION check_email_subscription(
  p_user_id UUID,
  p_email_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_subscribed BOOLEAN;
BEGIN
  SELECT CASE p_email_type
    WHEN 'welcome' THEN welcome_emails
    WHEN 'milestone' THEN milestone_emails
    WHEN 'weekly_summary' THEN weekly_summary
    WHEN 'tips' THEN tips_and_advice
    WHEN 'marketing' THEN marketing_emails
    ELSE false
  END INTO v_subscribed
  FROM automation_email_subscriptions
  WHERE user_id = p_user_id;

  RETURN COALESCE(v_subscribed, true); -- Default to true if no preferences set
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGER: SEND WELCOME EMAIL ON SIGNUP
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_welcome_email()
RETURNS TRIGGER AS $$
DECLARE
  v_user_email TEXT;
BEGIN
  -- Get user email
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = NEW.id;

  -- Initialize email subscriptions
  INSERT INTO automation_email_subscriptions (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Queue welcome email
  IF check_email_subscription(NEW.id, 'welcome') THEN
    PERFORM queue_email(
      NEW.id,
      'welcome',
      v_user_email,
      jsonb_build_object(
        'user_name', COALESCE(NEW.full_name, 'there'),
        'app_url', 'https://eatpal.com'
      ),
      10 -- High priority
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_profile_created_send_welcome
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_welcome_email();

-- ============================================================================
-- TRIGGER: SEND MILESTONE EMAILS
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_milestone_email()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_kid_name TEXT;
BEGIN
  -- Get user info
  SELECT k.user_id, k.name INTO v_user_id, v_kid_name
  FROM kids k
  WHERE k.id = NEW.kid_id;

  SELECT u.email INTO v_user_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  -- Queue milestone email
  IF check_email_subscription(v_user_id, 'milestone') THEN
    PERFORM queue_email(
      v_user_id,
      'milestone_achieved',
      v_user_email,
      jsonb_build_object(
        'kid_name', v_kid_name,
        'achievement_title', NEW.title,
        'achievement_description', NEW.description,
        'app_url', 'https://eatpal.com'
      ),
      8 -- High priority
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_achievement_earned_send_email
  AFTER INSERT ON kid_achievements
  FOR EACH ROW
  EXECUTE FUNCTION trigger_milestone_email();

-- ============================================================================
-- WEEKLY SUMMARY SCHEDULING
-- ============================================================================

CREATE OR REPLACE FUNCTION schedule_weekly_summaries()
RETURNS INTEGER AS $$
DECLARE
  v_user RECORD;
  v_user_email TEXT;
  v_scheduled_count INTEGER := 0;
BEGIN
  -- For each user subscribed to weekly summaries
  FOR v_user IN
    SELECT es.user_id
    FROM automation_email_subscriptions es
    WHERE es.weekly_summary = true
      AND es.unsubscribed_at IS NULL
  LOOP
    -- Get user email
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = v_user.user_id;

    -- Check if already queued for this week
    IF NOT EXISTS (
      SELECT 1 FROM automation_email_queue
      WHERE user_id = v_user.user_id
        AND template_key = 'weekly_summary'
        AND scheduled_for >= DATE_TRUNC('week', NOW())
        AND status = 'pending'
    ) THEN
      -- Queue weekly summary
      PERFORM queue_email(
        v_user.user_id,
        'weekly_summary',
        v_user_email,
        jsonb_build_object('app_url', 'https://eatpal.com'),
        5 -- Normal priority
      );

      v_scheduled_count := v_scheduled_count + 1;
    END IF;
  END LOOP;

  RETURN v_scheduled_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- EMAIL STATISTICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW automation_email_statistics AS
SELECT
  eq.template_key,
  et.template_name,
  et.category,
  COUNT(*) as total_sent,
  COUNT(*) FILTER (WHERE eq.status = 'sent') as successful,
  COUNT(*) FILTER (WHERE eq.status = 'failed') as failed,
  COUNT(*) FILTER (WHERE eq.status = 'pending') as pending,
  COUNT(DISTINCT ee.email_id) FILTER (WHERE ee.event_type = 'opened') as opened_count,
  COUNT(DISTINCT ee.email_id) FILTER (WHERE ee.event_type = 'clicked') as clicked_count,
  ROUND(
    COUNT(DISTINCT ee.email_id) FILTER (WHERE ee.event_type = 'opened')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE eq.status = 'sent'), 0) * 100,
    2
  ) as open_rate,
  ROUND(
    COUNT(DISTINCT ee.email_id) FILTER (WHERE ee.event_type = 'clicked')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE eq.status = 'sent'), 0) * 100,
    2
  ) as click_rate
FROM automation_email_queue eq
JOIN automation_email_templates et ON et.template_key = eq.template_key
LEFT JOIN automation_email_events ee ON ee.email_id = eq.id
GROUP BY eq.template_key, et.template_name, et.category;

-- ============================================================================
-- DEFAULT EMAIL TEMPLATES
-- ============================================================================

INSERT INTO automation_email_templates (template_key, template_name, subject, html_body, text_body, category, variables) VALUES

-- Welcome Email
('welcome', 'Welcome Email', 'Welcome to EatPal! ðŸŽ‰',
'<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
  <h1 style="color: white; margin: 0;">Welcome to EatPal!</h1>
</div>
<div style="padding: 40px 20px;">
  <p>Hi {{user_name}},</p>
  <p>We''re thrilled to have you join our community of parents helping their kids explore new foods!</p>

  <h3>Getting Started:</h3>
  <ul>
    <li><strong>Add Your Child:</strong> Create a profile with their food preferences and goals</li>
    <li><strong>Build Your Pantry:</strong> Add safe foods and try-bites</li>
    <li><strong>Create Meal Plans:</strong> Use our AI-powered planner for balanced meals</li>
    <li><strong>Track Progress:</strong> Log food attempts and celebrate milestones</li>
  </ul>

  <div style="text-align: center; margin: 30px 0;">
    <a href="{{app_url}}" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Get Started</a>
  </div>

  <p>Need help? Reply to this email anytime!</p>
  <p>Happy feeding,<br>The EatPal Team</p>
</div>
</body></html>',
'Welcome to EatPal!

Hi {{user_name}},

We''re thrilled to have you join our community of parents helping their kids explore new foods!

Getting Started:
- Add Your Child: Create a profile with their food preferences
- Build Your Pantry: Add safe foods and try-bites
- Create Meal Plans: Use our AI-powered planner
- Track Progress: Log food attempts and celebrate milestones

Visit {{app_url}} to get started!

Happy feeding,
The EatPal Team',
'transactional',
'["user_name", "app_url"]'::jsonb),

-- Milestone Achievement
('milestone_achieved', 'Milestone Achievement', 'ðŸŽ‰ {{kid_name}} earned a new achievement!',
'<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<div style="background: #10b981; padding: 40px 20px; text-align: center;">
  <h1 style="color: white; margin: 0;">ðŸŽ‰ New Achievement Unlocked!</h1>
</div>
<div style="padding: 40px 20px;">
  <h2 style="color: #10b981;">{{achievement_title}}</h2>
  <p style="font-size: 18px;">{{achievement_description}}</p>

  <p>Way to go! Every small step is a big victory in your feeding journey.</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="{{app_url}}/analytics" style="background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View All Achievements</a>
  </div>

  <p>Keep up the amazing work!</p>
  <p>The EatPal Team</p>
</div>
</body></html>',
'ðŸŽ‰ {{kid_name}} earned a new achievement!

{{achievement_title}}
{{achievement_description}}

Way to go! Every small step is a big victory.

View all achievements: {{app_url}}/analytics

Keep up the amazing work!
The EatPal Team',
'notification',
'["kid_name", "achievement_title", "achievement_description", "app_url"]'::jsonb),

-- Weekly Summary
('weekly_summary', 'Weekly Summary', 'Your Weekly EatPal Summary',
'<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<div style="background: #667eea; padding: 40px 20px; text-align: center;">
  <h1 style="color: white; margin: 0;">Your Week at a Glance</h1>
</div>
<div style="padding: 40px 20px;">
  <p>This week''s highlights will be populated with your child''s progress data.</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="{{app_url}}/analytics" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Detailed Analytics</a>
  </div>

  <p>The EatPal Team</p>
</div>
</body></html>',
'Your Weekly EatPal Summary

View your detailed analytics: {{app_url}}/analytics

The EatPal Team',
'notification',
'["app_url"]'::jsonb)

ON CONFLICT (template_key) DO NOTHING;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_automation_email_templates_updated_at
  BEFORE UPDATE ON automation_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_automation_email_queue_updated_at
  BEFORE UPDATE ON automation_email_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_automation_email_subscriptions_updated_at
  BEFORE UPDATE ON automation_email_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE automation_email_templates IS 'Email templates with variable substitution';
COMMENT ON TABLE automation_email_queue IS 'Queue for outgoing emails with retry logic';
COMMENT ON TABLE automation_email_subscriptions IS 'User email preferences and unsubscribe tokens';
COMMENT ON TABLE automation_email_events IS 'Email delivery and engagement tracking';
COMMENT ON FUNCTION queue_email IS 'Queue an email with template variable substitution';
COMMENT ON FUNCTION check_email_subscription IS 'Check if user is subscribed to email type';
COMMENT ON FUNCTION schedule_weekly_summaries IS 'Schedule weekly summary emails for subscribed users';
COMMENT ON VIEW automation_email_statistics IS 'Email campaign performance metrics';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251010233000_email_automation.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 40: 20251010234000_admin_analytics.sql
-- ============================================

-- ============================================================================
-- ADMIN ANALYTICS & MONITORING SYSTEM
-- ============================================================================
-- Comprehensive analytics views and metrics for platform monitoring

-- ============================================================================
-- PLATFORM HEALTH METRICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW admin_platform_health AS
SELECT
  -- User metrics
  (SELECT COUNT(*) FROM profiles) as total_users,
  (SELECT COUNT(*) FROM profiles WHERE created_at >= NOW() - INTERVAL '7 days') as new_users_7d,
  (SELECT COUNT(*) FROM profiles WHERE created_at >= NOW() - INTERVAL '30 days') as new_users_30d,

  -- Activity metrics
  (SELECT COUNT(DISTINCT user_id) FROM plan_entries WHERE date >= CURRENT_DATE - 7) as active_users_7d,
  (SELECT COUNT(DISTINCT user_id) FROM plan_entries WHERE date >= CURRENT_DATE - 30) as active_users_30d,

  -- Content metrics
  (SELECT COUNT(*) FROM kids) as total_kids,
  (SELECT COUNT(*) FROM foods) as total_foods,
  (SELECT COUNT(*) FROM recipes) as total_recipes,
  (SELECT COUNT(*) FROM plan_entries) as total_plan_entries,
  (SELECT COUNT(*) FROM food_attempts) as total_food_attempts,

  -- Success metrics
  (SELECT COUNT(*) FROM food_attempts WHERE outcome IN ('success', 'partial') AND attempted_at >= NOW() - INTERVAL '7 days') as successful_attempts_7d,
  (SELECT COUNT(*) FROM kid_achievements WHERE earned_at >= NOW() - INTERVAL '7 days') as achievements_7d,

  -- System health
  (SELECT COUNT(*) FROM rate_limits WHERE window_start >= NOW() - INTERVAL '1 hour') as rate_limit_hits_1h,
  (SELECT COUNT(*) FROM backup_logs WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours') as failed_backups_24h,
  (SELECT COUNT(*) FROM automation_email_queue WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours') as failed_emails_24h,

  NOW() as snapshot_at;

-- ============================================================================
-- USER ENGAGEMENT METRICS
-- ============================================================================

CREATE OR REPLACE VIEW admin_user_engagement AS
SELECT
  p.id as user_id,
  p.full_name,
  p.created_at as joined_at,

  -- Kids & content
  (SELECT COUNT(*) FROM kids WHERE user_id = p.id) as kids_count,
  (SELECT COUNT(*) FROM foods WHERE user_id = p.id) as foods_count,
  (SELECT COUNT(*) FROM recipes WHERE user_id = p.id) as recipes_count,

  -- Activity metrics
  (SELECT COUNT(*) FROM plan_entries WHERE user_id = p.id) as total_plan_entries,
  (SELECT COUNT(*) FROM food_attempts fa JOIN kids k ON k.id = fa.kid_id WHERE k.user_id = p.id) as total_food_attempts,
  (SELECT MAX(date) FROM plan_entries WHERE user_id = p.id) as last_plan_date,
  (SELECT MAX(attempted_at) FROM food_attempts fa JOIN kids k ON k.id = fa.kid_id WHERE k.user_id = p.id) as last_attempt_date,

  -- Engagement score (0-100)
  LEAST(100, GREATEST(0,
    COALESCE((SELECT COUNT(*) FROM plan_entries WHERE user_id = p.id AND date >= CURRENT_DATE - 7), 0) * 5 +
    COALESCE((SELECT COUNT(*) FROM food_attempts fa JOIN kids k ON k.id = fa.kid_id WHERE k.user_id = p.id AND fa.attempted_at >= NOW() - INTERVAL '7 days'), 0) * 3 +
    COALESCE((SELECT COUNT(*) FROM recipes WHERE user_id = p.id), 0) * 2
  )) as engagement_score,

  -- User tier
  CASE
    WHEN (SELECT COUNT(*) FROM plan_entries WHERE user_id = p.id AND date >= CURRENT_DATE - 7) >= 7 THEN 'power_user'
    WHEN (SELECT COUNT(*) FROM plan_entries WHERE user_id = p.id AND date >= CURRENT_DATE - 30) >= 7 THEN 'active'
    WHEN (SELECT COUNT(*) FROM plan_entries WHERE user_id = p.id) >= 1 THEN 'casual'
    ELSE 'inactive'
  END as user_tier

FROM profiles p
ORDER BY engagement_score DESC;

-- ============================================================================
-- DAILY ACTIVITY METRICS
-- ============================================================================

CREATE OR REPLACE VIEW admin_daily_activity AS
SELECT
  date_series.date,

  -- User activity
  COUNT(DISTINCT pe.user_id) as active_users,
  COUNT(pe.id) as plan_entries_created,
  COUNT(pe.id) FILTER (WHERE pe.result IS NOT NULL) as meals_logged,

  -- Food attempts
  COUNT(DISTINCT fa.id) as food_attempts_created,
  COUNT(fa.id) FILTER (WHERE fa.outcome IN ('success', 'partial')) as successful_attempts,

  -- New content
  COUNT(DISTINCT f.id) as foods_added,
  COUNT(DISTINCT r.id) as recipes_created,

  -- Achievements
  COUNT(DISTINCT ka.id) as achievements_earned

FROM generate_series(
  CURRENT_DATE - INTERVAL '30 days',
  CURRENT_DATE,
  '1 day'::interval
) AS date_series(date)

LEFT JOIN plan_entries pe ON pe.date = date_series.date::date
LEFT JOIN food_attempts fa ON fa.attempted_at::date = date_series.date::date
LEFT JOIN foods f ON f.created_at::date = date_series.date::date
LEFT JOIN recipes r ON r.created_at::date = date_series.date::date
LEFT JOIN kid_achievements ka ON ka.earned_at::date = date_series.date::date

GROUP BY date_series.date
ORDER BY date_series.date DESC;

-- ============================================================================
-- AI USAGE METRICS
-- ============================================================================

CREATE OR REPLACE VIEW admin_ai_usage AS
SELECT
  rl.endpoint,
  rlc.description,
  COUNT(*) as total_requests,
  COUNT(DISTINCT rl.user_id) as unique_users,
  COUNT(*) FILTER (WHERE rl.window_start >= NOW() - INTERVAL '24 hours') as requests_24h,
  COUNT(*) FILTER (WHERE rl.window_start >= NOW() - INTERVAL '7 days') as requests_7d,
  MAX(rl.window_start) as last_request_at,

  -- Average requests per user
  ROUND(COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT rl.user_id), 0), 2) as avg_requests_per_user,

  -- Peak usage
  MAX(rl.request_count) as peak_requests_per_minute

FROM rate_limits rl
LEFT JOIN rate_limit_config rlc ON rlc.endpoint = rl.endpoint
WHERE rl.window_start >= NOW() - INTERVAL '30 days'
GROUP BY rl.endpoint, rlc.description
ORDER BY total_requests DESC;

-- ============================================================================
-- CONTENT QUALITY METRICS
-- ============================================================================

CREATE OR REPLACE VIEW admin_content_quality AS
SELECT
  'foods' as content_type,
  COUNT(*) as total_items,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as added_7d,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as added_30d,
  ROUND(AVG(CHAR_LENGTH(name))) as avg_name_length,
  COUNT(*) FILTER (WHERE allergens IS NOT NULL AND array_length(allergens, 1) > 0) as items_with_allergens,
  COUNT(*) FILTER (WHERE quantity IS NOT NULL) as items_with_quantity
FROM foods

UNION ALL

SELECT
  'recipes' as content_type,
  COUNT(*) as total_items,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as added_7d,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as added_30d,
  ROUND(AVG(CHAR_LENGTH(name))) as avg_name_length,
  COUNT(*) FILTER (WHERE description IS NOT NULL) as items_with_allergens,
  COUNT(*) FILTER (WHERE array_length(food_ids, 1) > 3) as items_with_quantity
FROM recipes

UNION ALL

SELECT
  'kids' as content_type,
  COUNT(*) as total_items,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as added_7d,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as added_30d,
  ROUND(AVG(CHAR_LENGTH(name))) as avg_name_length,
  COUNT(*) FILTER (WHERE allergens IS NOT NULL AND array_length(allergens, 1) > 0) as items_with_allergens,
  COUNT(*) FILTER (WHERE profile_completed = true) as items_with_quantity
FROM kids;

-- ============================================================================
-- ERROR TRACKING VIEW
-- ============================================================================

CREATE OR REPLACE VIEW admin_error_tracking AS
SELECT
  'backup_failures' as error_type,
  COUNT(*) as error_count,
  MAX(created_at) as last_occurrence,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'user_id', user_id,
      'error', error_message,
      'timestamp', created_at
    ) ORDER BY created_at DESC
  ) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as recent_errors
FROM backup_logs
WHERE status = 'failed'
  AND created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'email_failures' as error_type,
  COUNT(*) as error_count,
  MAX(created_at) as last_occurrence,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'user_id', user_id,
      'template', template_key,
      'error', error_message,
      'timestamp', created_at
    ) ORDER BY created_at DESC
  ) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as recent_errors
FROM automation_email_queue
WHERE status = 'failed'
  AND created_at >= NOW() - INTERVAL '7 days';

-- ============================================================================
-- USER RETENTION COHORT ANALYSIS
-- ============================================================================

CREATE OR REPLACE VIEW admin_user_retention AS
WITH cohorts AS (
  SELECT
    DATE_TRUNC('month', created_at) as cohort_month,
    id as user_id
  FROM profiles
  WHERE created_at >= NOW() - INTERVAL '6 months'
),
user_activity AS (
  SELECT
    user_id,
    DATE_TRUNC('month', date) as activity_month
  FROM plan_entries
  WHERE date >= CURRENT_DATE - INTERVAL '6 months'
  GROUP BY user_id, DATE_TRUNC('month', date)
)
SELECT
  c.cohort_month,
  COUNT(DISTINCT c.user_id) as cohort_size,
  COUNT(DISTINCT ua0.user_id) as month_0,
  COUNT(DISTINCT ua1.user_id) as month_1,
  COUNT(DISTINCT ua2.user_id) as month_2,
  COUNT(DISTINCT ua3.user_id) as month_3,

  -- Retention percentages
  ROUND(COUNT(DISTINCT ua1.user_id)::NUMERIC / NULLIF(COUNT(DISTINCT c.user_id), 0) * 100, 1) as retention_month_1_pct,
  ROUND(COUNT(DISTINCT ua2.user_id)::NUMERIC / NULLIF(COUNT(DISTINCT c.user_id), 0) * 100, 1) as retention_month_2_pct,
  ROUND(COUNT(DISTINCT ua3.user_id)::NUMERIC / NULLIF(COUNT(DISTINCT c.user_id), 0) * 100, 1) as retention_month_3_pct

FROM cohorts c
LEFT JOIN user_activity ua0 ON ua0.user_id = c.user_id AND ua0.activity_month = c.cohort_month
LEFT JOIN user_activity ua1 ON ua1.user_id = c.user_id AND ua1.activity_month = c.cohort_month + INTERVAL '1 month'
LEFT JOIN user_activity ua2 ON ua2.user_id = c.user_id AND ua2.activity_month = c.cohort_month + INTERVAL '2 months'
LEFT JOIN user_activity ua3 ON ua3.user_id = c.user_id AND ua3.activity_month = c.cohort_month + INTERVAL '3 months'
GROUP BY c.cohort_month
ORDER BY c.cohort_month DESC;

-- ============================================================================
-- FEATURE ADOPTION METRICS
-- ============================================================================

CREATE OR REPLACE VIEW admin_feature_adoption AS
WITH user_totals AS (
  SELECT COUNT(*) as total_users FROM profiles
)
SELECT
  'Meal Planning' as feature,
  COUNT(DISTINCT pe.user_id) as users_using,
  ROUND(COUNT(DISTINCT pe.user_id)::NUMERIC / ut.total_users * 100, 1) as adoption_rate_pct,
  COUNT(pe.id) as total_usage_count,
  MAX(pe.date) as last_used
FROM plan_entries pe
CROSS JOIN user_totals ut
GROUP BY ut.total_users

UNION ALL

SELECT
  'Food Tracking' as feature,
  COUNT(DISTINCT k.user_id) as users_using,
  ROUND(COUNT(DISTINCT k.user_id)::NUMERIC / ut.total_users * 100, 1) as adoption_rate_pct,
  COUNT(fa.id) as total_usage_count,
  MAX(fa.attempted_at) as last_used
FROM food_attempts fa
JOIN kids k ON k.id = fa.kid_id
CROSS JOIN user_totals ut
GROUP BY ut.total_users

UNION ALL

SELECT
  'Recipes' as feature,
  COUNT(DISTINCT r.user_id) as users_using,
  ROUND(COUNT(DISTINCT r.user_id)::NUMERIC / ut.total_users * 100, 1) as adoption_rate_pct,
  COUNT(r.id) as total_usage_count,
  MAX(r.created_at) as last_used
FROM recipes r
CROSS JOIN user_totals ut
GROUP BY ut.total_users

UNION ALL

SELECT
  'AI Coach' as feature,
  COUNT(DISTINCT ac.user_id) as users_using,
  ROUND(COUNT(DISTINCT ac.user_id)::NUMERIC / ut.total_users * 100, 1) as adoption_rate_pct,
  COUNT(ac.id) as total_usage_count,
  MAX(ac.updated_at) as last_used
FROM ai_coach_conversations ac
CROSS JOIN user_totals ut
GROUP BY ut.total_users

UNION ALL

SELECT
  'Meal Builder' as feature,
  COUNT(DISTINCT k.user_id) as users_using,
  ROUND(COUNT(DISTINCT k.user_id)::NUMERIC / ut.total_users * 100, 1) as adoption_rate_pct,
  COUNT(kmc.id) as total_usage_count,
  MAX(kmc.created_at) as last_used
FROM kid_meal_creations kmc
JOIN kids k ON k.id = kmc.kid_id
CROSS JOIN user_totals ut
GROUP BY ut.total_users;

-- ============================================================================
-- ADMIN NOTIFICATION TRIGGERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL, -- 'alert', 'warning', 'info'
  severity TEXT NOT NULL, -- 'critical', 'high', 'medium', 'low'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON admin_notifications(is_read, created_at DESC) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_admin_notifications_severity ON admin_notifications(severity, created_at DESC);

-- Enable RLS
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Only admins can access
CREATE POLICY "Admins can view notifications"
  ON admin_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage notifications"
  ON admin_notifications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- ============================================================================
-- FUNCTION: CREATE ADMIN NOTIFICATION
-- ============================================================================

CREATE OR REPLACE FUNCTION create_admin_notification(
  p_type TEXT,
  p_severity TEXT,
  p_title TEXT,
  p_message TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO admin_notifications (
    notification_type,
    severity,
    title,
    message,
    metadata
  ) VALUES (
    p_type,
    p_severity,
    p_title,
    p_message,
    p_metadata
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- MONITORING TRIGGERS
-- ============================================================================

-- Alert when backups fail
CREATE OR REPLACE FUNCTION check_backup_failures()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'failed' THEN
    PERFORM create_admin_notification(
      'alert',
      'high',
      'Backup Failed',
      'User backup failed: ' || COALESCE(NEW.error_message, 'Unknown error'),
      jsonb_build_object('backup_id', NEW.id, 'user_id', NEW.user_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_backup_failure
  AFTER UPDATE ON backup_logs
  FOR EACH ROW
  WHEN (OLD.status != 'failed' AND NEW.status = 'failed')
  EXECUTE FUNCTION check_backup_failures();

-- Alert when rate limits are frequently hit
CREATE OR REPLACE FUNCTION check_rate_limit_abuse()
RETURNS TRIGGER AS $$
DECLARE
  v_recent_hits INTEGER;
BEGIN
  -- Check if user has hit rate limit more than 5 times in last hour
  SELECT COUNT(*) INTO v_recent_hits
  FROM rate_limits
  WHERE user_id = NEW.user_id
    AND endpoint = NEW.endpoint
    AND window_start >= NOW() - INTERVAL '1 hour'
    AND request_count >= (
      SELECT free_tier_limit FROM rate_limit_config WHERE endpoint = NEW.endpoint
    );

  IF v_recent_hits >= 5 THEN
    PERFORM create_admin_notification(
      'warning',
      'medium',
      'Potential Rate Limit Abuse',
      'User hitting rate limits frequently: ' || NEW.endpoint,
      jsonb_build_object('user_id', NEW.user_id, 'endpoint', NEW.endpoint, 'hits', v_recent_hits)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_rate_limit_hit
  AFTER INSERT ON rate_limits
  FOR EACH ROW
  WHEN (NEW.request_count >= 10)
  EXECUTE FUNCTION check_rate_limit_abuse();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON VIEW admin_platform_health IS 'High-level platform health metrics snapshot';
COMMENT ON VIEW admin_user_engagement IS 'Per-user engagement scores and activity metrics';
COMMENT ON VIEW admin_daily_activity IS 'Daily activity trends over last 30 days';
COMMENT ON VIEW admin_ai_usage IS 'AI endpoint usage statistics and costs';
COMMENT ON VIEW admin_content_quality IS 'Content creation and quality metrics';
COMMENT ON VIEW admin_error_tracking IS 'System errors and failures tracking';
COMMENT ON VIEW admin_user_retention IS 'Cohort-based user retention analysis';
COMMENT ON VIEW admin_feature_adoption IS 'Feature usage and adoption rates';
COMMENT ON TABLE admin_notifications IS 'System notifications for administrators';
COMMENT ON FUNCTION create_admin_notification IS 'Create a new admin notification';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251010234000_admin_analytics.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 41: 20251010235000_ai_cost_tracking.sql
-- ============================================

-- ============================================================================
-- AI COST TRACKING SYSTEM
-- ============================================================================
-- Track and monitor AI API costs with budgets and alerts

-- ============================================================================
-- AI USAGE LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  model TEXT, -- e.g., 'gpt-4', 'gpt-3.5-turbo', 'claude-3-opus'

  -- Token usage
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,

  -- Cost tracking (in cents)
  prompt_cost_cents DECIMAL(10, 4),
  completion_cost_cents DECIMAL(10, 4),
  total_cost_cents DECIMAL(10, 4),

  -- Request details
  request_duration_ms INTEGER,
  status TEXT, -- 'success', 'error', 'timeout'
  error_message TEXT,

  -- Metadata
  request_metadata JSONB,
  response_metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user ON ai_usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_endpoint ON ai_usage_logs(endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_date ON ai_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_cost ON ai_usage_logs(total_cost_cents DESC);

-- Enable RLS
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own logs
CREATE POLICY "Users can view their own AI usage logs"
  ON ai_usage_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all logs
CREATE POLICY "Admins can view all AI usage logs"
  ON ai_usage_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- System can insert logs
CREATE POLICY "System can insert AI usage logs"
  ON ai_usage_logs FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- AI COST BUDGETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_cost_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_name TEXT NOT NULL,
  budget_type TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'

  -- Budget limits (in cents)
  free_tier_limit_cents INTEGER NOT NULL DEFAULT 100, -- $1.00
  premium_tier_limit_cents INTEGER NOT NULL DEFAULT 1000, -- $10.00
  enterprise_tier_limit_cents INTEGER NOT NULL DEFAULT 10000, -- $100.00

  -- Alert thresholds (percentage of limit)
  warning_threshold_pct INTEGER DEFAULT 80,
  critical_threshold_pct INTEGER DEFAULT 95,

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ai_cost_budgets ENABLE ROW LEVEL SECURITY;

-- Anyone can read active budgets
CREATE POLICY "Anyone can read active budgets"
  ON ai_cost_budgets FOR SELECT
  USING (is_active = true);

-- Only admins can manage budgets
CREATE POLICY "Admins can manage budgets"
  ON ai_cost_budgets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Insert default budget
INSERT INTO ai_cost_budgets (budget_name, budget_type, free_tier_limit_cents, premium_tier_limit_cents, enterprise_tier_limit_cents)
VALUES ('Daily AI Budget', 'daily', 100, 1000, 10000)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- AI MODEL PRICING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL, -- 'openai', 'anthropic', etc.

  -- Pricing per 1M tokens (in cents)
  prompt_price_per_1m_tokens INTEGER NOT NULL,
  completion_price_per_1m_tokens INTEGER NOT NULL,

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ai_model_pricing ENABLE ROW LEVEL SECURITY;

-- Anyone can read pricing
CREATE POLICY "Anyone can read AI model pricing"
  ON ai_model_pricing FOR SELECT
  USING (true);

-- Only admins can manage pricing
CREATE POLICY "Admins can manage AI model pricing"
  ON ai_model_pricing FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Insert default pricing (OpenAI GPT-4 Turbo as of 2024)
INSERT INTO ai_model_pricing (model_name, provider, prompt_price_per_1m_tokens, completion_price_per_1m_tokens) VALUES
('gpt-4-turbo', 'openai', 1000, 3000), -- $10/$30 per 1M tokens
('gpt-4', 'openai', 3000, 6000), -- $30/$60 per 1M tokens
('gpt-3.5-turbo', 'openai', 50, 150), -- $0.50/$1.50 per 1M tokens
('claude-3-opus', 'anthropic', 1500, 7500), -- $15/$75 per 1M tokens
('claude-3-sonnet', 'anthropic', 300, 1500), -- $3/$15 per 1M tokens
('claude-3-haiku', 'anthropic', 25, 125) -- $0.25/$1.25 per 1M tokens
ON CONFLICT (model_name) DO NOTHING;

-- ============================================================================
-- FUNCTION: LOG AI USAGE
-- ============================================================================

CREATE OR REPLACE FUNCTION log_ai_usage(
  p_user_id UUID,
  p_endpoint TEXT,
  p_model TEXT,
  p_prompt_tokens INTEGER,
  p_completion_tokens INTEGER,
  p_request_duration_ms INTEGER DEFAULT NULL,
  p_status TEXT DEFAULT 'success',
  p_error_message TEXT DEFAULT NULL,
  p_request_metadata JSONB DEFAULT '{}'::jsonb,
  p_response_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_pricing RECORD;
  v_prompt_cost_cents DECIMAL(10, 4);
  v_completion_cost_cents DECIMAL(10, 4);
  v_total_cost_cents DECIMAL(10, 4);
  v_log_id UUID;
BEGIN
  -- Get pricing for model
  SELECT * INTO v_pricing
  FROM ai_model_pricing
  WHERE model_name = p_model
    AND is_active = true;

  IF FOUND THEN
    -- Calculate costs
    v_prompt_cost_cents := (p_prompt_tokens::DECIMAL / 1000000) * v_pricing.prompt_price_per_1m_tokens;
    v_completion_cost_cents := (p_completion_tokens::DECIMAL / 1000000) * v_pricing.completion_price_per_1m_tokens;
    v_total_cost_cents := v_prompt_cost_cents + v_completion_cost_cents;
  ELSE
    -- Default fallback cost estimation if model not found
    v_prompt_cost_cents := (p_prompt_tokens::DECIMAL / 1000000) * 1000; -- $10 per 1M tokens
    v_completion_cost_cents := (p_completion_tokens::DECIMAL / 1000000) * 3000; -- $30 per 1M tokens
    v_total_cost_cents := v_prompt_cost_cents + v_completion_cost_cents;
  END IF;

  -- Insert usage log
  INSERT INTO ai_usage_logs (
    user_id,
    endpoint,
    model,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    prompt_cost_cents,
    completion_cost_cents,
    total_cost_cents,
    request_duration_ms,
    status,
    error_message,
    request_metadata,
    response_metadata
  ) VALUES (
    p_user_id,
    p_endpoint,
    p_model,
    p_prompt_tokens,
    p_completion_tokens,
    p_prompt_tokens + p_completion_tokens,
    v_prompt_cost_cents,
    v_completion_cost_cents,
    v_total_cost_cents,
    p_request_duration_ms,
    p_status,
    p_error_message,
    p_request_metadata,
    p_response_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: CHECK AI BUDGET
-- ============================================================================

CREATE OR REPLACE FUNCTION check_ai_budget(
  p_user_id UUID,
  p_budget_type TEXT DEFAULT 'daily'
)
RETURNS TABLE(
  within_budget BOOLEAN,
  current_spend_cents DECIMAL(10, 4),
  budget_limit_cents INTEGER,
  percentage_used DECIMAL(5, 2),
  alert_level TEXT
) AS $$
DECLARE
  v_budget RECORD;
  v_subscription_tier TEXT;
  v_limit_cents INTEGER;
  v_current_spend DECIMAL(10, 4);
  v_period_start TIMESTAMPTZ;
  v_percentage DECIMAL(5, 2);
  v_alert_level TEXT;
BEGIN
  -- Get budget configuration
  SELECT * INTO v_budget
  FROM ai_cost_budgets
  WHERE budget_type = p_budget_type
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    -- Return default values if no budget configured
    RETURN QUERY SELECT true, 0::DECIMAL, 0, 0::DECIMAL, 'none'::TEXT;
    RETURN;
  END IF;

  -- Get user's subscription tier (default to free if not set)
  v_subscription_tier := 'free';

  -- Set limit based on tier
  v_limit_cents := CASE v_subscription_tier
    WHEN 'enterprise' THEN v_budget.enterprise_tier_limit_cents
    WHEN 'premium' THEN v_budget.premium_tier_limit_cents
    ELSE v_budget.free_tier_limit_cents
  END;

  -- Calculate period start
  v_period_start := CASE p_budget_type
    WHEN 'daily' THEN DATE_TRUNC('day', NOW())
    WHEN 'weekly' THEN DATE_TRUNC('week', NOW())
    WHEN 'monthly' THEN DATE_TRUNC('month', NOW())
    ELSE DATE_TRUNC('day', NOW())
  END;

  -- Get current spend for period
  SELECT COALESCE(SUM(total_cost_cents), 0) INTO v_current_spend
  FROM ai_usage_logs
  WHERE user_id = p_user_id
    AND created_at >= v_period_start
    AND status = 'success';

  -- Calculate percentage
  v_percentage := (v_current_spend / NULLIF(v_limit_cents, 0)) * 100;

  -- Determine alert level
  v_alert_level := CASE
    WHEN v_percentage >= v_budget.critical_threshold_pct THEN 'critical'
    WHEN v_percentage >= v_budget.warning_threshold_pct THEN 'warning'
    ELSE 'ok'
  END;

  -- Return result
  RETURN QUERY SELECT
    v_current_spend < v_limit_cents,
    v_current_spend,
    v_limit_cents,
    v_percentage,
    v_alert_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- AI COST ANALYTICS VIEWS
-- ============================================================================

-- Daily cost summary
CREATE OR REPLACE VIEW ai_cost_daily_summary AS
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_requests,
  COUNT(DISTINCT user_id) as unique_users,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost_cents) as total_cost_cents,
  ROUND(SUM(total_cost_cents) / 100.0, 2) as total_cost_dollars,
  AVG(total_cost_cents) as avg_cost_per_request_cents,
  AVG(request_duration_ms) as avg_duration_ms,
  COUNT(*) FILTER (WHERE status = 'error') as error_count
FROM ai_usage_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Cost by endpoint
CREATE OR REPLACE VIEW ai_cost_by_endpoint AS
SELECT
  endpoint,
  COUNT(*) as total_requests,
  COUNT(DISTINCT user_id) as unique_users,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost_cents) as total_cost_cents,
  ROUND(SUM(total_cost_cents) / 100.0, 2) as total_cost_dollars,
  AVG(total_cost_cents) as avg_cost_per_request_cents,
  AVG(total_tokens) as avg_tokens_per_request,
  AVG(request_duration_ms) as avg_duration_ms
FROM ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY endpoint
ORDER BY total_cost_cents DESC;

-- Cost by user
CREATE OR REPLACE VIEW ai_cost_by_user AS
SELECT
  al.user_id,
  p.full_name,
  COUNT(*) as total_requests,
  SUM(al.total_tokens) as total_tokens,
  SUM(al.total_cost_cents) as total_cost_cents,
  ROUND(SUM(al.total_cost_cents) / 100.0, 2) as total_cost_dollars,
  MAX(al.created_at) as last_request_at,

  -- Current month spend
  SUM(al.total_cost_cents) FILTER (WHERE al.created_at >= DATE_TRUNC('month', NOW())) as current_month_cost_cents,

  -- Budget check
  (SELECT budget_limit_cents FROM check_ai_budget(al.user_id, 'monthly') LIMIT 1) as monthly_budget_cents
FROM ai_usage_logs al
JOIN profiles p ON p.id = al.user_id
WHERE al.created_at >= NOW() - INTERVAL '90 days'
GROUP BY al.user_id, p.full_name
ORDER BY total_cost_cents DESC;

-- Cost by model
CREATE OR REPLACE VIEW ai_cost_by_model AS
SELECT
  model,
  COUNT(*) as total_requests,
  COUNT(DISTINCT user_id) as unique_users,
  SUM(total_tokens) as total_tokens,
  SUM(prompt_tokens) as total_prompt_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  SUM(total_cost_cents) as total_cost_cents,
  ROUND(SUM(total_cost_cents) / 100.0, 2) as total_cost_dollars,
  AVG(total_cost_cents) as avg_cost_per_request_cents,
  AVG(request_duration_ms) as avg_duration_ms
FROM ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND model IS NOT NULL
GROUP BY model
ORDER BY total_cost_cents DESC;

-- ============================================================================
-- TRIGGER: CHECK BUDGET ON NEW REQUEST
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_budget_alert()
RETURNS TRIGGER AS $$
DECLARE
  v_budget_check RECORD;
BEGIN
  -- Check daily budget
  SELECT * INTO v_budget_check
  FROM check_ai_budget(NEW.user_id, 'daily');

  -- Create alert if critical threshold reached
  IF v_budget_check.alert_level = 'critical' THEN
    PERFORM create_admin_notification(
      'alert',
      'high',
      'AI Budget Critical',
      'User has exceeded ' || v_budget_check.percentage_used || '% of daily AI budget',
      jsonb_build_object(
        'user_id', NEW.user_id,
        'current_spend_cents', v_budget_check.current_spend_cents,
        'budget_limit_cents', v_budget_check.budget_limit_cents,
        'percentage_used', v_budget_check.percentage_used
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_ai_usage_check_budget
  AFTER INSERT ON ai_usage_logs
  FOR EACH ROW
  WHEN (NEW.status = 'success')
  EXECUTE FUNCTION trigger_budget_alert();

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_ai_cost_budgets_updated_at
  BEFORE UPDATE ON ai_cost_budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_model_pricing_updated_at
  BEFORE UPDATE ON ai_model_pricing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE ai_usage_logs IS 'Detailed logs of AI API usage with token and cost tracking';
COMMENT ON TABLE ai_cost_budgets IS 'Budget limits and alert thresholds for AI spending';
COMMENT ON TABLE ai_model_pricing IS 'Pricing information for AI models';
COMMENT ON FUNCTION log_ai_usage IS 'Log AI API usage with automatic cost calculation';
COMMENT ON FUNCTION check_ai_budget IS 'Check if user is within AI budget and return alert level';
COMMENT ON VIEW ai_cost_daily_summary IS 'Daily AI cost and usage summary';
COMMENT ON VIEW ai_cost_by_endpoint IS 'AI cost breakdown by endpoint';
COMMENT ON VIEW ai_cost_by_user IS 'AI cost breakdown by user';
COMMENT ON VIEW ai_cost_by_model IS 'AI cost breakdown by AI model';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251010235000_ai_cost_tracking.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 42: 20251012005052_a8dfd754-bffa-4018-be76-dbc4ce9153af.sql
-- ============================================

-- Add missing recipe columns for cooking details
ALTER TABLE recipes 
  ADD COLUMN IF NOT EXISTS instructions TEXT,
  ADD COLUMN IF NOT EXISTS prep_time TEXT,
  ADD COLUMN IF NOT EXISTS cook_time TEXT,
  ADD COLUMN IF NOT EXISTS servings TEXT,
  ADD COLUMN IF NOT EXISTS additional_ingredients TEXT,
  ADD COLUMN IF NOT EXISTS tips TEXT;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251012005052_a8dfd754-bffa-4018-be76-dbc4ce9153af.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 43: 20251012010642_b2a14d3a-766b-445d-9c2a-80487a3a452d.sql
-- ============================================

-- Ensure required columns exist on recipes table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'prep_time'
  ) THEN
    ALTER TABLE public.recipes ADD COLUMN prep_time text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'cook_time'
  ) THEN
    ALTER TABLE public.recipes ADD COLUMN cook_time text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'instructions'
  ) THEN
    ALTER TABLE public.recipes ADD COLUMN instructions text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'servings'
  ) THEN
    ALTER TABLE public.recipes ADD COLUMN servings integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'additional_ingredients'
  ) THEN
    ALTER TABLE public.recipes ADD COLUMN additional_ingredients text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'tips'
  ) THEN
    ALTER TABLE public.recipes ADD COLUMN tips text;
  END IF;
END $$;

-- Harden and authorize scheduling while bypassing RLS during inserts
CREATE OR REPLACE FUNCTION public.schedule_recipe_to_plan(
  p_kid_id uuid,
  p_recipe_id uuid,
  p_date date,
  p_meal_slot text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_food_id UUID;
  v_food_ids UUID[];
  v_user_id UUID;
  v_count INTEGER := 0;
  v_is_primary BOOLEAN := true;
BEGIN
  -- Determine owner of the kid
  SELECT user_id INTO v_user_id FROM kids WHERE id = p_kid_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Kid not found';
  END IF;

  -- Authorization guard: only the kid's owner can schedule
  IF v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to schedule for this kid';
  END IF;

  -- Get recipe foods
  SELECT food_ids INTO v_food_ids FROM recipes WHERE id = p_recipe_id;
  IF v_food_ids IS NULL OR array_length(v_food_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Recipe has no foods';
  END IF;

  -- Remove existing entries for this kid/date/slot/recipe
  DELETE FROM plan_entries
  WHERE kid_id = p_kid_id
    AND date = p_date
    AND meal_slot = p_meal_slot
    AND recipe_id = p_recipe_id;

  -- Insert plan entries for each food in the recipe
  FOREACH v_food_id IN ARRAY v_food_ids LOOP
    INSERT INTO plan_entries (
      user_id,
      kid_id,
      date,
      meal_slot,
      food_id,
      recipe_id,
      is_primary_dish
    ) VALUES (
      v_user_id,
      p_kid_id,
      p_date,
      p_meal_slot,
      v_food_id,
      p_recipe_id,
      v_is_primary
    );

    v_count := v_count + 1;
    v_is_primary := false; -- first item is primary
  END LOOP;

  RETURN v_count;
END;
$function$;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251012010642_b2a14d3a-766b-445d-9c2a-80487a3a452d.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 44: 20251012011805_60cf5942-6c7c-4215-9b4c-14085bfb21cd.sql
-- ============================================

-- Update schedule_recipe_to_plan to include household_id so RLS allows visibility
CREATE OR REPLACE FUNCTION public.schedule_recipe_to_plan(p_kid_id uuid, p_recipe_id uuid, p_date date, p_meal_slot text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_food_id UUID;
  v_food_ids UUID[];
  v_user_id UUID;
  v_household_id UUID;
  v_count INTEGER := 0;
  v_is_primary BOOLEAN := true;
BEGIN
  -- Determine owner of the kid and household
  SELECT user_id, household_id INTO v_user_id, v_household_id FROM kids WHERE id = p_kid_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Kid not found';
  END IF;

  -- Authorization guard: only the kid's owner can schedule
  IF v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to schedule for this kid';
  END IF;

  -- Get recipe foods
  SELECT food_ids INTO v_food_ids FROM recipes WHERE id = p_recipe_id;
  IF v_food_ids IS NULL OR array_length(v_food_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Recipe has no foods';
  END IF;

  -- Remove existing entries for this kid/date/slot/recipe
  DELETE FROM plan_entries
  WHERE kid_id = p_kid_id
    AND date = p_date
    AND meal_slot = p_meal_slot
    AND recipe_id = p_recipe_id;

  -- Insert plan entries for each food in the recipe
  FOREACH v_food_id IN ARRAY v_food_ids LOOP
    INSERT INTO plan_entries (
      user_id,
      household_id,
      kid_id,
      date,
      meal_slot,
      food_id,
      recipe_id,
      is_primary_dish
    ) VALUES (
      v_user_id,
      v_household_id,
      p_kid_id,
      p_date,
      p_meal_slot,
      v_food_id,
      p_recipe_id,
      v_is_primary
    );

    v_count := v_count + 1;
    v_is_primary := false; -- first item is primary
  END LOOP;

  RETURN v_count;
END;
$function$;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251012011805_60cf5942-6c7c-4215-9b4c-14085bfb21cd.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 45: 20251013042658_25106cb6-71d7-4bfe-acba-f0b0f1126dc6.sql
-- ============================================

-- Fix the get_blog_generation_insights function to correctly reference times_used
DROP FUNCTION IF EXISTS get_blog_generation_insights();

CREATE OR REPLACE FUNCTION public.get_blog_generation_insights()
RETURNS TABLE(
  total_titles integer,
  unused_titles integer,
  most_used_title text,
  most_used_count integer,
  recent_topics text[],
  recommended_next_topics text[]
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_titles,
    COUNT(*) FILTER (WHERE btb.times_used = 0)::INTEGER as unused_titles,
    (SELECT btb2.title FROM blog_title_bank btb2 ORDER BY btb2.times_used DESC LIMIT 1) as most_used_title,
    (SELECT btb2.times_used FROM blog_title_bank btb2 ORDER BY btb2.times_used DESC LIMIT 1) as most_used_count,
    (
      SELECT ARRAY_AGG(DISTINCT unnest_val)
      FROM (
        SELECT unnest(bgh.keywords) as unnest_val
        FROM blog_generation_history bgh
        WHERE bgh.generated_at > NOW() - INTERVAL '30 days'
        LIMIT 100
      ) subq
      LIMIT 20
    ) as recent_topics,
    (
      SELECT ARRAY_AGG(btb3.title)
      FROM (
        SELECT btb3.title 
        FROM blog_title_bank btb3
        WHERE btb3.times_used = 0 
        ORDER BY RANDOM() 
        LIMIT 10
      ) btb3
    ) as recommended_next_topics
  FROM blog_title_bank btb;
END;
$function$;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251013042658_25106cb6-71d7-4bfe-acba-f0b0f1126dc6.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 46: 20251013045657_076d6c6b-a25a-4267-a04d-fdbccbca1761.sql
-- ============================================

-- Add unique constraint required by track_blog_content() trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'blog_content_tracking_post_id_key'
      AND conrelid = 'public.blog_content_tracking'::regclass
  ) THEN
    ALTER TABLE public.blog_content_tracking
    ADD CONSTRAINT blog_content_tracking_post_id_key UNIQUE (post_id);
  END IF;
END$$;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251013045657_076d6c6b-a25a-4267-a04d-fdbccbca1761.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 47: 20251013120000_admin_live_activity.sql
-- ============================================

-- =====================================================
-- ADMIN LIVE ACTIVITY FEED & ALERTS SYSTEM
-- =====================================================
-- Purpose: Real-time monitoring of user actions and system events
-- Features: Activity stream, automated alerts, system health tracking

-- =====================================================
-- 1. ACTIVITY FEED TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_live_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'signup',
    'login',
    'logout',
    'meal_plan_created',
    'meal_plan_updated',
    'grocery_list_created',
    'recipe_created',
    'pantry_item_added',
    'kid_added',
    'subscription_created',
    'subscription_updated',
    'subscription_cancelled',
    'payment_success',
    'payment_failed',
    'ai_query',
    'error',
    'api_call',
    'feature_used'
  )),
  activity_data JSONB NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}', -- browser, IP, device type, etc.
  severity TEXT CHECK (severity IN ('info', 'warning', 'error', 'critical')) DEFAULT 'info',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast filtering and querying
CREATE INDEX idx_admin_activity_type ON admin_live_activity(activity_type);
CREATE INDEX idx_admin_activity_user ON admin_live_activity(user_id);
CREATE INDEX idx_admin_activity_created ON admin_live_activity(created_at DESC);
CREATE INDEX idx_admin_activity_severity ON admin_live_activity(severity);
CREATE INDEX idx_admin_activity_combined ON admin_live_activity(activity_type, created_at DESC);

-- Enable RLS
ALTER TABLE admin_live_activity ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view activity
CREATE POLICY "Admins can view all activity"
  ON admin_live_activity
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 2. ADMIN ALERTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'error_spike',
    'signup_drop',
    'high_api_cost',
    'payment_failure',
    'abuse_detection',
    'server_downtime',
    'low_activity',
    'feature_adoption'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  alert_data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_admin_alerts_type ON admin_alerts(alert_type);
CREATE INDEX idx_admin_alerts_severity ON admin_alerts(severity);
CREATE INDEX idx_admin_alerts_unread ON admin_alerts(is_read) WHERE is_read = FALSE;
CREATE INDEX idx_admin_alerts_unresolved ON admin_alerts(is_resolved) WHERE is_resolved = FALSE;
CREATE INDEX idx_admin_alerts_created ON admin_alerts(created_at DESC);

-- Enable RLS
ALTER TABLE admin_alerts ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view alerts
CREATE POLICY "Admins can view all alerts"
  ON admin_alerts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Policy: Only admins can update alerts
CREATE POLICY "Admins can update alerts"
  ON admin_alerts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 3. ALERT PREFERENCES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_alert_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  email_enabled BOOLEAN DEFAULT TRUE,
  push_enabled BOOLEAN DEFAULT TRUE,
  threshold_value INTEGER, -- e.g., errors per minute
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(admin_id, alert_type)
);

-- Enable RLS
ALTER TABLE admin_alert_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can manage their own preferences
CREATE POLICY "Admins can manage own alert preferences"
  ON admin_alert_preferences
  FOR ALL
  USING (admin_id = auth.uid());

-- =====================================================
-- 4. SYSTEM HEALTH METRICS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS admin_system_health (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'api_response_time_p50',
    'api_response_time_p95',
    'api_response_time_p99',
    'error_rate',
    'active_users',
    'database_connections',
    'storage_used',
    'ai_api_calls',
    'ai_cost_daily',
    'rate_limit_hits'
  )),
  metric_value NUMERIC NOT NULL,
  metric_unit TEXT, -- ms, %, count, $, etc.
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_system_health_type ON admin_system_health(metric_type);
CREATE INDEX idx_system_health_recorded ON admin_system_health(recorded_at DESC);
CREATE INDEX idx_system_health_combined ON admin_system_health(metric_type, recorded_at DESC);

-- Enable RLS
ALTER TABLE admin_system_health ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view metrics
CREATE POLICY "Admins can view system health"
  ON admin_system_health
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 5. HELPER FUNCTIONS
-- =====================================================

-- Function to log activity (can be called from triggers or application code)
CREATE OR REPLACE FUNCTION log_admin_activity(
  p_user_id UUID,
  p_activity_type TEXT,
  p_activity_data JSONB DEFAULT '{}',
  p_metadata JSONB DEFAULT '{}',
  p_severity TEXT DEFAULT 'info'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  INSERT INTO admin_live_activity (
    user_id,
    activity_type,
    activity_data,
    metadata,
    severity
  ) VALUES (
    p_user_id,
    p_activity_type,
    p_activity_data,
    p_metadata,
    p_severity
  )
  RETURNING id INTO v_activity_id;
  
  RETURN v_activity_id;
END;
$$;

-- Function to create alert
CREATE OR REPLACE FUNCTION create_admin_alert(
  p_alert_type TEXT,
  p_severity TEXT,
  p_title TEXT,
  p_message TEXT,
  p_alert_data JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert_id UUID;
BEGIN
  INSERT INTO admin_alerts (
    alert_type,
    severity,
    title,
    message,
    alert_data
  ) VALUES (
    p_alert_type,
    p_severity,
    p_title,
    p_message,
    p_alert_data
  )
  RETURNING id INTO v_alert_id;
  
  RETURN v_alert_id;
END;
$$;

-- Function to get recent activity summary
CREATE OR REPLACE FUNCTION get_activity_summary(
  p_time_window INTERVAL DEFAULT '1 hour'
)
RETURNS TABLE (
  activity_type TEXT,
  count BIGINT,
  severity TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    activity_type,
    COUNT(*) as count,
    severity
  FROM admin_live_activity
  WHERE created_at >= NOW() - p_time_window
  GROUP BY activity_type, severity
  ORDER BY count DESC;
$$;

-- Function to detect error spikes
CREATE OR REPLACE FUNCTION detect_error_spike()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_recent_errors INTEGER;
  v_threshold INTEGER := 10; -- 10 errors per minute
BEGIN
  -- Count errors in last minute
  SELECT COUNT(*) INTO v_recent_errors
  FROM admin_live_activity
  WHERE activity_type = 'error'
    AND created_at >= NOW() - INTERVAL '1 minute';
  
  -- Create alert if threshold exceeded
  IF v_recent_errors >= v_threshold THEN
    PERFORM create_admin_alert(
      'error_spike',
      'critical',
      'Error Spike Detected',
      format('Detected %s errors in the last minute (threshold: %s)', v_recent_errors, v_threshold),
      jsonb_build_object('error_count', v_recent_errors, 'threshold', v_threshold)
    );
  END IF;
END;
$$;

-- =====================================================
-- 6. EXAMPLE TRIGGERS FOR AUTOMATIC LOGGING
-- =====================================================

-- Note: Triggers for meal plans and grocery lists can be added
-- once those tables are created in future migrations.
-- For now, activity logging is done via application code.

-- Example: Log meal creation
-- CREATE OR REPLACE FUNCTION trigger_log_meal_creation()
-- RETURNS TRIGGER
-- LANGUAGE plpgsql
-- AS $$
-- BEGIN
--   PERFORM log_admin_activity(
--     (SELECT user_id FROM kids WHERE id = NEW.kid_id),
--     'meal_plan_created',
--     jsonb_build_object('meal_id', NEW.id, 'kid_id', NEW.kid_id),
--     '{}'::jsonb,
--     'info'
--   );
--   RETURN NEW;
-- END;
-- $$;
-- 
-- CREATE TRIGGER log_meal_creation
--   AFTER INSERT ON kid_meal_creations
--   FOR EACH ROW
--   EXECUTE FUNCTION trigger_log_meal_creation();

-- =====================================================
-- 7. VIEWS FOR ADMIN DASHBOARD
-- =====================================================

-- View: Recent activity with user details
CREATE OR REPLACE VIEW admin_activity_feed AS
SELECT 
  a.id,
  a.user_id,
  u.email,
  p.full_name,
  a.activity_type,
  a.activity_data,
  a.metadata,
  a.severity,
  a.created_at
FROM admin_live_activity a
LEFT JOIN auth.users u ON u.id = a.user_id
LEFT JOIN profiles p ON p.id = a.user_id
ORDER BY a.created_at DESC
LIMIT 1000;

-- View: Unread alerts
CREATE OR REPLACE VIEW admin_unread_alerts AS
SELECT 
  id,
  alert_type,
  severity,
  title,
  message,
  alert_data,
  created_at
FROM admin_alerts
WHERE is_read = FALSE
ORDER BY 
  CASE severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  created_at DESC;

-- View: System health summary
CREATE OR REPLACE VIEW admin_system_health_summary AS
SELECT 
  metric_type,
  metric_value,
  metric_unit,
  recorded_at,
  ROW_NUMBER() OVER (PARTITION BY metric_type ORDER BY recorded_at DESC) as rn
FROM admin_system_health
WHERE recorded_at >= NOW() - INTERVAL '24 hours';

-- =====================================================
-- 8. SCHEDULED JOBS (via pg_cron or edge functions)
-- =====================================================

-- Clean up old activity logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM admin_live_activity
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  DELETE FROM admin_system_health
  WHERE recorded_at < NOW() - INTERVAL '90 days';
END;
$$;

-- =====================================================
-- 9. GRANT PERMISSIONS
-- =====================================================

-- Grant necessary permissions for service role
GRANT ALL ON admin_live_activity TO service_role;
GRANT ALL ON admin_alerts TO service_role;
GRANT ALL ON admin_alert_preferences TO service_role;
GRANT ALL ON admin_system_health TO service_role;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION log_admin_activity TO service_role;
GRANT EXECUTE ON FUNCTION create_admin_alert TO service_role;
GRANT EXECUTE ON FUNCTION get_activity_summary TO service_role;
GRANT EXECUTE ON FUNCTION detect_error_spike TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_activity_logs TO service_role;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Insert initial system health metrics
INSERT INTO admin_system_health (metric_type, metric_value, metric_unit)
VALUES 
  ('active_users', 0, 'count'),
  ('error_rate', 0, '%'),
  ('ai_cost_daily', 0, '$');

COMMENT ON TABLE admin_live_activity IS 'Real-time activity feed for admin monitoring';
COMMENT ON TABLE admin_alerts IS 'Automated alerts for critical system events';
COMMENT ON TABLE admin_alert_preferences IS 'Admin notification preferences per alert type';
COMMENT ON TABLE admin_system_health IS 'System performance and health metrics over time';



-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251013120000_admin_live_activity.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 48: 20251013130000_feature_flags.sql
-- ============================================

-- =====================================================
-- FEATURE FLAG MANAGEMENT SYSTEM
-- =====================================================
-- Purpose: Admin-controlled feature rollout and A/B testing
-- Features: Percentage rollouts, user targeting, gradual deployment

-- =====================================================
-- 1. FEATURE FLAGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL CHECK (key ~ '^[a-z0-9_-]+$'),
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT FALSE NOT NULL,
  rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  targeting_rules JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}', -- Additional flag info
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

-- Indexes
CREATE INDEX idx_feature_flags_key ON feature_flags(key);
CREATE INDEX idx_feature_flags_enabled ON feature_flags(enabled);
CREATE INDEX idx_feature_flags_rollout ON feature_flags(rollout_percentage);

-- Enable RLS
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view enabled flags"
  ON feature_flags
  FOR SELECT
  USING (enabled = TRUE);

CREATE POLICY "Admins can manage all flags"
  ON feature_flags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 2. FEATURE FLAG EVALUATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS feature_flag_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_key TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,
  evaluation_reason TEXT, -- 'enabled', 'disabled', 'rollout', 'targeting'
  evaluated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(flag_key, user_id, evaluated_at)
);

-- Indexes for analytics
CREATE INDEX idx_flag_evaluations_flag_key ON feature_flag_evaluations(flag_key);
CREATE INDEX idx_flag_evaluations_user ON feature_flag_evaluations(user_id);
CREATE INDEX idx_flag_evaluations_evaluated ON feature_flag_evaluations(evaluated_at DESC);
CREATE INDEX idx_flag_evaluations_combined ON feature_flag_evaluations(flag_key, enabled, evaluated_at DESC);

-- Enable RLS
ALTER TABLE feature_flag_evaluations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own evaluations"
  ON feature_flag_evaluations
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all evaluations"
  ON feature_flag_evaluations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 3. FLAG ANALYTICS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS feature_flag_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flag_key TEXT NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'adoption_rate',
    'user_count',
    'error_rate',
    'performance_impact',
    'feedback_score'
  )),
  metric_value NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_flag_analytics_flag_key ON feature_flag_analytics(flag_key);
CREATE INDEX idx_flag_analytics_type ON feature_flag_analytics(metric_type);
CREATE INDEX idx_flag_analytics_recorded ON feature_flag_analytics(recorded_at DESC);

-- Enable RLS
ALTER TABLE feature_flag_analytics ENABLE ROW LEVEL SECURITY;

-- Policy: Admins only
CREATE POLICY "Admins can view flag analytics"
  ON feature_flag_analytics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 4. HELPER FUNCTIONS
-- =====================================================

-- Function to evaluate a feature flag for a user
CREATE OR REPLACE FUNCTION evaluate_feature_flag(
  p_flag_key TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_flag RECORD;
  v_enabled BOOLEAN := FALSE;
  v_reason TEXT := 'disabled';
  v_user_hash INTEGER;
BEGIN
  -- Get flag configuration
  SELECT * INTO v_flag FROM feature_flags WHERE key = p_flag_key;
  
  -- If flag doesn't exist, return false
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- If flag is disabled globally, return false
  IF v_flag.enabled = FALSE THEN
    v_enabled := FALSE;
    v_reason := 'disabled';
  ELSE
    -- Check targeting rules first
    IF v_flag.targeting_rules IS NOT NULL AND v_flag.targeting_rules != '{}'::jsonb THEN
      -- Check user role targeting
      IF v_flag.targeting_rules ? 'roles' THEN
        IF EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_id = p_user_id
          AND role::text = ANY(
            SELECT jsonb_array_elements_text(v_flag.targeting_rules->'roles')
          )
        ) THEN
          v_enabled := TRUE;
          v_reason := 'targeting_role';
        END IF;
      END IF;
      
      -- Check email domain targeting
      IF NOT v_enabled AND v_flag.targeting_rules ? 'email_domains' THEN
        IF EXISTS (
          SELECT 1 FROM auth.users
          WHERE id = p_user_id
          AND email LIKE ANY(
            SELECT '%@' || jsonb_array_elements_text(v_flag.targeting_rules->'email_domains')
          )
        ) THEN
          v_enabled := TRUE;
          v_reason := 'targeting_email_domain';
        END IF;
      END IF;
      
      -- Check specific user IDs
      IF NOT v_enabled AND v_flag.targeting_rules ? 'user_ids' THEN
        IF v_flag.targeting_rules->'user_ids' ? p_user_id::text THEN
          v_enabled := TRUE;
          v_reason := 'targeting_user_id';
        END IF;
      END IF;
    END IF;
    
    -- If not enabled by targeting, check rollout percentage
    IF NOT v_enabled THEN
      -- Use consistent hashing based on user ID and flag key
      v_user_hash := ABS(HASHTEXT(p_user_id::text || p_flag_key));
      
      IF (v_user_hash % 100) < v_flag.rollout_percentage THEN
        v_enabled := TRUE;
        v_reason := 'rollout';
      ELSE
        v_enabled := FALSE;
        v_reason := 'rollout_excluded';
      END IF;
    END IF;
  END IF;
  
  -- Log evaluation (async, don't fail if logging fails)
  BEGIN
    INSERT INTO feature_flag_evaluations (flag_key, user_id, enabled, evaluation_reason)
    VALUES (p_flag_key, p_user_id, v_enabled, v_reason);
  EXCEPTION WHEN OTHERS THEN
    -- Silently continue if logging fails
    NULL;
  END;
  
  RETURN v_enabled;
END;
$$;

-- Function to get all flags for a user
CREATE OR REPLACE FUNCTION get_user_feature_flags(p_user_id UUID)
RETURNS TABLE (
  flag_key TEXT,
  enabled BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    key as flag_key,
    evaluate_feature_flag(key, p_user_id) as enabled
  FROM feature_flags
  WHERE feature_flags.enabled = TRUE;
$$;

-- Function to get flag analytics
CREATE OR REPLACE FUNCTION get_flag_adoption_stats(p_flag_key TEXT, p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  total_evaluations BIGINT,
  enabled_count BIGINT,
  adoption_rate NUMERIC,
  unique_users BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    COUNT(*) as total_evaluations,
    COUNT(*) FILTER (WHERE enabled = TRUE) as enabled_count,
    ROUND((COUNT(*) FILTER (WHERE enabled = TRUE)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) as adoption_rate,
    COUNT(DISTINCT user_id) as unique_users
  FROM feature_flag_evaluations
  WHERE flag_key = p_flag_key
    AND evaluated_at >= NOW() - (p_days || ' days')::INTERVAL;
$$;

-- =====================================================
-- 5. AUTO-UPDATE TIMESTAMP TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION update_feature_flag_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_feature_flag_timestamp
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_feature_flag_timestamp();

-- =====================================================
-- 6. VIEWS FOR ADMIN DASHBOARD
-- =====================================================

-- View: Flag status summary
CREATE OR REPLACE VIEW feature_flag_summary AS
SELECT 
  ff.id,
  ff.key,
  ff.name,
  ff.description,
  ff.enabled,
  ff.rollout_percentage,
  ff.created_at,
  ff.updated_at,
  COUNT(DISTINCT ffe.user_id) FILTER (WHERE ffe.evaluated_at >= NOW() - INTERVAL '7 days') as users_last_7d,
  COUNT(*) FILTER (WHERE ffe.enabled = TRUE AND ffe.evaluated_at >= NOW() - INTERVAL '7 days') as enabled_count_7d,
  ROUND(
    (COUNT(*) FILTER (WHERE ffe.enabled = TRUE AND ffe.evaluated_at >= NOW() - INTERVAL '7 days')::NUMERIC / 
     NULLIF(COUNT(*) FILTER (WHERE ffe.evaluated_at >= NOW() - INTERVAL '7 days'), 0)) * 100, 
    2
  ) as adoption_rate_7d
FROM feature_flags ff
LEFT JOIN feature_flag_evaluations ffe ON ffe.flag_key = ff.key
GROUP BY ff.id, ff.key, ff.name, ff.description, ff.enabled, ff.rollout_percentage, ff.created_at, ff.updated_at;

-- =====================================================
-- 7. SEED DATA - DEFAULT FLAGS
-- =====================================================

INSERT INTO feature_flags (key, name, description, enabled, rollout_percentage, created_by)
VALUES 
  (
    'gamification_badges',
    'Gamification Badges',
    'Enable achievement badges and progress tracking',
    FALSE,
    0,
    NULL
  ),
  (
    'social_sharing',
    'Social Sharing',
    'Allow users to share meal plans on social media',
    FALSE,
    0,
    NULL
  ),
  (
    'ai_meal_suggestions',
    'AI Meal Suggestions',
    'Enhanced AI-powered meal plan suggestions',
    FALSE,
    0,
    NULL
  ),
  (
    'advanced_analytics',
    'Advanced Analytics',
    'Show detailed analytics and insights',
    FALSE,
    0,
    NULL
  ),
  (
    'push_notifications',
    'Push Notifications',
    'Enable browser push notifications for reminders',
    FALSE,
    0,
    NULL
  )
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

GRANT ALL ON feature_flags TO service_role;
GRANT ALL ON feature_flag_evaluations TO service_role;
GRANT ALL ON feature_flag_analytics TO service_role;

GRANT EXECUTE ON FUNCTION evaluate_feature_flag TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION get_user_feature_flags TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION get_flag_adoption_stats TO service_role;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

COMMENT ON TABLE feature_flags IS 'Feature flags for controlled rollout and A/B testing';
COMMENT ON TABLE feature_flag_evaluations IS 'Log of feature flag evaluations for analytics';
COMMENT ON TABLE feature_flag_analytics IS 'Aggregated analytics for feature flag performance';
COMMENT ON FUNCTION evaluate_feature_flag IS 'Evaluates if a feature flag is enabled for a specific user';
COMMENT ON FUNCTION get_user_feature_flags IS 'Returns all feature flags for a user with their enabled status';



-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251013130000_feature_flags.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 49: 20251013140000_support_tickets.sql
-- ============================================

-- =====================================================
-- SUPPORT TICKET SYSTEM
-- =====================================================
-- Purpose: Full-featured ticketing for user support
-- Features: User portal, admin management, AI triage

-- =====================================================
-- 1. SUPPORT TICKETS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT CHECK (status IN ('new', 'in_progress', 'waiting_user', 'resolved', 'closed')) DEFAULT 'new',
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  category TEXT CHECK (category IN ('bug', 'feature_request', 'question', 'billing', 'other')) DEFAULT 'other',
  assigned_to UUID REFERENCES profiles(id),
  context JSONB DEFAULT '{}', -- Page URL, user state, browser info, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON support_tickets(created_at DESC);

-- Enable RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Policies (drop existing ones first to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own tickets" ON support_tickets;
DROP POLICY IF EXISTS "Users can create own tickets" ON support_tickets;
DROP POLICY IF EXISTS "Admins can view all tickets" ON support_tickets;
DROP POLICY IF EXISTS "Admins can update all tickets" ON support_tickets;

CREATE POLICY "Users can view own tickets"
  ON support_tickets
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own tickets"
  ON support_tickets
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all tickets"
  ON support_tickets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update all tickets"
  ON support_tickets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 2. TICKET MESSAGES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE, -- Internal admin notes
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_author ON ticket_messages(author_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created ON ticket_messages(created_at DESC);

-- Enable RLS
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

-- Policies (drop existing ones first to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own ticket messages" ON ticket_messages;
DROP POLICY IF EXISTS "Users can create messages on own tickets" ON ticket_messages;
DROP POLICY IF EXISTS "Admins can view all messages" ON ticket_messages;
DROP POLICY IF EXISTS "Admins can create messages" ON ticket_messages;

CREATE POLICY "Users can view own ticket messages"
  ON ticket_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = ticket_messages.ticket_id
      AND support_tickets.user_id = auth.uid()
    )
    AND is_internal = FALSE
  );

CREATE POLICY "Users can create messages on own tickets"
  ON ticket_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = ticket_messages.ticket_id
      AND support_tickets.user_id = auth.uid()
    )
    AND is_internal = FALSE
  );

CREATE POLICY "Admins can view all messages"
  ON ticket_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can create messages"
  ON ticket_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 3. CANNED RESPONSES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS ticket_canned_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ticket_canned_responses ENABLE ROW LEVEL SECURITY;

-- Policy: Admins only (drop existing first)
DROP POLICY IF EXISTS "Admins can manage canned responses" ON ticket_canned_responses;

CREATE POLICY "Admins can manage canned responses"
  ON ticket_canned_responses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 4. HELPER FUNCTIONS
-- =====================================================

-- Function to auto-update ticket timestamp
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_ticket_timestamp ON support_tickets;

CREATE TRIGGER set_ticket_timestamp
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_timestamp();

-- Function to log ticket creation activity
CREATE OR REPLACE FUNCTION log_ticket_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Log to admin activity feed
  INSERT INTO admin_live_activity (user_id, activity_type, activity_data, severity)
  VALUES (
    NEW.user_id,
    'support_ticket_created',
    jsonb_build_object(
      'ticket_id', NEW.id,
      'subject', NEW.subject,
      'priority', NEW.priority,
      'category', NEW.category
    ),
    CASE 
      WHEN NEW.priority = 'urgent' THEN 'critical'
      WHEN NEW.priority = 'high' THEN 'warning'
      ELSE 'info'
    END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_new_ticket ON support_tickets;

CREATE TRIGGER log_new_ticket
  AFTER INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION log_ticket_activity();

-- =====================================================
-- 5. VIEWS FOR DASHBOARD
-- =====================================================

-- View: Ticket queue with user details
CREATE OR REPLACE VIEW ticket_queue AS
SELECT 
  t.id,
  t.user_id,
  u.email,
  p.full_name,
  t.subject,
  t.description,
  t.status,
  t.priority,
  t.category,
  t.assigned_to,
  admin.full_name as assigned_to_name,
  t.context,
  t.created_at,
  t.updated_at,
  t.resolved_at,
  COUNT(tm.id) as message_count,
  MAX(tm.created_at) as last_message_at
FROM support_tickets t
LEFT JOIN auth.users u ON u.id = t.user_id
LEFT JOIN profiles p ON p.id = t.user_id
LEFT JOIN profiles admin ON admin.id = t.assigned_to
LEFT JOIN ticket_messages tm ON tm.ticket_id = t.id
GROUP BY t.id, u.email, p.full_name, admin.full_name
ORDER BY 
  CASE t.priority
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  t.created_at DESC;

-- =====================================================
-- 6. SEED DATA - CANNED RESPONSES
-- =====================================================

INSERT INTO ticket_canned_responses (title, content, category)
VALUES 
  (
    'Welcome Response',
    'Thank you for contacting EatPal support! We''ve received your ticket and will respond within 24 hours. In the meantime, check out our Help Center for common questions.',
    'general'
  ),
  (
    'Meal Plan Help',
    'To create a meal plan, go to the Planner page and click "Generate Meal Plan". You can customize it based on your child''s preferences and dietary needs. Need more help? Let me know!',
    'question'
  ),
  (
    'Subscription Issue',
    'I''m sorry you''re experiencing subscription issues. I''ve escalated this to our billing team. They''ll reach out within 4 hours to resolve this for you.',
    'billing'
  ),
  (
    'Bug Report Received',
    'Thank you for reporting this bug! Our development team has been notified and will investigate. We''ll update you as soon as we have more information.',
    'bug'
  ),
  (
    'Feature Request Received',
    'Thanks for the feature suggestion! We''ve added it to our roadmap. We''ll keep you updated on progress. Your feedback helps make EatPal better!',
    'feature_request'
  )
ON CONFLICT DO NOTHING;

-- =====================================================
-- 7. GRANT PERMISSIONS
-- =====================================================

GRANT ALL ON support_tickets TO service_role;
GRANT ALL ON ticket_messages TO service_role;
GRANT ALL ON ticket_canned_responses TO service_role;

GRANT EXECUTE ON FUNCTION update_ticket_timestamp TO service_role;
GRANT EXECUTE ON FUNCTION log_ticket_activity TO service_role;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

COMMENT ON TABLE support_tickets IS 'Support tickets submitted by users';
COMMENT ON TABLE ticket_messages IS 'Messages/replies on support tickets';
COMMENT ON TABLE ticket_canned_responses IS 'Pre-written response templates for admins';



-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251013140000_support_tickets.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 50: 20251013150000_blog_uniqueness_tracking.sql
-- ============================================

-- Blog Title Bank and Uniqueness Tracking System
-- This migration adds comprehensive duplicate prevention and title management

-- Table to store available blog titles from Blog_Titles.md
CREATE TABLE IF NOT EXISTS blog_title_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL UNIQUE,
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  variations_generated INTEGER DEFAULT 0,
  is_locked BOOLEAN DEFAULT FALSE, -- prevent use if needed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table to track content similarity and prevent duplicates
CREATE TABLE IF NOT EXISTS blog_content_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  title_fingerprint TEXT NOT NULL, -- normalized title for comparison
  content_hash TEXT NOT NULL, -- hash of core content
  topic_keywords TEXT[], -- extracted keywords
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table to track AI generation history for better uniqueness
CREATE TABLE IF NOT EXISTS blog_generation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  keywords TEXT[],
  tone_used TEXT,
  perspective_used TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_title_bank_times_used ON blog_title_bank(times_used);
CREATE INDEX IF NOT EXISTS idx_title_bank_last_used ON blog_title_bank(last_used_at);
CREATE INDEX IF NOT EXISTS idx_content_tracking_post ON blog_content_tracking(post_id);
CREATE INDEX IF NOT EXISTS idx_content_tracking_hash ON blog_content_tracking(content_hash);
CREATE INDEX IF NOT EXISTS idx_content_tracking_fingerprint ON blog_content_tracking(title_fingerprint);
CREATE INDEX IF NOT EXISTS idx_generation_history_date ON blog_generation_history(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_history_keywords ON blog_generation_history USING gin(keywords);

-- Function to normalize title for comparison
CREATE OR REPLACE FUNCTION normalize_title(title_text TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Remove punctuation, convert to lowercase, remove extra spaces
  RETURN lower(regexp_replace(regexp_replace(title_text, '[^a-zA-Z0-9\s]', '', 'g'), '\s+', ' ', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate content hash
CREATE OR REPLACE FUNCTION generate_content_hash(content_text TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Create a hash of the first 1000 characters (core content)
  RETURN md5(substring(regexp_replace(content_text, '\s+', '', 'g'), 1, 1000));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to extract keywords from text
CREATE OR REPLACE FUNCTION extract_keywords(text_content TEXT)
RETURNS TEXT[] AS $$
DECLARE
  words TEXT[];
  cleaned_text TEXT;
BEGIN
  -- Basic keyword extraction (could be enhanced with NLP)
  cleaned_text := lower(regexp_replace(text_content, '[^a-zA-Z\s]', ' ', 'g'));
  words := regexp_split_to_array(cleaned_text, '\s+');
  
  -- Return unique words longer than 4 characters (simple keyword filter)
  RETURN ARRAY(
    SELECT DISTINCT word 
    FROM unnest(words) AS word 
    WHERE length(word) > 4 
    ORDER BY word
    LIMIT 50
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if title is too similar to existing posts
CREATE OR REPLACE FUNCTION check_title_similarity(new_title TEXT, threshold NUMERIC DEFAULT 0.8)
RETURNS TABLE (
  similar_post_id UUID,
  similar_title TEXT,
  similarity_score NUMERIC
) AS $$
DECLARE
  normalized_new_title TEXT;
BEGIN
  normalized_new_title := normalize_title(new_title);
  
  RETURN QUERY
  SELECT 
    bp.id,
    bp.title,
    (1.0 - (levenshtein(normalize_title(bp.title), normalized_new_title)::NUMERIC / 
            GREATEST(length(normalize_title(bp.title)), length(normalized_new_title)))) as similarity
  FROM blog_posts bp
  WHERE (1.0 - (levenshtein(normalize_title(bp.title), normalized_new_title)::NUMERIC / 
                GREATEST(length(normalize_title(bp.title)), length(normalized_new_title)))) > threshold
  ORDER BY similarity DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Function to check content similarity
CREATE OR REPLACE FUNCTION check_content_similarity(new_content_hash TEXT)
RETURNS TABLE (
  post_id UUID,
  post_title TEXT,
  is_duplicate BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bp.id,
    bp.title,
    (bct.content_hash = new_content_hash) as is_duplicate
  FROM blog_content_tracking bct
  JOIN blog_posts bp ON bct.post_id = bp.id
  WHERE bct.content_hash = new_content_hash;
END;
$$ LANGUAGE plpgsql;

-- Function to get unused or least-used title from bank
CREATE OR REPLACE FUNCTION get_next_blog_title()
RETURNS TABLE (
  title TEXT,
  times_used INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT btb.title, btb.times_used
  FROM blog_title_bank btb
  WHERE btb.is_locked = FALSE
  ORDER BY 
    btb.times_used ASC,
    btb.last_used_at ASC NULLS FIRST,
    RANDOM()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get diverse title suggestions
CREATE OR REPLACE FUNCTION get_diverse_title_suggestions(count INTEGER DEFAULT 5)
RETURNS TABLE (
  title TEXT,
  times_used INTEGER,
  last_used_days_ago INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    btb.title,
    btb.times_used,
    CASE 
      WHEN btb.last_used_at IS NULL THEN NULL
      ELSE EXTRACT(DAY FROM NOW() - btb.last_used_at)::INTEGER
    END as last_used_days_ago
  FROM blog_title_bank btb
  WHERE btb.is_locked = FALSE
  ORDER BY 
    btb.times_used ASC,
    btb.last_used_at ASC NULLS FIRST,
    RANDOM()
  LIMIT count;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically track blog post content on insert/update
CREATE OR REPLACE FUNCTION track_blog_content()
RETURNS TRIGGER AS $$
DECLARE
  title_fp TEXT;
  content_h TEXT;
  keywords TEXT[];
BEGIN
  title_fp := normalize_title(NEW.title);
  content_h := generate_content_hash(NEW.content);
  keywords := extract_keywords(NEW.content || ' ' || NEW.title);
  
  -- Insert or update content tracking
  INSERT INTO blog_content_tracking (
    post_id,
    title_fingerprint,
    content_hash,
    topic_keywords
  ) VALUES (
    NEW.id,
    title_fp,
    content_h,
    keywords
  )
  ON CONFLICT (post_id) DO UPDATE SET
    title_fingerprint = title_fp,
    content_hash = content_h,
    topic_keywords = keywords;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS track_blog_content_trigger ON blog_posts;
CREATE TRIGGER track_blog_content_trigger
  AFTER INSERT OR UPDATE OF title, content ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION track_blog_content();

-- Trigger to update title bank when post is created
CREATE OR REPLACE FUNCTION update_title_bank_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- Update title bank if this title exists there
  UPDATE blog_title_bank
  SET 
    times_used = times_used + 1,
    last_used_at = NOW()
  WHERE normalize_title(title) = normalize_title(NEW.title);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_title_bank_usage_trigger ON blog_posts;
CREATE TRIGGER update_title_bank_usage_trigger
  AFTER INSERT ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_title_bank_usage();

-- Function to populate title bank from JSON array
CREATE OR REPLACE FUNCTION populate_title_bank(titles_json JSONB)
RETURNS INTEGER AS $$
DECLARE
  title_text TEXT;
  inserted_count INTEGER := 0;
BEGIN
  FOR title_text IN SELECT jsonb_array_elements_text(titles_json)
  LOOP
    INSERT INTO blog_title_bank (title)
    VALUES (title_text)
    ON CONFLICT (title) DO NOTHING;
    
    IF FOUND THEN
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;
  
  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get blog generation insights
CREATE OR REPLACE FUNCTION get_blog_generation_insights()
RETURNS TABLE (
  total_titles INTEGER,
  unused_titles INTEGER,
  most_used_title TEXT,
  most_used_count INTEGER,
  recent_topics TEXT[],
  recommended_next_topics TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_titles,
    COUNT(*) FILTER (WHERE times_used = 0)::INTEGER as unused_titles,
    (SELECT title FROM blog_title_bank ORDER BY times_used DESC LIMIT 1) as most_used_title,
    (SELECT times_used FROM blog_title_bank ORDER BY times_used DESC LIMIT 1) as most_used_count,
    (
      SELECT ARRAY_AGG(DISTINCT unnest_val)
      FROM (
        SELECT unnest(keywords) as unnest_val
        FROM blog_generation_history
        WHERE generated_at > NOW() - INTERVAL '30 days'
        LIMIT 100
      ) subq
      LIMIT 20
    ) as recent_topics,
    (
      SELECT ARRAY_AGG(title)
      FROM (
        SELECT title 
        FROM blog_title_bank 
        WHERE times_used = 0 
        ORDER BY RANDOM() 
        LIMIT 10
      ) unused
    ) as recommended_next_topics;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE blog_title_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_content_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_generation_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for title bank
DROP POLICY IF EXISTS "Admins can manage title bank" ON blog_title_bank;
CREATE POLICY "Admins can manage title bank"
  ON blog_title_bank FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can view title bank" ON blog_title_bank;
CREATE POLICY "Admins can view title bank"
  ON blog_title_bank FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- RLS Policies for content tracking
DROP POLICY IF EXISTS "Admins can view content tracking" ON blog_content_tracking;
CREATE POLICY "Admins can view content tracking"
  ON blog_content_tracking FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- RLS Policies for generation history
DROP POLICY IF EXISTS "Admins can manage generation history" ON blog_generation_history;
CREATE POLICY "Admins can manage generation history"
  ON blog_generation_history FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Add comment explaining the system
COMMENT ON TABLE blog_title_bank IS 'Stores available blog titles and tracks usage to prevent repetition';
COMMENT ON TABLE blog_content_tracking IS 'Tracks content similarity to detect duplicate or near-duplicate posts';
COMMENT ON TABLE blog_generation_history IS 'Logs AI generation parameters for better uniqueness over time';
COMMENT ON FUNCTION get_next_blog_title IS 'Returns the least-used or unused title for next blog generation';
COMMENT ON FUNCTION check_title_similarity IS 'Checks if a proposed title is too similar to existing posts';
COMMENT ON FUNCTION get_blog_generation_insights IS 'Provides insights on blog generation patterns and suggestions';



-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251013150000_blog_uniqueness_tracking.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 51: 20251013151257_424570f3-724f-4764-95f4-d3c9e69fd802.sql
-- ============================================

-- Create referral program configuration table
CREATE TABLE public.referral_program_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier TEXT NOT NULL DEFAULT 'standard', -- 'standard', 'professional', 'enterprise'
  
  -- Referrer rewards
  referrer_reward_type TEXT NOT NULL DEFAULT 'free_months', -- 'free_months', 'percent_off', 'dollar_off'
  referrer_reward_value NUMERIC NOT NULL DEFAULT 1,
  referrer_reward_duration_months INTEGER DEFAULT 1, -- for free_months or percent_off
  
  -- Referred user rewards
  referred_reward_type TEXT NOT NULL DEFAULT 'free_months',
  referred_reward_value NUMERIC NOT NULL DEFAULT 1,
  referred_reward_duration_months INTEGER DEFAULT 1,
  
  -- Program settings
  is_active BOOLEAN DEFAULT true,
  min_referrals_for_reward INTEGER DEFAULT 1,
  max_rewards_per_user INTEGER DEFAULT NULL, -- NULL = unlimited
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(tier)
);

-- Create referral codes table
CREATE TABLE public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL UNIQUE,
  
  -- Analytics
  clicks INTEGER DEFAULT 0,
  signups INTEGER DEFAULT 0,
  successful_referrals INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Create referrals tracking table
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  referral_code TEXT NOT NULL,
  
  -- Status tracking
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'rewarded', 'cancelled'
  completed_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ,
  
  -- UTM tracking
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(referred_user_id)
);

-- Create referral rewards table
CREATE TABLE public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  referral_id UUID REFERENCES public.referrals(id) ON DELETE CASCADE,
  
  reward_type TEXT NOT NULL, -- 'free_months', 'percent_off', 'dollar_off'
  reward_value NUMERIC NOT NULL,
  reward_duration_months INTEGER,
  
  -- Status
  status TEXT DEFAULT 'pending', -- 'pending', 'applied', 'expired', 'cancelled'
  applied_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  
  -- Metadata
  user_tier TEXT, -- tier at time of reward
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.referral_program_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referral_program_config
CREATE POLICY "Admins can manage referral config"
  ON public.referral_program_config
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view active referral config"
  ON public.referral_program_config
  FOR SELECT
  USING (is_active = true);

-- RLS Policies for referral_codes
CREATE POLICY "Users can view their own referral code"
  ON public.referral_codes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own referral code"
  ON public.referral_codes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update referral code stats"
  ON public.referral_codes
  FOR UPDATE
  USING (true);

CREATE POLICY "Admins can view all referral codes"
  ON public.referral_codes
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for referrals
CREATE POLICY "Users can view their referrals"
  ON public.referrals
  FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

CREATE POLICY "System can create referrals"
  ON public.referrals
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update referrals"
  ON public.referrals
  FOR UPDATE
  USING (true);

CREATE POLICY "Admins can view all referrals"
  ON public.referrals
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for referral_rewards
CREATE POLICY "Users can view their own rewards"
  ON public.referral_rewards
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can manage rewards"
  ON public.referral_rewards
  FOR ALL
  USING (true);

CREATE POLICY "Admins can view all rewards"
  ON public.referral_rewards
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- Create function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 8 character code
    new_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
    
    -- Check if code exists
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = new_code) INTO code_exists;
    
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN new_code;
END;
$$;

-- Create function to auto-generate referral code for new users
CREATE OR REPLACE FUNCTION create_user_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO referral_codes (user_id, code)
  VALUES (NEW.id, generate_referral_code());
  
  RETURN NEW;
END;
$$;

-- Trigger to create referral code on user signup
CREATE TRIGGER on_user_created_create_referral_code
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_referral_code();

-- Insert default configurations
INSERT INTO referral_program_config (tier, referrer_reward_type, referrer_reward_value, referred_reward_type, referred_reward_value)
VALUES 
  ('standard', 'free_months', 1, 'free_months', 1),
  ('professional', 'free_months', 1, 'percent_off', 20),
  ('enterprise', 'free_months', 2, 'percent_off', 25);

-- Create indexes for performance
CREATE INDEX idx_referral_codes_user_id ON referral_codes(user_id);
CREATE INDEX idx_referral_codes_code ON referral_codes(code);
CREATE INDEX idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred_user_id ON referrals(referred_user_id);
CREATE INDEX idx_referrals_status ON referrals(status);
CREATE INDEX idx_referral_rewards_user_id ON referral_rewards(user_id);
CREATE INDEX idx_referral_rewards_status ON referral_rewards(status);

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251013151257_424570f3-724f-4764-95f4-d3c9e69fd802.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 52: 20251013151526_580c4971-9431-4611-85fc-128e1a38384a.sql
-- ============================================

-- Add subscription_tier to profiles if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'profiles' AND column_name = 'subscription_tier') THEN
    ALTER TABLE profiles ADD COLUMN subscription_tier TEXT DEFAULT 'standard';
  END IF;
END $$;

-- Fix the referrals foreign key to profiles
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_referred_user_id_fkey;
ALTER TABLE referrals ADD CONSTRAINT referrals_referred_user_id_fkey 
  FOREIGN KEY (referred_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251013151526_580c4971-9431-4611-85fc-128e1a38384a.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 53: 20251013152646_d3831937-3780-46d0-8181-ea66061ae2cf.sql
-- ============================================

-- Create waitlist table
CREATE TABLE public.waitlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  referral_source TEXT,
  utm_campaign TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notified_at TIMESTAMP WITH TIME ZONE,
  converted_to_user BOOLEAN DEFAULT false,
  user_id UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Admins can view all waitlist entries
CREATE POLICY "Admins can manage waitlist"
  ON public.waitlist
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Anyone can insert waitlist entries
CREATE POLICY "Anyone can join waitlist"
  ON public.waitlist
  FOR INSERT
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_waitlist_email ON public.waitlist(email);
CREATE INDEX idx_waitlist_status ON public.waitlist(status);
CREATE INDEX idx_waitlist_joined_at ON public.waitlist(joined_at DESC);

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251013152646_d3831937-3780-46d0-8181-ea66061ae2cf.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 54: 20251013160000_email_sequences.sql
-- ============================================

-- Email Sequences System
-- Allows creation of automated, multi-step email sequences triggered by events

-- Create email sequences table
CREATE TABLE IF NOT EXISTS email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL, -- 'lead_created', 'trial_start', 'trial_ending', 'subscription_active', 'subscription_canceled'
  trigger_conditions JSONB DEFAULT '{}'::jsonb, -- Optional: conditions like source='contact_form'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email sequence steps table
CREATE TABLE IF NOT EXISTS email_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,
  delay_hours INTEGER NOT NULL DEFAULT 0,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  condition_rules JSONB DEFAULT '{}'::jsonb, -- Optional: send only if conditions met
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sequence_id, step_order)
);

-- Create user enrollment tracking table
CREATE TABLE IF NOT EXISTS user_email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(user_id, sequence_id),
  CHECK (user_id IS NOT NULL OR lead_id IS NOT NULL)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_sequences_trigger ON email_sequences(trigger_event, is_active);
CREATE INDEX IF NOT EXISTS idx_email_sequence_steps_sequence ON email_sequence_steps(sequence_id, step_order);
CREATE INDEX IF NOT EXISTS idx_user_email_sequences_user ON user_email_sequences(user_id, sequence_id);
CREATE INDEX IF NOT EXISTS idx_user_email_sequences_lead ON user_email_sequences(lead_id, sequence_id);
CREATE INDEX IF NOT EXISTS idx_user_email_sequences_enrolled ON user_email_sequences(enrolled_at) WHERE completed_at IS NULL AND canceled_at IS NULL;

-- Enable RLS
ALTER TABLE email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_email_sequences ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Admin only)
CREATE POLICY "Admins can manage email sequences"
  ON email_sequences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage sequence steps"
  ON email_sequence_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view enrollments"
  ON user_email_sequences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Function to enroll user/lead in a sequence
CREATE OR REPLACE FUNCTION enroll_in_email_sequence(
  p_user_id UUID DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL,
  p_sequence_id UUID DEFAULT NULL,
  p_trigger_event TEXT DEFAULT NULL,
  p_trigger_conditions JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_sequence_id UUID;
  v_enrollment_id UUID;
  v_existing_enrollment UUID;
BEGIN
  -- Find sequence by ID or by trigger event
  IF p_sequence_id IS NOT NULL THEN
    v_sequence_id := p_sequence_id;
  ELSIF p_trigger_event IS NOT NULL THEN
    SELECT id INTO v_sequence_id
    FROM email_sequences
    WHERE trigger_event = p_trigger_event
      AND is_active = TRUE
      AND (
        trigger_conditions = '{}'::jsonb
        OR trigger_conditions @> p_trigger_conditions
      )
    LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Must provide either sequence_id or trigger_event';
  END IF;

  IF v_sequence_id IS NULL THEN
    RAISE NOTICE 'No matching sequence found for trigger: %', p_trigger_event;
    RETURN NULL;
  END IF;

  -- Check if already enrolled
  SELECT id INTO v_existing_enrollment
  FROM user_email_sequences
  WHERE (
    (p_user_id IS NOT NULL AND user_id = p_user_id) OR
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id)
  )
  AND sequence_id = v_sequence_id
  AND canceled_at IS NULL;

  IF v_existing_enrollment IS NOT NULL THEN
    RAISE NOTICE 'Already enrolled in sequence: %', v_sequence_id;
    RETURN v_existing_enrollment;
  END IF;

  -- Create enrollment
  INSERT INTO user_email_sequences (user_id, lead_id, sequence_id, current_step, enrolled_at)
  VALUES (p_user_id, p_lead_id, v_sequence_id, 0, NOW())
  RETURNING id INTO v_enrollment_id;

  -- Schedule first email immediately
  PERFORM schedule_next_sequence_email(v_enrollment_id);

  RETURN v_enrollment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to schedule next email in sequence
CREATE OR REPLACE FUNCTION schedule_next_sequence_email(p_enrollment_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_enrollment RECORD;
  v_step RECORD;
  v_next_step_order INTEGER;
  v_send_at TIMESTAMPTZ;
  v_email_address TEXT;
  v_user_name TEXT;
  v_final_subject TEXT;
  v_final_html TEXT;
  v_final_text TEXT;
BEGIN
  -- Get enrollment details
  SELECT * INTO v_enrollment
  FROM user_email_sequences
  WHERE id = p_enrollment_id
    AND completed_at IS NULL
    AND canceled_at IS NULL;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Get next step
  v_next_step_order := v_enrollment.current_step + 1;

  SELECT * INTO v_step
  FROM email_sequence_steps
  WHERE sequence_id = v_enrollment.sequence_id
    AND step_order = v_next_step_order;

  IF NOT FOUND THEN
    -- No more steps, mark sequence as completed
    UPDATE user_email_sequences
    SET completed_at = NOW()
    WHERE id = p_enrollment_id;
    RETURN TRUE;
  END IF;

  -- Calculate send time
  v_send_at := v_enrollment.enrolled_at +
               (v_step.delay_days || ' days')::INTERVAL +
               (v_step.delay_hours || ' hours')::INTERVAL;

  -- Get recipient email and name
  IF v_enrollment.user_id IS NOT NULL THEN
    SELECT email INTO v_email_address
    FROM auth.users
    WHERE id = v_enrollment.user_id;

    SELECT full_name INTO v_user_name
    FROM profiles
    WHERE id = v_enrollment.user_id;
  ELSIF v_enrollment.lead_id IS NOT NULL THEN
    SELECT email, full_name INTO v_email_address, v_user_name
    FROM leads
    WHERE id = v_enrollment.lead_id;
  END IF;

  IF v_email_address IS NULL THEN
    RAISE EXCEPTION 'No email address found for enrollment: %', p_enrollment_id;
  END IF;

  -- Replace template variables
  v_final_subject := replace_email_variables(v_step.subject, v_user_name, v_enrollment.metadata);
  v_final_html := replace_email_variables(v_step.html_body, v_user_name, v_enrollment.metadata);
  v_final_text := replace_email_variables(v_step.text_body, v_user_name, v_enrollment.metadata);

  -- Queue email
  INSERT INTO email_queue (
    to_email,
    subject,
    html_body,
    text_body,
    scheduled_for,
    status,
    priority,
    metadata
  ) VALUES (
    v_email_address,
    v_final_subject,
    v_final_html,
    v_final_text,
    v_send_at,
    'pending',
    5,
    jsonb_build_object(
      'enrollment_id', p_enrollment_id,
      'sequence_id', v_enrollment.sequence_id,
      'step_order', v_next_step_order
    )
  );

  -- Update current step
  UPDATE user_email_sequences
  SET current_step = v_next_step_order
  WHERE id = p_enrollment_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to replace template variables
CREATE OR REPLACE FUNCTION replace_email_variables(
  p_text TEXT,
  p_user_name TEXT,
  p_metadata JSONB
)
RETURNS TEXT AS $$
DECLARE
  v_result TEXT;
  v_first_name TEXT;
BEGIN
  v_result := p_text;

  -- Extract first name
  IF p_user_name IS NOT NULL THEN
    v_first_name := split_part(p_user_name, ' ', 1);
  ELSE
    v_first_name := 'there';
  END IF;

  -- Replace common variables
  v_result := replace(v_result, '{{first_name}}', v_first_name);
  v_result := replace(v_result, '{{full_name}}', COALESCE(p_user_name, 'there'));

  -- Replace metadata variables if present
  IF p_metadata IS NOT NULL THEN
    -- This is simplified - in production you'd iterate through metadata keys
    v_result := regexp_replace(v_result, '\{\{([^}]+)\}\}', COALESCE(p_metadata->>'\1', ''), 'g');
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function to auto-enroll on events
CREATE OR REPLACE FUNCTION trigger_email_sequences()
RETURNS TRIGGER AS $$
DECLARE
  v_trigger_event TEXT;
  v_user_id UUID;
  v_lead_id UUID;
BEGIN
  -- Determine trigger event based on table and operation
  IF TG_TABLE_NAME = 'leads' AND TG_OP = 'INSERT' THEN
    v_trigger_event := 'lead_created';
    v_lead_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'user_subscriptions' AND TG_OP = 'INSERT' AND NEW.status = 'trialing' THEN
    v_trigger_event := 'trial_start';
    v_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'user_subscriptions' AND TG_OP = 'UPDATE' AND OLD.status = 'trialing' AND NEW.status = 'active' THEN
    v_trigger_event := 'subscription_active';
    v_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'user_subscriptions' AND TG_OP = 'UPDATE' AND OLD.status != 'canceled' AND NEW.status = 'canceled' THEN
    v_trigger_event := 'subscription_canceled';
    v_user_id := NEW.user_id;
  ELSE
    RETURN NEW;
  END IF;

  -- Enroll in sequence
  PERFORM enroll_in_email_sequence(
    p_user_id := v_user_id,
    p_lead_id := v_lead_id,
    p_trigger_event := v_trigger_event
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_email_sequences_on_lead ON leads;
CREATE TRIGGER trigger_email_sequences_on_lead
  AFTER INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION trigger_email_sequences();

DROP TRIGGER IF EXISTS trigger_email_sequences_on_subscription ON user_subscriptions;
CREATE TRIGGER trigger_email_sequences_on_subscription
  AFTER INSERT OR UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_email_sequences();

-- Insert default email sequences
INSERT INTO email_sequences (name, description, trigger_event, trigger_conditions, is_active)
VALUES
  (
    'Contact Form Welcome',
    'Welcome email sequence for contact form submissions',
    'lead_created',
    '{"source": "contact_form"}'::jsonb,
    TRUE
  ),
  (
    'Newsletter Welcome',
    'Welcome email sequence for newsletter subscribers',
    'lead_created',
    '{"source": "newsletter"}'::jsonb,
    TRUE
  ),
  (
    'Trial Onboarding',
    'Onboarding email sequence for trial users',
    'trial_start',
    '{}'::jsonb,
    TRUE
  ),
  (
    'New Customer Welcome',
    'Welcome sequence for new paying customers',
    'subscription_active',
    '{}'::jsonb,
    TRUE
  ),
  (
    'Win-back Campaign',
    'Win-back sequence for canceled subscriptions',
    'subscription_canceled',
    '{}'::jsonb,
    TRUE
  )
ON CONFLICT DO NOTHING;

-- Insert email sequence steps for Contact Form Welcome
DO $$
DECLARE
  v_sequence_id UUID;
BEGIN
  SELECT id INTO v_sequence_id FROM email_sequences WHERE name = 'Contact Form Welcome';

  IF v_sequence_id IS NOT NULL THEN
    INSERT INTO email_sequence_steps (sequence_id, step_order, delay_days, delay_hours, subject, html_body, text_body)
    VALUES
      (
        v_sequence_id, 1, 0, 0,
        'Thanks for reaching out, {{first_name}}!',
        '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #10b981;">Thanks for contacting EatPal!</h2><p>Hi {{first_name}},</p><p>We received your message and our team will get back to you within 24-48 hours.</p><p>In the meantime, did you know you can start using EatPal right away with a free trial?</p><div style="text-align: center; margin: 30px 0;"><a href="https://tryeatpal.com/auth" style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Start Free Trial</a></div><p>Best regards,<br>The EatPal Team</p></div>',
        'Hi {{first_name}},\n\nWe received your message and will get back to you within 24-48 hours.\n\nStart your free trial: https://tryeatpal.com/auth\n\nBest regards,\nThe EatPal Team'
      ),
      (
        v_sequence_id, 2, 1, 0,
        'Here''s how EatPal helps families like yours',
        '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #10b981;">Making mealtime easier for picky eaters</h2><p>Hi {{first_name}},</p><p>While you wait to hear back from us, here''s how EatPal helps families with picky eaters:</p><ul style="line-height: 1.8;"><li><strong>Personalized meal planning</strong> based on your child''s preferences</li><li><strong>Food tracking</strong> to monitor progress and patterns</li><li><strong>Evidence-based strategies</strong> like food chaining</li><li><strong>Progress monitoring</strong> with visual charts</li></ul><p>Over 1,000 families are already using EatPal to reduce mealtime stress.</p><div style="text-align: center; margin: 30px 0;"><a href="https://tryeatpal.com/auth" style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Try It Free</a></div><p>Questions? Just reply to this email.</p><p>Best regards,<br>The EatPal Team</p></div>',
        'Hi {{first_name}},\n\nHere''s how EatPal helps families:\n- Personalized meal planning\n- Food tracking\n- Evidence-based strategies\n- Progress monitoring\n\nTry it free: https://tryeatpal.com/auth\n\nBest regards,\nThe EatPal Team'
      ),
      (
        v_sequence_id, 3, 3, 0,
        'Ready to try EatPal, {{first_name}}?',
        '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #10b981;">Start your free trial today</h2><p>Hi {{first_name}},</p><p>We wanted to follow up on your inquiry about EatPal.</p><p>Starting is easy:<br>1. Create your free account<br>2. Add your child''s profile<br>3. Start tracking meals</p><p>No credit card required for your free trial!</p><div style="text-align: center; margin: 30px 0;"><a href="https://tryeatpal.com/auth" style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Get Started Free</a></div><p>Questions? We''re here to help.</p><p>Best regards,<br>The EatPal Team</p></div>',
        'Hi {{first_name}},\n\nReady to try EatPal?\n\n1. Create account\n2. Add child profile\n3. Start tracking\n\nNo credit card required!\n\nhttps://tryeatpal.com/auth\n\nBest regards,\nThe EatPal Team'
      );
  END IF;
END $$;

COMMENT ON TABLE email_sequences IS 'Automated email sequences triggered by events';
COMMENT ON TABLE email_sequence_steps IS 'Individual steps/emails in a sequence';
COMMENT ON TABLE user_email_sequences IS 'Tracks user enrollment in email sequences';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251013160000_email_sequences.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 55: 20251013170000_enhanced_lead_scoring.sql
-- ============================================

-- Enhanced Lead Scoring System
-- Expands on existing scoring to include behavioral triggers and automation

-- Create lead score history table for tracking changes
CREATE TABLE IF NOT EXISTS lead_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  old_score INTEGER NOT NULL,
  new_score INTEGER NOT NULL,
  score_delta INTEGER GENERATED ALWAYS AS (new_score - old_score) STORED,
  reason TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_score_history_lead ON lead_score_history(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_score_history_date ON lead_score_history(created_at DESC);

-- Enable RLS
ALTER TABLE lead_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view score history"
  ON lead_score_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Enhanced lead scoring function with behavioral triggers
CREATE OR REPLACE FUNCTION calculate_enhanced_lead_score(p_lead_id UUID)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
  lead_record RECORD;
  interaction_count INTEGER;
  email_opens INTEGER;
  email_clicks INTEGER;
  days_since_contact INTEGER;
  pricing_views INTEGER;
BEGIN
  -- Get lead record
  SELECT * INTO lead_record FROM leads WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Base score for contact information (35 points max)
  IF lead_record.email IS NOT NULL THEN
    score := score + 10;
  END IF;

  IF lead_record.full_name IS NOT NULL THEN
    score := score + 10;
  END IF;

  IF lead_record.phone IS NOT NULL THEN
    score := score + 15;
  END IF;

  -- Source quality scoring (25 points max)
  CASE lead_record.source
    WHEN 'referral' THEN score := score + 20;
    WHEN 'trial_signup' THEN score := score + 25;
    WHEN 'paid_ad' THEN score := score + 10;
    WHEN 'organic_search' THEN score := score + 15;
    WHEN 'contact_form' THEN score := score + 12;
    WHEN 'newsletter' THEN score := score + 8;
    ELSE score := score + 5;
  END CASE;

  -- Interaction scoring (30 points max)
  SELECT COUNT(*) INTO interaction_count
  FROM lead_interactions
  WHERE lead_interactions.lead_id = p_lead_id;

  score := score + LEAST(interaction_count * 5, 30);

  -- Email engagement scoring (30 points max)
  SELECT
    COUNT(*) FILTER (WHERE event_type = 'opened'),
    COUNT(*) FILTER (WHERE event_type = 'clicked')
  INTO email_opens, email_clicks
  FROM email_events ee
  JOIN email_queue eq ON eq.id = ee.email_id
  WHERE eq.to_email = lead_record.email;

  score := score + LEAST(email_opens * 5, 15); -- Up to 15 points for opens
  score := score + LEAST(email_clicks * 10, 15); -- Up to 15 points for clicks

  -- Recency bonus (10 points)
  days_since_contact := EXTRACT(DAY FROM NOW() - lead_record.last_contacted_at);

  IF days_since_contact <= 3 THEN
    score := score + 10;
  ELSIF days_since_contact <= 7 THEN
    score := score + 7;
  ELSIF days_since_contact <= 14 THEN
    score := score + 5;
  ELSIF days_since_contact <= 30 THEN
    score := score + 2;
  END IF;

  -- High-intent behavior bonuses
  -- Check for pricing page views (stored in metadata)
  pricing_views := COALESCE((lead_record.metadata->>'pricing_views')::INTEGER, 0);
  IF pricing_views > 0 THEN
    score := score + LEAST(pricing_views * 10, 20);
  END IF;

  -- Check if payment method added but not converted
  IF (lead_record.metadata->>'payment_added')::BOOLEAN = TRUE AND lead_record.status != 'converted' THEN
    score := score + 25;
  END IF;

  -- Check for trial started
  IF (lead_record.metadata->>'trial_started')::BOOLEAN = TRUE THEN
    score := score + 25;
  END IF;

  -- Penalty for long inactivity (after 60 days, start reducing score)
  IF days_since_contact > 60 THEN
    score := score - LEAST((days_since_contact - 60) / 10, 20);
  END IF;

  -- Ensure score stays within bounds
  RETURN GREATEST(LEAST(score, 100), 0);
END;
$$ LANGUAGE plpgsql;

-- Function to log score changes
CREATE OR REPLACE FUNCTION log_score_change(
  p_lead_id UUID,
  p_old_score INTEGER,
  p_new_score INTEGER,
  p_reason TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
BEGIN
  IF p_old_score != p_new_score THEN
    INSERT INTO lead_score_history (lead_id, old_score, new_score, reason, metadata)
    VALUES (p_lead_id, p_old_score, p_new_score, p_reason, p_metadata);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Updated trigger function for lead score with logging
CREATE OR REPLACE FUNCTION update_lead_score_with_logging()
RETURNS TRIGGER AS $$
DECLARE
  old_score INTEGER;
  new_score INTEGER;
BEGIN
  old_score := OLD.score;
  new_score := calculate_enhanced_lead_score(NEW.id);

  NEW.score := new_score;

  -- Log the change
  PERFORM log_score_change(NEW.id, old_score, new_score, 'automatic_update', jsonb_build_object(
    'trigger', TG_OP,
    'changed_fields', CASE
      WHEN TG_OP = 'UPDATE' THEN (
        SELECT jsonb_object_agg(key, value)
        FROM jsonb_each(to_jsonb(NEW)) AS new_data(key, value)
        WHERE to_jsonb(OLD)->>key IS DISTINCT FROM value::text
      )
      ELSE '{}'::jsonb
    END
  ));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace old trigger
DROP TRIGGER IF EXISTS trigger_update_lead_score ON leads;
CREATE TRIGGER trigger_update_lead_score
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_score_with_logging();

-- Also calculate score on insert
CREATE OR REPLACE FUNCTION calculate_initial_lead_score()
RETURNS TRIGGER AS $$
BEGIN
  NEW.score := calculate_enhanced_lead_score(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_initial_lead_score ON leads;
CREATE TRIGGER trigger_initial_lead_score
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION calculate_initial_lead_score();

-- Function to trigger automated actions based on score
CREATE OR REPLACE FUNCTION trigger_score_based_actions()
RETURNS TRIGGER AS $$
DECLARE
  score_threshold_high INTEGER := 80;
  score_threshold_medium INTEGER := 60;
BEGIN
  -- High score actions (80+)
  IF NEW.score >= score_threshold_high AND (OLD.score IS NULL OR OLD.score < score_threshold_high) THEN
    -- Auto-qualify the lead
    IF NEW.status = 'new' THEN
      NEW.status := 'qualified';
    END IF;

    -- Create admin notification (would need admin_notifications table)
    INSERT INTO admin_notifications (
      title,
      message,
      severity,
      category,
      entity_type,
      entity_id
    ) VALUES (
      'High-Score Lead',
      format('Lead %s has reached a score of %s', COALESCE(NEW.full_name, NEW.email), NEW.score),
      'high',
      'leads',
      'lead',
      NEW.id
    ) ON CONFLICT DO NOTHING;

  -- Medium score actions (60-79)
  ELSIF NEW.score >= score_threshold_medium AND NEW.score < score_threshold_high THEN
    -- Add to priority nurture sequence (would trigger via email automation)
    NULL; -- Placeholder for future automation

  -- Low score after 30 days (< 40)
  ELSIF NEW.score < 40 AND EXTRACT(DAY FROM NOW() - NEW.created_at) > 30 THEN
    IF NEW.status = 'new' THEN
      NEW.status := 'unqualified';
    END IF;

    -- Cancel active email sequences
    UPDATE user_email_sequences
    SET canceled_at = NOW()
    WHERE lead_id = NEW.id
      AND canceled_at IS NULL
      AND completed_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_score_actions ON leads;
CREATE TRIGGER trigger_score_actions
  BEFORE UPDATE ON leads
  FOR EACH ROW
  WHEN (OLD.score IS DISTINCT FROM NEW.score)
  EXECUTE FUNCTION trigger_score_based_actions();

-- Function to batch recalculate all lead scores (for admin use)
CREATE OR REPLACE FUNCTION recalculate_all_lead_scores()
RETURNS TABLE (lead_id UUID, old_score INTEGER, new_score INTEGER) AS $$
BEGIN
  RETURN QUERY
  UPDATE leads
  SET score = calculate_enhanced_lead_score(id)
  WHERE score != calculate_enhanced_lead_score(id)
  RETURNING id, score AS old_score, calculate_enhanced_lead_score(id) AS new_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get lead score breakdown (for debugging)
CREATE OR REPLACE FUNCTION get_lead_score_breakdown(p_lead_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  lead_record RECORD;
  interaction_count INTEGER;
  email_opens INTEGER;
  email_clicks INTEGER;
BEGIN
  SELECT * INTO lead_record FROM leads WHERE id = p_lead_id;

  SELECT COUNT(*) INTO interaction_count
  FROM lead_interactions WHERE lead_id = p_lead_id;

  SELECT
    COUNT(*) FILTER (WHERE event_type = 'opened'),
    COUNT(*) FILTER (WHERE event_type = 'clicked')
  INTO email_opens, email_clicks
  FROM email_events ee
  JOIN email_queue eq ON eq.id = ee.email_id
  WHERE eq.to_email = lead_record.email;

  result := jsonb_build_object(
    'base_info', jsonb_build_object(
      'has_email', lead_record.email IS NOT NULL,
      'has_name', lead_record.full_name IS NOT NULL,
      'has_phone', lead_record.phone IS NOT NULL,
      'points', CASE
        WHEN lead_record.email IS NOT NULL THEN 10 ELSE 0
      END + CASE
        WHEN lead_record.full_name IS NOT NULL THEN 10 ELSE 0
      END + CASE
        WHEN lead_record.phone IS NOT NULL THEN 15 ELSE 0
      END
    ),
    'source_quality', jsonb_build_object(
      'source', lead_record.source,
      'points', CASE lead_record.source
        WHEN 'referral' THEN 20
        WHEN 'trial_signup' THEN 25
        WHEN 'paid_ad' THEN 10
        WHEN 'organic_search' THEN 15
        WHEN 'contact_form' THEN 12
        WHEN 'newsletter' THEN 8
        ELSE 5
      END
    ),
    'interactions', jsonb_build_object(
      'count', interaction_count,
      'points', LEAST(interaction_count * 5, 30)
    ),
    'email_engagement', jsonb_build_object(
      'opens', email_opens,
      'clicks', email_clicks,
      'points', LEAST(email_opens * 5, 15) + LEAST(email_clicks * 10, 15)
    ),
    'recency', jsonb_build_object(
      'days_since_contact', EXTRACT(DAY FROM NOW() - lead_record.last_contacted_at),
      'points', CASE
        WHEN EXTRACT(DAY FROM NOW() - lead_record.last_contacted_at) <= 3 THEN 10
        WHEN EXTRACT(DAY FROM NOW() - lead_record.last_contacted_at) <= 7 THEN 7
        WHEN EXTRACT(DAY FROM NOW() - lead_record.last_contacted_at) <= 14 THEN 5
        WHEN EXTRACT(DAY FROM NOW() - lead_record.last_contacted_at) <= 30 THEN 2
        ELSE 0
      END
    ),
    'current_score', lead_record.score,
    'calculated_score', calculate_enhanced_lead_score(p_lead_id)
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE lead_score_history IS 'Tracks historical changes to lead scores for audit and analysis';
COMMENT ON FUNCTION calculate_enhanced_lead_score IS 'Enhanced scoring algorithm including behavioral signals';
COMMENT ON FUNCTION get_lead_score_breakdown IS 'Returns detailed breakdown of how a lead score is calculated';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251013170000_enhanced_lead_scoring.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 56: 20251013172257_e84cfccc-4de5-4580-b63b-7e78c19590df.sql
-- ============================================

-- Create store_layouts table
CREATE TABLE IF NOT EXISTS public.store_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  household_id UUID,
  name TEXT NOT NULL,
  address TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create store_aisles table
CREATE TABLE IF NOT EXISTS public.store_aisles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_layout_id UUID NOT NULL REFERENCES public.store_layouts(id) ON DELETE CASCADE,
  aisle_number TEXT,
  aisle_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.store_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_aisles ENABLE ROW LEVEL SECURITY;

-- RLS policies for store_layouts
CREATE POLICY "Users can view own store layouts"
  ON public.store_layouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own store layouts"
  ON public.store_layouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own store layouts"
  ON public.store_layouts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own store layouts"
  ON public.store_layouts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for store_aisles
CREATE POLICY "Users can view aisles from their stores"
  ON public.store_aisles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.store_layouts
      WHERE store_layouts.id = store_aisles.store_layout_id
      AND store_layouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert aisles to their stores"
  ON public.store_aisles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.store_layouts
      WHERE store_layouts.id = store_aisles.store_layout_id
      AND store_layouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update aisles in their stores"
  ON public.store_aisles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.store_layouts
      WHERE store_layouts.id = store_aisles.store_layout_id
      AND store_layouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete aisles from their stores"
  ON public.store_aisles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.store_layouts
      WHERE store_layouts.id = store_aisles.store_layout_id
      AND store_layouts.user_id = auth.uid()
    )
  );

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251013172257_e84cfccc-4de5-4580-b63b-7e78c19590df.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 57: 20251014000000_grocery_recipe_phase1.sql
-- ============================================

-- ============================================================================
-- PHASE 1: GROCERY & RECIPE ENHANCEMENTS
-- ============================================================================

-- ============================================================================
-- RECIPES ENHANCEMENTS
-- ============================================================================

-- Add new columns to recipes table
ALTER TABLE recipes 
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT CHECK (source_type IN ('website', 'photo', 'manual', 'imported')),
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rating DECIMAL(3,1) CHECK (rating >= 1 AND rating <= 5),
  ADD COLUMN IF NOT EXISTS times_made INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_made_date DATE,
  ADD COLUMN IF NOT EXISTS total_time_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS difficulty_level TEXT CHECK (difficulty_level IN ('easy', 'medium', 'hard')),
  ADD COLUMN IF NOT EXISTS kid_friendly_score INTEGER CHECK (kid_friendly_score >= 0 AND kid_friendly_score <= 100),
  ADD COLUMN IF NOT EXISTS nutrition_info JSONB;

-- Create recipe ingredients table (structured storage)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  food_id UUID REFERENCES foods(id) ON DELETE SET NULL,
  ingredient_name TEXT NOT NULL,
  quantity DECIMAL(10,2),
  unit TEXT,
  preparation_notes TEXT,
  is_optional BOOLEAN DEFAULT false,
  section TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create recipe collections
CREATE TABLE IF NOT EXISTS recipe_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'folder',
  color TEXT DEFAULT 'primary',
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recipe to collection mappings
CREATE TABLE IF NOT EXISTS recipe_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES recipe_collections(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, recipe_id)
);

-- Recipe photos
CREATE TABLE IF NOT EXISTS recipe_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  is_primary BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recipe attempts/ratings
CREATE TABLE IF NOT EXISTS recipe_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  kid_rating INTEGER CHECK (kid_rating >= 1 AND kid_rating <= 5),
  amount_eaten TEXT CHECK (amount_eaten IN ('none', 'taste', 'some', 'most', 'all')),
  notes TEXT,
  would_make_again BOOLEAN,
  modifications TEXT,
  photo_urls TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROCERY LIST ENHANCEMENTS
-- ============================================================================

-- Create grocery lists table (multiple lists support)
CREATE TABLE IF NOT EXISTS grocery_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'shopping-cart',
  color TEXT DEFAULT 'primary',
  is_default BOOLEAN DEFAULT false,
  store_name TEXT,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enhance grocery_items table
ALTER TABLE grocery_items 
  ADD COLUMN IF NOT EXISTS grocery_list_id UUID REFERENCES grocery_lists(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS brand_preference TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS source_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS added_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS added_via TEXT CHECK (added_via IN ('manual', 'voice', 'recipe', 'restock', 'barcode', 'plan'));

-- Shopping sessions (collaborative mode)
CREATE TABLE IF NOT EXISTS shopping_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  grocery_list_id UUID REFERENCES grocery_lists(id) ON DELETE SET NULL,
  store_name TEXT,
  store_location TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  total_items INTEGER,
  checked_items INTEGER,
  estimated_total DECIMAL(10,2),
  actual_total DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store layouts
CREATE TABLE IF NOT EXISTS store_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  store_chain TEXT,
  store_location TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store aisles
CREATE TABLE IF NOT EXISTS store_aisles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_layout_id UUID REFERENCES store_layouts(id) ON DELETE CASCADE,
  aisle_name TEXT NOT NULL,
  aisle_number TEXT,
  sort_order INTEGER NOT NULL,
  color TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Food-to-aisle mappings
CREATE TABLE IF NOT EXISTS food_aisle_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_layout_id UUID REFERENCES store_layouts(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  aisle_id UUID REFERENCES store_aisles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_layout_id, food_name)
);

-- Shopping history
CREATE TABLE IF NOT EXISTS grocery_purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity DECIMAL(10,2),
  unit TEXT,
  store_name TEXT,
  price DECIMAL(10,2),
  category TEXT,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Recipe indexes
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_food ON recipe_ingredients(food_id);
CREATE INDEX IF NOT EXISTS idx_recipe_collections_user ON recipe_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_collection_items_collection ON recipe_collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_recipe_collection_items_recipe ON recipe_collection_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_photos_recipe ON recipe_photos(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_attempts_recipe ON recipe_attempts(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_attempts_user ON recipe_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_attempts_kid ON recipe_attempts(kid_id);

-- Grocery indexes
CREATE INDEX IF NOT EXISTS idx_grocery_lists_user ON grocery_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_grocery_lists_household ON grocery_lists(household_id);
CREATE INDEX IF NOT EXISTS idx_grocery_items_list ON grocery_items(grocery_list_id);
CREATE INDEX IF NOT EXISTS idx_grocery_items_recipe_source ON grocery_items(source_recipe_id);
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_household ON shopping_sessions(household_id, is_active);
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_user ON shopping_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_store_layouts_user ON store_layouts(user_id);
CREATE INDEX IF NOT EXISTS idx_store_aisles_layout ON store_aisles(store_layout_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_food_aisle_mappings_layout ON food_aisle_mappings(store_layout_id);
CREATE INDEX IF NOT EXISTS idx_purchase_history_user ON grocery_purchase_history(user_id, item_name);
CREATE INDEX IF NOT EXISTS idx_purchase_history_date ON grocery_purchase_history(purchased_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Recipe tables
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their recipe ingredients"
  ON recipe_ingredients FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_ingredients.recipe_id
      AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their recipe collections"
  ON recipe_collections FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their collection items"
  ON recipe_collection_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recipe_collections
      WHERE recipe_collections.id = recipe_collection_items.collection_id
      AND recipe_collections.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their recipe photos"
  ON recipe_photos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_photos.recipe_id
      AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their recipe attempts"
  ON recipe_attempts FOR ALL
  USING (user_id = auth.uid());

-- Grocery tables
ALTER TABLE grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_aisles ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_aisle_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_purchase_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own lists"
  ON grocery_lists FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Household members can view household lists"
  ON grocery_lists FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Household members can manage shopping sessions"
  ON shopping_sessions FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their store layouts"
  ON store_layouts FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their store aisles"
  ON store_aisles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM store_layouts
      WHERE store_layouts.id = store_aisles.store_layout_id
      AND store_layouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their aisle mappings"
  ON food_aisle_mappings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM store_layouts
      WHERE store_layouts.id = food_aisle_mappings.store_layout_id
      AND store_layouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their purchase history"
  ON grocery_purchase_history FOR ALL
  USING (user_id = auth.uid());

-- ============================================================================
-- DATA MIGRATION
-- ============================================================================

-- Create default grocery lists for existing users
INSERT INTO grocery_lists (user_id, household_id, name, is_default)
SELECT DISTINCT 
  user_id, 
  household_id, 
  'Shopping List', 
  true
FROM grocery_items
WHERE NOT EXISTS (
  SELECT 1 FROM grocery_lists 
  WHERE grocery_lists.user_id = grocery_items.user_id
)
ON CONFLICT DO NOTHING;

-- Assign existing grocery items to default lists
UPDATE grocery_items gi
SET grocery_list_id = (
  SELECT id FROM grocery_lists
  WHERE user_id = gi.user_id 
  AND is_default = true
  LIMIT 1
)
WHERE grocery_list_id IS NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE recipe_ingredients IS 'Structured ingredient storage for recipes';
COMMENT ON TABLE recipe_collections IS 'User-created recipe folders/collections';
COMMENT ON TABLE grocery_lists IS 'Multiple grocery lists per user (Costco, Weekly, etc.)';
COMMENT ON TABLE shopping_sessions IS 'Active shopping sessions for collaborative mode';
COMMENT ON TABLE store_layouts IS 'Custom store aisle layouts per user';
COMMENT ON COLUMN grocery_items.source_recipe_id IS 'Recipe that generated this grocery item';
COMMENT ON COLUMN grocery_items.added_via IS 'How this item was added (manual, recipe, restock, etc.)';



-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251014000000_grocery_recipe_phase1.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 58: 20251014000001_grocery_recipe_phase1_fixed.sql
-- ============================================

-- Phase 1: Grocery & Recipe Enhancements
-- This migration safely adds new features with DROP IF EXISTS

-- ============================================================================
-- PART 1: RECIPE ENHANCEMENTS
-- ============================================================================

-- Drop existing policies first (if they exist)
DROP POLICY IF EXISTS "Users can manage their recipe ingredients" ON recipe_ingredients;
DROP POLICY IF EXISTS "Users can view their recipe collections" ON recipe_collections;
DROP POLICY IF EXISTS "Users can manage their recipe collections" ON recipe_collections;
DROP POLICY IF EXISTS "Users can manage collection items" ON recipe_collection_items;
DROP POLICY IF EXISTS "Users can view recipe photos" ON recipe_photos;
DROP POLICY IF EXISTS "Users can manage recipe photos" ON recipe_photos;
DROP POLICY IF EXISTS "Users can view recipe attempts" ON recipe_attempts;
DROP POLICY IF EXISTS "Users can manage their recipe attempts" ON recipe_attempts;

-- Add new columns to recipes table (use ALTER TABLE ADD COLUMN IF NOT EXISTS for safety)
DO $$ 
BEGIN
  -- Image and source
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='image_url') THEN
    ALTER TABLE recipes ADD COLUMN image_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='source_url') THEN
    ALTER TABLE recipes ADD COLUMN source_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='source_type') THEN
    ALTER TABLE recipes ADD COLUMN source_type TEXT CHECK (source_type IN ('manual', 'imported', 'ai_generated', 'url'));
  END IF;
  
  -- Organization
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='tags') THEN
    ALTER TABLE recipes ADD COLUMN tags TEXT[];
  END IF;
  
  -- Rating and usage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='rating') THEN
    ALTER TABLE recipes ADD COLUMN rating DECIMAL(2,1) CHECK (rating >= 0 AND rating <= 5);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='times_made') THEN
    ALTER TABLE recipes ADD COLUMN times_made INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='last_made_date') THEN
    ALTER TABLE recipes ADD COLUMN last_made_date DATE;
  END IF;
  
  -- Time and difficulty
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='total_time_minutes') THEN
    ALTER TABLE recipes ADD COLUMN total_time_minutes INTEGER;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='difficulty_level') THEN
    ALTER TABLE recipes ADD COLUMN difficulty_level TEXT CHECK (difficulty_level IN ('easy', 'medium', 'hard'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='kid_friendly_score') THEN
    ALTER TABLE recipes ADD COLUMN kid_friendly_score INTEGER CHECK (kid_friendly_score >= 0 AND kid_friendly_score <= 100);
  END IF;
  
  -- Nutrition
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='nutrition_info') THEN
    ALTER TABLE recipes ADD COLUMN nutrition_info JSONB;
  END IF;
END $$;

-- Recipe Ingredients Table (structured ingredient storage)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  quantity TEXT,
  unit TEXT,
  name TEXT NOT NULL,
  preparation TEXT,
  optional BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);

-- Recipe Collections (folders for organizing recipes)
CREATE TABLE IF NOT EXISTS recipe_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_collections_user_id ON recipe_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_collections_household_id ON recipe_collections(household_id);

-- Recipe Collection Items (many-to-many relationship)
CREATE TABLE IF NOT EXISTS recipe_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES recipe_collections(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_collection_items_collection_id ON recipe_collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_recipe_collection_items_recipe_id ON recipe_collection_items(recipe_id);

-- Recipe Photos (multiple photos per recipe)
CREATE TABLE IF NOT EXISTS recipe_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  is_primary BOOLEAN DEFAULT false,
  uploaded_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_photos_recipe_id ON recipe_photos(recipe_id);

-- Recipe Attempts (tracking when recipes are made and rated)
CREATE TABLE IF NOT EXISTS recipe_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  made_date DATE NOT NULL,
  rating DECIMAL(2,1) CHECK (rating >= 0 AND rating <= 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_attempts_recipe_id ON recipe_attempts(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_attempts_user_id ON recipe_attempts(user_id);

-- ============================================================================
-- PART 2: GROCERY LIST ENHANCEMENTS
-- ============================================================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Household members can view household lists" ON grocery_lists;
DROP POLICY IF EXISTS "Users can manage their own lists" ON grocery_lists;
DROP POLICY IF EXISTS "Household members can manage shopping sessions" ON shopping_sessions;
DROP POLICY IF EXISTS "Household members can view store layouts" ON store_layouts;
DROP POLICY IF EXISTS "Users can manage their store layouts" ON store_layouts;
DROP POLICY IF EXISTS "Users can view store aisles" ON store_aisles;
DROP POLICY IF EXISTS "Users can manage store aisles" ON store_aisles;
DROP POLICY IF EXISTS "Users can view food aisle mappings" ON food_aisle_mappings;
DROP POLICY IF EXISTS "Users can manage food aisle mappings" ON food_aisle_mappings;
DROP POLICY IF EXISTS "Household members can view purchase history" ON grocery_purchase_history;
DROP POLICY IF EXISTS "Household members can manage purchase history" ON grocery_purchase_history;

-- Grocery Lists (support for multiple lists)
CREATE TABLE IF NOT EXISTS grocery_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Grocery List',
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grocery_lists_user_id ON grocery_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_grocery_lists_household_id ON grocery_lists(household_id);

-- Add columns to grocery_items table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='grocery_list_id') THEN
    ALTER TABLE grocery_items ADD COLUMN grocery_list_id UUID REFERENCES grocery_lists(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='photo_url') THEN
    ALTER TABLE grocery_items ADD COLUMN photo_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='notes') THEN
    ALTER TABLE grocery_items ADD COLUMN notes TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='brand_preference') THEN
    ALTER TABLE grocery_items ADD COLUMN brand_preference TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='barcode') THEN
    ALTER TABLE grocery_items ADD COLUMN barcode TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='source_recipe_id') THEN
    ALTER TABLE grocery_items ADD COLUMN source_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='added_by_user_id') THEN
    ALTER TABLE grocery_items ADD COLUMN added_by_user_id UUID REFERENCES auth.users(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='added_via') THEN
    ALTER TABLE grocery_items ADD COLUMN added_via TEXT CHECK (added_via IN ('manual', 'recipe', 'smart_restock', 'meal_plan'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_grocery_items_list_id ON grocery_items(grocery_list_id);

-- Shopping Sessions (collaborative shopping tracking)
CREATE TABLE IF NOT EXISTS shopping_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_list_id UUID NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  started_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_shopping_sessions_list_id ON shopping_sessions(grocery_list_id);
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_household_id ON shopping_sessions(household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_active ON shopping_sessions(is_active) WHERE is_active = true;

-- Store Layouts (custom store configurations)
CREATE TABLE IF NOT EXISTS store_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_layouts_user_id ON store_layouts(user_id);
CREATE INDEX IF NOT EXISTS idx_store_layouts_household_id ON store_layouts(household_id);

-- Store Aisles (aisle definitions per store)
CREATE TABLE IF NOT EXISTS store_aisles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_layout_id UUID NOT NULL REFERENCES store_layouts(id) ON DELETE CASCADE,
  aisle_number TEXT,
  aisle_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_aisles_store_id ON store_aisles(store_layout_id);

-- Food Aisle Mappings (map foods to specific aisles in specific stores)
CREATE TABLE IF NOT EXISTS food_aisle_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  store_aisle_id UUID NOT NULL REFERENCES store_aisles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(food_id, store_aisle_id)
);

CREATE INDEX IF NOT EXISTS idx_food_aisle_mappings_food_id ON food_aisle_mappings(food_id);
CREATE INDEX IF NOT EXISTS idx_food_aisle_mappings_aisle_id ON food_aisle_mappings(store_aisle_id);

-- Grocery Purchase History (track when items were bought)
CREATE TABLE IF NOT EXISTS grocery_purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_item_id UUID REFERENCES grocery_items(id) ON DELETE SET NULL,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity DECIMAL NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  purchased_by_user_id UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_grocery_purchase_history_household_id ON grocery_purchase_history(household_id);
CREATE INDEX IF NOT EXISTS idx_grocery_purchase_history_purchased_at ON grocery_purchase_history(purchased_at);

-- ============================================================================
-- PART 3: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_aisles ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_aisle_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_purchase_history ENABLE ROW LEVEL SECURITY;

-- Recipe Ingredients Policies
CREATE POLICY "Users can manage their recipe ingredients"
  ON recipe_ingredients FOR ALL
  USING (
    recipe_id IN (
      SELECT id FROM recipes WHERE user_id = auth.uid()
    )
  );

-- Recipe Collections Policies
CREATE POLICY "Users can view their recipe collections"
  ON recipe_collections FOR SELECT
  USING (
    user_id = auth.uid() OR
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their recipe collections"
  ON recipe_collections FOR ALL
  USING (user_id = auth.uid());

-- Recipe Collection Items Policies
CREATE POLICY "Users can manage collection items"
  ON recipe_collection_items FOR ALL
  USING (
    collection_id IN (
      SELECT id FROM recipe_collections WHERE user_id = auth.uid()
    )
  );

-- Recipe Photos Policies
CREATE POLICY "Users can view recipe photos"
  ON recipe_photos FOR SELECT
  USING (
    recipe_id IN (
      SELECT id FROM recipes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage recipe photos"
  ON recipe_photos FOR ALL
  USING (uploaded_by_user_id = auth.uid());

-- Recipe Attempts Policies
CREATE POLICY "Users can view recipe attempts"
  ON recipe_attempts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their recipe attempts"
  ON recipe_attempts FOR ALL
  USING (user_id = auth.uid());

-- Grocery Lists Policies
CREATE POLICY "Household members can view household lists"
  ON grocery_lists FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their own lists"
  ON grocery_lists FOR ALL
  USING (user_id = auth.uid());

-- Shopping Sessions Policies
CREATE POLICY "Household members can manage shopping sessions"
  ON shopping_sessions FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Store Layouts Policies
CREATE POLICY "Household members can view store layouts"
  ON store_layouts FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their store layouts"
  ON store_layouts FOR ALL
  USING (user_id = auth.uid());

-- Store Aisles Policies
CREATE POLICY "Users can view store aisles"
  ON store_aisles FOR SELECT
  USING (
    store_layout_id IN (
      SELECT id FROM store_layouts 
      WHERE household_id IN (
        SELECT household_id FROM profiles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage store aisles"
  ON store_aisles FOR ALL
  USING (
    store_layout_id IN (
      SELECT id FROM store_layouts WHERE user_id = auth.uid()
    )
  );

-- Food Aisle Mappings Policies
CREATE POLICY "Users can view food aisle mappings"
  ON food_aisle_mappings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage food aisle mappings"
  ON food_aisle_mappings FOR ALL
  USING (user_id = auth.uid());

-- Grocery Purchase History Policies
CREATE POLICY "Household members can view purchase history"
  ON grocery_purchase_history FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Household members can manage purchase history"
  ON grocery_purchase_history FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 4: DATA MIGRATION
-- ============================================================================

-- Create default grocery list for existing users who have grocery items
DO $$
DECLARE
  user_record RECORD;
  new_list_id UUID;
BEGIN
  FOR user_record IN 
    SELECT DISTINCT user_id, household_id 
    FROM grocery_items 
    WHERE grocery_list_id IS NULL
  LOOP
    -- Create default list for this user
    INSERT INTO grocery_lists (user_id, household_id, name, is_default)
    VALUES (user_record.user_id, user_record.household_id, 'My Grocery List', true)
    RETURNING id INTO new_list_id;
    
    -- Assign existing grocery items to this list
    UPDATE grocery_items
    SET grocery_list_id = new_list_id
    WHERE user_id = user_record.user_id 
    AND grocery_list_id IS NULL;
  END LOOP;
END $$;



-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251014000001_grocery_recipe_phase1_fixed.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 59: 20251014000002_grocery_recipe_phase1_final.sql
-- ============================================

-- Phase 1: Grocery & Recipe Enhancements
-- This migration safely adds new features with DROP IF EXISTS

-- ============================================================================
-- PART 1: RECIPE ENHANCEMENTS
-- ============================================================================

-- Drop existing policies first (if they exist)
DROP POLICY IF EXISTS "Users can manage their recipe ingredients" ON recipe_ingredients;
DROP POLICY IF EXISTS "Users can view their recipe collections" ON recipe_collections;
DROP POLICY IF EXISTS "Users can manage their recipe collections" ON recipe_collections;
DROP POLICY IF EXISTS "Users can manage collection items" ON recipe_collection_items;
DROP POLICY IF EXISTS "Users can view recipe photos" ON recipe_photos;
DROP POLICY IF EXISTS "Users can manage recipe photos" ON recipe_photos;
DROP POLICY IF EXISTS "Users can view recipe attempts" ON recipe_attempts;
DROP POLICY IF EXISTS "Users can manage their recipe attempts" ON recipe_attempts;

-- Add new columns to recipes table (use ALTER TABLE ADD COLUMN IF NOT EXISTS for safety)
DO $$ 
BEGIN
  -- Image and source
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='image_url') THEN
    ALTER TABLE recipes ADD COLUMN image_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='source_url') THEN
    ALTER TABLE recipes ADD COLUMN source_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='source_type') THEN
    ALTER TABLE recipes ADD COLUMN source_type TEXT CHECK (source_type IN ('manual', 'imported', 'ai_generated', 'url'));
  END IF;
  
  -- Organization
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='tags') THEN
    ALTER TABLE recipes ADD COLUMN tags TEXT[];
  END IF;
  
  -- Rating and usage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='rating') THEN
    ALTER TABLE recipes ADD COLUMN rating DECIMAL(2,1) CHECK (rating >= 0 AND rating <= 5);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='times_made') THEN
    ALTER TABLE recipes ADD COLUMN times_made INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='last_made_date') THEN
    ALTER TABLE recipes ADD COLUMN last_made_date DATE;
  END IF;
  
  -- Time and difficulty
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='total_time_minutes') THEN
    ALTER TABLE recipes ADD COLUMN total_time_minutes INTEGER;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='difficulty_level') THEN
    ALTER TABLE recipes ADD COLUMN difficulty_level TEXT CHECK (difficulty_level IN ('easy', 'medium', 'hard'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='kid_friendly_score') THEN
    ALTER TABLE recipes ADD COLUMN kid_friendly_score INTEGER CHECK (kid_friendly_score >= 0 AND kid_friendly_score <= 100);
  END IF;
  
  -- Nutrition
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='nutrition_info') THEN
    ALTER TABLE recipes ADD COLUMN nutrition_info JSONB;
  END IF;
END $$;

-- Recipe Ingredients Table (structured ingredient storage)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  quantity TEXT,
  unit TEXT,
  name TEXT NOT NULL,
  preparation TEXT,
  optional BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);

-- Recipe Collections (folders for organizing recipes)
CREATE TABLE IF NOT EXISTS recipe_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_collections_user_id ON recipe_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_collections_household_id ON recipe_collections(household_id);

-- Recipe Collection Items (many-to-many relationship)
CREATE TABLE IF NOT EXISTS recipe_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES recipe_collections(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_collection_items_collection_id ON recipe_collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_recipe_collection_items_recipe_id ON recipe_collection_items(recipe_id);

-- Recipe Photos (multiple photos per recipe)
CREATE TABLE IF NOT EXISTS recipe_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  is_primary BOOLEAN DEFAULT false,
  uploaded_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_photos_recipe_id ON recipe_photos(recipe_id);

-- Recipe Attempts (tracking when recipes are made and rated)
CREATE TABLE IF NOT EXISTS recipe_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  made_date DATE NOT NULL,
  rating DECIMAL(2,1) CHECK (rating >= 0 AND rating <= 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_attempts_recipe_id ON recipe_attempts(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_attempts_user_id ON recipe_attempts(user_id);

-- ============================================================================
-- PART 2: GROCERY LIST ENHANCEMENTS
-- ============================================================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Household members can view household lists" ON grocery_lists;
DROP POLICY IF EXISTS "Users can manage their own lists" ON grocery_lists;
DROP POLICY IF EXISTS "Household members can manage shopping sessions" ON shopping_sessions;
DROP POLICY IF EXISTS "Household members can view store layouts" ON store_layouts;
DROP POLICY IF EXISTS "Users can manage their store layouts" ON store_layouts;
DROP POLICY IF EXISTS "Users can view store aisles" ON store_aisles;
DROP POLICY IF EXISTS "Users can manage store aisles" ON store_aisles;
DROP POLICY IF EXISTS "Household members can view purchase history" ON grocery_purchase_history;
DROP POLICY IF EXISTS "Household members can manage purchase history" ON grocery_purchase_history;

-- Grocery Lists (support for multiple lists)
CREATE TABLE IF NOT EXISTS grocery_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Grocery List',
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grocery_lists_user_id ON grocery_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_grocery_lists_household_id ON grocery_lists(household_id);

-- Add columns to grocery_items table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='grocery_list_id') THEN
    ALTER TABLE grocery_items ADD COLUMN grocery_list_id UUID REFERENCES grocery_lists(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='photo_url') THEN
    ALTER TABLE grocery_items ADD COLUMN photo_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='notes') THEN
    ALTER TABLE grocery_items ADD COLUMN notes TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='brand_preference') THEN
    ALTER TABLE grocery_items ADD COLUMN brand_preference TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='barcode') THEN
    ALTER TABLE grocery_items ADD COLUMN barcode TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='source_recipe_id') THEN
    ALTER TABLE grocery_items ADD COLUMN source_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='added_by_user_id') THEN
    ALTER TABLE grocery_items ADD COLUMN added_by_user_id UUID REFERENCES auth.users(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='added_via') THEN
    ALTER TABLE grocery_items ADD COLUMN added_via TEXT CHECK (added_via IN ('manual', 'recipe', 'smart_restock', 'meal_plan'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_grocery_items_list_id ON grocery_items(grocery_list_id);

-- Shopping Sessions (collaborative shopping tracking)
CREATE TABLE IF NOT EXISTS shopping_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_list_id UUID NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  started_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_shopping_sessions_list_id ON shopping_sessions(grocery_list_id);
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_household_id ON shopping_sessions(household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_active ON shopping_sessions(is_active) WHERE is_active = true;

-- Store Layouts (custom store configurations)
CREATE TABLE IF NOT EXISTS store_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_layouts_user_id ON store_layouts(user_id);
CREATE INDEX IF NOT EXISTS idx_store_layouts_household_id ON store_layouts(household_id);

-- Store Aisles (aisle definitions per store)
CREATE TABLE IF NOT EXISTS store_aisles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_layout_id UUID NOT NULL REFERENCES store_layouts(id) ON DELETE CASCADE,
  aisle_number TEXT,
  aisle_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_aisles_store_id ON store_aisles(store_layout_id);

-- Grocery Purchase History (track when items were bought)
CREATE TABLE IF NOT EXISTS grocery_purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_item_id UUID REFERENCES grocery_items(id) ON DELETE SET NULL,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity DECIMAL NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  purchased_by_user_id UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_grocery_purchase_history_household_id ON grocery_purchase_history(household_id);
CREATE INDEX IF NOT EXISTS idx_grocery_purchase_history_purchased_at ON grocery_purchase_history(purchased_at);

-- ============================================================================
-- PART 3: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_aisles ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_purchase_history ENABLE ROW LEVEL SECURITY;

-- Recipe Ingredients Policies
CREATE POLICY "Users can manage their recipe ingredients"
  ON recipe_ingredients FOR ALL
  USING (
    recipe_id IN (
      SELECT id FROM recipes WHERE user_id = auth.uid()
    )
  );

-- Recipe Collections Policies
CREATE POLICY "Users can view their recipe collections"
  ON recipe_collections FOR SELECT
  USING (
    user_id = auth.uid() OR
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their recipe collections"
  ON recipe_collections FOR ALL
  USING (user_id = auth.uid());

-- Recipe Collection Items Policies
CREATE POLICY "Users can manage collection items"
  ON recipe_collection_items FOR ALL
  USING (
    collection_id IN (
      SELECT id FROM recipe_collections WHERE user_id = auth.uid()
    )
  );

-- Recipe Photos Policies
CREATE POLICY "Users can view recipe photos"
  ON recipe_photos FOR SELECT
  USING (
    recipe_id IN (
      SELECT id FROM recipes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage recipe photos"
  ON recipe_photos FOR ALL
  USING (uploaded_by_user_id = auth.uid());

-- Recipe Attempts Policies
CREATE POLICY "Users can view recipe attempts"
  ON recipe_attempts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their recipe attempts"
  ON recipe_attempts FOR ALL
  USING (user_id = auth.uid());

-- Grocery Lists Policies
CREATE POLICY "Household members can view household lists"
  ON grocery_lists FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their own lists"
  ON grocery_lists FOR ALL
  USING (user_id = auth.uid());

-- Shopping Sessions Policies
CREATE POLICY "Household members can manage shopping sessions"
  ON shopping_sessions FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Store Layouts Policies
CREATE POLICY "Household members can view store layouts"
  ON store_layouts FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their store layouts"
  ON store_layouts FOR ALL
  USING (user_id = auth.uid());

-- Store Aisles Policies
CREATE POLICY "Users can view store aisles"
  ON store_aisles FOR SELECT
  USING (
    store_layout_id IN (
      SELECT id FROM store_layouts 
      WHERE household_id IN (
        SELECT household_id FROM profiles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage store aisles"
  ON store_aisles FOR ALL
  USING (
    store_layout_id IN (
      SELECT id FROM store_layouts WHERE user_id = auth.uid()
    )
  );

-- Grocery Purchase History Policies
CREATE POLICY "Household members can view purchase history"
  ON grocery_purchase_history FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Household members can manage purchase history"
  ON grocery_purchase_history FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 4: DATA MIGRATION
-- ============================================================================

-- Create default grocery list for existing users who have grocery items
DO $$
DECLARE
  user_record RECORD;
  new_list_id UUID;
BEGIN
  FOR user_record IN 
    SELECT DISTINCT user_id, household_id 
    FROM grocery_items 
    WHERE grocery_list_id IS NULL
  LOOP
    -- Create default list for this user
    INSERT INTO grocery_lists (user_id, household_id, name, is_default)
    VALUES (user_record.user_id, user_record.household_id, 'My Grocery List', true)
    RETURNING id INTO new_list_id;
    
    -- Assign existing grocery items to this list
    UPDATE grocery_items
    SET grocery_list_id = new_list_id
    WHERE user_id = user_record.user_id 
    AND grocery_list_id IS NULL;
  END LOOP;
END $$;



-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251014000002_grocery_recipe_phase1_final.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 60: 20251014000003_grocery_recipe_phase1_complete.sql
-- ============================================

-- Phase 1: Grocery & Recipe Enhancements
-- This migration safely adds new features

-- ============================================================================
-- PART 1: RECIPE ENHANCEMENTS
-- ============================================================================

-- Add new columns to recipes table
DO $$ 
BEGIN
  -- Image and source
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='image_url') THEN
    ALTER TABLE recipes ADD COLUMN image_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='source_url') THEN
    ALTER TABLE recipes ADD COLUMN source_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='source_type') THEN
    ALTER TABLE recipes ADD COLUMN source_type TEXT CHECK (source_type IN ('manual', 'imported', 'ai_generated', 'url'));
  END IF;
  
  -- Organization
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='tags') THEN
    ALTER TABLE recipes ADD COLUMN tags TEXT[];
  END IF;
  
  -- Rating and usage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='rating') THEN
    ALTER TABLE recipes ADD COLUMN rating DECIMAL(2,1) CHECK (rating >= 0 AND rating <= 5);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='times_made') THEN
    ALTER TABLE recipes ADD COLUMN times_made INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='last_made_date') THEN
    ALTER TABLE recipes ADD COLUMN last_made_date DATE;
  END IF;
  
  -- Time and difficulty
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='total_time_minutes') THEN
    ALTER TABLE recipes ADD COLUMN total_time_minutes INTEGER;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='difficulty_level') THEN
    ALTER TABLE recipes ADD COLUMN difficulty_level TEXT CHECK (difficulty_level IN ('easy', 'medium', 'hard'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='kid_friendly_score') THEN
    ALTER TABLE recipes ADD COLUMN kid_friendly_score INTEGER CHECK (kid_friendly_score >= 0 AND kid_friendly_score <= 100);
  END IF;
  
  -- Nutrition
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='nutrition_info') THEN
    ALTER TABLE recipes ADD COLUMN nutrition_info JSONB;
  END IF;
END $$;

-- Recipe Ingredients Table (structured ingredient storage)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  quantity TEXT,
  unit TEXT,
  name TEXT NOT NULL,
  preparation TEXT,
  optional BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);

-- Recipe Collections (folders for organizing recipes)
CREATE TABLE IF NOT EXISTS recipe_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_collections_user_id ON recipe_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_collections_household_id ON recipe_collections(household_id);

-- Recipe Collection Items (many-to-many relationship)
CREATE TABLE IF NOT EXISTS recipe_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES recipe_collections(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_collection_items_collection_id ON recipe_collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_recipe_collection_items_recipe_id ON recipe_collection_items(recipe_id);

-- Recipe Photos (multiple photos per recipe)
CREATE TABLE IF NOT EXISTS recipe_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  is_primary BOOLEAN DEFAULT false,
  uploaded_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_photos_recipe_id ON recipe_photos(recipe_id);

-- Add missing columns to recipe_photos if table already exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipe_photos' AND column_name='uploaded_by_user_id') THEN
    ALTER TABLE recipe_photos ADD COLUMN uploaded_by_user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Recipe Attempts (tracking when recipes are made and rated)
CREATE TABLE IF NOT EXISTS recipe_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  made_date DATE NOT NULL,
  rating DECIMAL(2,1) CHECK (rating >= 0 AND rating <= 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_attempts_recipe_id ON recipe_attempts(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_attempts_user_id ON recipe_attempts(user_id);

-- ============================================================================
-- PART 2: GROCERY LIST ENHANCEMENTS
-- ============================================================================

-- Grocery Lists (support for multiple lists)
CREATE TABLE IF NOT EXISTS grocery_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Grocery List',
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grocery_lists_user_id ON grocery_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_grocery_lists_household_id ON grocery_lists(household_id);

-- Add columns to grocery_items table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='grocery_list_id') THEN
    ALTER TABLE grocery_items ADD COLUMN grocery_list_id UUID REFERENCES grocery_lists(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='photo_url') THEN
    ALTER TABLE grocery_items ADD COLUMN photo_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='notes') THEN
    ALTER TABLE grocery_items ADD COLUMN notes TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='brand_preference') THEN
    ALTER TABLE grocery_items ADD COLUMN brand_preference TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='barcode') THEN
    ALTER TABLE grocery_items ADD COLUMN barcode TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='source_recipe_id') THEN
    ALTER TABLE grocery_items ADD COLUMN source_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='added_by_user_id') THEN
    ALTER TABLE grocery_items ADD COLUMN added_by_user_id UUID REFERENCES auth.users(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='added_via') THEN
    ALTER TABLE grocery_items ADD COLUMN added_via TEXT CHECK (added_via IN ('manual', 'recipe', 'smart_restock', 'meal_plan'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_grocery_items_list_id ON grocery_items(grocery_list_id);

-- Shopping Sessions (collaborative shopping tracking)
CREATE TABLE IF NOT EXISTS shopping_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_list_id UUID NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  started_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_shopping_sessions_list_id ON shopping_sessions(grocery_list_id);
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_household_id ON shopping_sessions(household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_active ON shopping_sessions(is_active) WHERE is_active = true;

-- Store Layouts (custom store configurations)
CREATE TABLE IF NOT EXISTS store_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_layouts_user_id ON store_layouts(user_id);
CREATE INDEX IF NOT EXISTS idx_store_layouts_household_id ON store_layouts(household_id);

-- Store Aisles (aisle definitions per store)
CREATE TABLE IF NOT EXISTS store_aisles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_layout_id UUID NOT NULL REFERENCES store_layouts(id) ON DELETE CASCADE,
  aisle_number TEXT,
  aisle_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_aisles_store_id ON store_aisles(store_layout_id);

-- Grocery Purchase History (track when items were bought)
CREATE TABLE IF NOT EXISTS grocery_purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_item_id UUID REFERENCES grocery_items(id) ON DELETE SET NULL,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity DECIMAL NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  purchased_by_user_id UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_grocery_purchase_history_household_id ON grocery_purchase_history(household_id);
CREATE INDEX IF NOT EXISTS idx_grocery_purchase_history_purchased_at ON grocery_purchase_history(purchased_at);

-- ============================================================================
-- PART 3: DROP EXISTING POLICIES (AFTER TABLES ARE CREATED)
-- ============================================================================

-- Drop and recreate all policies to ensure they're current
DO $$
BEGIN
  -- Recipe tables
  DROP POLICY IF EXISTS "Users can manage their recipe ingredients" ON recipe_ingredients;
  DROP POLICY IF EXISTS "Users can view their recipe collections" ON recipe_collections;
  DROP POLICY IF EXISTS "Users can manage their recipe collections" ON recipe_collections;
  DROP POLICY IF EXISTS "Users can manage collection items" ON recipe_collection_items;
  DROP POLICY IF EXISTS "Users can view recipe photos" ON recipe_photos;
  DROP POLICY IF EXISTS "Users can manage recipe photos" ON recipe_photos;
  DROP POLICY IF EXISTS "Users can view recipe attempts" ON recipe_attempts;
  DROP POLICY IF EXISTS "Users can manage their recipe attempts" ON recipe_attempts;
  
  -- Grocery tables
  DROP POLICY IF EXISTS "Household members can view household lists" ON grocery_lists;
  DROP POLICY IF EXISTS "Users can manage their own lists" ON grocery_lists;
  DROP POLICY IF EXISTS "Household members can manage shopping sessions" ON shopping_sessions;
  DROP POLICY IF EXISTS "Household members can view store layouts" ON store_layouts;
  DROP POLICY IF EXISTS "Users can manage their store layouts" ON store_layouts;
  DROP POLICY IF EXISTS "Users can view store aisles" ON store_aisles;
  DROP POLICY IF EXISTS "Users can manage store aisles" ON store_aisles;
  DROP POLICY IF EXISTS "Household members can view purchase history" ON grocery_purchase_history;
  DROP POLICY IF EXISTS "Household members can manage purchase history" ON grocery_purchase_history;
END $$;

-- ============================================================================
-- PART 4: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_aisles ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_purchase_history ENABLE ROW LEVEL SECURITY;

-- Recipe Ingredients Policies
CREATE POLICY "Users can manage their recipe ingredients"
  ON recipe_ingredients FOR ALL
  USING (
    recipe_id IN (
      SELECT id FROM recipes WHERE user_id = auth.uid()
    )
  );

-- Recipe Collections Policies
CREATE POLICY "Users can view their recipe collections"
  ON recipe_collections FOR SELECT
  USING (
    user_id = auth.uid() OR
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their recipe collections"
  ON recipe_collections FOR ALL
  USING (user_id = auth.uid());

-- Recipe Collection Items Policies
CREATE POLICY "Users can manage collection items"
  ON recipe_collection_items FOR ALL
  USING (
    collection_id IN (
      SELECT id FROM recipe_collections WHERE user_id = auth.uid()
    )
  );

-- Recipe Photos Policies
CREATE POLICY "Users can view recipe photos"
  ON recipe_photos FOR SELECT
  USING (
    recipe_id IN (
      SELECT id FROM recipes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage recipe photos"
  ON recipe_photos FOR ALL
  USING (uploaded_by_user_id = auth.uid());

-- Recipe Attempts Policies
CREATE POLICY "Users can view recipe attempts"
  ON recipe_attempts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their recipe attempts"
  ON recipe_attempts FOR ALL
  USING (user_id = auth.uid());

-- Grocery Lists Policies
CREATE POLICY "Household members can view household lists"
  ON grocery_lists FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their own lists"
  ON grocery_lists FOR ALL
  USING (user_id = auth.uid());

-- Shopping Sessions Policies
CREATE POLICY "Household members can manage shopping sessions"
  ON shopping_sessions FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Store Layouts Policies
CREATE POLICY "Household members can view store layouts"
  ON store_layouts FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their store layouts"
  ON store_layouts FOR ALL
  USING (user_id = auth.uid());

-- Store Aisles Policies
CREATE POLICY "Users can view store aisles"
  ON store_aisles FOR SELECT
  USING (
    store_layout_id IN (
      SELECT id FROM store_layouts 
      WHERE household_id IN (
        SELECT household_id FROM profiles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage store aisles"
  ON store_aisles FOR ALL
  USING (
    store_layout_id IN (
      SELECT id FROM store_layouts WHERE user_id = auth.uid()
    )
  );

-- Grocery Purchase History Policies
CREATE POLICY "Household members can view purchase history"
  ON grocery_purchase_history FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Household members can manage purchase history"
  ON grocery_purchase_history FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 5: DATA MIGRATION
-- ============================================================================

-- Create default grocery list for existing users who have grocery items
DO $$
DECLARE
  user_record RECORD;
  new_list_id UUID;
BEGIN
  FOR user_record IN 
    SELECT DISTINCT user_id, household_id 
    FROM grocery_items 
    WHERE grocery_list_id IS NULL
  LOOP
    -- Create default list for this user
    INSERT INTO grocery_lists (user_id, household_id, name, is_default)
    VALUES (user_record.user_id, user_record.household_id, 'My Grocery List', true)
    RETURNING id INTO new_list_id;
    
    -- Assign existing grocery items to this list
    UPDATE grocery_items
    SET grocery_list_id = new_list_id
    WHERE user_id = user_record.user_id 
    AND grocery_list_id IS NULL;
  END LOOP;
END $$;



-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251014000003_grocery_recipe_phase1_complete.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 61: 20251029033504_b10a66ba-0f5b-419d-b82a-e549ab46a733.sql
-- ============================================

-- Secure function to apply internal link updates with admin check
CREATE OR REPLACE FUNCTION public.apply_internal_link(
  p_post_id uuid,
  p_updated_content text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Ensure caller is an authenticated admin
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'::app_role
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Update the post content
  UPDATE blog_posts
  SET content = p_updated_content,
      updated_at = NOW()
  WHERE id = p_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  RETURN TRUE;
END;
$$;

-- Optional: add comment for documentation
COMMENT ON FUNCTION public.apply_internal_link(uuid, text)
IS 'Updates blog_posts.content if caller is admin (bypasses RLS via SECURITY DEFINER). Used by internal linking approvals.';

-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251029033504_b10a66ba-0f5b-419d-b82a-e549ab46a733.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 62: 20251030000000_add_stripe_price_ids.sql
-- ============================================

-- Add separate Stripe price ID columns for monthly and yearly billing
-- This allows each plan to have different Stripe price IDs for monthly vs yearly subscriptions

ALTER TABLE subscription_plans 
ADD COLUMN IF NOT EXISTS stripe_price_id_monthly TEXT,
ADD COLUMN IF NOT EXISTS stripe_price_id_yearly TEXT,
ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;

-- Remove the old unique constraint on the single stripe_price_id if it exists
ALTER TABLE subscription_plans 
DROP CONSTRAINT IF EXISTS subscription_plans_stripe_price_id_key;

-- Add new unique constraints for the separate price IDs
ALTER TABLE subscription_plans
ADD CONSTRAINT subscription_plans_stripe_price_id_monthly_key UNIQUE (stripe_price_id_monthly);

ALTER TABLE subscription_plans
ADD CONSTRAINT subscription_plans_stripe_price_id_yearly_key UNIQUE (stripe_price_id_yearly);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_price_id_monthly 
  ON subscription_plans(stripe_price_id_monthly) WHERE stripe_price_id_monthly IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_price_id_yearly 
  ON subscription_plans(stripe_price_id_yearly) WHERE stripe_price_id_yearly IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_product_id 
  ON subscription_plans(stripe_product_id) WHERE stripe_product_id IS NOT NULL;

-- Comment explaining the change
COMMENT ON COLUMN subscription_plans.stripe_price_id_monthly IS 'Stripe Price ID for monthly billing';
COMMENT ON COLUMN subscription_plans.stripe_price_id_yearly IS 'Stripe Price ID for yearly billing';
COMMENT ON COLUMN subscription_plans.stripe_product_id IS 'Stripe Product ID for this plan';
COMMENT ON COLUMN subscription_plans.stripe_price_id IS 'DEPRECATED: Use stripe_price_id_monthly or stripe_price_id_yearly instead';



-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251030000000_add_stripe_price_ids.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 63: 20251030000001_subscription_enhancements.sql
-- ============================================

-- Enhanced subscription tracking and notifications

-- Add billing cycle tracking to subscriptions
ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly'));

-- Create subscription notifications table
CREATE TABLE IF NOT EXISTS subscription_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- 'limit_warning', 'limit_reached', 'upgrade_suggestion', 'trial_ending', 'payment_failed', 'subscription_ending'
  feature_type TEXT, -- 'children', 'pantry_foods', 'ai_coach', 'food_tracker', etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  action_label TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscription_notifications_user_id ON subscription_notifications(user_id);
CREATE INDEX idx_subscription_notifications_created_at ON subscription_notifications(created_at DESC);
CREATE INDEX idx_subscription_notifications_is_read ON subscription_notifications(is_read) WHERE is_read = FALSE;

ALTER TABLE subscription_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON subscription_notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON subscription_notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Create usage alerts table
CREATE TABLE IF NOT EXISTS usage_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_type TEXT NOT NULL,
  threshold_percentage INTEGER NOT NULL, -- 75, 90, 100
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  notified BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_usage_alerts_user_id ON usage_alerts(user_id);
CREATE INDEX idx_usage_alerts_notified ON usage_alerts(notified) WHERE notified = FALSE;

-- Create index for efficient lookups (not unique, we handle that in the function)
CREATE INDEX idx_usage_alerts_daily_lookup 
  ON usage_alerts(user_id, feature_type, threshold_percentage, triggered_at);

ALTER TABLE usage_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own alerts"
  ON usage_alerts FOR SELECT
  USING (user_id = auth.uid());

-- Function to get user's current usage stats
CREATE OR REPLACE FUNCTION get_usage_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan RECORD;
  v_stats JSONB;
  v_children_count INTEGER;
  v_pantry_foods_count INTEGER;
  v_today_ai_requests INTEGER;
  v_month_food_tracker INTEGER;
BEGIN
  -- Get user's plan
  SELECT sp.*
  INTO v_plan
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing')
  LIMIT 1;
  
  -- If no subscription, use Free plan
  IF v_plan IS NULL THEN
    SELECT * INTO v_plan
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;
  END IF;
  
  -- Get actual usage counts
  SELECT COUNT(*) INTO v_children_count
  FROM kids
  WHERE user_id = p_user_id;
  
  SELECT COUNT(*) INTO v_pantry_foods_count
  FROM foods
  WHERE user_id = p_user_id;
  
  SELECT COALESCE(ai_coach_requests, 0) INTO v_today_ai_requests
  FROM user_usage_tracking
  WHERE user_id = p_user_id
    AND date = CURRENT_DATE;
    
  SELECT COALESCE(SUM(food_tracker_entries), 0) INTO v_month_food_tracker
  FROM user_usage_tracking
  WHERE user_id = p_user_id
    AND date >= date_trunc('month', CURRENT_DATE);
  
  -- Build response
  v_stats := jsonb_build_object(
    'plan', jsonb_build_object(
      'name', v_plan.name,
      'max_children', v_plan.max_children,
      'max_pantry_foods', v_plan.max_pantry_foods,
      'ai_coach_daily_limit', v_plan.ai_coach_daily_limit,
      'food_tracker_monthly_limit', v_plan.food_tracker_monthly_limit,
      'has_food_chaining', v_plan.has_food_chaining,
      'has_meal_builder', v_plan.has_meal_builder,
      'has_nutrition_tracking', v_plan.has_nutrition_tracking
    ),
    'usage', jsonb_build_object(
      'children', jsonb_build_object(
        'current', v_children_count,
        'limit', v_plan.max_children,
        'percentage', CASE 
          WHEN v_plan.max_children IS NULL THEN 0
          ELSE ROUND((v_children_count::DECIMAL / v_plan.max_children) * 100, 0)
        END
      ),
      'pantry_foods', jsonb_build_object(
        'current', v_pantry_foods_count,
        'limit', v_plan.max_pantry_foods,
        'percentage', CASE 
          WHEN v_plan.max_pantry_foods IS NULL THEN 0
          ELSE ROUND((v_pantry_foods_count::DECIMAL / v_plan.max_pantry_foods) * 100, 0)
        END
      ),
      'ai_coach', jsonb_build_object(
        'current', COALESCE(v_today_ai_requests, 0),
        'limit', v_plan.ai_coach_daily_limit,
        'percentage', CASE 
          WHEN v_plan.ai_coach_daily_limit IS NULL THEN 0
          WHEN v_plan.ai_coach_daily_limit = 0 THEN 100
          ELSE ROUND((COALESCE(v_today_ai_requests, 0)::DECIMAL / v_plan.ai_coach_daily_limit) * 100, 0)
        END,
        'resets_at', (CURRENT_DATE + INTERVAL '1 day')::TEXT
      ),
      'food_tracker', jsonb_build_object(
        'current', COALESCE(v_month_food_tracker, 0),
        'limit', v_plan.food_tracker_monthly_limit,
        'percentage', CASE 
          WHEN v_plan.food_tracker_monthly_limit IS NULL THEN 0
          ELSE ROUND((COALESCE(v_month_food_tracker, 0)::DECIMAL / v_plan.food_tracker_monthly_limit) * 100, 0)
        END,
        'resets_at', (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::TEXT
      )
    )
  );
  
  RETURN v_stats;
END;
$$;

-- Function to create usage alert
CREATE OR REPLACE FUNCTION create_usage_alert(
  p_user_id UUID,
  p_feature_type TEXT,
  p_threshold_percentage INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id UUID;
  v_title TEXT;
  v_message TEXT;
  v_existing_alert UUID;
BEGIN
  -- Check if alert already exists for today
  SELECT id INTO v_existing_alert
  FROM usage_alerts
  WHERE user_id = p_user_id
    AND feature_type = p_feature_type
    AND threshold_percentage = p_threshold_percentage
    AND triggered_at::date = CURRENT_DATE;
  
  -- Only create if it doesn't exist
  IF v_existing_alert IS NULL THEN
    INSERT INTO usage_alerts (user_id, feature_type, threshold_percentage)
    VALUES (p_user_id, p_feature_type, p_threshold_percentage);
  END IF;
  
  -- Create appropriate notification
  CASE p_threshold_percentage
    WHEN 75 THEN
      v_title := 'Approaching Limit';
      v_message := 'You''ve used 75% of your ' || p_feature_type || ' limit. Consider upgrading for more.';
    WHEN 90 THEN
      v_title := 'Limit Almost Reached';
      v_message := 'You''ve used 90% of your ' || p_feature_type || ' limit. Upgrade now to avoid interruption.';
    WHEN 100 THEN
      v_title := 'Limit Reached';
      v_message := 'You''ve reached your ' || p_feature_type || ' limit. Upgrade to continue using this feature.';
  END CASE;
  
  -- Insert notification
  INSERT INTO subscription_notifications (
    user_id,
    notification_type,
    feature_type,
    title,
    message,
    action_url,
    action_label,
    metadata
  ) VALUES (
    p_user_id,
    CASE WHEN p_threshold_percentage = 100 THEN 'limit_reached' ELSE 'limit_warning' END,
    p_feature_type,
    v_title,
    v_message,
    '/pricing',
    'Upgrade Now',
    jsonb_build_object('threshold', p_threshold_percentage)
  );
END;
$$;

-- Trigger to check usage thresholds
CREATE OR REPLACE FUNCTION check_usage_thresholds()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_usage_stats JSONB;
  v_feature_usage JSONB;
  v_percentage INTEGER;
BEGIN
  -- Get current usage stats
  v_usage_stats := get_usage_stats(NEW.user_id);
  
  -- Check AI coach usage
  v_feature_usage := v_usage_stats->'usage'->'ai_coach';
  v_percentage := (v_feature_usage->>'percentage')::INTEGER;
  
  IF v_percentage >= 75 AND v_percentage < 90 THEN
    PERFORM create_usage_alert(NEW.user_id, 'ai_coach', 75);
  ELSIF v_percentage >= 90 AND v_percentage < 100 THEN
    PERFORM create_usage_alert(NEW.user_id, 'ai_coach', 90);
  ELSIF v_percentage >= 100 THEN
    PERFORM create_usage_alert(NEW.user_id, 'ai_coach', 100);
  END IF;
  
  -- Check food tracker usage
  v_feature_usage := v_usage_stats->'usage'->'food_tracker';
  v_percentage := (v_feature_usage->>'percentage')::INTEGER;
  
  IF v_percentage >= 75 AND v_percentage < 90 THEN
    PERFORM create_usage_alert(NEW.user_id, 'food_tracker', 75);
  ELSIF v_percentage >= 90 AND v_percentage < 100 THEN
    PERFORM create_usage_alert(NEW.user_id, 'food_tracker', 90);
  ELSIF v_percentage >= 100 THEN
    PERFORM create_usage_alert(NEW.user_id, 'food_tracker', 100);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on usage tracking
DROP TRIGGER IF EXISTS usage_threshold_check ON user_usage_tracking;
CREATE TRIGGER usage_threshold_check
  AFTER INSERT OR UPDATE ON user_usage_tracking
  FOR EACH ROW
  EXECUTE FUNCTION check_usage_thresholds();

-- Function to get unread notifications count
CREATE OR REPLACE FUNCTION get_unread_notifications_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER
  FROM subscription_notifications
  WHERE user_id = p_user_id
    AND is_read = FALSE
    AND dismissed_at IS NULL;
$$;

-- View for subscription dashboard
CREATE OR REPLACE VIEW user_subscription_dashboard AS
SELECT 
  us.user_id,
  sp.name as plan_name,
  sp.price_monthly,
  sp.price_yearly,
  us.status,
  us.billing_cycle,
  us.current_period_start,
  us.current_period_end,
  us.cancel_at_period_end,
  us.trial_end,
  sp.max_children,
  sp.max_pantry_foods,
  sp.ai_coach_daily_limit,
  sp.food_tracker_monthly_limit,
  sp.has_food_chaining,
  sp.has_meal_builder,
  sp.has_nutrition_tracking,
  sp.has_multi_household,
  -- Calculate days until renewal/cancellation
  CASE 
    WHEN us.current_period_end IS NOT NULL THEN
      EXTRACT(DAY FROM (us.current_period_end - NOW()))::INTEGER
    ELSE NULL
  END as days_until_renewal,
  -- Unread notifications
  (SELECT COUNT(*) FROM subscription_notifications 
   WHERE user_id = us.user_id AND is_read = FALSE AND dismissed_at IS NULL) as unread_notifications
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id
WHERE us.status IN ('active', 'trialing', 'past_due');

-- Grant access to view
GRANT SELECT ON user_subscription_dashboard TO authenticated;



-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251030000001_subscription_enhancements.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 64: 20251103000000_create_seo_management_tables.sql
-- ============================================

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


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251103000000_create_seo_management_tables.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 65: 20251104000000_google_search_console_integration.sql
-- ============================================

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


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251104000000_google_search_console_integration.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 66: 20251105000000_seo_automated_monitoring.sql
-- ============================================

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


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251105000000_seo_automated_monitoring.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 67: 20251106000000_advanced_seo_features.sql
-- ============================================

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


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251106000000_advanced_seo_features.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 68: 20251107000000_enterprise_seo_features.sql
-- ============================================

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


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251107000000_enterprise_seo_features.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 69: 20251107000000_fix_complementary_subscriptions.sql
-- ============================================

-- Fix subscription system to properly handle complementary subscriptions
-- and improve usage stat checking

-- Update get_usage_stats to check for complementary subscriptions
CREATE OR REPLACE FUNCTION get_usage_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan RECORD;
  v_stats JSONB;
  v_children_count INTEGER;
  v_pantry_foods_count INTEGER;
  v_today_ai_requests INTEGER;
  v_month_food_tracker INTEGER;
  v_is_complementary BOOLEAN := FALSE;
BEGIN
  -- Get user's plan (check for active complementary subscription first)
  SELECT sp.*, us.is_complementary
  INTO v_plan
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing')
  LIMIT 1;

  -- Store complementary status
  IF v_plan IS NOT NULL THEN
    v_is_complementary := COALESCE(v_plan.is_complementary, FALSE);
  END IF;

  -- If no paid/trial subscription, check for active complementary subscription
  IF v_plan IS NULL THEN
    SELECT sp.*, TRUE as is_complementary
    INTO v_plan
    FROM complementary_subscriptions cs
    JOIN subscription_plans sp ON cs.plan_id = sp.id
    WHERE cs.user_id = p_user_id
      AND cs.status = 'active'
      AND (cs.end_date IS NULL OR cs.end_date >= NOW())
    ORDER BY cs.created_at DESC
    LIMIT 1;

    IF v_plan IS NOT NULL THEN
      v_is_complementary := TRUE;
    END IF;
  END IF;

  -- If still no subscription, use Free plan
  IF v_plan IS NULL THEN
    SELECT * INTO v_plan
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;
  END IF;

  -- Get actual usage counts
  SELECT COUNT(*) INTO v_children_count
  FROM kids
  WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_pantry_foods_count
  FROM foods
  WHERE user_id = p_user_id;

  SELECT COALESCE(ai_coach_requests, 0) INTO v_today_ai_requests
  FROM user_usage_tracking
  WHERE user_id = p_user_id
    AND date = CURRENT_DATE;

  SELECT COALESCE(SUM(food_tracker_entries), 0) INTO v_month_food_tracker
  FROM user_usage_tracking
  WHERE user_id = p_user_id
    AND date >= date_trunc('month', CURRENT_DATE);

  -- Build response (include complementary status)
  v_stats := jsonb_build_object(
    'plan', jsonb_build_object(
      'name', v_plan.name,
      'max_children', v_plan.max_children,
      'max_pantry_foods', v_plan.max_pantry_foods,
      'ai_coach_daily_limit', v_plan.ai_coach_daily_limit,
      'food_tracker_monthly_limit', v_plan.food_tracker_monthly_limit,
      'has_food_chaining', v_plan.has_food_chaining,
      'has_meal_builder', v_plan.has_meal_builder,
      'has_nutrition_tracking', v_plan.has_nutrition_tracking,
      'is_complementary', v_is_complementary
    ),
    'usage', jsonb_build_object(
      'children', jsonb_build_object(
        'current', v_children_count,
        'limit', v_plan.max_children,
        'percentage', CASE
          WHEN v_plan.max_children IS NULL THEN 0
          ELSE ROUND((v_children_count::DECIMAL / v_plan.max_children) * 100, 0)
        END
      ),
      'pantry_foods', jsonb_build_object(
        'current', v_pantry_foods_count,
        'limit', v_plan.max_pantry_foods,
        'percentage', CASE
          WHEN v_plan.max_pantry_foods IS NULL THEN 0
          ELSE ROUND((v_pantry_foods_count::DECIMAL / v_plan.max_pantry_foods) * 100, 0)
        END
      ),
      'ai_coach', jsonb_build_object(
        'current', COALESCE(v_today_ai_requests, 0),
        'limit', v_plan.ai_coach_daily_limit,
        'percentage', CASE
          WHEN v_plan.ai_coach_daily_limit IS NULL THEN 0
          WHEN v_plan.ai_coach_daily_limit = 0 THEN 100
          ELSE ROUND((COALESCE(v_today_ai_requests, 0)::DECIMAL / v_plan.ai_coach_daily_limit) * 100, 0)
        END,
        'resets_at', (CURRENT_DATE + INTERVAL '1 day')::TEXT
      ),
      'food_tracker', jsonb_build_object(
        'current', COALESCE(v_month_food_tracker, 0),
        'limit', v_plan.food_tracker_monthly_limit,
        'percentage', CASE
          WHEN v_plan.food_tracker_monthly_limit IS NULL THEN 0
          ELSE ROUND((COALESCE(v_month_food_tracker, 0)::DECIMAL / v_plan.food_tracker_monthly_limit) * 100, 0)
        END,
        'resets_at', (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::TEXT
      )
    )
  );

  RETURN v_stats;
END;
$$;

-- Function to check if user has active complementary subscription
CREATE OR REPLACE FUNCTION has_active_complementary_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_complementary BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM complementary_subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND (end_date IS NULL OR end_date >= NOW())
  ) INTO v_has_complementary;

  RETURN COALESCE(v_has_complementary, FALSE);
END;
$$;

-- Function to get complementary subscription details
-- Drop existing function first to allow return type change
DROP FUNCTION IF EXISTS get_complementary_subscription(UUID);

CREATE OR REPLACE FUNCTION get_complementary_subscription(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  plan_id UUID,
  plan_name TEXT,
  is_permanent BOOLEAN,
  end_date TIMESTAMPTZ,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cs.id,
    cs.plan_id,
    sp.name as plan_name,
    cs.is_permanent,
    cs.end_date,
    cs.reason
  FROM complementary_subscriptions cs
  JOIN subscription_plans sp ON cs.plan_id = sp.id
  WHERE cs.user_id = p_user_id
    AND cs.status = 'active'
    AND (cs.end_date IS NULL OR cs.end_date >= NOW())
  ORDER BY cs.created_at DESC
  LIMIT 1;
END;
$$;

-- Update user_subscription_dashboard view to include complementary info
DROP VIEW IF EXISTS user_subscription_dashboard;
CREATE OR REPLACE VIEW user_subscription_dashboard AS
SELECT
  us.user_id,
  us.plan_id,
  sp.name as plan_name,
  us.status,
  us.billing_cycle,
  us.current_period_end,
  us.cancel_at_period_end,
  us.trial_end,
  us.is_complementary,
  us.complementary_subscription_id,
  CASE
    WHEN us.current_period_end IS NOT NULL THEN
      EXTRACT(DAY FROM (us.current_period_end - NOW()))::INTEGER
    ELSE NULL
  END as days_until_renewal,
  (
    SELECT COUNT(*)::INTEGER
    FROM subscription_notifications sn
    WHERE sn.user_id = us.user_id
      AND sn.is_read = FALSE
      AND sn.dismissed_at IS NULL
  ) as unread_notifications_count,
  -- Add complementary subscription details if applicable
  CASE
    WHEN us.is_complementary = TRUE THEN (
      SELECT jsonb_build_object(
        'is_permanent', cs.is_permanent,
        'end_date', cs.end_date,
        'reason', cs.reason
      )
      FROM complementary_subscriptions cs
      WHERE cs.id = us.complementary_subscription_id
    )
    ELSE NULL
  END as complementary_details
FROM user_subscriptions us
JOIN subscription_plans sp ON us.plan_id = sp.id;

COMMENT ON VIEW user_subscription_dashboard IS 'Comprehensive view of user subscriptions including complementary access';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251107000000_fix_complementary_subscriptions.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 70: 20251107100000_unified_search_traffic_analytics.sql
-- ============================================

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
  model_accuracy DECIMAL(5,2), -- RÂ² or similar metric

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


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251107100000_unified_search_traffic_analytics.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 71: 20251108000000_content_optimization_features.sql
-- ============================================

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


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251108000000_content_optimization_features.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 72: 20251109000000_user_intelligence_dashboard.sql
-- ============================================

-- User Intelligence Dashboard
-- This migration creates the necessary views and functions for the unified user intelligence dashboard

-- ============================================================================
-- 1. USER ENGAGEMENT STATS (Materialized View for Performance)
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS user_engagement_stats AS
SELECT
  p.id as user_id,
  -- Login activity
  COUNT(DISTINCT ala.id) FILTER (WHERE ala.activity_type = 'login' AND ala.created_at > NOW() - INTERVAL '30 days') as logins_30d,
  COUNT(DISTINCT ala.id) FILTER (WHERE ala.activity_type = 'login' AND ala.created_at > NOW() - INTERVAL '7 days') as logins_7d,
  MAX(ala.created_at) FILTER (WHERE ala.activity_type = 'login') as last_login,

  -- Content creation activity
  COUNT(DISTINCT pe.id) FILTER (WHERE pe.created_at > NOW() - INTERVAL '30 days') as meal_plans_30d,
  COUNT(DISTINCT r.id) FILTER (WHERE r.created_at > NOW() - INTERVAL '30 days') as recipes_30d,
  COUNT(DISTINCT f.id) FILTER (WHERE f.created_at > NOW() - INTERVAL '30 days') as foods_30d,

  -- Engagement metrics
  COUNT(DISTINCT fa.id) FILTER (WHERE fa.created_at > NOW() - INTERVAL '30 days') as food_attempts_30d,
  COUNT(DISTINCT ka.id) FILTER (WHERE ka.earned_at > NOW() - INTERVAL '30 days') as achievements_30d,

  -- Error tracking
  COUNT(DISTINCT ala.id) FILTER (WHERE ala.severity = 'error' AND ala.created_at > NOW() - INTERVAL '7 days') as errors_7d,

  -- Feature adoption (count of distinct feature types used)
  COUNT(DISTINCT CASE
    WHEN pe.id IS NOT NULL THEN 'meal_plans'
    WHEN r.id IS NOT NULL THEN 'recipes'
    WHEN fa.id IS NOT NULL THEN 'food_tracking'
    WHEN ka.id IS NOT NULL THEN 'achievements'
  END) as features_adopted,

  -- Last activity timestamp
  GREATEST(
    MAX(ala.created_at),
    MAX(pe.created_at),
    MAX(r.created_at),
    MAX(f.created_at)
  ) as last_activity

FROM profiles p
LEFT JOIN admin_live_activity ala ON p.id = ala.user_id
LEFT JOIN plan_entries pe ON p.id = pe.user_id
LEFT JOIN recipes r ON p.id = r.user_id
LEFT JOIN foods f ON p.id = f.user_id
LEFT JOIN kids k ON p.id = k.user_id
LEFT JOIN food_attempts fa ON k.id = fa.kid_id
LEFT JOIN kid_achievements ka ON k.id = ka.kid_id
GROUP BY p.id;

-- Create index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_engagement_stats_user_id ON user_engagement_stats(user_id);

-- ============================================================================
-- 2. USER TICKET SUMMARY VIEW
-- ============================================================================

CREATE OR REPLACE VIEW user_ticket_summary AS
SELECT
  st.user_id,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE st.status IN ('new', 'in_progress', 'waiting_user')) as open_count,
  COUNT(*) FILTER (WHERE st.status IN ('resolved', 'closed')) as closed_count,
  MAX(st.created_at) as last_ticket_date,
  AVG(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 3600) FILTER (WHERE st.status IN ('resolved', 'closed')) as avg_resolution_hours
FROM support_tickets st
GROUP BY st.user_id;

-- ============================================================================
-- 3. HEALTH SCORE CALCULATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_user_health_score(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_score INTEGER := 100;
  v_days_since_login INTEGER;
  v_engagement_stats RECORD;
BEGIN
  -- Get engagement stats
  SELECT * INTO v_engagement_stats
  FROM user_engagement_stats
  WHERE user_id = p_user_id;

  IF v_engagement_stats IS NULL THEN
    RETURN 50; -- Default score for users with no data
  END IF;

  -- Calculate days since last login
  v_days_since_login := EXTRACT(DAY FROM NOW() - v_engagement_stats.last_login);

  -- Deduct points based on inactivity
  IF v_days_since_login > 30 THEN
    v_score := v_score - 40;
  ELSIF v_days_since_login > 14 THEN
    v_score := v_score - 25;
  ELSIF v_days_since_login > 7 THEN
    v_score := v_score - 15;
  END IF;

  -- Deduct points for low login frequency
  IF v_engagement_stats.logins_30d < 4 THEN
    v_score := v_score - 20;
  ELSIF v_engagement_stats.logins_30d < 8 THEN
    v_score := v_score - 10;
  END IF;

  -- Deduct points for low content creation
  IF v_engagement_stats.meal_plans_30d = 0 THEN
    v_score := v_score - 15;
  END IF;

  -- Deduct points for low feature adoption
  IF v_engagement_stats.features_adopted < 2 THEN
    v_score := v_score - 15;
  ELSIF v_engagement_stats.features_adopted < 3 THEN
    v_score := v_score - 10;
  END IF;

  -- Deduct points for errors
  IF v_engagement_stats.errors_7d > 5 THEN
    v_score := v_score - 15;
  ELSIF v_engagement_stats.errors_7d > 2 THEN
    v_score := v_score - 10;
  END IF;

  -- Add points for high engagement
  IF v_engagement_stats.logins_30d > 20 THEN
    v_score := v_score + 10;
  END IF;

  IF v_engagement_stats.meal_plans_30d > 10 THEN
    v_score := v_score + 5;
  END IF;

  -- Ensure score is between 0 and 100
  RETURN GREATEST(0, LEAST(100, v_score));
END;
$$;

-- ============================================================================
-- 4. USER INTELLIGENCE VIEW (Main Consolidated View)
-- ============================================================================

CREATE OR REPLACE VIEW admin_user_intelligence AS
SELECT
  p.id,
  u.email,
  p.full_name as name,
  p.created_at,

  -- Health scoring
  calculate_user_health_score(p.id) as health_score,
  CASE
    WHEN calculate_user_health_score(p.id) >= 70 THEN 'healthy'
    WHEN calculate_user_health_score(p.id) >= 40 THEN 'at_risk'
    ELSE 'critical'
  END as health_status,

  -- Subscription data
  s.id as subscription_id,
  s.status as subscription_status,
  s.stripe_subscription_id,
  s.stripe_customer_id,
  s.current_period_end as next_billing_date,
  s.cancel_at_period_end,
  COALESCE(sp.price_monthly, 0) as mrr,

  -- Calculate LTV (simplified: months active * MRR)
  ROUND(
    EXTRACT(EPOCH FROM (s.current_period_end - s.created_at)) / (86400 * 30) *
    COALESCE(sp.price_monthly, 0)
  ) as estimated_ltv,

  -- Calculate account age in days
  EXTRACT(DAY FROM NOW() - p.created_at)::INTEGER as account_age_days,

  -- Engagement metrics from materialized view
  ues.logins_30d,
  ues.logins_7d,
  ues.last_login,
  ues.last_activity,
  ues.meal_plans_30d,
  ues.recipes_30d,
  ues.foods_30d,
  ues.food_attempts_30d,
  ues.achievements_30d,
  ues.errors_7d,
  ues.features_adopted,

  -- Engagement tier classification
  CASE
    WHEN ues.logins_30d >= 20 AND ues.meal_plans_30d >= 10 THEN 'power_user'
    WHEN ues.logins_30d >= 8 AND ues.meal_plans_30d >= 4 THEN 'active'
    WHEN ues.logins_30d >= 2 THEN 'casual'
    ELSE 'inactive'
  END as user_tier,

  -- Support metrics
  uts.total_count as total_tickets,
  uts.open_count as open_tickets,
  uts.closed_count as closed_tickets,
  uts.last_ticket_date,
  uts.avg_resolution_hours,

  -- Kids count
  (SELECT COUNT(*) FROM kids k WHERE k.user_id = p.id) as kids_count,

  -- Risk indicators
  CASE
    WHEN EXTRACT(DAY FROM NOW() - ues.last_activity) > 7 THEN true
    ELSE false
  END as at_risk_inactive,

  CASE
    WHEN ues.errors_7d > 3 THEN true
    ELSE false
  END as at_risk_errors,

  CASE
    WHEN s.status = 'past_due' OR s.cancel_at_period_end THEN true
    ELSE false
  END as at_risk_payment

FROM profiles p
LEFT JOIN auth.users u ON p.id = u.id
LEFT JOIN user_subscriptions s ON p.id = s.user_id AND s.status IN ('active', 'trialing', 'past_due')
LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
LEFT JOIN user_engagement_stats ues ON p.id = ues.user_id
LEFT JOIN user_ticket_summary uts ON p.id = uts.user_id;

-- ============================================================================
-- 5. USER ACTIVITY TIMELINE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_activity_timeline(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  activity_date TIMESTAMPTZ,
  activity_type TEXT,
  activity_description TEXT,
  severity TEXT,
  metadata JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH all_activities AS (
    -- Admin live activity
    SELECT
      ala.created_at as activity_date,
      ala.activity_type,
      ala.activity_description,
      ala.severity,
      ala.metadata
    FROM admin_live_activity ala
    WHERE ala.user_id = p_user_id

    UNION ALL

    -- Support tickets
    SELECT
      st.created_at as activity_date,
      'support_ticket' as activity_type,
      'Support ticket opened: ' || st.subject as activity_description,
      CASE st.priority
        WHEN 'urgent' THEN 'error'
        WHEN 'high' THEN 'warning'
        ELSE 'info'
      END as severity,
      jsonb_build_object(
        'ticket_id', st.id,
        'status', st.status,
        'category', st.category,
        'priority', st.priority
      ) as metadata
    FROM support_tickets st
    WHERE st.user_id = p_user_id

    UNION ALL

    -- Subscription events
    SELECT
      s.created_at as activity_date,
      'subscription_created' as activity_type,
      'Subscription started' as activity_description,
      'info' as severity,
      jsonb_build_object(
        'subscription_id', s.id,
        'status', s.status
      ) as metadata
    FROM user_subscriptions s
    WHERE s.user_id = p_user_id

    UNION ALL

    -- Payment events
    SELECT
      ph.created_at as activity_date,
      'payment_' || ph.status as activity_type,
      'Payment ' || ph.status || ': $' || ph.amount as activity_description,
      CASE ph.status
        WHEN 'succeeded' THEN 'info'
        WHEN 'failed' THEN 'error'
        ELSE 'warning'
      END as severity,
      jsonb_build_object(
        'payment_id', ph.id,
        'amount', ph.amount,
        'status', ph.status
      ) as metadata
    FROM payment_history ph
    WHERE ph.user_id = p_user_id
  )
  SELECT *
  FROM all_activities
  ORDER BY activity_date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ============================================================================
-- 6. QUICK USER SEARCH FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION search_users_intelligence(
  p_search_term TEXT,
  p_filter TEXT DEFAULT NULL, -- 'at_risk', 'payment_failed', 'has_tickets', 'churned', 'vip'
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  name TEXT,
  health_score INTEGER,
  health_status TEXT,
  subscription_status TEXT,
  mrr NUMERIC,
  user_tier TEXT,
  match_rank REAL
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    aui.id,
    aui.email,
    aui.name,
    aui.health_score,
    aui.health_status,
    aui.subscription_status,
    aui.mrr,
    aui.user_tier,
    -- Simple relevance scoring
    CASE
      WHEN aui.email ILIKE p_search_term THEN 1.0
      WHEN aui.email ILIKE p_search_term || '%' THEN 0.9
      WHEN aui.email ILIKE '%' || p_search_term || '%' THEN 0.7
      WHEN aui.name ILIKE '%' || p_search_term || '%' THEN 0.6
      ELSE 0.5
    END as match_rank
  FROM admin_user_intelligence aui
  WHERE
    -- Search filter
    (
      p_search_term IS NULL OR
      p_search_term = '' OR
      aui.email ILIKE '%' || p_search_term || '%' OR
      aui.name ILIKE '%' || p_search_term || '%' OR
      aui.id::TEXT = p_search_term
    )
    -- Quick filters
    AND (
      p_filter IS NULL OR
      (p_filter = 'at_risk' AND aui.health_status IN ('at_risk', 'critical')) OR
      (p_filter = 'payment_failed' AND aui.subscription_status = 'past_due') OR
      (p_filter = 'has_tickets' AND aui.open_tickets > 0) OR
      (p_filter = 'churned' AND (aui.subscription_status IS NULL OR aui.subscription_status = 'canceled')) OR
      (p_filter = 'vip' AND aui.user_tier = 'power_user')
    )
  ORDER BY match_rank DESC, aui.health_score ASC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 7. REFRESH FUNCTION FOR MATERIALIZED VIEW
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_user_engagement_stats()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_engagement_stats;
END;
$$;

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on views is not needed, but ensure base tables have it

-- Grant access to authenticated users (admins will be checked at app level)
GRANT SELECT ON user_engagement_stats TO authenticated;
GRANT SELECT ON user_ticket_summary TO authenticated;
GRANT SELECT ON admin_user_intelligence TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_user_health_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_activity_timeline(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION search_users_intelligence(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_user_engagement_stats() TO authenticated;

-- ============================================================================
-- 9. SCHEDULED REFRESH (Optional - requires pg_cron extension)
-- ============================================================================

-- Uncomment if pg_cron is available
-- SELECT cron.schedule(
--   'refresh-user-engagement-stats',
--   '*/15 * * * *', -- Every 15 minutes
--   $$SELECT refresh_user_engagement_stats()$$
-- );

-- ============================================================================
-- 10. INITIAL MATERIALIZED VIEW REFRESH
-- ============================================================================

REFRESH MATERIALIZED VIEW user_engagement_stats;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON MATERIALIZED VIEW user_engagement_stats IS 'Materialized view containing user engagement metrics for fast queries. Refresh every 15 minutes.';
COMMENT ON VIEW user_ticket_summary IS 'Summary of support tickets per user';
COMMENT ON VIEW admin_user_intelligence IS 'Consolidated view of all user intelligence data for admin dashboard';
COMMENT ON FUNCTION calculate_user_health_score(UUID) IS 'Calculates a health score (0-100) for a user based on engagement metrics';
COMMENT ON FUNCTION get_user_activity_timeline(UUID, INTEGER, INTEGER) IS 'Returns paginated activity timeline for a user across all systems';
COMMENT ON FUNCTION search_users_intelligence(TEXT, TEXT, INTEGER) IS 'Search users with optional filters (at_risk, payment_failed, has_tickets, churned, vip)';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251109000000_user_intelligence_dashboard.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 73: 20251109000001_smart_support_copilot.sql
-- ============================================

-- Smart Support Copilot Database Schema
-- This migration creates the necessary tables and functions for AI-powered support automation

-- ============================================================================
-- 1. TICKET AI ANALYSIS CACHE
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_ticket_ai_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,

  -- AI Classification
  issue_type TEXT, -- 'billing', 'bug', 'feature_request', 'question', 'account', 'technical'
  issue_confidence NUMERIC(3,2) CHECK (issue_confidence >= 0 AND issue_confidence <= 1),
  affected_feature TEXT, -- 'meal_plans', 'recipes', 'subscription', 'login', etc.

  -- Auto-resolution assessment
  auto_resolvable BOOLEAN DEFAULT false,
  auto_resolution_confidence NUMERIC(3,2) CHECK (auto_resolution_confidence >= 0 AND auto_resolution_confidence <= 1),

  -- Response suggestions
  suggested_response TEXT,
  response_template_id UUID,

  -- Similar tickets (for learning from past resolutions)
  similar_ticket_ids UUID[],
  similarity_scores NUMERIC[],

  -- User context (auto-gathered)
  auto_gathered_context JSONB DEFAULT '{}'::jsonb,
  /*
    Context includes:
    - subscription_status
    - recent_errors (last 7 days)
    - recent_activity
    - feature_flags
    - user_tier
    - health_score
  */

  -- Sentiment analysis
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'frustrated')),
  sentiment_score NUMERIC(3,2),
  urgency_score INTEGER CHECK (urgency_score >= 0 AND urgency_score <= 100),

  -- Processing metadata
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  analysis_model TEXT DEFAULT 'gpt-4o-mini',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_ai_analysis_ticket_id ON support_ticket_ai_analysis(ticket_id);
CREATE INDEX idx_ticket_ai_analysis_auto_resolvable ON support_ticket_ai_analysis(auto_resolvable) WHERE auto_resolvable = true;
CREATE INDEX idx_ticket_ai_analysis_issue_type ON support_ticket_ai_analysis(issue_type);

-- ============================================================================
-- 2. KNOWLEDGE BASE ARTICLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_kb_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Article content
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,

  -- Organization
  category TEXT, -- 'getting_started', 'billing', 'troubleshooting', 'features', 'faq'
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Auto-generation tracking
  auto_generated BOOLEAN DEFAULT false,
  created_from_ticket_id UUID REFERENCES support_tickets(id),
  generated_from_pattern TEXT, -- Description of the pattern that triggered creation

  -- Publishing
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,

  -- Analytics
  view_count INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,

  -- Related articles
  related_article_ids UUID[],

  -- Search optimization
  search_vector tsvector,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_kb_articles_category ON support_kb_articles(category);
CREATE INDEX idx_kb_articles_status ON support_kb_articles(status);
CREATE INDEX idx_kb_articles_search_vector ON support_kb_articles USING GIN(search_vector);
CREATE INDEX idx_kb_articles_tags ON support_kb_articles USING GIN(tags);

-- Trigger to update search_vector
CREATE OR REPLACE FUNCTION update_kb_article_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_kb_search_vector
  BEFORE INSERT OR UPDATE OF title, content, summary, tags ON support_kb_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_kb_article_search_vector();

-- ============================================================================
-- 3. SUPPORT RESPONSE TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_response_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template details
  name TEXT NOT NULL,
  category TEXT, -- 'billing', 'bug', 'feature_request', 'question', 'greeting', 'closing'
  template_text TEXT NOT NULL,

  -- Variables support (e.g., {{user_name}}, {{subscription_status}})
  variables TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Success metrics
  avg_resolution_time_hours NUMERIC(10,2),
  success_rate NUMERIC(3,2), -- Based on CSAT ratings

  -- Template metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_response_templates_category ON support_response_templates(category);
CREATE INDEX idx_response_templates_active ON support_response_templates(is_active) WHERE is_active = true;

-- ============================================================================
-- 4. TICKET SATISFACTION RATINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_ticket_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,

  -- CSAT rating
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback_text TEXT,

  -- Tracking
  ai_assisted BOOLEAN DEFAULT false,
  auto_resolved BOOLEAN DEFAULT false,
  response_template_used UUID REFERENCES support_response_templates(id),

  -- Analysis
  rating_category TEXT GENERATED ALWAYS AS (
    CASE
      WHEN rating >= 4 THEN 'satisfied'
      WHEN rating = 3 THEN 'neutral'
      ELSE 'unsatisfied'
    END
  ) STORED,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(ticket_id)
);

CREATE INDEX idx_ticket_ratings_rating ON support_ticket_ratings(rating);
CREATE INDEX idx_ticket_ratings_ai_assisted ON support_ticket_ratings(ai_assisted);
CREATE INDEX idx_ticket_ratings_auto_resolved ON support_ticket_ratings(auto_resolved);

-- ============================================================================
-- 5. SUPPORT PERFORMANCE METRICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW support_performance_metrics AS
WITH ticket_stats AS (
  SELECT
    DATE(st.created_at) as metric_date,
    COUNT(*) as total_tickets,
    COUNT(*) FILTER (WHERE staa.auto_resolvable = true) as auto_resolvable_tickets,
    COUNT(*) FILTER (WHERE staa.auto_resolvable = true AND st.status IN ('resolved', 'closed')) as auto_resolved_tickets,
    COUNT(*) FILTER (WHERE staa.id IS NOT NULL) as ai_assisted_tickets,
    COUNT(*) FILTER (WHERE st.status IN ('resolved', 'closed')) as resolved_tickets,
    AVG(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 3600) FILTER (WHERE st.status IN ('resolved', 'closed')) as avg_resolution_hours,
    AVG(str.rating) as avg_csat_rating,
    AVG(str.rating) FILTER (WHERE staa.id IS NOT NULL) as avg_csat_ai_assisted,
    AVG(str.rating) FILTER (WHERE str.auto_resolved = true) as avg_csat_auto_resolved
  FROM support_tickets st
  LEFT JOIN support_ticket_ai_analysis staa ON st.id = staa.ticket_id
  LEFT JOIN support_ticket_ratings str ON st.id = str.ticket_id
  WHERE st.created_at >= NOW() - INTERVAL '90 days'
  GROUP BY DATE(st.created_at)
),
issue_breakdown AS (
  SELECT
    staa.issue_type,
    COUNT(*) as ticket_count,
    AVG(staa.issue_confidence) as avg_confidence,
    COUNT(*) FILTER (WHERE st.status IN ('resolved', 'closed')) as resolved_count,
    AVG(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 3600) FILTER (WHERE st.status IN ('resolved', 'closed')) as avg_resolution_hours
  FROM support_tickets st
  JOIN support_ticket_ai_analysis staa ON st.id = staa.ticket_id
  WHERE st.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY staa.issue_type
)
SELECT
  ts.*,
  json_agg(
    json_build_object(
      'issue_type', ib.issue_type,
      'ticket_count', ib.ticket_count,
      'avg_confidence', ib.avg_confidence,
      'resolved_count', ib.resolved_count,
      'avg_resolution_hours', ib.avg_resolution_hours
    )
  ) as issue_breakdown
FROM ticket_stats ts
CROSS JOIN issue_breakdown ib
GROUP BY ts.metric_date, ts.total_tickets, ts.auto_resolvable_tickets, ts.auto_resolved_tickets,
         ts.ai_assisted_tickets, ts.resolved_tickets, ts.avg_resolution_hours, ts.avg_csat_rating,
         ts.avg_csat_ai_assisted, ts.avg_csat_auto_resolved
ORDER BY ts.metric_date DESC;

-- ============================================================================
-- 6. FUNCTION: AUTO-GATHER USER CONTEXT FOR TICKET
-- ============================================================================

CREATE OR REPLACE FUNCTION gather_ticket_user_context(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_context JSONB;
BEGIN
  SELECT jsonb_build_object(
    'subscription_status', (
      SELECT status
      FROM subscriptions
      WHERE user_id = p_user_id
        AND status IN ('active', 'trialing', 'past_due')
      LIMIT 1
    ),
    'subscription_mrr', (
      SELECT spm.price_monthly
      FROM subscriptions s
      JOIN stripe_product_mapping spm ON s.stripe_price_id = spm.stripe_price_id
      WHERE s.user_id = p_user_id
        AND s.status IN ('active', 'trialing', 'past_due')
      LIMIT 1
    ),
    'recent_errors', (
      SELECT json_agg(
        json_build_object(
          'activity_type', activity_type,
          'description', activity_description,
          'created_at', created_at
        )
      )
      FROM (
        SELECT activity_type, activity_description, created_at
        FROM admin_live_activity
        WHERE user_id = p_user_id
          AND severity = 'error'
          AND created_at > NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 5
      ) errors
    ),
    'last_login', (
      SELECT MAX(created_at)
      FROM admin_live_activity
      WHERE user_id = p_user_id
        AND activity_type = 'login'
    ),
    'user_tier', (
      SELECT user_tier
      FROM admin_user_intelligence
      WHERE id = p_user_id
    ),
    'health_score', (
      SELECT health_score
      FROM admin_user_intelligence
      WHERE id = p_user_id
    ),
    'open_tickets_count', (
      SELECT COUNT(*)
      FROM support_tickets
      WHERE user_id = p_user_id
        AND status IN ('new', 'in_progress', 'waiting_user')
    ),
    'total_tickets_count', (
      SELECT COUNT(*)
      FROM support_tickets
      WHERE user_id = p_user_id
    ),
    'account_age_days', (
      SELECT EXTRACT(DAY FROM NOW() - created_at)::INTEGER
      FROM profiles
      WHERE id = p_user_id
    )
  ) INTO v_context;

  RETURN v_context;
END;
$$;

-- ============================================================================
-- 7. FUNCTION: FIND SIMILAR TICKETS (FOR AI LEARNING)
-- ============================================================================

CREATE OR REPLACE FUNCTION find_similar_tickets(
  p_ticket_id UUID,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  similar_ticket_id UUID,
  similarity_score NUMERIC,
  resolution_summary TEXT,
  resolution_time_hours NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH current_ticket AS (
    SELECT
      st.subject,
      st.description,
      st.category,
      staa.issue_type
    FROM support_tickets st
    LEFT JOIN support_ticket_ai_analysis staa ON st.id = staa.ticket_id
    WHERE st.id = p_ticket_id
  )
  SELECT
    st.id as similar_ticket_id,
    -- Simple similarity based on category and issue_type match
    CASE
      WHEN st.category = ct.category AND staa.issue_type = ct.issue_type THEN 0.9
      WHEN st.category = ct.category THEN 0.6
      WHEN staa.issue_type = ct.issue_type THEN 0.5
      ELSE 0.3
    END as similarity_score,
    LEFT(st.description, 200) as resolution_summary,
    EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 3600 as resolution_time_hours
  FROM support_tickets st
  JOIN support_ticket_ai_analysis staa ON st.id = staa.ticket_id
  CROSS JOIN current_ticket ct
  WHERE st.id != p_ticket_id
    AND st.status IN ('resolved', 'closed')
    AND (
      st.category = ct.category OR
      staa.issue_type = ct.issue_type
    )
  ORDER BY similarity_score DESC, st.updated_at DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 8. FUNCTION: SEARCH KNOWLEDGE BASE
-- ============================================================================

CREATE OR REPLACE FUNCTION search_kb_articles(
  p_query TEXT,
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  article_id UUID,
  title TEXT,
  summary TEXT,
  category TEXT,
  relevance_rank REAL
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.title,
    kb.summary,
    kb.category,
    ts_rank(kb.search_vector, plainto_tsquery('english', p_query)) as relevance_rank
  FROM support_kb_articles kb
  WHERE kb.status = 'published'
    AND (p_category IS NULL OR kb.category = p_category)
    AND kb.search_vector @@ plainto_tsquery('english', p_query)
  ORDER BY relevance_rank DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 9. TRIGGER: AUTO-UPDATE TEMPLATE USAGE STATS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_template_usage_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update usage count and last used timestamp
  IF NEW.response_template_used IS NOT NULL THEN
    UPDATE support_response_templates
    SET
      usage_count = usage_count + 1,
      last_used_at = NOW()
    WHERE id = NEW.response_template_used;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_template_usage
  AFTER INSERT ON support_ticket_ratings
  FOR EACH ROW
  WHEN (NEW.response_template_used IS NOT NULL)
  EXECUTE FUNCTION update_template_usage_stats();

-- ============================================================================
-- 10. TRIGGER: UPDATE TEMPLATE SUCCESS RATE
-- ============================================================================

CREATE OR REPLACE FUNCTION update_template_success_rate()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate success rate for the template
  UPDATE support_response_templates srt
  SET success_rate = (
    SELECT AVG(rating)::NUMERIC / 5.0
    FROM support_ticket_ratings
    WHERE response_template_used = NEW.response_template_used
  )
  WHERE id = NEW.response_template_used;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_template_success_rate
  AFTER INSERT OR UPDATE OF rating ON support_ticket_ratings
  FOR EACH ROW
  WHEN (NEW.response_template_used IS NOT NULL)
  EXECUTE FUNCTION update_template_success_rate();

-- ============================================================================
-- 11. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE support_ticket_ai_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_response_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_ratings ENABLE ROW LEVEL SECURITY;

-- Admin-only access for AI analysis and templates
CREATE POLICY support_ai_analysis_admin_all ON support_ticket_ai_analysis
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY support_templates_admin_all ON support_response_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- KB articles - admins can do all, users can read published
CREATE POLICY kb_articles_admin_all ON support_kb_articles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY kb_articles_user_read ON support_kb_articles
  FOR SELECT USING (status = 'published');

-- Ticket ratings - users can rate their own tickets
CREATE POLICY ticket_ratings_own ON support_ticket_ratings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets st
      WHERE st.id = ticket_id AND st.user_id = auth.uid()
    )
  );

CREATE POLICY ticket_ratings_admin_read ON support_ticket_ratings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- 12. GRANTS
-- ============================================================================

GRANT SELECT ON support_performance_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION gather_ticket_user_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION find_similar_tickets(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION search_kb_articles(TEXT, TEXT, INTEGER) TO authenticated;

-- ============================================================================
-- 13. SEED DATA - DEFAULT RESPONSE TEMPLATES
-- ============================================================================

INSERT INTO support_response_templates (name, category, template_text, variables) VALUES
('Password Reset', 'account', 'Hi {{user_name}},

I can help you reset your password. I''ve sent a password reset link to your email address ({{user_email}}).

Please check your inbox and spam folder. The link will expire in 1 hour.

If you don''t receive it within a few minutes, please let me know and I''ll resend it.

Best regards,
Support Team', ARRAY['user_name', 'user_email']),

('Subscription Cancellation Confirmation', 'billing', 'Hi {{user_name}},

I''ve confirmed that your subscription has been cancelled. Your access will continue until {{end_date}}, and you won''t be charged again.

We''re sorry to see you go! If there''s anything we could have done better, we''d love to hear your feedback.

If you change your mind, you can reactivate your subscription anytime from your account settings.

Thank you for being a customer!

Best regards,
Support Team', ARRAY['user_name', 'end_date']),

('Feature Request Acknowledgment', 'feature_request', 'Hi {{user_name}},

Thank you for suggesting this feature! We really appreciate customers who take the time to share ideas.

I''ve forwarded your request to our product team for review. While I can''t promise when or if this will be implemented, we carefully consider all feature requests when planning our roadmap.

We''ll keep you updated if we decide to move forward with this feature.

Is there anything else I can help you with today?

Best regards,
Support Team', ARRAY['user_name']),

('Bug Report - Under Investigation', 'bug', 'Hi {{user_name}},

Thank you for reporting this issue. I''ve confirmed this is a bug and our engineering team is now investigating.

Here''s what we know so far:
- Issue: {{issue_description}}
- Status: Under investigation
- Priority: {{priority}}

I''ll keep you updated on our progress. We aim to resolve this as quickly as possible.

As a workaround, you might try: {{workaround}}

Thank you for your patience!

Best regards,
Support Team', ARRAY['user_name', 'issue_description', 'priority', 'workaround']),

('General Question - Browser Cache Clear', 'technical', 'Hi {{user_name}},

This issue is often resolved by clearing your browser cache. Here''s how:

**Chrome:**
1. Press Ctrl+Shift+Delete (Cmd+Shift+Delete on Mac)
2. Select "Cached images and files"
3. Click "Clear data"

**Safari:**
1. Go to Safari > Preferences > Privacy
2. Click "Manage Website Data"
3. Click "Remove All"

After clearing the cache, please log out and log back in.

Let me know if this resolves the issue or if you need further assistance!

Best regards,
Support Team', ARRAY['user_name'])

ON CONFLICT DO NOTHING;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE support_ticket_ai_analysis IS 'AI-powered analysis cache for support tickets including classification, sentiment, and resolution suggestions';
COMMENT ON TABLE support_kb_articles IS 'Knowledge base articles for self-service support, can be auto-generated from ticket patterns';
COMMENT ON TABLE support_response_templates IS 'Reusable response templates with usage tracking and success metrics';
COMMENT ON TABLE support_ticket_ratings IS 'Customer satisfaction ratings for support tickets';
COMMENT ON VIEW support_performance_metrics IS 'Aggregated support performance metrics including AI assistance effectiveness';
COMMENT ON FUNCTION gather_ticket_user_context(UUID) IS 'Automatically gathers relevant user context for support ticket triage';
COMMENT ON FUNCTION find_similar_tickets(UUID, INTEGER) IS 'Finds similar resolved tickets for learning from past resolutions';
COMMENT ON FUNCTION search_kb_articles(TEXT, TEXT, INTEGER) IS 'Full-text search across knowledge base articles';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251109000001_smart_support_copilot.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 74: 20251109000002_revenue_operations_command_center.sql
-- ============================================

-- Revenue Operations Command Center Database Schema
-- This migration creates the necessary tables and functions for revenue ops, churn prevention, and growth optimization

-- ============================================================================
-- 1. CHURN PREDICTION SCORES
-- ============================================================================

CREATE TABLE IF NOT EXISTS revenue_churn_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Churn prediction
  churn_probability NUMERIC(3,2) NOT NULL CHECK (churn_probability >= 0 AND churn_probability <= 1),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

  -- Contributing factors (scored 0-100)
  risk_factors JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    Risk factors include:
    - engagement_score: 0-100 (low engagement = high risk)
    - feature_adoption_score: 0-100
    - error_frequency_score: 0-100
    - payment_health_score: 0-100
    - support_satisfaction_score: 0-100
  */

  -- Prediction metadata
  model_version TEXT DEFAULT 'rule_based_v1',
  confidence_score NUMERIC(3,2),

  -- Temporal tracking
  last_calculated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prediction_expires TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',

  -- Historical tracking
  previous_probability NUMERIC(3,2),
  trend TEXT CHECK (trend IN ('improving', 'stable', 'declining')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

CREATE INDEX idx_churn_predictions_user_id ON revenue_churn_predictions(user_id);
CREATE INDEX idx_churn_predictions_risk_level ON revenue_churn_predictions(risk_level);
CREATE INDEX idx_churn_predictions_expires ON revenue_churn_predictions(prediction_expires);

-- ============================================================================
-- 2. AUTOMATED REVENUE INTERVENTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS revenue_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Intervention details
  intervention_type TEXT NOT NULL CHECK (intervention_type IN (
    'win_back_email',
    'feature_nudge',
    'payment_recovery',
    'upsell_annual',
    'retention_discount',
    'onboarding_reminder',
    'success_call',
    'churn_survey'
  )),

  -- Campaign tracking
  campaign_id UUID,
  campaign_name TEXT,

  -- Trigger information
  triggered_by TEXT CHECK (triggered_by IN ('churn_risk', 'payment_failure', 'low_engagement', 'manual')),
  trigger_data JSONB DEFAULT '{}'::jsonb,

  -- Execution
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'sent',
    'engaged',
    'converted',
    'failed',
    'cancelled'
  )),

  -- Results
  result_data JSONB DEFAULT '{}'::jsonb,
  /*
    Result data includes:
    - email_opened: boolean
    - email_clicked: boolean
    - conversion_achieved: boolean
    - revenue_retained: numeric
    - churn_prevented: boolean
  */

  -- Effectiveness
  engagement_score NUMERIC(3,2), -- How engaged was the user with intervention
  conversion_achieved BOOLEAN DEFAULT false,
  revenue_impact NUMERIC(10,2), -- Estimated revenue saved/generated

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interventions_user_id ON revenue_interventions(user_id);
CREATE INDEX idx_interventions_type ON revenue_interventions(intervention_type);
CREATE INDEX idx_interventions_status ON revenue_interventions(status);
CREATE INDEX idx_interventions_scheduled ON revenue_interventions(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_interventions_triggered ON revenue_interventions(triggered_at);

-- ============================================================================
-- 3. PAYMENT RECOVERY & DUNNING
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_recovery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Payment failure details
  payment_intent_id TEXT,
  failure_reason TEXT,
  failure_code TEXT,
  failed_amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',

  -- Recovery attempt
  attempt_number INTEGER NOT NULL DEFAULT 1,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_retry_at TIMESTAMPTZ,

  -- Result
  result TEXT NOT NULL CHECK (result IN ('success', 'failed', 'pending')),
  recovery_method TEXT, -- 'auto_retry', 'updated_payment_method', 'manual'

  -- Dunning communication
  dunning_email_sent BOOLEAN DEFAULT false,
  dunning_email_sent_at TIMESTAMPTZ,
  payment_method_updated BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_recovery_subscription ON payment_recovery_attempts(subscription_id);
CREATE INDEX idx_payment_recovery_user ON payment_recovery_attempts(user_id);
CREATE INDEX idx_payment_recovery_next_retry ON payment_recovery_attempts(next_retry_at) WHERE result = 'pending';

-- ============================================================================
-- 4. REVENUE COHORTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS revenue_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_month DATE NOT NULL, -- First day of signup month
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Acquisition data
  acquisition_channel TEXT, -- 'organic', 'paid', 'referral', 'social', etc.
  initial_plan TEXT,
  initial_mrr NUMERIC(10,2),

  -- Lifetime tracking
  total_revenue NUMERIC(10,2) DEFAULT 0,
  total_payments INTEGER DEFAULT 0,
  churned_at TIMESTAMPTZ,
  churn_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(cohort_month, user_id)
);

CREATE INDEX idx_cohorts_month ON revenue_cohorts(cohort_month);
CREATE INDEX idx_cohorts_user ON revenue_cohorts(user_id);
CREATE INDEX idx_cohorts_channel ON revenue_cohorts(acquisition_channel);
CREATE INDEX idx_cohorts_churned ON revenue_cohorts(churned_at);

-- ============================================================================
-- 5. REVENUE FORECASTS (Cached Predictions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS revenue_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Forecast metadata
  forecast_date DATE NOT NULL, -- Date forecast was generated
  forecast_month DATE NOT NULL, -- Month being forecasted
  scenario TEXT NOT NULL CHECK (scenario IN ('conservative', 'base', 'optimistic')),

  -- Predictions
  predicted_mrr NUMERIC(10,2) NOT NULL,
  predicted_arr NUMERIC(10,2) NOT NULL,
  predicted_new_customers INTEGER,
  predicted_churned_customers INTEGER,
  predicted_churn_rate NUMERIC(5,4),

  -- Assumptions used
  assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    Assumptions include:
    - growth_rate: numeric
    - churn_rate: numeric
    - avg_subscription_value: numeric
    - new_signups_per_month: integer
  */

  -- Confidence
  confidence_level NUMERIC(3,2),

  generated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(forecast_date, forecast_month, scenario)
);

CREATE INDEX idx_forecasts_month ON revenue_forecasts(forecast_month);
CREATE INDEX idx_forecasts_scenario ON revenue_forecasts(scenario);
CREATE INDEX idx_forecasts_generated ON revenue_forecasts(generated_at);

-- ============================================================================
-- 6. MATERIALIZED VIEW: COHORT RETENTION ANALYSIS
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS revenue_cohort_retention AS
WITH cohort_data AS (
  SELECT
    DATE_TRUNC('month', p.created_at)::DATE as cohort_month,
    p.id as user_id,
    p.created_at as signup_date,
    s.id as subscription_id,
    s.status as subscription_status,
    s.created_at as subscription_start,
    CASE 
      WHEN s.status = 'canceled' THEN s.updated_at
      ELSE NULL 
    END as subscription_end,
    COALESCE(sp.price_monthly, 0) as mrr
  FROM profiles p
  LEFT JOIN user_subscriptions s ON p.id = s.user_id
  LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE p.created_at >= NOW() - INTERVAL '12 months'
),
monthly_retention AS (
  SELECT
    cd.cohort_month,
    COUNT(DISTINCT cd.user_id) as cohort_size,
    SUM(cd.mrr) as cohort_initial_mrr,

    -- Month 0 (signup month)
    COUNT(DISTINCT cd.user_id) as m0_users,
    SUM(CASE WHEN cd.subscription_status IN ('active', 'trialing') THEN cd.mrr ELSE 0 END) as m0_mrr,

    -- Month 1
    COUNT(DISTINCT CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '1 month')
      THEN cd.user_id END) as m1_users,
    SUM(CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '1 month')
      THEN cd.mrr ELSE 0 END) as m1_mrr,

    -- Month 2
    COUNT(DISTINCT CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '2 months')
      THEN cd.user_id END) as m2_users,
    SUM(CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '2 months')
      THEN cd.mrr ELSE 0 END) as m2_mrr,

    -- Month 3
    COUNT(DISTINCT CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '3 months')
      THEN cd.user_id END) as m3_users,
    SUM(CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '3 months')
      THEN cd.mrr ELSE 0 END) as m3_mrr,

    -- Month 6
    COUNT(DISTINCT CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '6 months')
      THEN cd.user_id END) as m6_users,
    SUM(CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '6 months')
      THEN cd.mrr ELSE 0 END) as m6_mrr,

    -- Average LTV calculation
    AVG(CASE
      WHEN cd.subscription_end IS NOT NULL
      THEN EXTRACT(EPOCH FROM (cd.subscription_end - cd.subscription_start)) / (86400 * 30) * cd.mrr
      ELSE EXTRACT(EPOCH FROM (NOW() - cd.subscription_start)) / (86400 * 30) * cd.mrr
    END) as avg_ltv

  FROM cohort_data cd
  GROUP BY cd.cohort_month
)
SELECT
  mr.cohort_month,
  mr.cohort_size,
  mr.cohort_initial_mrr,

  -- Retention percentages
  ROUND(mr.m0_users::NUMERIC / NULLIF(mr.cohort_size, 0) * 100, 1) as m0_retention_pct,
  ROUND(mr.m1_users::NUMERIC / NULLIF(mr.cohort_size, 0) * 100, 1) as m1_retention_pct,
  ROUND(mr.m2_users::NUMERIC / NULLIF(mr.cohort_size, 0) * 100, 1) as m2_retention_pct,
  ROUND(mr.m3_users::NUMERIC / NULLIF(mr.cohort_size, 0) * 100, 1) as m3_retention_pct,
  ROUND(mr.m6_users::NUMERIC / NULLIF(mr.cohort_size, 0) * 100, 1) as m6_retention_pct,

  -- MRR retention
  mr.m0_mrr,
  mr.m1_mrr,
  mr.m2_mrr,
  mr.m3_mrr,
  mr.m6_mrr,

  -- LTV
  ROUND(mr.avg_ltv, 2) as avg_ltv

FROM monthly_retention mr
ORDER BY mr.cohort_month DESC;

CREATE UNIQUE INDEX idx_cohort_retention_month ON revenue_cohort_retention(cohort_month);

-- ============================================================================
-- 7. MATERIALIZED VIEW: REVENUE METRICS DAILY
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS revenue_metrics_daily AS
WITH daily_metrics AS (
  SELECT
    DATE(s.created_at) as metric_date,

    -- MRR calculation (active subscriptions)
    COUNT(DISTINCT CASE WHEN s.status IN ('active', 'trialing') THEN s.id END) as active_subscriptions,
    SUM(CASE
      WHEN s.status IN ('active', 'trialing')
      THEN (SELECT price_monthly FROM subscription_plans WHERE id = s.plan_id)
      ELSE 0
    END) as mrr,

    -- New subscriptions
    COUNT(CASE WHEN DATE(s.created_at) = DATE(NOW()) THEN 1 END) as new_subscriptions_today,

    -- Churned subscriptions (using updated_at when status became 'canceled')
    COUNT(CASE WHEN s.status = 'canceled' AND DATE(s.updated_at) = DATE(NOW()) THEN 1 END) as churned_subscriptions_today,

    -- Revenue
    SUM(CASE WHEN DATE(s.created_at) = DATE(NOW()) THEN
      (SELECT price_monthly FROM subscription_plans WHERE id = s.plan_id)
    ELSE 0 END) as new_mrr_today,

    SUM(CASE WHEN s.status = 'canceled' AND DATE(s.updated_at) = DATE(NOW()) THEN
      (SELECT price_monthly FROM subscription_plans WHERE id = s.plan_id)
    ELSE 0 END) as churned_mrr_today

  FROM user_subscriptions s
  WHERE s.created_at >= NOW() - INTERVAL '90 days'
  GROUP BY DATE(s.created_at)
)
SELECT
  dm.metric_date,
  dm.active_subscriptions,
  dm.mrr,
  dm.mrr * 12 as arr,
  dm.new_subscriptions_today,
  dm.churned_subscriptions_today,
  dm.new_mrr_today,
  dm.churned_mrr_today,
  dm.new_mrr_today - dm.churned_mrr_today as net_new_mrr,

  -- Growth rates
  ROUND(
    (dm.mrr - LAG(dm.mrr) OVER (ORDER BY dm.metric_date)) /
    NULLIF(LAG(dm.mrr) OVER (ORDER BY dm.metric_date), 0) * 100,
    2
  ) as mrr_growth_pct,

  -- Churn rate (trailing 30 days)
  ROUND(
    dm.churned_subscriptions_today::NUMERIC /
    NULLIF(dm.active_subscriptions, 0) * 100,
    2
  ) as churn_rate_pct

FROM daily_metrics dm
ORDER BY dm.metric_date DESC;

CREATE UNIQUE INDEX idx_revenue_metrics_date ON revenue_metrics_daily(metric_date);

-- ============================================================================
-- 8. FUNCTION: CALCULATE CHURN PROBABILITY
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_churn_probability(p_user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_probability NUMERIC := 0.0;
  v_engagement_score INTEGER;
  v_feature_adoption INTEGER;
  v_error_frequency INTEGER;
  v_payment_health INTEGER;
  v_days_since_login INTEGER;
  v_subscription_status TEXT;
  v_cancel_attempts INTEGER;
BEGIN
  -- Get user intelligence data
  SELECT
    health_score,
    features_adopted,
    errors_7d,
    subscription_status,
    EXTRACT(DAY FROM NOW() - last_login)::INTEGER
  INTO
    v_engagement_score,
    v_feature_adoption,
    v_error_frequency,
    v_subscription_status,
    v_days_since_login
  FROM admin_user_intelligence
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN 0.5; -- Default probability if no data
  END IF;

  -- Calculate churn probability based on signals (0.0 to 1.0)

  -- Engagement score (inverse - low score = high churn risk)
  v_probability := v_probability + ((100 - COALESCE(v_engagement_score, 50)) / 100.0 * 0.3);

  -- Days since last login
  IF v_days_since_login > 30 THEN
    v_probability := v_probability + 0.25;
  ELSIF v_days_since_login > 14 THEN
    v_probability := v_probability + 0.15;
  ELSIF v_days_since_login > 7 THEN
    v_probability := v_probability + 0.08;
  END IF;

  -- Feature adoption (low adoption = higher risk)
  IF COALESCE(v_feature_adoption, 0) < 2 THEN
    v_probability := v_probability + 0.15;
  ELSIF v_feature_adoption < 4 THEN
    v_probability := v_probability + 0.08;
  END IF;

  -- Error frequency
  IF COALESCE(v_error_frequency, 0) > 5 THEN
    v_probability := v_probability + 0.12;
  ELSIF v_error_frequency > 2 THEN
    v_probability := v_probability + 0.06;
  END IF;

  -- Subscription status
  IF v_subscription_status = 'past_due' THEN
    v_probability := v_probability + 0.20;
  ELSIF v_subscription_status = 'canceled' THEN
    RETURN 1.0; -- Already churned
  END IF;

  -- Check for cancel attempts
  SELECT COUNT(*)
  INTO v_cancel_attempts
  FROM admin_live_activity
  WHERE user_id = p_user_id
    AND activity_type = 'subscription_cancel_attempt'
    AND created_at > NOW() - INTERVAL '30 days';

  IF v_cancel_attempts > 0 THEN
    v_probability := v_probability + 0.18;
  END IF;

  -- Ensure probability is between 0 and 1
  RETURN LEAST(1.0, GREATEST(0.0, v_probability));
END;
$$;

-- ============================================================================
-- 9. FUNCTION: UPDATE CHURN PREDICTIONS FOR ALL USERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_all_churn_predictions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_user RECORD;
  v_probability NUMERIC;
  v_risk_level TEXT;
  v_previous_prob NUMERIC;
  v_trend TEXT;
BEGIN
  -- Loop through active subscription users
  FOR v_user IN
    SELECT DISTINCT p.id as user_id
    FROM profiles p
    JOIN user_subscriptions s ON p.id = s.user_id
    WHERE s.status IN ('active', 'trialing', 'past_due')
  LOOP
    -- Calculate churn probability
    v_probability := calculate_churn_probability(v_user.user_id);

    -- Determine risk level
    IF v_probability >= 0.7 THEN
      v_risk_level := 'critical';
    ELSIF v_probability >= 0.5 THEN
      v_risk_level := 'high';
    ELSIF v_probability >= 0.3 THEN
      v_risk_level := 'medium';
    ELSE
      v_risk_level := 'low';
    END IF;

    -- Get previous probability
    SELECT churn_probability INTO v_previous_prob
    FROM revenue_churn_predictions
    WHERE user_id = v_user.user_id;

    -- Determine trend
    IF v_previous_prob IS NOT NULL THEN
      IF v_probability < v_previous_prob - 0.1 THEN
        v_trend := 'improving';
      ELSIF v_probability > v_previous_prob + 0.1 THEN
        v_trend := 'declining';
      ELSE
        v_trend := 'stable';
      END IF;
    ELSE
      v_trend := 'stable';
    END IF;

    -- Upsert prediction
    INSERT INTO revenue_churn_predictions (
      user_id,
      churn_probability,
      risk_level,
      risk_factors,
      previous_probability,
      trend,
      last_calculated,
      prediction_expires
    ) VALUES (
      v_user.user_id,
      v_probability,
      v_risk_level,
      '{}'::jsonb, -- TODO: Add detailed risk factors
      v_previous_prob,
      v_trend,
      NOW(),
      NOW() + INTERVAL '7 days'
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      churn_probability = EXCLUDED.churn_probability,
      risk_level = EXCLUDED.risk_level,
      previous_probability = EXCLUDED.previous_probability,
      trend = EXCLUDED.trend,
      last_calculated = EXCLUDED.last_calculated,
      prediction_expires = EXCLUDED.prediction_expires,
      updated_at = NOW();

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN v_updated_count;
END;
$$;

-- ============================================================================
-- 10. FUNCTION: TRIGGER INTERVENTION FOR AT-RISK USERS
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_churn_interventions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_triggered_count INTEGER := 0;
  v_user RECORD;
BEGIN
  -- Find high-risk users without recent interventions
  FOR v_user IN
    SELECT
      rcp.user_id,
      rcp.churn_probability,
      rcp.risk_level,
      aui.subscription_status,
      aui.last_login
    FROM revenue_churn_predictions rcp
    JOIN admin_user_intelligence aui ON rcp.user_id = aui.id
    WHERE rcp.risk_level IN ('high', 'critical')
      AND rcp.churn_probability >= 0.5
      -- No intervention in last 7 days
      AND NOT EXISTS (
        SELECT 1 FROM revenue_interventions
        WHERE user_id = rcp.user_id
          AND triggered_at > NOW() - INTERVAL '7 days'
          AND intervention_type = 'win_back_email'
      )
    LIMIT 50 -- Process in batches
  LOOP
    -- Create win-back intervention
    INSERT INTO revenue_interventions (
      user_id,
      intervention_type,
      triggered_by,
      trigger_data,
      scheduled_for,
      status
    ) VALUES (
      v_user.user_id,
      'win_back_email',
      'churn_risk',
      jsonb_build_object(
        'churn_probability', v_user.churn_probability,
        'risk_level', v_user.risk_level
      ),
      NOW() + INTERVAL '1 hour', -- Schedule for 1 hour from now
      'scheduled'
    );

    v_triggered_count := v_triggered_count + 1;
  END LOOP;

  RETURN v_triggered_count;
END;
$$;

-- ============================================================================
-- 11. FUNCTION: SCHEDULE PAYMENT RETRY
-- ============================================================================

CREATE OR REPLACE FUNCTION schedule_payment_retry(
  p_subscription_id UUID,
  p_user_id UUID,
  p_failed_amount NUMERIC,
  p_failure_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_attempt_id UUID;
  v_attempt_count INTEGER;
  v_next_retry TIMESTAMPTZ;
BEGIN
  -- Count existing attempts
  SELECT COUNT(*) INTO v_attempt_count
  FROM payment_recovery_attempts
  WHERE subscription_id = p_subscription_id
    AND result = 'failed';

  -- Calculate next retry time based on attempt number
  CASE v_attempt_count + 1
    WHEN 1 THEN v_next_retry := NOW() + INTERVAL '3 days';
    WHEN 2 THEN v_next_retry := NOW() + INTERVAL '7 days';
    WHEN 3 THEN v_next_retry := NOW() + INTERVAL '14 days';
    ELSE v_next_retry := NULL; -- No more retries
  END CASE;

  -- Create recovery attempt record
  INSERT INTO payment_recovery_attempts (
    subscription_id,
    user_id,
    failure_reason,
    failed_amount,
    attempt_number,
    next_retry_at,
    result
  ) VALUES (
    p_subscription_id,
    p_user_id,
    p_failure_reason,
    p_failed_amount,
    v_attempt_count + 1,
    v_next_retry,
    'pending'
  )
  RETURNING id INTO v_attempt_id;

  -- Create dunning intervention
  INSERT INTO revenue_interventions (
    user_id,
    intervention_type,
    triggered_by,
    trigger_data,
    scheduled_for,
    status
  ) VALUES (
    p_user_id,
    'payment_recovery',
    'payment_failure',
    jsonb_build_object(
      'attempt_number', v_attempt_count + 1,
      'failed_amount', p_failed_amount,
      'failure_reason', p_failure_reason
    ),
    NOW() + INTERVAL '1 hour',
    'scheduled'
  );

  RETURN v_attempt_id;
END;
$$;

-- ============================================================================
-- 12. FUNCTION: REFRESH MATERIALIZED VIEWS
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_revenue_metrics()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY revenue_cohort_retention;
  REFRESH MATERIALIZED VIEW CONCURRENTLY revenue_metrics_daily;
END;
$$;

-- ============================================================================
-- 13. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE revenue_churn_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_recovery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_forecasts ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY revenue_churn_admin ON revenue_churn_predictions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY revenue_interventions_admin ON revenue_interventions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY payment_recovery_admin ON payment_recovery_attempts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY revenue_cohorts_admin ON revenue_cohorts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY revenue_forecasts_admin ON revenue_forecasts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- 14. GRANTS
-- ============================================================================

GRANT SELECT ON revenue_cohort_retention TO authenticated;
GRANT SELECT ON revenue_metrics_daily TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_churn_probability(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_all_churn_predictions() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_churn_interventions() TO authenticated;
GRANT EXECUTE ON FUNCTION schedule_payment_retry(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_revenue_metrics() TO authenticated;

-- ============================================================================
-- 15. INITIAL DATA & CRON JOBS (Comments for setup)
-- ============================================================================

-- Run initial churn prediction calculation
SELECT update_all_churn_predictions();

-- Initial materialized view refresh
SELECT refresh_revenue_metrics();

-- Setup cron jobs (requires pg_cron extension):
-- Daily churn prediction update:
-- SELECT cron.schedule('update-churn-predictions', '0 2 * * *', $$SELECT update_all_churn_predictions()$$);

-- Daily intervention triggers:
-- SELECT cron.schedule('trigger-interventions', '0 8 * * *', $$SELECT trigger_churn_interventions()$$);

-- Hourly metrics refresh:
-- SELECT cron.schedule('refresh-revenue-metrics', '0 * * * *', $$SELECT refresh_revenue_metrics()$$);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE revenue_churn_predictions IS 'ML-based churn prediction scores for active subscribers with risk factors and trending';
COMMENT ON TABLE revenue_interventions IS 'Automated intervention campaigns for churn prevention, upsells, and engagement';
COMMENT ON TABLE payment_recovery_attempts IS 'Smart dunning management with automatic retry scheduling';
COMMENT ON TABLE revenue_cohorts IS 'User cohort tracking for retention analysis and LTV calculation';
COMMENT ON TABLE revenue_forecasts IS 'Revenue forecasting with multiple scenarios (conservative, base, optimistic)';
COMMENT ON MATERIALIZED VIEW revenue_cohort_retention IS 'Cohort retention analysis by month with MRR and LTV metrics';
COMMENT ON MATERIALIZED VIEW revenue_metrics_daily IS 'Daily revenue metrics including MRR, ARR, growth rate, and churn rate';
COMMENT ON FUNCTION calculate_churn_probability(UUID) IS 'Calculates churn probability (0-1) for a user based on engagement, errors, and payment health';
COMMENT ON FUNCTION update_all_churn_predictions() IS 'Batch update churn predictions for all active subscribers';
COMMENT ON FUNCTION trigger_churn_interventions() IS 'Automatically trigger win-back interventions for high-risk users';
COMMENT ON FUNCTION schedule_payment_retry(UUID, UUID, NUMERIC, TEXT) IS 'Schedule smart payment retry with exponential backoff (3d, 7d, 14d)';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251109000002_revenue_operations_command_center.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 75: 20251109000003_fix_user_roles_rls.sql
-- ============================================

-- Fix user_roles RLS policies to ensure users can always see their own roles
-- This is needed for the admin check to work properly

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON user_roles;

-- Recreate with more explicit permissions
CREATE POLICY "Users can view their own roles"
  ON user_roles
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all roles"
  ON user_roles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admins can insert roles"
  ON user_roles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admins can update roles"
  ON user_roles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::app_role
    )
  );

CREATE POLICY "Admins can delete roles"
  ON user_roles
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::app_role
    )
  );


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251109000003_fix_user_roles_rls.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 76: 20251110000000_picky_eater_quiz.sql
-- ============================================

-- Picky Eater Quiz Tables
-- Stores quiz responses, lead captures, and analytics for the picky eater quiz tool

-- Table: quiz_responses
-- Stores all quiz submissions with answers and calculated personality type
CREATE TABLE IF NOT EXISTS quiz_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Quiz answers (stored as JSONB for flexibility)
  answers JSONB NOT NULL,

  -- Calculated results
  personality_type VARCHAR(50) NOT NULL,
  secondary_type VARCHAR(50),
  scores JSONB NOT NULL, -- Stores all personality type scores

  -- User information (optional, collected after email capture)
  email VARCHAR(255),
  child_name VARCHAR(100),
  parent_name VARCHAR(100),

  -- Tracking
  session_id VARCHAR(100),
  referral_source VARCHAR(255),
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  ab_test_variant VARCHAR(50),

  -- Engagement tracking
  email_captured BOOLEAN DEFAULT false,
  pdf_downloaded BOOLEAN DEFAULT false,
  shared_social BOOLEAN DEFAULT false,
  trial_started BOOLEAN DEFAULT false,

  -- Analytics
  completion_time_seconds INTEGER,
  device_type VARCHAR(50),
  user_agent TEXT,

  CONSTRAINT valid_personality_type CHECK (
    personality_type IN (
      'texture_detective',
      'beige_brigade',
      'slow_explorer',
      'visual_critic',
      'mix_master',
      'flavor_seeker'
    )
  )
);

-- Table: quiz_leads
-- Stores email capture information and nurture sequence tracking
CREATE TABLE IF NOT EXISTS quiz_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Lead information
  email VARCHAR(255) NOT NULL UNIQUE,
  child_name VARCHAR(100),
  parent_name VARCHAR(100),

  -- Associated quiz response
  quiz_response_id UUID REFERENCES quiz_responses(id),
  personality_type VARCHAR(50),

  -- Email sequence tracking
  email_sequence_started BOOLEAN DEFAULT false,
  email_1_sent_at TIMESTAMP WITH TIME ZONE,
  email_1_opened BOOLEAN DEFAULT false,
  email_1_clicked BOOLEAN DEFAULT false,
  email_2_sent_at TIMESTAMP WITH TIME ZONE,
  email_2_opened BOOLEAN DEFAULT false,
  email_2_clicked BOOLEAN DEFAULT false,
  email_3_sent_at TIMESTAMP WITH TIME ZONE,
  email_3_opened BOOLEAN DEFAULT false,
  email_3_clicked BOOLEAN DEFAULT false,
  email_4_sent_at TIMESTAMP WITH TIME ZONE,
  email_4_opened BOOLEAN DEFAULT false,
  email_4_clicked BOOLEAN DEFAULT false,
  email_5_sent_at TIMESTAMP WITH TIME ZONE,
  email_5_opened BOOLEAN DEFAULT false,
  email_5_clicked BOOLEAN DEFAULT false,
  email_6_sent_at TIMESTAMP WITH TIME ZONE,
  email_6_opened BOOLEAN DEFAULT false,
  email_6_clicked BOOLEAN DEFAULT false,
  email_7_sent_at TIMESTAMP WITH TIME ZONE,
  email_7_opened BOOLEAN DEFAULT false,
  email_7_clicked BOOLEAN DEFAULT false,

  -- Conversion tracking
  trial_started BOOLEAN DEFAULT false,
  trial_started_at TIMESTAMP WITH TIME ZONE,
  subscription_active BOOLEAN DEFAULT false,
  subscription_started_at TIMESTAMP WITH TIME ZONE,

  -- Referral tracking
  referral_code VARCHAR(50) UNIQUE,
  referral_count INTEGER DEFAULT 0,

  -- Status
  unsubscribed BOOLEAN DEFAULT false,
  unsubscribed_at TIMESTAMP WITH TIME ZONE,

  -- Marketing consent
  accepts_marketing BOOLEAN DEFAULT true
);

-- Table: quiz_analytics
-- Stores detailed analytics events for quiz flow optimization
CREATE TABLE IF NOT EXISTS quiz_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Session tracking
  session_id VARCHAR(100) NOT NULL,
  quiz_response_id UUID REFERENCES quiz_responses(id),

  -- Event data
  event_type VARCHAR(100) NOT NULL, -- e.g., 'quiz_started', 'question_answered', 'quiz_abandoned', etc.
  event_data JSONB,

  -- Page/Step tracking
  current_step INTEGER,
  total_steps INTEGER,

  -- Timing
  time_on_page_seconds INTEGER,

  -- Device/Browser
  device_type VARCHAR(50),
  browser VARCHAR(100),
  user_agent TEXT,

  -- A/B Testing
  ab_test_variant VARCHAR(50),

  -- Source tracking
  referral_source VARCHAR(255),
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100)
);

-- Table: quiz_shares
-- Tracks social sharing and virality
CREATE TABLE IF NOT EXISTS quiz_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Original quiz response
  quiz_response_id UUID REFERENCES quiz_responses(id),

  -- Share details
  platform VARCHAR(50) NOT NULL, -- facebook, instagram, twitter, pinterest, email
  personality_type VARCHAR(50),

  -- Tracking
  share_url TEXT,
  referral_code VARCHAR(50),
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0
);

-- Table: quiz_referrals
-- Tracks referral conversions
CREATE TABLE IF NOT EXISTS quiz_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Referrer information
  referrer_email VARCHAR(255) REFERENCES quiz_leads(email),
  referral_code VARCHAR(50) NOT NULL,

  -- Referred user
  referred_quiz_response_id UUID REFERENCES quiz_responses(id),
  referred_email VARCHAR(255),

  -- Conversion status
  converted BOOLEAN DEFAULT false,
  reward_granted BOOLEAN DEFAULT false
);

-- Indexes for performance
CREATE INDEX idx_quiz_responses_created_at ON quiz_responses(created_at DESC);
CREATE INDEX idx_quiz_responses_personality_type ON quiz_responses(personality_type);
CREATE INDEX idx_quiz_responses_email ON quiz_responses(email);
CREATE INDEX idx_quiz_responses_session_id ON quiz_responses(session_id);

CREATE INDEX idx_quiz_leads_email ON quiz_leads(email);
CREATE INDEX idx_quiz_leads_created_at ON quiz_leads(created_at DESC);
CREATE INDEX idx_quiz_leads_personality_type ON quiz_leads(personality_type);
CREATE INDEX idx_quiz_leads_trial_started ON quiz_leads(trial_started);

CREATE INDEX idx_quiz_analytics_session_id ON quiz_analytics(session_id);
CREATE INDEX idx_quiz_analytics_event_type ON quiz_analytics(event_type);
CREATE INDEX idx_quiz_analytics_created_at ON quiz_analytics(created_at DESC);

CREATE INDEX idx_quiz_shares_quiz_response_id ON quiz_shares(quiz_response_id);
CREATE INDEX idx_quiz_shares_platform ON quiz_shares(platform);
CREATE INDEX idx_quiz_shares_referral_code ON quiz_shares(referral_code);

CREATE INDEX idx_quiz_referrals_referral_code ON quiz_referrals(referral_code);
CREATE INDEX idx_quiz_referrals_referrer_email ON quiz_referrals(referrer_email);

-- Enable Row Level Security
ALTER TABLE quiz_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_referrals ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- quiz_responses: Anyone can insert (anonymous quiz taking), only admins can view all
CREATE POLICY "Anyone can submit quiz responses"
  ON quiz_responses FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view their own quiz responses"
  ON quiz_responses FOR SELECT
  TO authenticated
  USING (email = auth.jwt()->>'email');

-- quiz_leads: Users can update their own lead info
CREATE POLICY "Anyone can create leads"
  ON quiz_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view their own lead info"
  ON quiz_leads FOR SELECT
  TO authenticated
  USING (email = auth.jwt()->>'email');

CREATE POLICY "Users can update their own lead info"
  ON quiz_leads FOR UPDATE
  TO authenticated
  USING (email = auth.jwt()->>'email')
  WITH CHECK (email = auth.jwt()->>'email');

-- quiz_analytics: Anyone can insert events
CREATE POLICY "Anyone can track analytics"
  ON quiz_analytics FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- quiz_shares: Anyone can create shares
CREATE POLICY "Anyone can create shares"
  ON quiz_shares FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- quiz_referrals: Anyone can create referrals
CREATE POLICY "Anyone can create referrals"
  ON quiz_referrals FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Updated_at trigger for quiz_leads
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_quiz_leads_updated_at BEFORE UPDATE ON quiz_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE quiz_responses IS 'Stores all picky eater quiz submissions with answers and calculated personality types';
COMMENT ON TABLE quiz_leads IS 'Email leads captured from quiz with nurture sequence tracking';
COMMENT ON TABLE quiz_analytics IS 'Detailed event tracking for quiz flow optimization and A/B testing';
COMMENT ON TABLE quiz_shares IS 'Social sharing tracking for virality metrics';
COMMENT ON TABLE quiz_referrals IS 'Referral program tracking and reward management';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251110000000_picky_eater_quiz.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 77: 20251110000001_budget_calculator_meal_planner.sql
-- ============================================

-- Grocery Budget Calculator & 5-Day Meal Plan Generator Tables
-- Lead magnet tools for TryEatPal.com

-- ============================================
-- GROCERY BUDGET CALCULATOR
-- ============================================

-- Table: budget_calculations
-- Stores all budget calculator submissions
CREATE TABLE IF NOT EXISTS budget_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Input data
  family_size INTEGER NOT NULL,
  adults INTEGER NOT NULL,
  children INTEGER NOT NULL,
  zip_code VARCHAR(10),
  state VARCHAR(2),
  dietary_restrictions JSONB DEFAULT '[]', -- ["vegetarian", "gluten_free", etc.]

  -- Calculated results
  recommended_monthly_budget DECIMAL(10, 2) NOT NULL,
  cost_per_meal DECIMAL(10, 2) NOT NULL,
  cost_per_person_per_day DECIMAL(10, 2) NOT NULL,
  usda_plan_level VARCHAR(20) NOT NULL, -- thrifty, low_cost, moderate, liberal

  -- Comparison data
  vs_meal_kits_savings DECIMAL(10, 2),
  vs_dining_out_savings DECIMAL(10, 2),
  annual_savings DECIMAL(10, 2),

  -- User information (captured after email)
  email VARCHAR(255),
  name VARCHAR(100),

  -- Tracking
  session_id VARCHAR(100) NOT NULL,
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),

  -- Engagement
  email_captured BOOLEAN DEFAULT false,
  meal_plan_downloaded BOOLEAN DEFAULT false,
  shared BOOLEAN DEFAULT false,
  trial_started BOOLEAN DEFAULT false,

  -- Analytics
  device_type VARCHAR(50),
  user_agent TEXT
);

-- Table: budget_leads
-- Email captures from budget calculator
CREATE TABLE IF NOT EXISTS budget_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Lead info
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100),

  -- Associated calculation
  budget_calculation_id UUID REFERENCES budget_calculations(id),
  family_size INTEGER,
  monthly_budget DECIMAL(10, 2),

  -- Email sequence tracking
  email_sequence_started BOOLEAN DEFAULT false,
  welcome_email_sent_at TIMESTAMP WITH TIME ZONE,
  day_3_email_sent_at TIMESTAMP WITH TIME ZONE,
  day_7_email_sent_at TIMESTAMP WITH TIME ZONE,

  -- Conversion tracking
  trial_started BOOLEAN DEFAULT false,
  trial_started_at TIMESTAMP WITH TIME ZONE,
  subscription_active BOOLEAN DEFAULT false,

  -- Referral
  referral_code VARCHAR(50) UNIQUE,
  referral_count INTEGER DEFAULT 0,

  -- Status
  unsubscribed BOOLEAN DEFAULT false,
  accepts_marketing BOOLEAN DEFAULT true
);

-- ============================================
-- 5-DAY MEAL PLAN GENERATOR
-- ============================================

-- Table: meal_plan_generations
-- Stores all meal plan generation requests
CREATE TABLE IF NOT EXISTS meal_plan_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Input data
  family_size INTEGER NOT NULL,
  adults INTEGER NOT NULL,
  children INTEGER NOT NULL,
  children_ages JSONB DEFAULT '[]', -- [3, 6, 9]
  dietary_restrictions JSONB DEFAULT '[]',
  allergies JSONB DEFAULT '[]',
  picky_eater_level VARCHAR(20), -- none, mild, moderate, severe
  cooking_time_available INTEGER, -- minutes per day
  cooking_skill_level VARCHAR(20), -- beginner, intermediate, advanced
  kitchen_equipment JSONB DEFAULT '[]', -- ["slow_cooker", "instant_pot", etc.]

  -- Generated meal plan (IDs reference to recipes or meal data)
  meal_plan JSONB NOT NULL, -- Array of 5 meals with recipes
  grocery_list JSONB NOT NULL, -- Organized by category
  total_estimated_cost DECIMAL(10, 2),
  total_prep_time INTEGER, -- minutes for all 5 meals

  -- User information
  email VARCHAR(255),
  name VARCHAR(100),

  -- Tracking
  session_id VARCHAR(100) NOT NULL,
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),

  -- Engagement
  email_captured BOOLEAN DEFAULT false,
  full_plan_downloaded BOOLEAN DEFAULT false,
  shared BOOLEAN DEFAULT false,
  trial_started BOOLEAN DEFAULT false,

  -- Satisfaction (if we add rating)
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,

  -- Analytics
  device_type VARCHAR(50),
  user_agent TEXT
);

-- Table: meal_plan_leads
-- Email captures from meal plan generator
CREATE TABLE IF NOT EXISTS meal_plan_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Lead info
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100),

  -- Associated meal plan
  meal_plan_generation_id UUID REFERENCES meal_plan_generations(id),
  family_size INTEGER,
  picky_eater_level VARCHAR(20),

  -- Email sequence tracking
  email_sequence_started BOOLEAN DEFAULT false,
  welcome_email_sent_at TIMESTAMP WITH TIME ZONE,
  day_2_email_sent_at TIMESTAMP WITH TIME ZONE,
  day_5_email_sent_at TIMESTAMP WITH TIME ZONE,
  day_7_email_sent_at TIMESTAMP WITH TIME ZONE,

  -- Conversion tracking
  trial_started BOOLEAN DEFAULT false,
  trial_started_at TIMESTAMP WITH TIME ZONE,
  subscription_active BOOLEAN DEFAULT false,

  -- Referral
  referral_code VARCHAR(50) UNIQUE,
  referral_count INTEGER DEFAULT 0,

  -- Status
  unsubscribed BOOLEAN DEFAULT false,
  accepts_marketing BOOLEAN DEFAULT true
);

-- ============================================
-- SHARED ANALYTICS
-- ============================================

-- Table: tool_analytics
-- General analytics for all lead magnet tools
CREATE TABLE IF NOT EXISTS tool_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Tool identification
  tool_name VARCHAR(50) NOT NULL, -- 'picky_eater_quiz', 'budget_calculator', 'meal_plan_generator'
  tool_version VARCHAR(20),

  -- Session tracking
  session_id VARCHAR(100) NOT NULL,
  user_id UUID, -- If authenticated

  -- Event data
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB,

  -- Page tracking
  page_url TEXT,
  referrer_url TEXT,

  -- Timing
  time_on_page_seconds INTEGER,

  -- Device/Browser
  device_type VARCHAR(50),
  browser VARCHAR(100),
  user_agent TEXT,

  -- Marketing
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),

  -- A/B Testing
  ab_test_variant VARCHAR(50),

  -- Location (optional)
  ip_address INET,
  country VARCHAR(2),
  region VARCHAR(100)
);

-- ============================================
-- INDEXES
-- ============================================

-- Budget Calculator Indexes
CREATE INDEX idx_budget_calculations_created_at ON budget_calculations(created_at DESC);
CREATE INDEX idx_budget_calculations_session_id ON budget_calculations(session_id);
CREATE INDEX idx_budget_calculations_email ON budget_calculations(email);
CREATE INDEX idx_budget_calculations_family_size ON budget_calculations(family_size);

CREATE INDEX idx_budget_leads_email ON budget_leads(email);
CREATE INDEX idx_budget_leads_created_at ON budget_leads(created_at DESC);
CREATE INDEX idx_budget_leads_trial_started ON budget_leads(trial_started);

-- Meal Plan Generator Indexes
CREATE INDEX idx_meal_plan_generations_created_at ON meal_plan_generations(created_at DESC);
CREATE INDEX idx_meal_plan_generations_session_id ON meal_plan_generations(session_id);
CREATE INDEX idx_meal_plan_generations_email ON meal_plan_generations(email);
CREATE INDEX idx_meal_plan_generations_family_size ON meal_plan_generations(family_size);
CREATE INDEX idx_meal_plan_generations_picky_eater_level ON meal_plan_generations(picky_eater_level);

CREATE INDEX idx_meal_plan_leads_email ON meal_plan_leads(email);
CREATE INDEX idx_meal_plan_leads_created_at ON meal_plan_leads(created_at DESC);
CREATE INDEX idx_meal_plan_leads_trial_started ON meal_plan_leads(trial_started);

-- Analytics Indexes
CREATE INDEX idx_tool_analytics_tool_name ON tool_analytics(tool_name);
CREATE INDEX idx_tool_analytics_session_id ON tool_analytics(session_id);
CREATE INDEX idx_tool_analytics_event_type ON tool_analytics(event_type);
CREATE INDEX idx_tool_analytics_created_at ON tool_analytics(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE budget_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Budget Calculator
CREATE POLICY "Anyone can create budget calculations"
  ON budget_calculations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view their own calculations"
  ON budget_calculations FOR SELECT
  TO authenticated
  USING (email = auth.jwt()->>'email');

-- RLS Policies - Budget Leads
CREATE POLICY "Anyone can create budget leads"
  ON budget_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view their own budget leads"
  ON budget_leads FOR SELECT
  TO authenticated
  USING (email = auth.jwt()->>'email');

CREATE POLICY "Users can update their own budget leads"
  ON budget_leads FOR UPDATE
  TO authenticated
  USING (email = auth.jwt()->>'email')
  WITH CHECK (email = auth.jwt()->>'email');

-- RLS Policies - Meal Plan Generations
CREATE POLICY "Anyone can create meal plans"
  ON meal_plan_generations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view their own meal plans"
  ON meal_plan_generations FOR SELECT
  TO authenticated
  USING (email = auth.jwt()->>'email');

-- RLS Policies - Meal Plan Leads
CREATE POLICY "Anyone can create meal plan leads"
  ON meal_plan_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view their own meal plan leads"
  ON meal_plan_leads FOR SELECT
  TO authenticated
  USING (email = auth.jwt()->>'email');

CREATE POLICY "Users can update their own meal plan leads"
  ON meal_plan_leads FOR UPDATE
  TO authenticated
  USING (email = auth.jwt()->>'email')
  WITH CHECK (email = auth.jwt()->>'email');

-- RLS Policies - Analytics (anyone can insert)
CREATE POLICY "Anyone can track analytics"
  ON tool_analytics FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ============================================
-- TRIGGERS
-- ============================================

-- Updated_at triggers
CREATE TRIGGER update_budget_leads_updated_at BEFORE UPDATE ON budget_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meal_plan_leads_updated_at BEFORE UPDATE ON meal_plan_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to increment referral counts
CREATE OR REPLACE FUNCTION increment_budget_referral_count(referrer_email_param TEXT)
RETURNS void AS $$
BEGIN
  UPDATE budget_leads
  SET referral_count = referral_count + 1
  WHERE email = referrer_email_param;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_meal_plan_referral_count(referrer_email_param TEXT)
RETURNS void AS $$
BEGIN
  UPDATE meal_plan_leads
  SET referral_count = referral_count + 1
  WHERE email = referrer_email_param;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE budget_calculations IS 'Stores all grocery budget calculator submissions and results';
COMMENT ON TABLE budget_leads IS 'Email leads captured from budget calculator with nurture tracking';
COMMENT ON TABLE meal_plan_generations IS 'Stores all 5-day meal plan generation requests and results';
COMMENT ON TABLE meal_plan_leads IS 'Email leads captured from meal plan generator with nurture tracking';
COMMENT ON TABLE tool_analytics IS 'Unified analytics tracking for all lead magnet tools';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251110000001_budget_calculator_meal_planner.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 78: 20251110000001_meal_plan_templates.sql
-- ============================================

-- Meal Plan Templates Feature
-- Allows users to save and reuse successful meal plans

-- Main templates table
CREATE TABLE IF NOT EXISTS meal_plan_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Template metadata
  name TEXT NOT NULL,
  description TEXT,

  -- Categorization
  is_favorite BOOLEAN DEFAULT false,
  is_admin_template BOOLEAN DEFAULT false, -- Admin-curated starter templates
  is_starter_template BOOLEAN DEFAULT false, -- Shown to new users
  season TEXT, -- 'spring', 'summer', 'fall', 'winter', 'year_round'
  target_age_range TEXT, -- '2-4', '5-8', '9-12', 'all'
  dietary_restrictions TEXT[], -- Matches kid dietary restrictions

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2), -- Average success rate when this template is used
  created_from_week DATE, -- Original week this template was based on

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT name_not_empty CHECK (char_length(name) > 0)
);

-- Template entries (the actual meal plan data)
CREATE TABLE IF NOT EXISTS meal_plan_template_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES meal_plan_templates(id) ON DELETE CASCADE,

  -- Scheduling
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Monday, 6=Sunday
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack1', 'snack2', 'try_bite')),

  -- Meal content
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  food_ids UUID[], -- For simple meals without recipes

  -- Metadata
  notes TEXT,
  is_optional BOOLEAN DEFAULT false, -- For flexible templates

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_meal_plan_templates_household ON meal_plan_templates(household_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_templates_user ON meal_plan_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_templates_admin ON meal_plan_templates(is_admin_template) WHERE is_admin_template = true;
CREATE INDEX IF NOT EXISTS idx_meal_plan_templates_starter ON meal_plan_templates(is_starter_template) WHERE is_starter_template = true;
CREATE INDEX IF NOT EXISTS idx_meal_plan_template_entries_template ON meal_plan_template_entries(template_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_template_entries_schedule ON meal_plan_template_entries(template_id, day_of_week, meal_slot);

-- Row Level Security Policies
ALTER TABLE meal_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_template_entries ENABLE ROW LEVEL SECURITY;

-- Users can view their own templates and admin templates
CREATE POLICY "Users can view own and admin templates"
  ON meal_plan_templates
  FOR SELECT
  USING (
    is_admin_template = true
    OR user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Users can create templates in their household
CREATE POLICY "Users can create templates"
  ON meal_plan_templates
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Users can update their own templates
CREATE POLICY "Users can update own templates"
  ON meal_plan_templates
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Users can delete their own templates
CREATE POLICY "Users can delete own templates"
  ON meal_plan_templates
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Template entries inherit permissions from parent template
CREATE POLICY "Users can view template entries"
  ON meal_plan_template_entries
  FOR SELECT
  USING (
    template_id IN (
      SELECT id FROM meal_plan_templates
      WHERE is_admin_template = true
        OR user_id = auth.uid()
        OR household_id IN (
          SELECT household_id FROM profiles WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY "Users can create template entries"
  ON meal_plan_template_entries
  FOR INSERT
  WITH CHECK (
    template_id IN (
      SELECT id FROM meal_plan_templates
      WHERE user_id = auth.uid()
        OR household_id IN (
          SELECT household_id FROM profiles WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY "Users can update template entries"
  ON meal_plan_template_entries
  FOR UPDATE
  USING (
    template_id IN (
      SELECT id FROM meal_plan_templates
      WHERE user_id = auth.uid()
        OR household_id IN (
          SELECT household_id FROM profiles WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY "Users can delete template entries"
  ON meal_plan_template_entries
  FOR DELETE
  USING (
    template_id IN (
      SELECT id FROM meal_plan_templates
      WHERE user_id = auth.uid()
        OR household_id IN (
          SELECT household_id FROM profiles WHERE user_id = auth.uid()
        )
    )
  );

-- Admins have full access to templates
CREATE POLICY "Admins can manage all templates"
  ON meal_plan_templates
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all template entries"
  ON meal_plan_template_entries
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_meal_plan_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_meal_plan_template_updated_at_trigger
  BEFORE UPDATE ON meal_plan_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_meal_plan_template_updated_at();

-- Function to calculate template success rate from usage
CREATE OR REPLACE FUNCTION calculate_template_success_rate(template_id_input UUID)
RETURNS DECIMAL AS $$
DECLARE
  avg_success DECIMAL(5,2);
BEGIN
  -- Calculate average success rate from food attempts of meals created from this template
  -- This is a simplified calculation - can be enhanced based on actual usage patterns
  SELECT AVG(
    CASE
      WHEN result = 'ate' THEN 100.0
      WHEN result = 'tasted' THEN 50.0
      WHEN result = 'refused' THEN 0.0
      ELSE NULL
    END
  ) INTO avg_success
  FROM plan_entries
  WHERE date >= (
    SELECT MAX(date) FROM plan_entries
    WHERE notes LIKE '%template:' || template_id_input || '%'
  )
  AND notes LIKE '%template:' || template_id_input || '%';

  RETURN COALESCE(avg_success, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE meal_plan_templates IS 'Reusable meal plan templates for quick weekly planning';
COMMENT ON TABLE meal_plan_template_entries IS 'Individual meal entries within a template';
COMMENT ON FUNCTION calculate_template_success_rate IS 'Calculates average success rate for meals created from a template';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251110000001_meal_plan_templates.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 79: 20251110000002_push_notifications.sql
-- ============================================

-- Push Notifications System
-- Enables meal reminders, grocery alerts, milestone celebrations, and partner activity notifications

-- User notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- Master toggles
  push_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,

  -- Notification types
  meal_reminders BOOLEAN DEFAULT true,
  grocery_reminders BOOLEAN DEFAULT true,
  prep_reminders BOOLEAN DEFAULT true,
  milestone_celebrations BOOLEAN DEFAULT true,
  partner_updates BOOLEAN DEFAULT true,
  weekly_summary BOOLEAN DEFAULT true,
  food_success_updates BOOLEAN DEFAULT true,
  template_suggestions BOOLEAN DEFAULT true,

  -- Timing preferences
  meal_reminder_time_minutes INTEGER DEFAULT 60, -- 1hr before meal
  grocery_reminder_day TEXT DEFAULT 'saturday', -- Weekly grocery reminder day
  grocery_reminder_time TIME DEFAULT '09:00:00', -- Morning reminder
  prep_reminder_time TIME DEFAULT '18:00:00', -- Evening prep reminder
  weekly_summary_day TEXT DEFAULT 'sunday',
  weekly_summary_time TIME DEFAULT '19:00:00',

  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT true,
  quiet_hours_start TIME DEFAULT '21:00:00',
  quiet_hours_end TIME DEFAULT '07:00:00',

  -- Frequency controls
  max_notifications_per_day INTEGER DEFAULT 10,
  digest_mode BOOLEAN DEFAULT false, -- Bundle notifications into digest

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_reminder_time CHECK (meal_reminder_time_minutes >= 0 AND meal_reminder_time_minutes <= 1440),
  CONSTRAINT valid_max_notifications CHECK (max_notifications_per_day >= 0 AND max_notifications_per_day <= 50)
);

-- Device push tokens (for Expo/FCM/APNs)
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Token details
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('expo', 'ios', 'android', 'web')),
  device_name TEXT,
  device_id TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ DEFAULT now(),
  failed_attempts INTEGER DEFAULT 0,
  last_error TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Notification queue (pending notifications)
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- Notification content
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb, -- Custom data payload
  icon TEXT,
  image_url TEXT,
  action_url TEXT, -- Deep link for click action

  -- Channel (determines delivery method)
  channel TEXT NOT NULL DEFAULT 'push' CHECK (channel IN ('push', 'email', 'sms', 'in_app')),

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled', 'throttled')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Grouping for digest mode
  digest_group TEXT, -- Group related notifications
  batch_id UUID, -- Link to batch send

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Notification history (for analytics and user viewing)
CREATE TABLE IF NOT EXISTS notification_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Notification details
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL,

  -- User interaction
  was_delivered BOOLEAN DEFAULT false,
  was_clicked BOOLEAN DEFAULT false,
  was_dismissed BOOLEAN DEFAULT false,

  -- Timestamps
  sent_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scheduled notification rules (recurring notifications)
CREATE TABLE IF NOT EXISTS notification_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Rule definition
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('meal_reminder', 'grocery_reminder', 'prep_reminder', 'weekly_summary')),
  is_active BOOLEAN DEFAULT true,

  -- Trigger conditions
  trigger_time_offset INTEGER, -- Minutes before event
  trigger_days TEXT[], -- Days of week: ['monday', 'wednesday', 'friday']
  trigger_time TIME,

  -- Notification template
  title_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  notification_data JSONB DEFAULT '{}'::jsonb,

  -- Targeting
  target_user_ids UUID[], -- Specific users, or NULL for all in household

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_household ON notification_preferences(household_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_push_tokens_platform ON push_tokens(platform);

CREATE INDEX IF NOT EXISTS idx_notification_queue_user ON notification_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled ON notification_queue(scheduled_for, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_type ON notification_queue(notification_type);

CREATE INDEX IF NOT EXISTS idx_notification_history_user ON notification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_sent ON notification_history(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history(notification_type);

CREATE INDEX IF NOT EXISTS idx_notification_rules_household ON notification_rules(household_id);
CREATE INDEX IF NOT EXISTS idx_notification_rules_active ON notification_rules(is_active) WHERE is_active = true;

-- Row Level Security Policies
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;

-- Notification Preferences Policies
CREATE POLICY "Users can view own preferences"
  ON notification_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own preferences"
  ON notification_preferences FOR UPDATE
  USING (user_id = auth.uid());

-- Push Tokens Policies
CREATE POLICY "Users can view own tokens"
  ON push_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own tokens"
  ON push_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own tokens"
  ON push_tokens FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own tokens"
  ON push_tokens FOR DELETE
  USING (user_id = auth.uid());

-- Notification Queue Policies (users can view their notifications)
CREATE POLICY "Users can view own notifications"
  ON notification_queue FOR SELECT
  USING (user_id = auth.uid());

-- Notification History Policies
CREATE POLICY "Users can view own history"
  ON notification_history FOR SELECT
  USING (user_id = auth.uid());

-- Notification Rules Policies
CREATE POLICY "Users can view household rules"
  ON notification_rules FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create household rules"
  ON notification_rules FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update household rules"
  ON notification_rules FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own rules"
  ON notification_rules FOR DELETE
  USING (created_by = auth.uid());

-- Admins have full access
CREATE POLICY "Admins can manage all notifications"
  ON notification_queue FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_notification_queue_updated_at
  BEFORE UPDATE ON notification_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_notification_rules_updated_at
  BEFORE UPDATE ON notification_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

-- Function to automatically create default preferences for new users
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_preferences (user_id, household_id)
  SELECT
    NEW.user_id,
    NEW.household_id
  FROM profiles
  WHERE user_id = NEW.user_id
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create preferences on profile creation
CREATE TRIGGER create_notification_preferences_on_profile
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_default_notification_preferences();

-- Function to check if notification should be sent (respects quiet hours)
CREATE OR REPLACE FUNCTION should_send_notification(
  p_user_id UUID,
  p_notification_type TEXT,
  p_scheduled_time TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
DECLARE
  prefs RECORD;
  scheduled_time_local TIME;
  notification_count INTEGER;
BEGIN
  -- Get user preferences
  SELECT * INTO prefs
  FROM notification_preferences
  WHERE user_id = p_user_id;

  -- If no preferences, allow (defaults to enabled)
  IF prefs IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Check if notification type is enabled
  CASE p_notification_type
    WHEN 'meal_reminder' THEN
      IF NOT prefs.meal_reminders THEN RETURN FALSE; END IF;
    WHEN 'grocery_reminder' THEN
      IF NOT prefs.grocery_reminders THEN RETURN FALSE; END IF;
    WHEN 'prep_reminder' THEN
      IF NOT prefs.prep_reminders THEN RETURN FALSE; END IF;
    WHEN 'milestone_celebration' THEN
      IF NOT prefs.milestone_celebrations THEN RETURN FALSE; END IF;
    WHEN 'partner_update' THEN
      IF NOT prefs.partner_updates THEN RETURN FALSE; END IF;
    WHEN 'weekly_summary' THEN
      IF NOT prefs.weekly_summary THEN RETURN FALSE; END IF;
    WHEN 'food_success' THEN
      IF NOT prefs.food_success_updates THEN RETURN FALSE; END IF;
    WHEN 'template_suggestion' THEN
      IF NOT prefs.template_suggestions THEN RETURN FALSE; END IF;
    ELSE
      RETURN TRUE; -- Unknown type, allow
  END CASE;

  -- Check quiet hours
  IF prefs.quiet_hours_enabled THEN
    scheduled_time_local := p_scheduled_time::TIME;
    IF scheduled_time_local >= prefs.quiet_hours_start
       OR scheduled_time_local <= prefs.quiet_hours_end THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Check max notifications per day
  IF prefs.max_notifications_per_day IS NOT NULL THEN
    SELECT COUNT(*) INTO notification_count
    FROM notification_history
    WHERE user_id = p_user_id
      AND sent_at >= CURRENT_DATE
      AND was_delivered = TRUE;

    IF notification_count >= prefs.max_notifications_per_day THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE notification_preferences IS 'User notification preferences and settings';
COMMENT ON TABLE push_tokens IS 'Device push notification tokens for Expo/FCM/APNs';
COMMENT ON TABLE notification_queue IS 'Pending and scheduled notifications';
COMMENT ON TABLE notification_history IS 'Historical log of sent notifications for analytics';
COMMENT ON TABLE notification_rules IS 'Automated recurring notification rules';
COMMENT ON FUNCTION should_send_notification IS 'Checks if notification should be sent based on user preferences';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251110000002_push_notifications.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 80: 20251110000003_recipe_scaling.sql
-- ============================================

-- Recipe Scaling Feature
-- Allows users to adjust recipe serving sizes with automatic ingredient quantity scaling

-- Add scaling fields to recipes table
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS servings_min INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS servings_max INTEGER DEFAULT 12,
  ADD COLUMN IF NOT EXISTS default_servings INTEGER;

-- Update default_servings to match existing servings where null
UPDATE recipes
SET default_servings = CASE
  WHEN servings ~ '^\d+$' THEN servings::INTEGER
  ELSE NULL
END
WHERE default_servings IS NULL AND servings IS NOT NULL;

-- Add constraints
ALTER TABLE recipes
  ADD CONSTRAINT servings_min_positive CHECK (servings_min > 0),
  ADD CONSTRAINT servings_max_positive CHECK (servings_max > 0),
  ADD CONSTRAINT servings_min_less_than_max CHECK (servings_min <= servings_max),
  ADD CONSTRAINT default_servings_in_range CHECK (
    default_servings IS NULL OR (default_servings >= servings_min AND default_servings <= servings_max)
  );

-- Update existing recipes to have sensible defaults
UPDATE recipes
SET
  servings_min = CASE
    WHEN servings ~ '^\d+$' THEN GREATEST(1, FLOOR((servings::INTEGER) * 0.5))
    ELSE 1
  END,
  servings_max = CASE
    WHEN servings ~ '^\d+$' THEN LEAST(12, CEILING((servings::INTEGER) * 2))
    ELSE 12
  END,
  default_servings = CASE
    WHEN servings ~ '^\d+$' THEN servings::INTEGER
    ELSE 4
  END
WHERE servings IS NOT NULL AND servings_min IS NULL;

-- Helper function to parse quantity strings (e.g., "1 1/2", "2.5", "1/4")
CREATE OR REPLACE FUNCTION parse_quantity(quantity_str TEXT)
RETURNS DECIMAL AS $$
DECLARE
  result DECIMAL;
  whole_part INTEGER;
  numerator INTEGER;
  denominator INTEGER;
  parts TEXT[];
  fraction_parts TEXT[];
BEGIN
  IF quantity_str IS NULL OR quantity_str = '' THEN
    RETURN 0;
  END IF;

  -- Remove extra whitespace
  quantity_str := TRIM(quantity_str);

  -- Try to parse as decimal first
  BEGIN
    result := quantity_str::DECIMAL;
    RETURN result;
  EXCEPTION WHEN OTHERS THEN
    -- Continue to fraction parsing
  END;

  -- Check for mixed fraction (e.g., "1 1/2")
  IF quantity_str ~ '^\d+\s+\d+/\d+$' THEN
    parts := regexp_split_to_array(quantity_str, '\s+');
    whole_part := parts[1]::INTEGER;
    fraction_parts := regexp_split_to_array(parts[2], '/');
    numerator := fraction_parts[1]::INTEGER;
    denominator := fraction_parts[2]::INTEGER;
    RETURN whole_part + (numerator::DECIMAL / denominator::DECIMAL);
  END IF;

  -- Check for simple fraction (e.g., "1/2")
  IF quantity_str ~ '^\d+/\d+$' THEN
    fraction_parts := regexp_split_to_array(quantity_str, '/');
    numerator := fraction_parts[1]::INTEGER;
    denominator := fraction_parts[2]::INTEGER;
    RETURN (numerator::DECIMAL / denominator::DECIMAL);
  END IF;

  -- If we can't parse it, return 0
  RETURN 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function to format quantity as fraction when appropriate
CREATE OR REPLACE FUNCTION format_quantity(quantity DECIMAL)
RETURNS TEXT AS $$
DECLARE
  whole_part INTEGER;
  decimal_part DECIMAL;
  fraction_text TEXT;
BEGIN
  IF quantity IS NULL OR quantity = 0 THEN
    RETURN '0';
  END IF;

  -- If it's a whole number, return it as is
  IF quantity = FLOOR(quantity) THEN
    RETURN quantity::TEXT;
  END IF;

  whole_part := FLOOR(quantity);
  decimal_part := quantity - whole_part;

  -- Common fraction conversions
  fraction_text := CASE
    WHEN ABS(decimal_part - 0.125) < 0.01 THEN '1/8'
    WHEN ABS(decimal_part - 0.25) < 0.01 THEN '1/4'
    WHEN ABS(decimal_part - 0.333) < 0.01 THEN '1/3'
    WHEN ABS(decimal_part - 0.375) < 0.01 THEN '3/8'
    WHEN ABS(decimal_part - 0.5) < 0.01 THEN '1/2'
    WHEN ABS(decimal_part - 0.625) < 0.01 THEN '5/8'
    WHEN ABS(decimal_part - 0.666) < 0.01 THEN '2/3'
    WHEN ABS(decimal_part - 0.75) < 0.01 THEN '3/4'
    WHEN ABS(decimal_part - 0.875) < 0.01 THEN '7/8'
    ELSE ROUND(decimal_part, 2)::TEXT
  END;

  -- Return with whole part if exists
  IF whole_part > 0 THEN
    RETURN whole_part::TEXT || ' ' || fraction_text;
  ELSE
    RETURN fraction_text;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to scale a recipe's ingredients
CREATE OR REPLACE FUNCTION scale_recipe_ingredients(
  recipe_id_input UUID,
  target_servings INTEGER
)
RETURNS TABLE(
  ingredient_id UUID,
  ingredient_name TEXT,
  original_quantity TEXT,
  scaled_quantity TEXT,
  unit TEXT,
  preparation_notes TEXT,
  is_optional BOOLEAN,
  section TEXT
) AS $$
DECLARE
  original_servings INTEGER;
  scale_factor DECIMAL;
  parsed_quantity DECIMAL;
  scaled_value DECIMAL;
BEGIN
  -- Get original servings
  SELECT COALESCE(default_servings, CASE
    WHEN servings ~ '^\d+$' THEN servings::INTEGER
    ELSE NULL
  END) INTO original_servings
  FROM recipes
  WHERE id = recipe_id_input;

  IF original_servings IS NULL OR original_servings = 0 THEN
    original_servings := 4; -- Default fallback
  END IF;

  -- Calculate scale factor
  scale_factor := target_servings::DECIMAL / original_servings::DECIMAL;

  RETURN QUERY
  SELECT
    ri.id,
    ri.ingredient_name,
    ri.quantity,
    CASE
      -- Don't scale if quantity is NULL or empty
      WHEN ri.quantity IS NULL OR ri.quantity = '' THEN ri.quantity
      -- Don't scale if quantity is a range (e.g., "2-3")
      WHEN ri.quantity ~ '-' THEN ri.quantity
      -- Don't scale if quantity is descriptive (e.g., "to taste", "pinch")
      WHEN ri.quantity ~* 'taste|pinch|dash|handful|sprinkle' THEN ri.quantity
      ELSE
        -- Parse, scale, and format
        format_quantity(parse_quantity(ri.quantity) * scale_factor)
    END,
    ri.unit,
    ri.preparation_notes,
    ri.is_optional,
    ri.section
  FROM recipe_ingredients ri
  WHERE ri.recipe_id = recipe_id_input
  ORDER BY ri.sort_order, ri.id;
END;
$$ LANGUAGE plpgsql;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_recipes_servings ON recipes(servings, servings_min, servings_max);

-- Comments for documentation
COMMENT ON COLUMN recipes.servings_min IS 'Minimum recommended servings for this recipe';
COMMENT ON COLUMN recipes.servings_max IS 'Maximum recommended servings for this recipe';
COMMENT ON COLUMN recipes.default_servings IS 'Default/original serving size (usually same as servings)';
COMMENT ON FUNCTION parse_quantity IS 'Parses quantity strings including fractions (1/2, 1 1/2, 2.5)';
COMMENT ON FUNCTION format_quantity IS 'Formats decimal quantities as fractions when appropriate';
COMMENT ON FUNCTION scale_recipe_ingredients IS 'Scales all ingredients in a recipe to target serving size';

-- Create a view for recipe scaling info
CREATE OR REPLACE VIEW recipe_scaling_info AS
SELECT
  id,
  name,
  servings,
  servings_min,
  servings_max,
  default_servings,
  CASE
    WHEN servings_min IS NOT NULL AND servings_max IS NOT NULL
      THEN servings_max - servings_min + 1
    ELSE 1
  END as scaling_options_count
FROM recipes;

COMMENT ON VIEW recipe_scaling_info IS 'Quick view of recipe scaling capabilities';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251110000003_recipe_scaling.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 81: 20251110000004_meal_voting.sql
-- ============================================

-- Kid Meal Voting Feature
-- Allows children to vote on upcoming meals with emoji reactions
-- Parents see vote results to inform meal planning

-- Individual meal votes from kids
CREATE TABLE IF NOT EXISTS meal_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- What they're voting on
  plan_entry_id UUID REFERENCES plan_entries(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  meal_date DATE NOT NULL,
  meal_slot TEXT NOT NULL,

  -- Vote value
  vote TEXT NOT NULL CHECK (vote IN ('love_it', 'okay', 'no_way')),
  vote_emoji TEXT, -- 'ðŸ˜', 'ðŸ™‚', 'ðŸ˜­'

  -- Optional feedback
  reason TEXT,

  -- Voting session
  voting_session_id UUID,

  -- Timestamps
  voted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Prevent duplicate votes (one vote per kid per meal)
  UNIQUE (kid_id, plan_entry_id),
  UNIQUE (kid_id, recipe_id, meal_date, meal_slot)
);

-- Voting sessions (when parents open voting)
CREATE TABLE IF NOT EXISTS voting_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Session details
  session_name TEXT NOT NULL,
  description TEXT,

  -- What meals are included
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  meal_slots TEXT[], -- ['breakfast', 'lunch', 'dinner']

  -- Status
  status TEXT DEFAULT 'open' CHECK (status IN ('draft', 'open', 'closed', 'archived')),

  -- Voting options
  allow_suggestions BOOLEAN DEFAULT false, -- Kids can suggest alternatives
  require_reason BOOLEAN DEFAULT false, -- Require reason for "no_way" votes

  -- Stats
  total_meals INTEGER DEFAULT 0,
  total_votes INTEGER DEFAULT 0,
  participation_rate DECIMAL(5,2), -- % of kids who voted

  -- Timestamps
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Vote summary by meal (materialized view for performance)
CREATE TABLE IF NOT EXISTS meal_vote_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_entry_id UUID REFERENCES plan_entries(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  meal_date DATE NOT NULL,
  meal_slot TEXT NOT NULL,

  -- Vote counts
  love_it_count INTEGER DEFAULT 0,
  okay_count INTEGER DEFAULT 0,
  no_way_count INTEGER DEFAULT 0,
  total_votes INTEGER DEFAULT 0,

  -- Calculated score (0-100)
  approval_score DECIMAL(5,2),

  -- Last updated
  last_vote_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (plan_entry_id),
  UNIQUE (recipe_id, household_id, meal_date, meal_slot)
);

-- Kid meal suggestions (when they vote "no_way" and suggest alternative)
CREATE TABLE IF NOT EXISTS kid_meal_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- What they're suggesting for
  original_plan_entry_id UUID REFERENCES plan_entries(id) ON DELETE SET NULL,
  meal_date DATE NOT NULL,
  meal_slot TEXT NOT NULL,

  -- Their suggestion
  suggested_recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  suggested_food_name TEXT,
  suggestion_reason TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'alternative_chosen')),
  parent_response TEXT,

  -- If accepted, link to new plan entry
  accepted_plan_entry_id UUID REFERENCES plan_entries(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Voting rewards/achievements
CREATE TABLE IF NOT EXISTS voting_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,

  achievement_type TEXT NOT NULL CHECK (achievement_type IN (
    'first_vote',
    'voted_5_times',
    'voted_10_times',
    'voted_full_week',
    'suggestion_accepted',
    'helpful_voter', -- Consistent voting
    'adventurous_voter' -- Says "love_it" to new foods
  )),

  achievement_name TEXT NOT NULL,
  achievement_description TEXT,
  icon_name TEXT,
  points_earned INTEGER DEFAULT 0,

  unlocked_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_meal_votes_kid ON meal_votes(kid_id);
CREATE INDEX IF NOT EXISTS idx_meal_votes_household ON meal_votes(household_id);
CREATE INDEX IF NOT EXISTS idx_meal_votes_plan_entry ON meal_votes(plan_entry_id);
CREATE INDEX IF NOT EXISTS idx_meal_votes_recipe ON meal_votes(recipe_id);
CREATE INDEX IF NOT EXISTS idx_meal_votes_date ON meal_votes(meal_date);
CREATE INDEX IF NOT EXISTS idx_meal_votes_session ON meal_votes(voting_session_id);

CREATE INDEX IF NOT EXISTS idx_voting_sessions_household ON voting_sessions(household_id);
CREATE INDEX IF NOT EXISTS idx_voting_sessions_status ON voting_sessions(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_voting_sessions_dates ON voting_sessions(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_meal_vote_summary_plan_entry ON meal_vote_summary(plan_entry_id);
CREATE INDEX IF NOT EXISTS idx_meal_vote_summary_recipe ON meal_vote_summary(recipe_id);
CREATE INDEX IF NOT EXISTS idx_meal_vote_summary_date ON meal_vote_summary(meal_date);

CREATE INDEX IF NOT EXISTS idx_kid_meal_suggestions_kid ON kid_meal_suggestions(kid_id);
CREATE INDEX IF NOT EXISTS idx_kid_meal_suggestions_status ON kid_meal_suggestions(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_voting_achievements_kid ON voting_achievements(kid_id);

-- Row Level Security
ALTER TABLE meal_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE voting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_vote_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE kid_meal_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voting_achievements ENABLE ROW LEVEL SECURITY;

-- meal_votes policies
CREATE POLICY "Users can view household votes"
  ON meal_votes FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create votes for household kids"
  ON meal_votes FOR INSERT
  WITH CHECK (
    kid_id IN (
      SELECT k.id FROM kids k
      JOIN household_members hm ON hm.household_id = k.household_id
      WHERE hm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update votes for household kids"
  ON meal_votes FOR UPDATE
  USING (
    kid_id IN (
      SELECT k.id FROM kids k
      JOIN household_members hm ON hm.household_id = k.household_id
      WHERE hm.user_id = auth.uid()
    )
  );

-- voting_sessions policies
CREATE POLICY "Users can view household sessions"
  ON voting_sessions FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create sessions"
  ON voting_sessions FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update household sessions"
  ON voting_sessions FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- meal_vote_summary policies (read-only for users)
CREATE POLICY "Users can view household vote summaries"
  ON meal_vote_summary FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- kid_meal_suggestions policies
CREATE POLICY "Users can view household suggestions"
  ON kid_meal_suggestions FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create suggestions for household kids"
  ON kid_meal_suggestions FOR INSERT
  WITH CHECK (
    kid_id IN (
      SELECT k.id FROM kids k
      JOIN household_members hm ON hm.household_id = k.household_id
      WHERE hm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update household suggestions"
  ON kid_meal_suggestions FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- voting_achievements policies
CREATE POLICY "Users can view household achievements"
  ON voting_achievements FOR SELECT
  USING (
    kid_id IN (
      SELECT k.id FROM kids k
      JOIN household_members hm ON hm.household_id = k.household_id
      WHERE hm.user_id = auth.uid()
    )
  );

-- Admins have full access
CREATE POLICY "Admins can manage all voting data"
  ON meal_votes FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all sessions"
  ON voting_sessions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Triggers for updated_at
CREATE TRIGGER update_meal_votes_updated_at
  BEFORE UPDATE ON meal_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_voting_sessions_updated_at
  BEFORE UPDATE ON voting_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_meal_vote_summary_updated_at
  BEFORE UPDATE ON meal_vote_summary
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_kid_meal_suggestions_updated_at
  BEFORE UPDATE ON kid_meal_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

-- Function to update vote summary when vote is cast
CREATE OR REPLACE FUNCTION update_meal_vote_summary()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update summary
  INSERT INTO meal_vote_summary (
    plan_entry_id,
    recipe_id,
    household_id,
    meal_date,
    meal_slot,
    love_it_count,
    okay_count,
    no_way_count,
    total_votes,
    approval_score,
    last_vote_at
  )
  SELECT
    COALESCE(NEW.plan_entry_id, OLD.plan_entry_id),
    COALESCE(NEW.recipe_id, OLD.recipe_id),
    COALESCE(NEW.household_id, OLD.household_id),
    COALESCE(NEW.meal_date, OLD.meal_date),
    COALESCE(NEW.meal_slot, OLD.meal_slot),
    COUNT(*) FILTER (WHERE vote = 'love_it'),
    COUNT(*) FILTER (WHERE vote = 'okay'),
    COUNT(*) FILTER (WHERE vote = 'no_way'),
    COUNT(*),
    -- Approval score: love_it=100, okay=50, no_way=0
    ROUND(
      (COUNT(*) FILTER (WHERE vote = 'love_it') * 100.0 +
       COUNT(*) FILTER (WHERE vote = 'okay') * 50.0) /
      NULLIF(COUNT(*), 0),
      2
    ),
    MAX(voted_at)
  FROM meal_votes
  WHERE (
    (NEW.plan_entry_id IS NOT NULL AND plan_entry_id = NEW.plan_entry_id)
    OR
    (NEW.recipe_id IS NOT NULL AND recipe_id = NEW.recipe_id AND meal_date = NEW.meal_date AND meal_slot = NEW.meal_slot)
  )
  GROUP BY plan_entry_id, recipe_id, household_id, meal_date, meal_slot
  ON CONFLICT (plan_entry_id)
  DO UPDATE SET
    love_it_count = EXCLUDED.love_it_count,
    okay_count = EXCLUDED.okay_count,
    no_way_count = EXCLUDED.no_way_count,
    total_votes = EXCLUDED.total_votes,
    approval_score = EXCLUDED.approval_score,
    last_vote_at = EXCLUDED.last_vote_at,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update summary on vote insert/update/delete
CREATE TRIGGER update_vote_summary_on_vote
  AFTER INSERT OR UPDATE OR DELETE ON meal_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_meal_vote_summary();

-- Function to check and award voting achievements
CREATE OR REPLACE FUNCTION check_voting_achievements(p_kid_id UUID)
RETURNS VOID AS $$
DECLARE
  vote_count INTEGER;
  full_week_count INTEGER;
  suggestion_count INTEGER;
BEGIN
  -- Count total votes
  SELECT COUNT(*) INTO vote_count
  FROM meal_votes
  WHERE kid_id = p_kid_id;

  -- First vote achievement
  IF vote_count = 1 THEN
    INSERT INTO voting_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_earned)
    VALUES (p_kid_id, 'first_vote', 'First Vote!', 'Cast your first meal vote', 'vote', 10)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 5 votes achievement
  IF vote_count = 5 THEN
    INSERT INTO voting_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_earned)
    VALUES (p_kid_id, 'voted_5_times', 'Active Voter', 'Voted on 5 meals', 'star', 25)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 10 votes achievement
  IF vote_count = 10 THEN
    INSERT INTO voting_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_earned)
    VALUES (p_kid_id, 'voted_10_times', 'Super Voter', 'Voted on 10 meals', 'trophy', 50)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Check for full week voting (7 consecutive days)
  SELECT COUNT(DISTINCT meal_date) INTO full_week_count
  FROM meal_votes
  WHERE kid_id = p_kid_id
    AND meal_date >= CURRENT_DATE - INTERVAL '7 days'
    AND meal_date <= CURRENT_DATE;

  IF full_week_count >= 7 THEN
    INSERT INTO voting_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_earned)
    VALUES (p_kid_id, 'voted_full_week', 'Week Warrior', 'Voted on meals for a full week', 'calendar', 100)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Check for accepted suggestions
  SELECT COUNT(*) INTO suggestion_count
  FROM kid_meal_suggestions
  WHERE kid_id = p_kid_id
    AND status = 'accepted';

  IF suggestion_count > 0 THEN
    INSERT INTO voting_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_earned)
    VALUES (p_kid_id, 'suggestion_accepted', 'Meal Planner', 'Your meal suggestion was accepted!', 'lightbulb', 75)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to check achievements after vote
CREATE OR REPLACE FUNCTION check_achievements_after_vote()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM check_voting_achievements(NEW.kid_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_achievements_on_vote
  AFTER INSERT ON meal_votes
  FOR EACH ROW
  EXECUTE FUNCTION check_achievements_after_vote();

COMMENT ON TABLE meal_votes IS 'Individual votes from kids on upcoming meals';
COMMENT ON TABLE voting_sessions IS 'Voting periods opened by parents for kids to vote on meals';
COMMENT ON TABLE meal_vote_summary IS 'Aggregated vote counts and approval scores per meal';
COMMENT ON TABLE kid_meal_suggestions IS 'Alternative meals suggested by kids when they vote no';
COMMENT ON TABLE voting_achievements IS 'Achievements earned by kids for participating in voting';
COMMENT ON FUNCTION update_meal_vote_summary IS 'Automatically updates vote summary when votes change';
COMMENT ON FUNCTION check_voting_achievements IS 'Checks and awards achievements based on voting activity';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251110000004_meal_voting.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 82: 20251110000005_weekly_reports.sql
-- ============================================

-- Automated Weekly Reports Feature
-- Generates comprehensive weekly summaries of meal planning activities
-- Provides insights on nutrition, engagement, and efficiency metrics

-- Weekly report records
CREATE TABLE IF NOT EXISTS weekly_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- Report period
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,

  -- Planning metrics
  meals_planned INTEGER DEFAULT 0,
  meals_completed INTEGER DEFAULT 0,
  planning_completion_rate DECIMAL(5,2), -- Percentage
  templates_used INTEGER DEFAULT 0,
  time_saved_minutes INTEGER DEFAULT 0, -- Estimated time saved using templates

  -- Nutrition metrics
  nutrition_goals_met INTEGER DEFAULT 0,
  nutrition_goals_total INTEGER DEFAULT 0,
  avg_calories_per_day DECIMAL(8,2),
  avg_protein_per_day DECIMAL(6,2),
  avg_carbs_per_day DECIMAL(6,2),
  avg_fat_per_day DECIMAL(6,2),
  nutrition_score DECIMAL(5,2), -- 0-100 score based on goals

  -- Grocery metrics
  grocery_items_added INTEGER DEFAULT 0,
  grocery_items_purchased INTEGER DEFAULT 0,
  grocery_completion_rate DECIMAL(5,2),
  estimated_grocery_cost DECIMAL(10,2),

  -- Recipe metrics
  unique_recipes_used INTEGER DEFAULT 0,
  recipe_repeats INTEGER DEFAULT 0,
  new_recipes_tried INTEGER DEFAULT 0,
  recipe_diversity_score DECIMAL(5,2), -- Higher = more variety

  -- Kid engagement metrics
  kids_voted INTEGER DEFAULT 0,
  total_kids INTEGER DEFAULT 0,
  voting_participation_rate DECIMAL(5,2),
  total_votes_cast INTEGER DEFAULT 0,
  avg_meal_approval_score DECIMAL(5,2), -- 0-100
  achievements_unlocked INTEGER DEFAULT 0,

  -- Top performers
  most_loved_meals JSONB, -- Array of {meal_name, approval_score, votes}
  least_loved_meals JSONB,
  most_used_recipes JSONB, -- Array of {recipe_name, times_used}
  healthiest_meals JSONB, -- Array of {meal_name, nutrition_score}

  -- Insights and recommendations
  insights JSONB, -- Array of insight objects
  recommendations JSONB, -- Array of recommendation objects

  -- Status
  status TEXT DEFAULT 'generated' CHECK (status IN ('generating', 'generated', 'sent', 'viewed', 'archived')),
  generated_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,

  -- Report version (for future schema changes)
  report_version INTEGER DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Ensure one report per week per household
  UNIQUE (household_id, week_start_date)
);

-- Report insights (individual noteworthy findings)
CREATE TABLE IF NOT EXISTS report_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID REFERENCES weekly_reports(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- Insight details
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'achievement',         -- "You planned 7 days this week!"
    'improvement',         -- "20% more veggies than last week"
    'streak',             -- "3 weeks in a row planning!"
    'cost_savings',       -- "Saved $50 vs eating out"
    'nutrition_win',      -- "Hit protein goals 6/7 days"
    'engagement_win',     -- "100% kid voting participation"
    'variety_win',        -- "Tried 5 new recipes"
    'efficiency_win',     -- "Used templates saved 2 hours"
    'concern',            -- "Low approval on 3 meals"
    'suggestion'          -- "Try more breakfast variety"
  )),

  title TEXT NOT NULL,
  description TEXT,
  metric_value DECIMAL(10,2), -- The key number
  metric_label TEXT, -- e.g., "meals", "minutes", "dollars"

  -- Visual elements
  icon_name TEXT, -- Lucide icon name
  color_scheme TEXT, -- 'green', 'yellow', 'red', 'blue', 'purple'

  -- Priority for display
  priority INTEGER DEFAULT 0, -- Higher = show first

  created_at TIMESTAMPTZ DEFAULT now()
);

-- User preferences for report generation and delivery
CREATE TABLE IF NOT EXISTS report_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Generation settings
  auto_generate BOOLEAN DEFAULT true,
  generation_day TEXT DEFAULT 'monday' CHECK (generation_day IN (
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
  )),
  generation_time TIME DEFAULT '09:00:00', -- What time to generate

  -- Delivery settings
  email_delivery BOOLEAN DEFAULT true,
  push_notification BOOLEAN DEFAULT true,
  in_app_only BOOLEAN DEFAULT false,

  -- Content preferences
  include_nutrition_details BOOLEAN DEFAULT true,
  include_cost_estimates BOOLEAN DEFAULT true,
  include_kid_voting BOOLEAN DEFAULT true,
  include_recommendations BOOLEAN DEFAULT true,
  include_comparisons BOOLEAN DEFAULT true, -- Compare to previous weeks

  -- Report format
  summary_level TEXT DEFAULT 'detailed' CHECK (summary_level IN ('brief', 'standard', 'detailed')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (household_id, user_id)
);

-- Historical comparison data (track trends over time)
CREATE TABLE IF NOT EXISTS report_trends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  metric_name TEXT NOT NULL,
  week_start_date DATE NOT NULL,
  metric_value DECIMAL(10,2) NOT NULL,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (household_id, metric_name, week_start_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_weekly_reports_household ON weekly_reports(household_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_dates ON weekly_reports(week_start_date, week_end_date);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_status ON weekly_reports(status);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_generated_at ON weekly_reports(generated_at);

CREATE INDEX IF NOT EXISTS idx_report_insights_report ON report_insights(report_id);
CREATE INDEX IF NOT EXISTS idx_report_insights_household ON report_insights(household_id);
CREATE INDEX IF NOT EXISTS idx_report_insights_type ON report_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_report_insights_priority ON report_insights(priority DESC);

CREATE INDEX IF NOT EXISTS idx_report_preferences_household ON report_preferences(household_id);
CREATE INDEX IF NOT EXISTS idx_report_preferences_user ON report_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_report_preferences_auto ON report_preferences(auto_generate) WHERE auto_generate = true;

CREATE INDEX IF NOT EXISTS idx_report_trends_household ON report_trends(household_id);
CREATE INDEX IF NOT EXISTS idx_report_trends_metric ON report_trends(metric_name, week_start_date);

-- Row Level Security
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_trends ENABLE ROW LEVEL SECURITY;

-- weekly_reports policies
CREATE POLICY "Users can view household reports"
  ON weekly_reports FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can create reports"
  ON weekly_reports FOR INSERT
  WITH CHECK (true); -- Edge function will have service role

CREATE POLICY "Users can update household reports"
  ON weekly_reports FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- report_insights policies
CREATE POLICY "Users can view household insights"
  ON report_insights FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- report_preferences policies
CREATE POLICY "Users can view their preferences"
  ON report_preferences FOR SELECT
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their preferences"
  ON report_preferences FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Users can update their preferences"
  ON report_preferences FOR UPDATE
  USING (
    user_id = auth.uid()
  );

-- report_trends policies
CREATE POLICY "Users can view household trends"
  ON report_trends FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- Admins have full access
CREATE POLICY "Admins can manage all reports"
  ON weekly_reports FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Triggers for updated_at
CREATE TRIGGER update_weekly_reports_updated_at
  BEFORE UPDATE ON weekly_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_report_preferences_updated_at
  BEFORE UPDATE ON report_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

-- Function to mark report as viewed
CREATE OR REPLACE FUNCTION mark_report_viewed(p_report_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE weekly_reports
  SET
    status = CASE
      WHEN status = 'generated' THEN 'viewed'
      WHEN status = 'sent' THEN 'viewed'
      ELSE status
    END,
    viewed_at = CASE
      WHEN viewed_at IS NULL THEN now()
      ELSE viewed_at
    END,
    updated_at = now()
  WHERE id = p_report_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get trend comparison
CREATE OR REPLACE FUNCTION get_metric_trend(
  p_household_id UUID,
  p_metric_name TEXT,
  p_current_week DATE,
  p_weeks_back INTEGER DEFAULT 4
)
RETURNS TABLE(
  week_start_date DATE,
  metric_value DECIMAL(10,2),
  week_label TEXT,
  is_current BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rt.week_start_date,
    rt.metric_value,
    CASE
      WHEN rt.week_start_date = p_current_week THEN 'Current'
      WHEN rt.week_start_date = p_current_week - INTERVAL '1 week' THEN 'Last Week'
      ELSE 'Week of ' || TO_CHAR(rt.week_start_date, 'Mon DD')
    END,
    rt.week_start_date = p_current_week
  FROM report_trends rt
  WHERE rt.household_id = p_household_id
    AND rt.metric_name = p_metric_name
    AND rt.week_start_date >= p_current_week - (p_weeks_back || ' weeks')::INTERVAL
    AND rt.week_start_date <= p_current_week
  ORDER BY rt.week_start_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to save trend data
CREATE OR REPLACE FUNCTION save_report_trend(
  p_household_id UUID,
  p_metric_name TEXT,
  p_week_start DATE,
  p_value DECIMAL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO report_trends (household_id, metric_name, week_start_date, metric_value)
  VALUES (p_household_id, p_metric_name, p_week_start, p_value)
  ON CONFLICT (household_id, metric_name, week_start_date)
  DO UPDATE SET metric_value = p_value;
END;
$$ LANGUAGE plpgsql;

-- View for recent reports summary
CREATE OR REPLACE VIEW recent_reports_summary AS
SELECT
  wr.id,
  wr.household_id,
  wr.week_start_date,
  wr.week_end_date,
  wr.status,
  wr.meals_planned,
  wr.planning_completion_rate,
  wr.nutrition_score,
  wr.voting_participation_rate,
  wr.avg_meal_approval_score,
  wr.generated_at,
  wr.viewed_at,
  COUNT(ri.id) as insight_count
FROM weekly_reports wr
LEFT JOIN report_insights ri ON ri.report_id = wr.id
WHERE wr.generated_at >= now() - INTERVAL '3 months'
GROUP BY wr.id
ORDER BY wr.week_start_date DESC;

-- Comments for documentation
COMMENT ON TABLE weekly_reports IS 'Comprehensive weekly summaries of household meal planning activities';
COMMENT ON TABLE report_insights IS 'Individual noteworthy findings and achievements from weekly reports';
COMMENT ON TABLE report_preferences IS 'User preferences for report generation and delivery';
COMMENT ON TABLE report_trends IS 'Historical metric data for trend analysis over time';

COMMENT ON COLUMN weekly_reports.planning_completion_rate IS 'Percentage of planned meals that were actually logged';
COMMENT ON COLUMN weekly_reports.time_saved_minutes IS 'Estimated time saved by using templates and automation';
COMMENT ON COLUMN weekly_reports.nutrition_score IS 'Overall nutrition quality score based on goals (0-100)';
COMMENT ON COLUMN weekly_reports.recipe_diversity_score IS 'Score indicating meal variety (higher = more diverse)';
COMMENT ON COLUMN weekly_reports.most_loved_meals IS 'JSON array of top-rated meals by kid votes';
COMMENT ON COLUMN weekly_reports.insights IS 'JSON array of key insights and achievements';

COMMENT ON FUNCTION mark_report_viewed IS 'Marks a report as viewed and updates viewed_at timestamp';
COMMENT ON FUNCTION get_metric_trend IS 'Retrieves historical trend data for a specific metric';
COMMENT ON FUNCTION save_report_trend IS 'Saves a metric value for trend tracking';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251110000005_weekly_reports.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 83: 20251110000006_meal_suggestions.sql
-- ============================================

-- Quick Meal Suggestions Feature
-- AI-powered personalized meal recommendations based on household preferences,
-- past votes, available ingredients, and contextual factors

-- Meal suggestions generated for households
CREATE TABLE IF NOT EXISTS meal_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- Suggestion context
  suggested_for_date DATE,
  meal_slot TEXT CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack1', 'snack2', 'try_bite')),

  -- Suggested recipe
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,

  -- AI reasoning and metadata
  reasoning TEXT, -- Why this was suggested
  confidence_score DECIMAL(5,2), -- 0-100 how confident the AI is
  match_factors JSONB, -- Factors that influenced the suggestion

  -- Personalization data used
  based_on_votes BOOLEAN DEFAULT false,
  based_on_pantry BOOLEAN DEFAULT false,
  based_on_season BOOLEAN DEFAULT false,
  based_on_preferences BOOLEAN DEFAULT false,
  based_on_variety BOOLEAN DEFAULT false,

  -- Suggestion attributes
  estimated_prep_time INTEGER, -- Minutes
  estimated_cook_time INTEGER,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  predicted_kid_approval INTEGER, -- 0-100 predicted approval

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'skipped', 'planned')),
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,

  -- Feedback
  feedback_rating INTEGER CHECK (feedback_rating BETWEEN 1 AND 5),
  feedback_text TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days' -- Suggestions expire after 1 week
);

-- User feedback on suggestions (helps improve future recommendations)
CREATE TABLE IF NOT EXISTS suggestion_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  suggestion_id UUID REFERENCES meal_suggestions(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Feedback type
  feedback_type TEXT NOT NULL CHECK (feedback_type IN (
    'thumbs_up',
    'thumbs_down',
    'not_interested',
    'already_planned',
    'missing_ingredients',
    'too_complex',
    'not_kid_friendly',
    'perfect'
  )),

  feedback_text TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- User preferences for meal suggestions
CREATE TABLE IF NOT EXISTS suggestion_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Dietary preferences
  dietary_restrictions JSONB DEFAULT '[]', -- ['vegetarian', 'gluten_free', 'dairy_free', 'nut_free']
  allergens JSONB DEFAULT '[]', -- Specific allergens to avoid

  -- Time constraints
  max_prep_time INTEGER, -- Minutes
  max_cook_time INTEGER,
  prefer_quick_meals BOOLEAN DEFAULT false,

  -- Complexity preferences
  preferred_difficulty TEXT[] DEFAULT ARRAY['easy', 'medium'],
  avoid_difficult_recipes BOOLEAN DEFAULT true,

  -- Variety preferences
  avoid_recent_recipes BOOLEAN DEFAULT true, -- Don't suggest recently used
  recent_recipe_window_days INTEGER DEFAULT 14, -- How many days to look back
  prefer_new_recipes BOOLEAN DEFAULT true,

  -- Kid-focused
  prioritize_kid_favorites BOOLEAN DEFAULT true, -- Use voting data
  min_kid_approval INTEGER DEFAULT 70, -- Only suggest meals with >70% approval

  -- Ingredient-based
  use_pantry_items BOOLEAN DEFAULT true, -- Prioritize available ingredients
  allow_missing_ingredients BOOLEAN DEFAULT true,
  max_missing_ingredients INTEGER DEFAULT 3,

  -- Seasonal
  prefer_seasonal BOOLEAN DEFAULT true,
  current_season TEXT, -- 'spring', 'summer', 'fall', 'winter'

  -- Frequency
  auto_generate_suggestions BOOLEAN DEFAULT true,
  suggestion_frequency TEXT DEFAULT 'daily' CHECK (suggestion_frequency IN ('daily', 'weekly', 'on_demand')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (household_id, user_id)
);

-- Suggestion history for analytics
CREATE TABLE IF NOT EXISTS suggestion_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- Metrics
  date DATE NOT NULL,
  suggestions_generated INTEGER DEFAULT 0,
  suggestions_accepted INTEGER DEFAULT 0,
  suggestions_rejected INTEGER DEFAULT 0,
  acceptance_rate DECIMAL(5,2),

  -- Top factors
  top_match_factors JSONB,
  avg_confidence_score DECIMAL(5,2),

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (household_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_meal_suggestions_household ON meal_suggestions(household_id);
CREATE INDEX IF NOT EXISTS idx_meal_suggestions_recipe ON meal_suggestions(recipe_id);
CREATE INDEX IF NOT EXISTS idx_meal_suggestions_status ON meal_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_meal_suggestions_date ON meal_suggestions(suggested_for_date);
CREATE INDEX IF NOT EXISTS idx_meal_suggestions_expires ON meal_suggestions(expires_at);
CREATE INDEX IF NOT EXISTS idx_meal_suggestions_created ON meal_suggestions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_suggestion ON suggestion_feedback(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_household ON suggestion_feedback(household_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_type ON suggestion_feedback(feedback_type);

CREATE INDEX IF NOT EXISTS idx_suggestion_preferences_household ON suggestion_preferences(household_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_preferences_user ON suggestion_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_suggestion_analytics_household ON suggestion_analytics(household_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_analytics_date ON suggestion_analytics(date DESC);

-- Row Level Security
ALTER TABLE meal_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_analytics ENABLE ROW LEVEL SECURITY;

-- meal_suggestions policies
CREATE POLICY "Users can view household suggestions"
  ON meal_suggestions FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can create suggestions"
  ON meal_suggestions FOR INSERT
  WITH CHECK (true); -- Edge function uses service role

CREATE POLICY "Users can update household suggestions"
  ON meal_suggestions FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete household suggestions"
  ON meal_suggestions FOR DELETE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- suggestion_feedback policies
CREATE POLICY "Users can view household feedback"
  ON suggestion_feedback FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create feedback"
  ON suggestion_feedback FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- suggestion_preferences policies
CREATE POLICY "Users can view their preferences"
  ON suggestion_preferences FOR SELECT
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their preferences"
  ON suggestion_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their preferences"
  ON suggestion_preferences FOR UPDATE
  USING (user_id = auth.uid());

-- suggestion_analytics policies
CREATE POLICY "Users can view household analytics"
  ON suggestion_analytics FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_meal_suggestions_updated_at
  BEFORE UPDATE ON meal_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_suggestion_preferences_updated_at
  BEFORE UPDATE ON suggestion_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

-- Function to accept suggestion and add to meal plan
CREATE OR REPLACE FUNCTION accept_meal_suggestion(
  p_suggestion_id UUID,
  p_kid_ids UUID[]
)
RETURNS JSONB AS $$
DECLARE
  v_suggestion meal_suggestions;
  v_plan_entry_ids UUID[] := '{}';
  v_kid_id UUID;
  v_entry_id UUID;
BEGIN
  -- Get suggestion details
  SELECT * INTO v_suggestion
  FROM meal_suggestions
  WHERE id = p_suggestion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion not found';
  END IF;

  -- Create plan entries for each kid
  FOREACH v_kid_id IN ARRAY p_kid_ids
  LOOP
    INSERT INTO plan_entries (
      household_id,
      kid_id,
      recipe_id,
      date,
      meal_slot,
      completed
    ) VALUES (
      v_suggestion.household_id,
      v_kid_id,
      v_suggestion.recipe_id,
      v_suggestion.suggested_for_date,
      v_suggestion.meal_slot,
      false
    )
    RETURNING id INTO v_entry_id;

    v_plan_entry_ids := array_append(v_plan_entry_ids, v_entry_id);
  END LOOP;

  -- Update suggestion status
  UPDATE meal_suggestions
  SET
    status = 'accepted',
    accepted_at = now(),
    updated_at = now()
  WHERE id = p_suggestion_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_entry_ids', v_plan_entry_ids,
    'count', array_length(v_plan_entry_ids, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reject suggestion with feedback
CREATE OR REPLACE FUNCTION reject_meal_suggestion(
  p_suggestion_id UUID,
  p_feedback_type TEXT,
  p_feedback_text TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_suggestion meal_suggestions;
BEGIN
  -- Get suggestion
  SELECT * INTO v_suggestion
  FROM meal_suggestions
  WHERE id = p_suggestion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion not found';
  END IF;

  -- Update suggestion status
  UPDATE meal_suggestions
  SET
    status = 'rejected',
    rejected_at = now(),
    updated_at = now()
  WHERE id = p_suggestion_id;

  -- Record feedback
  INSERT INTO suggestion_feedback (
    suggestion_id,
    household_id,
    user_id,
    feedback_type,
    feedback_text
  ) VALUES (
    p_suggestion_id,
    v_suggestion.household_id,
    auth.uid(),
    p_feedback_type,
    p_feedback_text
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'rejected'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get recent recipes for variety checking
CREATE OR REPLACE FUNCTION get_recent_recipe_ids(
  p_household_id UUID,
  p_days_back INTEGER DEFAULT 14
)
RETURNS UUID[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT DISTINCT recipe_id
    FROM plan_entries
    WHERE household_id = p_household_id
      AND recipe_id IS NOT NULL
      AND date >= CURRENT_DATE - p_days_back
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get kid favorite recipes based on votes
CREATE OR REPLACE FUNCTION get_kid_favorite_recipes(
  p_household_id UUID,
  p_min_approval INTEGER DEFAULT 70
)
RETURNS TABLE(
  recipe_id UUID,
  approval_score DECIMAL,
  vote_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mvs.recipe_id,
    mvs.approval_score,
    mvs.total_votes
  FROM meal_vote_summary mvs
  WHERE mvs.household_id = p_household_id
    AND mvs.recipe_id IS NOT NULL
    AND mvs.approval_score >= p_min_approval
    AND mvs.total_votes >= 2 -- At least 2 votes
  ORDER BY mvs.approval_score DESC, mvs.total_votes DESC;
END;
$$ LANGUAGE plpgsql;

-- View for active suggestions
CREATE OR REPLACE VIEW active_suggestions AS
SELECT
  ms.*,
  r.name as recipe_name,
  r.description as recipe_description,
  r.image_url as recipe_image,
  r.servings as recipe_servings,
  (
    SELECT COUNT(*)
    FROM suggestion_feedback sf
    WHERE sf.suggestion_id = ms.id
  ) as feedback_count
FROM meal_suggestions ms
JOIN recipes r ON r.id = ms.recipe_id
WHERE ms.status = 'pending'
  AND ms.expires_at > now()
ORDER BY ms.confidence_score DESC, ms.created_at DESC;

-- Comments for documentation
COMMENT ON TABLE meal_suggestions IS 'AI-generated meal recommendations personalized for each household';
COMMENT ON TABLE suggestion_feedback IS 'User feedback on suggestions to improve future recommendations';
COMMENT ON TABLE suggestion_preferences IS 'User preferences for how suggestions are generated';
COMMENT ON TABLE suggestion_analytics IS 'Daily analytics on suggestion performance';

COMMENT ON COLUMN meal_suggestions.reasoning IS 'AI-generated explanation of why this meal was suggested';
COMMENT ON COLUMN meal_suggestions.confidence_score IS 'AI confidence in this recommendation (0-100)';
COMMENT ON COLUMN meal_suggestions.match_factors IS 'JSON array of factors that influenced this suggestion';
COMMENT ON COLUMN meal_suggestions.predicted_kid_approval IS 'Predicted approval score based on similar past meals';

COMMENT ON FUNCTION accept_meal_suggestion IS 'Accepts a suggestion and creates plan entries for specified kids';
COMMENT ON FUNCTION reject_meal_suggestion IS 'Rejects a suggestion and records feedback for learning';
COMMENT ON FUNCTION get_recent_recipe_ids IS 'Returns recipe IDs used recently to ensure variety';
COMMENT ON FUNCTION get_kid_favorite_recipes IS 'Returns recipes with high kid approval scores';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251110000006_meal_suggestions.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 84: 20251110000007_grocery_delivery.sql
-- ============================================

-- Smart Grocery Delivery Integration
-- Seamlessly order groceries from meal plans through delivery services
-- Supports multiple providers (Instacart, Amazon Fresh, Walmart, etc.)

-- Delivery provider configurations
CREATE TABLE IF NOT EXISTS delivery_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Provider info
  provider_name TEXT NOT NULL UNIQUE, -- 'instacart', 'amazon_fresh', 'walmart', 'shipt', 'target'
  display_name TEXT NOT NULL,
  logo_url TEXT,
  website_url TEXT,

  -- Availability
  is_active BOOLEAN DEFAULT true,
  supported_regions JSONB, -- Array of zip codes or regions

  -- API configuration
  api_endpoint TEXT,
  requires_oauth BOOLEAN DEFAULT false,
  auth_type TEXT, -- 'oauth', 'api_key', 'none'

  -- Features
  supports_scheduled_delivery BOOLEAN DEFAULT false,
  supports_express_delivery BOOLEAN DEFAULT false,
  supports_price_matching BOOLEAN DEFAULT false,
  min_order_amount DECIMAL(10,2),
  delivery_fee DECIMAL(10,2),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User connections to delivery providers
CREATE TABLE IF NOT EXISTS user_delivery_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES delivery_providers(id) ON DELETE CASCADE,

  -- Account details
  provider_user_id TEXT, -- External user ID from provider
  account_email TEXT,
  is_connected BOOLEAN DEFAULT false,

  -- OAuth tokens (encrypted)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- API keys (encrypted)
  api_key TEXT,

  -- Preferences
  preferred_store_id TEXT,
  preferred_store_name TEXT,
  default_delivery_window TEXT, -- 'same_day', 'next_day', 'scheduled'

  -- Status
  last_connected_at TIMESTAMPTZ,
  connection_status TEXT DEFAULT 'active' CHECK (connection_status IN ('active', 'expired', 'disconnected', 'error')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (user_id, provider_id)
);

-- Grocery delivery orders
CREATE TABLE IF NOT EXISTS grocery_delivery_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES delivery_providers(id) ON DELETE SET NULL,
  account_id UUID REFERENCES user_delivery_accounts(id) ON DELETE SET NULL,

  -- Order details
  external_order_id TEXT, -- Order ID from delivery provider
  order_number TEXT, -- Human-readable order number

  -- Items
  items JSONB NOT NULL, -- Array of {food_id, name, quantity, unit, estimated_price, actual_price, available}
  item_count INTEGER,

  -- Pricing
  subtotal DECIMAL(10,2),
  delivery_fee DECIMAL(10,2),
  service_fee DECIMAL(10,2),
  tax DECIMAL(10,2),
  tip DECIMAL(10,2),
  total_amount DECIMAL(10,2),
  estimated_amount DECIMAL(10,2), -- Estimate before order placed

  -- Delivery details
  delivery_address JSONB, -- {street, city, state, zip, instructions}
  delivery_window_start TIMESTAMPTZ,
  delivery_window_end TIMESTAMPTZ,
  delivery_type TEXT CHECK (delivery_type IN ('standard', 'express', 'scheduled')),

  -- Status tracking
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft',           -- Being prepared
    'pending',         -- Ready to submit
    'submitted',       -- Sent to provider
    'confirmed',       -- Provider confirmed
    'shopping',        -- Shopper picking items
    'out_for_delivery',-- In transit
    'delivered',       -- Completed
    'cancelled',       -- Cancelled
    'failed'           -- Failed to process
  )),

  -- Shopper info (if available from provider)
  shopper_name TEXT,
  shopper_phone TEXT,
  shopper_rating DECIMAL(3,2),

  -- Timestamps
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  -- Notes
  order_notes TEXT,
  substitution_preferences TEXT, -- 'allow', 'contact_me', 'refund'

  -- Source tracking
  created_from_meal_plan BOOLEAN DEFAULT false,
  meal_plan_week_start DATE,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Order status history
CREATE TABLE IF NOT EXISTS delivery_order_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES grocery_delivery_orders(id) ON DELETE CASCADE,

  status TEXT NOT NULL,
  status_message TEXT,
  metadata JSONB, -- Additional data from provider

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Item substitutions
CREATE TABLE IF NOT EXISTS order_substitutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES grocery_delivery_orders(id) ON DELETE CASCADE,

  -- Original item
  original_food_id UUID REFERENCES foods(id) ON DELETE SET NULL,
  original_item_name TEXT NOT NULL,
  original_quantity DECIMAL(10,2),
  original_price DECIMAL(10,2),

  -- Substituted item
  substituted_item_name TEXT,
  substituted_quantity DECIMAL(10,2),
  substituted_price DECIMAL(10,2),

  -- Reason
  reason TEXT CHECK (reason IN ('out_of_stock', 'price_change', 'customer_approved', 'shopper_suggestion')),
  customer_approved BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Delivery pricing cache (for cost estimates)
CREATE TABLE IF NOT EXISTS delivery_pricing_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES delivery_providers(id) ON DELETE CASCADE,

  -- Item details
  item_name TEXT NOT NULL,
  item_category TEXT,

  -- Pricing
  price DECIMAL(10,2),
  unit TEXT,
  store_name TEXT,

  -- Cache metadata
  zip_code TEXT,
  last_updated TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days',

  created_at TIMESTAMPTZ DEFAULT now()
);

-- User preferences for grocery delivery
CREATE TABLE IF NOT EXISTS delivery_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Preferred provider
  preferred_provider_id UUID REFERENCES delivery_providers(id) ON DELETE SET NULL,

  -- Delivery preferences
  default_delivery_type TEXT DEFAULT 'standard',
  preferred_delivery_day TEXT[], -- ['monday', 'wednesday', 'friday']
  preferred_delivery_time TEXT, -- '6pm-8pm'

  -- Substitution preferences
  allow_substitutions BOOLEAN DEFAULT true,
  substitution_preference TEXT DEFAULT 'contact_me' CHECK (substitution_preference IN ('allow', 'contact_me', 'refund')),

  -- Budget
  weekly_grocery_budget DECIMAL(10,2),
  notify_if_over_budget BOOLEAN DEFAULT true,

  -- Auto-order
  auto_order_enabled BOOLEAN DEFAULT false,
  auto_order_day TEXT, -- 'sunday', 'monday', etc.
  auto_order_threshold DECIMAL(10,2), -- Only auto-order if total > threshold

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (household_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_delivery_providers_active ON delivery_providers(is_active);
CREATE INDEX IF NOT EXISTS idx_delivery_providers_name ON delivery_providers(provider_name);

CREATE INDEX IF NOT EXISTS idx_user_delivery_accounts_user ON user_delivery_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_delivery_accounts_household ON user_delivery_accounts(household_id);
CREATE INDEX IF NOT EXISTS idx_user_delivery_accounts_provider ON user_delivery_accounts(provider_id);
CREATE INDEX IF NOT EXISTS idx_user_delivery_accounts_status ON user_delivery_accounts(connection_status);

CREATE INDEX IF NOT EXISTS idx_grocery_delivery_orders_household ON grocery_delivery_orders(household_id);
CREATE INDEX IF NOT EXISTS idx_grocery_delivery_orders_user ON grocery_delivery_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_grocery_delivery_orders_provider ON grocery_delivery_orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_grocery_delivery_orders_status ON grocery_delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_grocery_delivery_orders_external ON grocery_delivery_orders(external_order_id);
CREATE INDEX IF NOT EXISTS idx_grocery_delivery_orders_created ON grocery_delivery_orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_order_history_order ON delivery_order_history(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_order_history_created ON delivery_order_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_substitutions_order ON order_substitutions(order_id);

CREATE INDEX IF NOT EXISTS idx_delivery_pricing_cache_provider ON delivery_pricing_cache(provider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_pricing_cache_item ON delivery_pricing_cache(item_name);
CREATE INDEX IF NOT EXISTS idx_delivery_pricing_cache_expires ON delivery_pricing_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_delivery_preferences_household ON delivery_preferences(household_id);
CREATE INDEX IF NOT EXISTS idx_delivery_preferences_user ON delivery_preferences(user_id);

-- Row Level Security
ALTER TABLE delivery_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_delivery_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_pricing_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_preferences ENABLE ROW LEVEL SECURITY;

-- delivery_providers policies (public read)
CREATE POLICY "Anyone can view active providers"
  ON delivery_providers FOR SELECT
  USING (is_active = true);

-- user_delivery_accounts policies
CREATE POLICY "Users can view their accounts"
  ON user_delivery_accounts FOR SELECT
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their accounts"
  ON user_delivery_accounts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their accounts"
  ON user_delivery_accounts FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their accounts"
  ON user_delivery_accounts FOR DELETE
  USING (user_id = auth.uid());

-- grocery_delivery_orders policies
CREATE POLICY "Users can view household orders"
  ON grocery_delivery_orders FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create orders"
  ON grocery_delivery_orders FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their orders"
  ON grocery_delivery_orders FOR UPDATE
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- delivery_order_history policies
CREATE POLICY "Users can view order history"
  ON delivery_order_history FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM grocery_delivery_orders
      WHERE household_id IN (
        SELECT household_id FROM profiles WHERE user_id = auth.uid()
      )
    )
  );

-- order_substitutions policies
CREATE POLICY "Users can view substitutions"
  ON order_substitutions FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM grocery_delivery_orders
      WHERE household_id IN (
        SELECT household_id FROM profiles WHERE user_id = auth.uid()
      )
    )
  );

-- delivery_pricing_cache policies (read-only for users)
CREATE POLICY "Users can view pricing cache"
  ON delivery_pricing_cache FOR SELECT
  USING (true);

-- delivery_preferences policies
CREATE POLICY "Users can view their preferences"
  ON delivery_preferences FOR SELECT
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their preferences"
  ON delivery_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their preferences"
  ON delivery_preferences FOR UPDATE
  USING (user_id = auth.uid());

-- Triggers for updated_at
CREATE TRIGGER update_delivery_providers_updated_at
  BEFORE UPDATE ON delivery_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_user_delivery_accounts_updated_at
  BEFORE UPDATE ON user_delivery_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_grocery_delivery_orders_updated_at
  BEFORE UPDATE ON grocery_delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_delivery_preferences_updated_at
  BEFORE UPDATE ON delivery_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

-- Function to create order from grocery list
CREATE OR REPLACE FUNCTION create_order_from_grocery_list(
  p_household_id UUID,
  p_user_id UUID,
  p_provider_id UUID,
  p_delivery_type TEXT DEFAULT 'standard'
)
RETURNS JSONB AS $$
DECLARE
  v_order_id UUID;
  v_items JSONB;
  v_item_count INTEGER;
  v_estimated_total DECIMAL(10,2);
BEGIN
  -- Get grocery list items for household
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'food_id', gl.food_id,
        'name', f.name,
        'quantity', gl.quantity,
        'unit', f.unit,
        'category', f.category,
        'estimated_price', COALESCE(f.price, 0),
        'available', true
      )
    ),
    COUNT(*),
    SUM(COALESCE(f.price, 0) * gl.quantity)
  INTO v_items, v_item_count, v_estimated_total
  FROM grocery_list gl
  JOIN foods f ON f.id = gl.food_id
  WHERE gl.household_id = p_household_id
    AND gl.purchased = false
    AND gl.food_id IS NOT NULL;

  IF v_items IS NULL OR v_item_count = 0 THEN
    RAISE EXCEPTION 'No items in grocery list';
  END IF;

  -- Create order
  INSERT INTO grocery_delivery_orders (
    household_id,
    user_id,
    provider_id,
    items,
    item_count,
    estimated_amount,
    delivery_type,
    status,
    created_from_meal_plan,
    substitution_preferences
  )
  VALUES (
    p_household_id,
    p_user_id,
    p_provider_id,
    v_items,
    v_item_count,
    v_estimated_total,
    p_delivery_type,
    'draft',
    true,
    'contact_me'
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'item_count', v_item_count,
    'estimated_total', v_estimated_total
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update order status
CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id UUID,
  p_status TEXT,
  p_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  -- Update order status
  UPDATE grocery_delivery_orders
  SET
    status = p_status,
    submitted_at = CASE WHEN p_status = 'submitted' AND submitted_at IS NULL THEN now() ELSE submitted_at END,
    confirmed_at = CASE WHEN p_status = 'confirmed' AND confirmed_at IS NULL THEN now() ELSE confirmed_at END,
    delivered_at = CASE WHEN p_status = 'delivered' AND delivered_at IS NULL THEN now() ELSE delivered_at END,
    cancelled_at = CASE WHEN p_status = 'cancelled' AND cancelled_at IS NULL THEN now() ELSE cancelled_at END,
    updated_at = now()
  WHERE id = p_order_id;

  -- Add to history
  INSERT INTO delivery_order_history (
    order_id,
    status,
    status_message,
    metadata
  )
  VALUES (
    p_order_id,
    p_status,
    p_message,
    p_metadata
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default providers
INSERT INTO delivery_providers (provider_name, display_name, logo_url, is_active, supported_regions, min_order_amount, delivery_fee)
VALUES
  ('instacart', 'Instacart', '/providers/instacart.png', true, '["*"]', 10.00, 3.99),
  ('amazon_fresh', 'Amazon Fresh', '/providers/amazon-fresh.png', true, '["*"]', 35.00, 0.00),
  ('walmart', 'Walmart Grocery', '/providers/walmart.png', true, '["*"]', 35.00, 0.00),
  ('shipt', 'Shipt', '/providers/shipt.png', true, '["*"]', 35.00, 5.99),
  ('target', 'Target Same Day', '/providers/target.png', true, '["*"]', 35.00, 5.99)
ON CONFLICT (provider_name) DO NOTHING;

-- Comments
COMMENT ON TABLE delivery_providers IS 'Supported grocery delivery service providers';
COMMENT ON TABLE user_delivery_accounts IS 'User connections to delivery service accounts';
COMMENT ON TABLE grocery_delivery_orders IS 'Grocery orders placed through delivery services';
COMMENT ON TABLE delivery_order_history IS 'Status change history for orders';
COMMENT ON TABLE order_substitutions IS 'Items substituted by shoppers';
COMMENT ON TABLE delivery_pricing_cache IS 'Cached pricing data from providers for estimates';
COMMENT ON TABLE delivery_preferences IS 'User preferences for grocery delivery';

COMMENT ON FUNCTION create_order_from_grocery_list IS 'Creates delivery order from household grocery list';
COMMENT ON FUNCTION update_order_status IS 'Updates order status and records in history';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251110000007_grocery_delivery.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 85: 20251111000000_add_custom_domains.sql
-- ============================================

-- Create custom domains table for Professional tier white-labeling
CREATE TABLE IF NOT EXISTS professional_custom_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  domain_name TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'active', 'failed')),
  dns_records JSONB DEFAULT '{}'::jsonb,
  verification_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  verified_at TIMESTAMPTZ,
  ssl_certificate_status TEXT DEFAULT 'pending' CHECK (ssl_certificate_status IN ('pending', 'issued', 'failed')),
  ssl_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_domain_name CHECK (
    domain_name ~ '^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*)*\.[a-zA-Z]{2,}$'
  )
);

-- Create brand customization table for Professional tier white-labeling
CREATE TABLE IF NOT EXISTS professional_brand_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Color theme
  primary_color TEXT DEFAULT '#2f6d3c',
  secondary_color TEXT DEFAULT '#a5d6a7',
  accent_color TEXT DEFAULT '#ffa45b',

  -- Branding assets
  business_name TEXT,
  logo_url TEXT,
  favicon_url TEXT,

  -- Content customization
  platform_tagline TEXT,
  footer_text TEXT,

  -- Contact information
  contact_email TEXT,
  phone_number TEXT,
  support_url TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_colors CHECK (
    primary_color ~ '^#[0-9A-Fa-f]{6}$' AND
    secondary_color ~ '^#[0-9A-Fa-f]{6}$' AND
    accent_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  CONSTRAINT valid_email CHECK (contact_email IS NULL OR contact_email ~ '^[^@]+@[^@]+\.[^@]+$')
);

-- Create indexes for performance
CREATE INDEX idx_professional_domains_user_id ON professional_custom_domains(user_id);
CREATE INDEX idx_professional_domains_status ON professional_custom_domains(status);
CREATE INDEX idx_professional_domains_domain_name ON professional_custom_domains(domain_name);
CREATE INDEX idx_professional_brand_settings_user_id ON professional_brand_settings(user_id);

-- Enable Row Level Security
ALTER TABLE professional_custom_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_brand_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for professional_custom_domains
CREATE POLICY "Users can view their own custom domain"
  ON professional_custom_domains FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own custom domain"
  ON professional_custom_domains FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    -- Check that user has Professional subscription
    EXISTS (
      SELECT 1 FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = auth.uid()
      AND us.status = 'active'
      AND sp.name = 'Professional'
    )
  );

CREATE POLICY "Users can update their own custom domain"
  ON professional_custom_domains FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own custom domain"
  ON professional_custom_domains FOR DELETE
  USING (user_id = auth.uid());

-- RLS Policies for professional_brand_settings
CREATE POLICY "Users can view their own brand settings"
  ON professional_brand_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own brand settings"
  ON professional_brand_settings FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    -- Check that user has Professional subscription
    EXISTS (
      SELECT 1 FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = auth.uid()
      AND us.status = 'active'
      AND sp.name = 'Professional'
    )
  );

CREATE POLICY "Users can update their own brand settings"
  ON professional_brand_settings FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own brand settings"
  ON professional_brand_settings FOR DELETE
  USING (user_id = auth.uid());

-- Policy to allow public viewing of brand settings for custom domains (for white-label display)
CREATE POLICY "Public can view brand settings for verified domains"
  ON professional_brand_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM professional_custom_domains pcd
      WHERE pcd.user_id = professional_brand_settings.user_id
      AND pcd.status IN ('verified', 'active')
    )
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_professional_domains_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_professional_brand_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_professional_domains_updated_at
  BEFORE UPDATE ON professional_custom_domains
  FOR EACH ROW
  EXECUTE FUNCTION update_professional_domains_updated_at();

CREATE TRIGGER update_professional_brand_settings_updated_at
  BEFORE UPDATE ON professional_brand_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_professional_brand_settings_updated_at();

-- Function to automatically populate DNS records when domain is added
CREATE OR REPLACE FUNCTION generate_dns_records()
RETURNS TRIGGER AS $$
BEGIN
  NEW.dns_records = jsonb_build_object(
    'verification', jsonb_build_object(
      'type', 'TXT',
      'name', '_eatpal-verification',
      'value', NEW.verification_token,
      'ttl', 3600
    ),
    'cname', jsonb_build_object(
      'type', 'CNAME',
      'name', '@',
      'value', 'eatpal.com',
      'ttl', 3600
    ),
    'www_cname', jsonb_build_object(
      'type', 'CNAME',
      'name', 'www',
      'value', 'eatpal.com',
      'ttl', 3600
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER populate_dns_records
  BEFORE INSERT ON professional_custom_domains
  FOR EACH ROW
  EXECUTE FUNCTION generate_dns_records();

-- Comments for documentation
COMMENT ON TABLE professional_custom_domains IS 'Stores custom domain configurations for Professional tier users white-labeling';
COMMENT ON TABLE professional_brand_settings IS 'Stores brand customization settings for Professional tier users white-labeling';
COMMENT ON COLUMN professional_custom_domains.status IS 'Domain verification status: pending, verified, active, failed';
COMMENT ON COLUMN professional_custom_domains.verification_token IS 'Unique token for DNS verification';
COMMENT ON COLUMN professional_brand_settings.primary_color IS 'Primary brand color in hex format';


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251111000000_add_custom_domains.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 86: 20251113000000_performance_indexes.sql
-- ============================================

-- Performance Optimization Indexes
-- Created: 2025-11-13
-- Purpose: Add indexes to optimize common query patterns and improve performance

-- ============================================================================
-- MEAL PLANNING INDEXES
-- ============================================================================

-- Optimize meal plan queries (most common query pattern)
-- Query: Get all plan entries for a kid within a date range
CREATE INDEX IF NOT EXISTS idx_plan_entries_kid_date_slot
  ON plan_entries(kid_id, date, meal_slot)
  WHERE deleted_at IS NULL;

-- Optimize plan entries by user for dashboard views
CREATE INDEX IF NOT EXISTS idx_plan_entries_user_date
  ON plan_entries(user_id, date DESC)
  WHERE deleted_at IS NULL;

-- Optimize lookup of plan entries by result (for analytics)
CREATE INDEX IF NOT EXISTS idx_plan_entries_result
  ON plan_entries(kid_id, result, date DESC)
  WHERE result IS NOT NULL AND deleted_at IS NULL;

-- ============================================================================
-- FOOD LIBRARY INDEXES
-- ============================================================================

-- Optimize safe foods lookup (frequently used for meal planning)
CREATE INDEX IF NOT EXISTS idx_foods_user_safe
  ON foods(user_id, is_safe)
  WHERE is_safe = true AND deleted_at IS NULL;

-- Optimize food search by category
CREATE INDEX IF NOT EXISTS idx_foods_user_category
  ON foods(user_id, category, name)
  WHERE deleted_at IS NULL;

-- Optimize try-bite foods lookup
CREATE INDEX IF NOT EXISTS idx_foods_user_try_bite
  ON foods(user_id, is_try_bite)
  WHERE is_try_bite = true AND deleted_at IS NULL;

-- Optimize food search by name (for autocomplete)
CREATE INDEX IF NOT EXISTS idx_foods_name_trgm
  ON foods USING gin(name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- KIDS & HOUSEHOLD INDEXES
-- ============================================================================

-- Optimize kids lookup by user and household
CREATE INDEX IF NOT EXISTS idx_kids_user_household
  ON kids(user_id, household_id)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- GROCERY LIST INDEXES
-- ============================================================================

-- Optimize grocery list items by list and status
CREATE INDEX IF NOT EXISTS idx_grocery_items_list_checked
  ON grocery_items(list_id, is_checked, created_at DESC)
  WHERE deleted_at IS NULL;

-- Optimize grocery list lookup by user
CREATE INDEX IF NOT EXISTS idx_grocery_lists_user_date
  ON grocery_lists(user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Optimize grocery list by food
CREATE INDEX IF NOT EXISTS idx_grocery_items_food
  ON grocery_items(food_id)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- RECIPES INDEXES
-- ============================================================================

-- Optimize recipe search by user
CREATE INDEX IF NOT EXISTS idx_recipes_user_created
  ON recipes(user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Optimize recipe search by name (for autocomplete)
CREATE INDEX IF NOT EXISTS idx_recipes_name_trgm
  ON recipes USING gin(name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- BLOG SYSTEM INDEXES
-- ============================================================================

-- Optimize published blog posts (most common query)
CREATE INDEX IF NOT EXISTS idx_blog_posts_published
  ON blog_posts(published_at DESC)
  WHERE status = 'published' AND published_at <= NOW();

-- Optimize blog post search by slug
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug
  ON blog_posts(slug)
  WHERE deleted_at IS NULL;

-- Optimize blog post full-text search
CREATE INDEX IF NOT EXISTS idx_blog_posts_search
  ON blog_posts
  USING gin(to_tsvector('english', title || ' ' || COALESCE(excerpt, '') || ' ' || content))
  WHERE status = 'published';

-- Optimize blog posts by category
CREATE INDEX IF NOT EXISTS idx_blog_posts_category
  ON blog_posts(category, published_at DESC)
  WHERE status = 'published';

-- Optimize blog post tags lookup
CREATE INDEX IF NOT EXISTS idx_blog_post_tags_post
  ON blog_post_tags(post_id);

CREATE INDEX IF NOT EXISTS idx_blog_post_tags_tag
  ON blog_post_tags(tag_id);

-- ============================================================================
-- SUBSCRIPTION & PAYMENT INDEXES
-- ============================================================================

-- Optimize active subscription lookup
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active
  ON user_subscriptions(user_id, status, current_period_end DESC)
  WHERE status IN ('active', 'trialing');

-- Optimize subscription by Stripe ID (webhook lookups)
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe
  ON user_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Optimize payment history lookup
CREATE INDEX IF NOT EXISTS idx_payment_history_user
  ON payment_history(user_id, created_at DESC);

-- ============================================================================
-- ANALYTICS & TRACKING INDEXES
-- ============================================================================

-- Optimize food attempts tracking
CREATE INDEX IF NOT EXISTS idx_food_attempts_kid_date
  ON food_attempts(kid_id, attempted_at DESC)
  WHERE deleted_at IS NULL;

-- Optimize achievements lookup
CREATE INDEX IF NOT EXISTS idx_kid_achievements_kid
  ON kid_achievements(kid_id, unlocked_at DESC);

-- ============================================================================
-- ADMIN & MONITORING INDEXES
-- ============================================================================

-- Optimize user roles lookup
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role
  ON user_roles(user_id, role);

-- Optimize admin activity log
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_user_action
  ON admin_activity_log(user_id, action, created_at DESC);

-- Optimize error logs for monitoring
CREATE INDEX IF NOT EXISTS idx_error_logs_created
  ON error_logs(created_at DESC, severity)
  WHERE created_at > NOW() - INTERVAL '30 days';

-- ============================================================================
-- AI FEATURES INDEXES
-- ============================================================================

-- Optimize AI cost tracking
CREATE INDEX IF NOT EXISTS idx_ai_cost_tracking_user_date
  ON ai_cost_tracking(user_id, created_at DESC);

-- Optimize food chain suggestions
CREATE INDEX IF NOT EXISTS idx_food_chain_suggestions_food
  ON food_chain_suggestions(food_id, confidence DESC);

-- ============================================================================
-- SEO & ANALYTICS INDEXES
-- ============================================================================

-- Optimize SEO audits
CREATE INDEX IF NOT EXISTS idx_seo_audits_created
  ON seo_audits(created_at DESC);

-- Optimize keyword rankings tracking
CREATE INDEX IF NOT EXISTS idx_keyword_rankings_keyword_date
  ON keyword_rankings(keyword, check_date DESC);

-- Optimize blog analytics
CREATE INDEX IF NOT EXISTS idx_blog_analytics_post_date
  ON blog_analytics(post_id, date DESC);

-- ============================================================================
-- COMMENTS & ENGAGEMENT INDEXES
-- ============================================================================

-- Optimize blog comments by post
CREATE INDEX IF NOT EXISTS idx_blog_comments_post
  ON blog_comments(post_id, created_at DESC)
  WHERE status = 'approved';

-- Optimize comment votes
CREATE INDEX IF NOT EXISTS idx_blog_comment_votes_comment
  ON blog_comment_votes(comment_id, vote_type);

-- ============================================================================
-- FOREIGN KEY INDEXES (if not already exists)
-- ============================================================================
-- PostgreSQL doesn't automatically index foreign keys, but they're often used in JOINs

-- Plan entries foreign keys
CREATE INDEX IF NOT EXISTS idx_plan_entries_food_id
  ON plan_entries(food_id);

-- Grocery items foreign keys
CREATE INDEX IF NOT EXISTS idx_grocery_items_list_id
  ON grocery_items(list_id);

-- Kids foreign keys
CREATE INDEX IF NOT EXISTS idx_kids_household_id
  ON kids(household_id);

-- ============================================================================
-- ANALYZE TABLES
-- ============================================================================
-- Update table statistics for query planner

ANALYZE plan_entries;
ANALYZE foods;
ANALYZE kids;
ANALYZE grocery_lists;
ANALYZE grocery_items;
ANALYZE recipes;
ANALYZE blog_posts;
ANALYZE user_subscriptions;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_plan_entries_kid_date_slot IS
  'Optimizes meal plan queries by kid, date, and meal slot';

COMMENT ON INDEX idx_foods_user_safe IS
  'Optimizes safe foods lookup for meal planning';

COMMENT ON INDEX idx_blog_posts_published IS
  'Optimizes published blog post listing';

COMMENT ON INDEX idx_user_subscriptions_active IS
  'Optimizes active subscription lookup for access control';

-- ============================================================================
-- NOTES
-- ============================================================================
--
-- Performance Impact:
-- - Write operations: Minimal impact (< 5% slower)
-- - Read operations: 50-80% faster for indexed queries
-- - Storage: ~10-15% increase in database size
--
-- Maintenance:
-- - Indexes are automatically maintained by PostgreSQL
-- - VACUUM ANALYZE runs automatically
-- - Monitor index usage with pg_stat_user_indexes
--
-- Query to check index usage:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- ORDER BY idx_scan DESC;
--
-- Query to find unused indexes:
-- SELECT schemaname, tablename, indexname, idx_scan
-- FROM pg_stat_user_indexes
-- WHERE idx_scan = 0 AND indexname NOT LIKE 'pg_%'
-- ORDER BY pg_relation_size(indexrelid) DESC;


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251113000000_performance_indexes.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 87: 20251124000000_fix_household_members_recursion.sql
-- ============================================

-- Fix infinite recursion in household_members RLS policies
-- The previous policies query household_members within its own policies, causing recursion.
-- Solution: Use SECURITY DEFINER functions that bypass RLS.

-- First, create a helper function to check if a user belongs to a household
-- This function uses SECURITY DEFINER to bypass RLS and prevent recursion
CREATE OR REPLACE FUNCTION public.user_belongs_to_household(_user_id uuid, _household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members
    WHERE user_id = _user_id
    AND household_id = _household_id
  )
$$;

-- Drop the existing recursive policies
DROP POLICY IF EXISTS "Members can view household members" ON public.household_members;
DROP POLICY IF EXISTS "Members can insert household members" ON public.household_members;
DROP POLICY IF EXISTS "Members can delete household members" ON public.household_members;

-- Create new non-recursive policies using the SECURITY DEFINER function
CREATE POLICY "Members can view household members"
  ON public.household_members FOR SELECT
  USING (
    public.user_belongs_to_household(auth.uid(), household_id)
  );

CREATE POLICY "Members can insert household members"
  ON public.household_members FOR INSERT
  WITH CHECK (
    public.user_belongs_to_household(auth.uid(), household_id)
  );

CREATE POLICY "Members can update household members"
  ON public.household_members FOR UPDATE
  USING (
    public.user_belongs_to_household(auth.uid(), household_id)
  );

CREATE POLICY "Members can delete household members"
  ON public.household_members FOR DELETE
  USING (
    public.user_belongs_to_household(auth.uid(), household_id)
  );

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.user_belongs_to_household(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_household(uuid, uuid) TO anon;



-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251124000000_fix_household_members_recursion.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- Migration 88: 20251202000000_blog_publishing_editor.sql
-- ============================================

-- Migration: Blog Publishing Editor Features
-- Adds: Prompt Versioning System, Scheduled Publishing Support
-- Date: 2025-12-02

-- ============================================
-- PART 1: PROMPT VERSIONING SYSTEM
-- ============================================

-- Create prompt templates table
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'blog', -- blog, social, email, etc.
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb, -- Array of variable names expected in templates
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create prompt template versions table for version history
CREATE TABLE IF NOT EXISTS prompt_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES prompt_templates(id) ON DELETE CASCADE NOT NULL,
  version_number INTEGER NOT NULL,
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  change_notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(template_id, version_number)
);

-- Create prompt usage tracking table
CREATE TABLE IF NOT EXISTS prompt_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES prompt_templates(id) ON DELETE SET NULL,
  version_number INTEGER,
  used_for TEXT, -- 'blog_generation', 'social_content', etc.
  input_variables JSONB,
  output_summary TEXT, -- Brief summary of what was generated
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  tokens_used INTEGER,
  generation_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for prompt tables
CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_active ON prompt_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_prompt_versions_template ON prompt_template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_prompt_usage_template ON prompt_usage_log(template_id);
CREATE INDEX IF NOT EXISTS idx_prompt_usage_created ON prompt_usage_log(created_at DESC);

-- Function to create a new version when template is updated
CREATE OR REPLACE FUNCTION create_prompt_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Only create version if system_prompt or user_prompt_template changed
  IF OLD.system_prompt IS DISTINCT FROM NEW.system_prompt
     OR OLD.user_prompt_template IS DISTINCT FROM NEW.user_prompt_template
     OR OLD.variables IS DISTINCT FROM NEW.variables THEN

    -- Get next version number
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
    FROM prompt_template_versions
    WHERE template_id = NEW.id;

    -- Insert new version
    INSERT INTO prompt_template_versions (
      template_id,
      version_number,
      system_prompt,
      user_prompt_template,
      variables,
      change_notes,
      created_by
    ) VALUES (
      NEW.id,
      next_version,
      NEW.system_prompt,
      NEW.user_prompt_template,
      NEW.variables,
      'Auto-saved on update',
      NEW.created_by
    );
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for version tracking
DROP TRIGGER IF EXISTS prompt_template_version_trigger ON prompt_templates;
CREATE TRIGGER prompt_template_version_trigger
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION create_prompt_version();

-- Function to get template with version history
CREATE OR REPLACE FUNCTION get_prompt_template_with_versions(p_template_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  category TEXT,
  system_prompt TEXT,
  user_prompt_template TEXT,
  variables JSONB,
  is_active BOOLEAN,
  is_default BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  versions JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pt.id,
    pt.name,
    pt.description,
    pt.category,
    pt.system_prompt,
    pt.user_prompt_template,
    pt.variables,
    pt.is_active,
    pt.is_default,
    pt.created_at,
    pt.updated_at,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'version_number', pv.version_number,
          'system_prompt', pv.system_prompt,
          'user_prompt_template', pv.user_prompt_template,
          'variables', pv.variables,
          'change_notes', pv.change_notes,
          'created_at', pv.created_at
        ) ORDER BY pv.version_number DESC
      )
      FROM prompt_template_versions pv
      WHERE pv.template_id = pt.id),
      '[]'::jsonb
    ) as versions
  FROM prompt_templates pt
  WHERE pt.id = p_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to restore a specific version
CREATE OR REPLACE FUNCTION restore_prompt_version(
  p_template_id UUID,
  p_version_number INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_version prompt_template_versions%ROWTYPE;
BEGIN
  -- Get the version to restore
  SELECT * INTO v_version
  FROM prompt_template_versions
  WHERE template_id = p_template_id
    AND version_number = p_version_number;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Update the template with the version's content
  UPDATE prompt_templates
  SET
    system_prompt = v_version.system_prompt,
    user_prompt_template = v_version.user_prompt_template,
    variables = v_version.variables
  WHERE id = p_template_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 2: SCHEDULED PUBLISHING ENHANCEMENTS
-- ============================================

-- Add index for scheduled posts (existing column, new index for cron efficiency)
CREATE INDEX IF NOT EXISTS idx_blog_posts_scheduled
  ON blog_posts(scheduled_for)
  WHERE status = 'scheduled' AND scheduled_for IS NOT NULL;

-- Create scheduled tasks tracking table
CREATE TABLE IF NOT EXISTS scheduled_publish_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- pending, published, failed, cancelled
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_publish_status ON scheduled_publish_log(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_publish_post ON scheduled_publish_log(post_id);

-- Function to get posts due for publishing
CREATE OR REPLACE FUNCTION get_posts_due_for_publishing()
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  scheduled_for TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    bp.id,
    bp.title,
    bp.slug,
    bp.scheduled_for
  FROM blog_posts bp
  WHERE bp.status = 'scheduled'
    AND bp.scheduled_for IS NOT NULL
    AND bp.scheduled_for <= NOW()
  ORDER BY bp.scheduled_for ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to publish a scheduled post
CREATE OR REPLACE FUNCTION publish_scheduled_post(p_post_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_post blog_posts%ROWTYPE;
BEGIN
  -- Get the post
  SELECT * INTO v_post
  FROM blog_posts
  WHERE id = p_post_id
    AND status = 'scheduled';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Update post to published
  UPDATE blog_posts
  SET
    status = 'published',
    published_at = NOW(),
    updated_at = NOW()
  WHERE id = p_post_id;

  -- Log the publish event
  INSERT INTO scheduled_publish_log (post_id, scheduled_for, published_at, status)
  VALUES (p_post_id, v_post.scheduled_for, NOW(), 'published');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 3: RLS POLICIES
-- ============================================

-- Enable RLS on new tables
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_publish_log ENABLE ROW LEVEL SECURITY;

-- Prompt templates: Admins can manage, all authenticated users can view active templates
CREATE POLICY "Admins can manage prompt templates"
  ON prompt_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can view active prompt templates"
  ON prompt_templates FOR SELECT
  USING (is_active = true AND auth.uid() IS NOT NULL);

-- Prompt versions: Same as templates
CREATE POLICY "Admins can manage prompt versions"
  ON prompt_template_versions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can view prompt versions"
  ON prompt_template_versions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Prompt usage log: Admin only
CREATE POLICY "Admins can view prompt usage"
  ON prompt_usage_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Scheduled publish log: Admin only
CREATE POLICY "Admins can view scheduled publish log"
  ON scheduled_publish_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- ============================================
-- PART 4: INSERT DEFAULT PROMPT TEMPLATES
-- ============================================

INSERT INTO prompt_templates (name, description, category, system_prompt, user_prompt_template, variables, is_active, is_default)
VALUES
(
  'Blog Article Generator',
  'Standard blog post generation prompt for EatPal parenting content',
  'blog',
  'You are an expert content writer specializing in parenting, child nutrition, and family wellness.

WRITING STYLE:
- Tone: {{tone}}
- Approach: {{perspective}}
- Must be completely unique and different from generic parenting advice
- Avoid clichÃ©s and overused phrases
- Bring fresh insights and actionable value

Create comprehensive, SEO-optimized blog content that is engaging, informative, and actionable for parents.',
  'Create a complete blog article about: {{topic}}

{{#if keywords}}Focus on these keywords: {{keywords}}{{/if}}
{{#if targetAudience}}Target audience: {{targetAudience}}{{else}}Target audience: Parents of picky eaters and young children{{/if}}

UNIQUENESS REQUIREMENTS:
- Approach from a FRESH angle
- Use the {{tone}} tone throughout
- Frame the content through {{perspective}}
- Provide specific, actionable advice
- Include unique examples and scenarios

Generate a comprehensive blog post with:
1. Title: Engaging, SEO-friendly (60 chars max)
2. SEO Title: Optimized meta title (60 chars max)
3. SEO Description: Compelling meta description (150-160 chars)
4. Excerpt: Brief hook (150-200 words)
5. Body Content: ~1000-1400 words with clear headings
6. FAQ Section: 5-7 questions with detailed answers

Return ONLY valid JSON with keys: title, seo_title, seo_description, excerpt, body, faq',
  '["topic", "keywords", "targetAudience", "tone", "perspective"]'::jsonb,
  true,
  true
),
(
  'Quick Tips Generator',
  'Generates shorter, tip-focused blog posts',
  'blog',
  'You are a parenting expert creating quick, actionable tips for busy parents. Keep content concise but valuable.',
  'Create a quick tips article about: {{topic}}

Generate:
1. Catchy title (under 60 chars)
2. Brief intro (2-3 sentences)
3. 5-7 actionable tips with brief explanations
4. Quick summary/takeaway

Return as JSON with keys: title, intro, tips (array), summary',
  '["topic"]'::jsonb,
  true,
  false
),
(
  'Social Media Snippets',
  'Generates social media content from blog posts',
  'social',
  'You are a social media expert creating engaging, shareable content for parents.',
  'Create social media content for this blog post:

Title: {{title}}
Excerpt: {{excerpt}}
URL: {{url}}

Generate platform-specific posts:
- Twitter/X: Under 280 chars, engaging hook
- Facebook: 1-2 paragraphs, conversational
- Instagram: Caption with emojis, call-to-action
- LinkedIn: Professional tone, value-focused

Return as JSON with keys: twitter, facebook, instagram, linkedin',
  '["title", "excerpt", "url"]'::jsonb,
  true,
  false
)
ON CONFLICT DO NOTHING;

-- Insert initial versions for the default templates
INSERT INTO prompt_template_versions (template_id, version_number, system_prompt, user_prompt_template, variables, change_notes)
SELECT
  id,
  1,
  system_prompt,
  user_prompt_template,
  variables,
  'Initial version'
FROM prompt_templates
WHERE is_default = true
ON CONFLICT DO NOTHING;

-- ============================================
-- PART 5: UPDATE TRIGGERS
-- ============================================

-- Trigger for prompt_templates updated_at
CREATE TRIGGER update_prompt_templates_updated_at
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- Record migration
INSERT INTO _migrations (filename) VALUES ('20251202000000_blog_publishing_editor.sql') ON CONFLICT (filename) DO NOTHING;


-- ============================================
-- View Migration Results
-- ============================================

SELECT COUNT(*) as total_applied FROM _migrations;
SELECT filename, applied_at FROM _migrations ORDER BY applied_at;

