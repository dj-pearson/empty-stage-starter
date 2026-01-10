-- Migration: Storage Management, Activity Timeline, Customer Health Scoring, and User Segmentation
-- Date: 2026-01-10
-- Description: Adds infrastructure for centralized file management, user activity tracking,
--              customer health scoring, and advanced user segmentation

-- =====================================================
-- STORAGE MANAGEMENT TABLES
-- =====================================================

-- Storage bucket metadata and configuration
CREATE TABLE IF NOT EXISTS public.storage_buckets_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT true,
  allowed_mime_types TEXT[] DEFAULT ARRAY['image/jpeg', 'image/png', 'image/webp'],
  max_file_size_bytes BIGINT DEFAULT 5242880, -- 5MB
  signed_url_expiry_seconds INTEGER DEFAULT 3600,
  retention_days INTEGER, -- NULL = indefinite
  auto_delete_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- File upload tracking for analytics
CREATE TABLE IF NOT EXISTS public.storage_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  bucket_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  is_public BOOLEAN DEFAULT true,
  thumbnail_path TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Create indexes for storage uploads
CREATE INDEX IF NOT EXISTS idx_storage_uploads_user_id ON public.storage_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_uploads_bucket ON public.storage_uploads(bucket_name);
CREATE INDEX IF NOT EXISTS idx_storage_uploads_created_at ON public.storage_uploads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storage_uploads_deleted ON public.storage_uploads(deleted_at) WHERE deleted_at IS NULL;

-- =====================================================
-- ACTIVITY TIMELINE / AUDIT TRAIL
-- =====================================================

