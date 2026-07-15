-- Migration: Storage Management, Activity Timeline, Customer Health Scoring, and User Segmentation
-- Date: 2026-01-10
-- Description: Adds infrastructure for centralized file management, user activity tracking,
--              customer health scoring, and advanced user segmentation
--
-- Split from the original 20260110000000_storage_analytics_features.sql into smaller
-- sequential files after the monolithic file repeatedly failed to apply with
-- "spawn ENAMETOOLONG" on the deploy runner. Each file below is a straight extraction
-- of one section from the original — no SQL logic changed. Order preserved via
-- incrementing timestamps (20260110000000 .. 20260110000008), which still sort before
-- the next migration (20260112000000_user_accessibility_preferences.sql).
--
-- This file: ACTIVITY TIMELINE / AUDIT TRAIL
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
