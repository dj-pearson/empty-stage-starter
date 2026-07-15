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
-- This file: STORAGE MANAGEMENT TABLES
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