-- User activity types enumeration
DO $$ BEGIN
  CREATE TYPE activity_type AS ENUM (
    'login', 'logout', 'signup',
    'food_created', 'food_updated', 'food_deleted',
    'recipe_created', 'recipe_updated', 'recipe_deleted',
    'meal_planned', 'meal_logged', 'meal_result_recorded',
    'grocery_item_added', 'grocery_item_checked', 'grocery_list_created',
    'kid_added', 'kid_updated', 'kid_deleted',
    'subscription_started', 'subscription_cancelled', 'payment_processed',
    'profile_updated', 'settings_changed', 'export_requested',
    'ai_coach_used', 'barcode_scanned', 'recipe_imported',
    'quiz_completed', 'budget_calculated', 'achievement_earned',
    'file_uploaded', 'file_deleted',
    'custom'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Activity timeline table
CREATE TABLE IF NOT EXISTS public.user_activity_timeline (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  activity_type TEXT NOT NULL, -- Using TEXT for flexibility, can store activity_type enum values
  activity_category TEXT NOT NULL DEFAULT 'general', -- e.g., 'meal_planning', 'shopping', 'account', 'ai'
  title TEXT NOT NULL,
  description TEXT,
  entity_type TEXT, -- e.g., 'food', 'recipe', 'kid', 'plan_entry'
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for activity timeline
CREATE INDEX IF NOT EXISTS idx_activity_timeline_user_id ON public.user_activity_timeline(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_timeline_created_at ON public.user_activity_timeline(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_timeline_type ON public.user_activity_timeline(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_timeline_category ON public.user_activity_timeline(activity_category);
CREATE INDEX IF NOT EXISTS idx_activity_timeline_entity ON public.user_activity_timeline(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_timeline_user_recent ON public.user_activity_timeline(user_id, created_at DESC);

-- =====================================================
-- CUSTOMER HEALTH SCORING
-- =====================================================

-- Customer health scores with detailed metrics
CREATE TABLE IF NOT EXISTS public.customer_health_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Overall health score (0-100)
  health_score INTEGER DEFAULT 0 CHECK (health_score >= 0 AND health_score <= 100),
  health_tier TEXT DEFAULT 'at_risk' CHECK (health_tier IN ('champion', 'healthy', 'neutral', 'at_risk', 'churning')),

  -- Component scores (0-100 each)
  engagement_score INTEGER DEFAULT 0,
  feature_adoption_score INTEGER DEFAULT 0,
  activity_frequency_score INTEGER DEFAULT 0,
  recency_score INTEGER DEFAULT 0,
  breadth_score INTEGER DEFAULT 0, -- How many features used
  depth_score INTEGER DEFAULT 0, -- How deeply features are used

  -- Engagement metrics
  days_active_last_30 INTEGER DEFAULT 0,
  days_active_last_7 INTEGER DEFAULT 0,
  total_sessions_30d INTEGER DEFAULT 0,
  avg_session_duration_minutes NUMERIC(10,2) DEFAULT 0,

  -- Feature usage metrics
  features_used_count INTEGER DEFAULT 0,
  ai_interactions_30d INTEGER DEFAULT 0,
  meals_planned_30d INTEGER DEFAULT 0,
  foods_logged_30d INTEGER DEFAULT 0,
  recipes_created_30d INTEGER DEFAULT 0,

  -- Trend indicators
  score_trend TEXT DEFAULT 'stable' CHECK (score_trend IN ('improving', 'stable', 'declining')),
  score_change_30d INTEGER DEFAULT 0,

  -- Timestamps
  last_activity_at TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for health scores
CREATE INDEX IF NOT EXISTS idx_health_scores_score ON public.customer_health_scores(health_score DESC);
CREATE INDEX IF NOT EXISTS idx_health_scores_tier ON public.customer_health_scores(health_tier);
CREATE INDEX IF NOT EXISTS idx_health_scores_trend ON public.customer_health_scores(score_trend);
CREATE INDEX IF NOT EXISTS idx_health_scores_last_activity ON public.customer_health_scores(last_activity_at DESC);

-- Health score history for trend analysis
CREATE TABLE IF NOT EXISTS public.customer_health_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  health_score INTEGER NOT NULL,
  health_tier TEXT NOT NULL,
  engagement_score INTEGER,
  feature_adoption_score INTEGER,
  activity_frequency_score INTEGER,
  recency_score INTEGER,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_history_user ON public.customer_health_history(user_id, recorded_at DESC);

-- =====================================================
-- ADVANCED USER SEGMENTATION
-- =====================================================

-- User segments definition
CREATE TABLE IF NOT EXISTS public.user_segments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  segment_type TEXT NOT NULL DEFAULT 'manual' CHECK (segment_type IN ('manual', 'dynamic', 'cohort')),

  -- For dynamic segments: SQL-like filter criteria
  filter_criteria JSONB DEFAULT '{}',

  -- Cohort settings
  cohort_type TEXT, -- 'signup_date', 'first_purchase', 'feature_usage', etc.
  cohort_value TEXT, -- e.g., '2026-01', 'meal_planning', etc.

  -- Segment metadata
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'users',
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false, -- System-defined segments

  -- Statistics
  member_count INTEGER DEFAULT 0,
  last_calculated_at TIMESTAMPTZ,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User segment membership
CREATE TABLE IF NOT EXISTS public.user_segment_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  segment_id UUID REFERENCES public.user_segments(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  UNIQUE(segment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_segment_members_segment ON public.user_segment_members(segment_id);
CREATE INDEX IF NOT EXISTS idx_segment_members_user ON public.user_segment_members(user_id);

-- User attributes for segmentation (denormalized for query performance)
CREATE TABLE IF NOT EXISTS public.user_attributes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Demographics
  signup_date DATE,
  signup_source TEXT,
  country_code TEXT,
  timezone TEXT,

  -- Subscription info
  subscription_tier TEXT,
  subscription_status TEXT,
  mrr_cents INTEGER DEFAULT 0,
  lifetime_value_cents INTEGER DEFAULT 0,

  -- Usage patterns
  primary_use_case TEXT, -- 'picky_eater', 'meal_planning', 'nutrition_tracking', 'budget_conscious'
  family_size INTEGER,
  kids_count INTEGER DEFAULT 0,

  -- Engagement
  total_sessions INTEGER DEFAULT 0,
  total_foods_added INTEGER DEFAULT 0,
  total_meals_planned INTEGER DEFAULT 0,
  total_recipes_created INTEGER DEFAULT 0,
  ai_usage_count INTEGER DEFAULT 0,

  -- Computed flags
  is_power_user BOOLEAN DEFAULT false,
  is_at_risk BOOLEAN DEFAULT false,
  has_completed_onboarding BOOLEAN DEFAULT false,
  has_used_ai_coach BOOLEAN DEFAULT false,
  has_used_barcode_scanner BOOLEAN DEFAULT false,

  -- Timestamps
  first_activity_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_attributes_subscription ON public.user_attributes(subscription_tier, subscription_status);
CREATE INDEX IF NOT EXISTS idx_user_attributes_use_case ON public.user_attributes(primary_use_case);
CREATE INDEX IF NOT EXISTS idx_user_attributes_flags ON public.user_attributes(is_power_user, is_at_risk);

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE public.storage_buckets_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_health_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_segment_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_attributes ENABLE ROW LEVEL SECURITY;

-- Storage buckets config: Admin only
CREATE POLICY "Admins can manage bucket config"
  ON public.storage_buckets_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Storage uploads: Users can see their own, admins can see all
CREATE POLICY "Users can view their own uploads"
  ON public.storage_uploads FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Users can insert their own uploads"
  ON public.storage_uploads FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can delete uploads"
  ON public.storage_uploads FOR DELETE
  USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Activity timeline: Users can see their own, admins can see all
CREATE POLICY "Users can view their own activity"
  ON public.user_activity_timeline FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "System can insert activity"
  ON public.user_activity_timeline FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Health scores: Users can see their own, admins can see all
CREATE POLICY "Users can view their own health score"
  ON public.customer_health_scores FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "System can manage health scores"
  ON public.customer_health_scores FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Health history: Same as health scores
CREATE POLICY "Users can view their own health history"
  ON public.customer_health_history FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Segments: Admins only
CREATE POLICY "Admins can manage segments"
  ON public.user_segments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Segment members: Admins only
CREATE POLICY "Admins can manage segment members"
  ON public.user_segment_members FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- User attributes: Users can see their own, admins can see all
CREATE POLICY "Users can view their own attributes"
  ON public.user_attributes FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to log user activity
CREATE OR REPLACE FUNCTION log_user_activity(
  p_user_id UUID,
  p_activity_type TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_category TEXT;
  v_activity_id UUID;
BEGIN
  -- Determine category from activity type
  v_category := CASE
    WHEN p_activity_type IN ('food_created', 'food_updated', 'food_deleted', 'recipe_created', 'recipe_updated', 'recipe_deleted') THEN 'content'
    WHEN p_activity_type IN ('meal_planned', 'meal_logged', 'meal_result_recorded') THEN 'meal_planning'
    WHEN p_activity_type IN ('grocery_item_added', 'grocery_item_checked', 'grocery_list_created') THEN 'shopping'
    WHEN p_activity_type IN ('kid_added', 'kid_updated', 'kid_deleted') THEN 'family'
    WHEN p_activity_type IN ('subscription_started', 'subscription_cancelled', 'payment_processed') THEN 'billing'
    WHEN p_activity_type IN ('login', 'logout', 'signup', 'profile_updated', 'settings_changed') THEN 'account'
    WHEN p_activity_type IN ('ai_coach_used', 'barcode_scanned', 'recipe_imported') THEN 'ai'
    WHEN p_activity_type IN ('quiz_completed', 'budget_calculated', 'achievement_earned') THEN 'engagement'
    WHEN p_activity_type IN ('file_uploaded', 'file_deleted') THEN 'storage'
    ELSE 'general'
  END;

  INSERT INTO public.user_activity_timeline (
    user_id, activity_type, activity_category, title, description,
    entity_type, entity_id, metadata
  ) VALUES (
    p_user_id, p_activity_type, v_category, p_title, p_description,
    p_entity_type, p_entity_id, p_metadata
  )
  RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate customer health score
CREATE OR REPLACE FUNCTION calculate_customer_health_score(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_engagement_score INTEGER := 0;
  v_feature_score INTEGER := 0;
  v_frequency_score INTEGER := 0;
  v_recency_score INTEGER := 0;
  v_final_score INTEGER := 0;
  v_tier TEXT;
  v_last_activity TIMESTAMPTZ;
  v_days_since_activity INTEGER;
  v_days_active_30 INTEGER;
  v_features_used INTEGER;
BEGIN
  -- Calculate recency score (0-100)
  SELECT MAX(created_at) INTO v_last_activity
  FROM public.user_activity_timeline
  WHERE user_id = p_user_id;

  IF v_last_activity IS NOT NULL THEN
    v_days_since_activity := EXTRACT(DAY FROM NOW() - v_last_activity);
    v_recency_score := GREATEST(0, 100 - (v_days_since_activity * 5));
  END IF;

  -- Calculate frequency score (0-100)
  SELECT COUNT(DISTINCT DATE(created_at)) INTO v_days_active_30
  FROM public.user_activity_timeline
  WHERE user_id = p_user_id AND created_at >= NOW() - INTERVAL '30 days';

  v_frequency_score := LEAST(100, v_days_active_30 * 4); -- 25+ days = 100

  -- Calculate feature adoption score (0-100)
  SELECT COUNT(DISTINCT activity_type) INTO v_features_used
  FROM public.user_activity_timeline
  WHERE user_id = p_user_id AND created_at >= NOW() - INTERVAL '30 days';

  v_feature_score := LEAST(100, v_features_used * 8); -- 12+ features = 100

  -- Calculate engagement score (based on key actions)
  SELECT
    LEAST(100, (
      (COALESCE(SUM(CASE WHEN activity_type IN ('meal_planned', 'meal_logged') THEN 1 ELSE 0 END), 0) * 3) +
      (COALESCE(SUM(CASE WHEN activity_type IN ('ai_coach_used') THEN 1 ELSE 0 END), 0) * 5) +
      (COALESCE(SUM(CASE WHEN activity_type IN ('recipe_created', 'food_created') THEN 1 ELSE 0 END), 0) * 4)
    ))
  INTO v_engagement_score
  FROM public.user_activity_timeline
  WHERE user_id = p_user_id AND created_at >= NOW() - INTERVAL '30 days';

  -- Calculate final score (weighted average)
  v_final_score := (
    (v_recency_score * 30) +
    (v_frequency_score * 25) +
    (v_feature_score * 20) +
    (v_engagement_score * 25)
  ) / 100;

  -- Determine tier
  v_tier := CASE
    WHEN v_final_score >= 80 THEN 'champion'
    WHEN v_final_score >= 60 THEN 'healthy'
    WHEN v_final_score >= 40 THEN 'neutral'
    WHEN v_final_score >= 20 THEN 'at_risk'
    ELSE 'churning'
  END;

  -- Upsert health score
  INSERT INTO public.customer_health_scores (
    user_id, health_score, health_tier,
    engagement_score, feature_adoption_score, activity_frequency_score, recency_score,
    days_active_last_30, features_used_count, last_activity_at, calculated_at
  ) VALUES (
    p_user_id, v_final_score, v_tier,
    v_engagement_score, v_feature_score, v_frequency_score, v_recency_score,
    v_days_active_30, v_features_used, v_last_activity, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    health_score = EXCLUDED.health_score,
    health_tier = EXCLUDED.health_tier,
    engagement_score = EXCLUDED.engagement_score,
    feature_adoption_score = EXCLUDED.feature_adoption_score,
    activity_frequency_score = EXCLUDED.activity_frequency_score,
    recency_score = EXCLUDED.recency_score,
    days_active_last_30 = EXCLUDED.days_active_last_30,
    features_used_count = EXCLUDED.features_used_count,
    last_activity_at = EXCLUDED.last_activity_at,
    calculated_at = NOW(),
    updated_at = NOW();

  -- Record history
  INSERT INTO public.customer_health_history (
    user_id, health_score, health_tier,
    engagement_score, feature_adoption_score, activity_frequency_score, recency_score
  ) VALUES (
    p_user_id, v_final_score, v_tier,
    v_engagement_score, v_feature_score, v_frequency_score, v_recency_score
  );

  RETURN v_final_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to refresh segment member counts
CREATE OR REPLACE FUNCTION refresh_segment_counts()
RETURNS void AS $$
BEGIN
  UPDATE public.user_segments s
  SET
    member_count = (SELECT COUNT(*) FROM public.user_segment_members WHERE segment_id = s.id),
    last_calculated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- VIEWS
-- =====================================================

-- Storage statistics view
CREATE OR REPLACE VIEW public.admin_storage_stats AS
SELECT
  bucket_name,
  COUNT(*) as total_files,
  SUM(file_size_bytes) as total_bytes,
  pg_size_pretty(SUM(file_size_bytes)::bigint) as total_size,
  AVG(file_size_bytes)::bigint as avg_file_size,
  COUNT(DISTINCT user_id) as unique_uploaders,
  MIN(created_at) as oldest_file,
  MAX(created_at) as newest_file,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as uploads_24h,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as uploads_7d
FROM public.storage_uploads
WHERE deleted_at IS NULL
GROUP BY bucket_name;

-- Customer health summary view
CREATE OR REPLACE VIEW public.admin_customer_health_summary AS
SELECT
  health_tier,
  COUNT(*) as user_count,
  ROUND(AVG(health_score)::numeric, 1) as avg_score,
  ROUND(AVG(engagement_score)::numeric, 1) as avg_engagement,
  ROUND(AVG(feature_adoption_score)::numeric, 1) as avg_feature_adoption,
  ROUND(AVG(days_active_last_30)::numeric, 1) as avg_days_active
FROM public.customer_health_scores
GROUP BY health_tier
ORDER BY
  CASE health_tier
    WHEN 'champion' THEN 1
    WHEN 'healthy' THEN 2
    WHEN 'neutral' THEN 3
    WHEN 'at_risk' THEN 4
    WHEN 'churning' THEN 5
  END;

-- User activity summary view
CREATE OR REPLACE VIEW public.admin_activity_summary AS
SELECT
  DATE(created_at) as activity_date,
  COUNT(*) as total_activities,
  COUNT(DISTINCT user_id) as active_users,
  COUNT(*) FILTER (WHERE activity_category = 'meal_planning') as meal_planning_activities,
  COUNT(*) FILTER (WHERE activity_category = 'shopping') as shopping_activities,
  COUNT(*) FILTER (WHERE activity_category = 'ai') as ai_activities,
  COUNT(*) FILTER (WHERE activity_category = 'content') as content_activities
FROM public.user_activity_timeline
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY activity_date DESC;

-- Segment summary view
CREATE OR REPLACE VIEW public.admin_segment_summary AS
SELECT
  s.id,
  s.name,
  s.display_name,
  s.segment_type,
  s.color,
  s.member_count,
  s.is_active,
  s.created_at,
  s.last_calculated_at,
  COALESCE(
    (SELECT AVG(chs.health_score)
     FROM public.user_segment_members usm
     JOIN public.customer_health_scores chs ON usm.user_id = chs.user_id
     WHERE usm.segment_id = s.id)::integer,
    0
  ) as avg_health_score
FROM public.user_segments s
ORDER BY s.member_count DESC;

-- =====================================================
-- DEFAULT DATA
-- =====================================================

-- Insert default bucket configurations
INSERT INTO public.storage_buckets_config (bucket_name, display_name, description, is_public, allowed_mime_types, max_file_size_bytes)
VALUES
  ('profile-pictures', 'Profile Pictures', 'User and child profile avatars', true, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'], 5242880),
  ('blog-images', 'Blog Images', 'Featured images and inline content for blog posts', true, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'], 10485760),
  ('recipe-images', 'Recipe Images', 'Recipe photos uploaded by users', true, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'], 5242880),
  ('Assets', 'Public Assets', 'Lead magnets, PDFs, and downloadable resources', true, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], 10485760),
  ('private-files', 'Private Files', 'User exports, reports, and private documents', false, ARRAY['image/jpeg', 'image/png', 'application/pdf', 'text/csv', 'application/json'], 52428800)
ON CONFLICT (bucket_name) DO NOTHING;

-- Insert default segments
INSERT INTO public.user_segments (name, display_name, description, segment_type, is_system, color, icon)
VALUES
  ('power_users', 'Power Users', 'Highly engaged users with health score >= 80', 'dynamic', true, '#8b5cf6', 'zap'),
  ('new_users', 'New Users', 'Users who signed up in the last 7 days', 'dynamic', true, '#22c55e', 'user-plus'),
  ('at_risk', 'At Risk', 'Users with declining engagement or health score < 40', 'dynamic', true, '#ef4444', 'alert-triangle'),
  ('premium_users', 'Premium Users', 'Users with active paid subscription', 'dynamic', true, '#f59e0b', 'crown'),
  ('picky_eater_parents', 'Picky Eater Parents', 'Users focused on picky eater tools', 'dynamic', true, '#06b6d4', 'baby'),
  ('meal_planners', 'Active Meal Planners', 'Users who regularly plan meals', 'dynamic', true, '#3b82f6', 'calendar')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update timestamp trigger for segments
CREATE OR REPLACE FUNCTION update_segment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_segments_timestamp
  BEFORE UPDATE ON public.user_segments
  FOR EACH ROW EXECUTE FUNCTION update_segment_timestamp();

-- Trigger to update segment count on member changes
CREATE OR REPLACE FUNCTION update_segment_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.user_segments SET member_count = member_count + 1 WHERE id = NEW.segment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.user_segments SET member_count = member_count - 1 WHERE id = OLD.segment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_segment_count_on_member_change
  AFTER INSERT OR DELETE ON public.user_segment_members
  FOR EACH ROW EXECUTE FUNCTION update_segment_member_count();
