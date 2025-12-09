-- Migration: Add Security Audit Logging and OAuth Token Tables
-- Date: 2025-12-04
-- Description: Creates tables for comprehensive security audit logging and secure OAuth token storage

-- ============================================
-- Security Audit Logs Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL CHECK (event_category IN (
    'authentication',
    'authorization',
    'data_access',
    'data_modification',
    'admin_action',
    'security_alert',
    'oauth',
    'api_access',
    'configuration'
  )),
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  device_fingerprint TEXT,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_security_audit_logs_user_id ON public.security_audit_logs(user_id);
CREATE INDEX idx_security_audit_logs_event_type ON public.security_audit_logs(event_type);
CREATE INDEX idx_security_audit_logs_event_category ON public.security_audit_logs(event_category);
CREATE INDEX idx_security_audit_logs_severity ON public.security_audit_logs(severity);
CREATE INDEX idx_security_audit_logs_created_at ON public.security_audit_logs(created_at DESC);
CREATE INDEX idx_security_audit_logs_session_id ON public.security_audit_logs(session_id);

-- Composite index for common queries
CREATE INDEX idx_security_audit_logs_user_category_time
  ON public.security_audit_logs(user_id, event_category, created_at DESC);

-- Enable RLS
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can view their own logs, admins can view all
CREATE POLICY "Users can view own audit logs"
  ON public.security_audit_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all audit logs"
  ON public.security_audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

-- Allow inserts from authenticated users and service role
CREATE POLICY "Allow audit log inserts"
  ON public.security_audit_logs FOR INSERT
  WITH CHECK (true);

-- ============================================
-- OAuth Tokens Table (for secure token storage)
-- ============================================
CREATE TABLE IF NOT EXISTS public.oauth_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  token_type TEXT DEFAULT 'Bearer',
  rotation_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Indexes
CREATE INDEX idx_oauth_tokens_user_id ON public.oauth_tokens(user_id);
CREATE INDEX idx_oauth_tokens_provider ON public.oauth_tokens(provider);
CREATE INDEX idx_oauth_tokens_expires_at ON public.oauth_tokens(expires_at);

-- Enable RLS
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only manage their own tokens
CREATE POLICY "Users can view own OAuth tokens"
  ON public.oauth_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own OAuth tokens"
  ON public.oauth_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own OAuth tokens"
  ON public.oauth_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own OAuth tokens"
  ON public.oauth_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Profile Extensions (for account locking)
-- ============================================
-- Add columns to profiles if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'is_locked'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_locked BOOLEAN DEFAULT false;
    ALTER TABLE public.profiles ADD COLUMN locked_at TIMESTAMPTZ;
    ALTER TABLE public.profiles ADD COLUMN lock_reason TEXT;
    ALTER TABLE public.profiles ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
    ALTER TABLE public.profiles ADD COLUMN last_failed_login_at TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================
-- Cleanup Functions
-- ============================================

-- Function to clean up old audit logs (retain 90 days by default)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.security_audit_logs
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL
  AND severity NOT IN ('critical', 'high'); -- Keep high-severity logs longer

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up expired OAuth tokens
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete tokens that:
  -- 1. Have been expired for more than 30 days
  -- 2. Have no refresh token (can't be renewed)
  DELETE FROM public.oauth_tokens
  WHERE expires_at < NOW() - INTERVAL '30 days'
  AND refresh_token_encrypted IS NULL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Triggers
-- ============================================

-- Trigger to update updated_at on oauth_tokens
CREATE OR REPLACE FUNCTION update_oauth_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER oauth_tokens_updated_at
  BEFORE UPDATE ON public.oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_oauth_tokens_updated_at();

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE public.security_audit_logs IS 'Comprehensive security audit log for authentication, authorization, and sensitive operations';
COMMENT ON TABLE public.oauth_tokens IS 'Secure storage for OAuth tokens with encryption and rotation tracking';

COMMENT ON COLUMN public.security_audit_logs.event_type IS 'Type of security event (e.g., LOGIN_SUCCESS, TOKEN_ROTATED)';
COMMENT ON COLUMN public.security_audit_logs.event_category IS 'Category of event for filtering (authentication, oauth, etc.)';
COMMENT ON COLUMN public.security_audit_logs.severity IS 'Severity level: low, medium, high, critical';
COMMENT ON COLUMN public.security_audit_logs.device_fingerprint IS 'Hashed device fingerprint for tracking';

COMMENT ON COLUMN public.oauth_tokens.access_token_encrypted IS 'Encrypted access token (base64 encoded)';
COMMENT ON COLUMN public.oauth_tokens.refresh_token_encrypted IS 'Encrypted refresh token for token rotation';
COMMENT ON COLUMN public.oauth_tokens.rotation_count IS 'Number of times the token has been rotated';
