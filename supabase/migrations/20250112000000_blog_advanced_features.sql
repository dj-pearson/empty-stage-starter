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
