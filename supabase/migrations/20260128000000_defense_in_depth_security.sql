-- Migration: Defense-in-Depth Security Layers
-- Date: 2026-01-28
-- Description: Creates comprehensive security infrastructure for defense-in-depth protection
--
-- Security Layers Implemented:
-- 1. Authentication - Session validation and user verification
-- 2. Authorization - Granular permissions and role levels
-- 3. Resource Ownership - Tenant filtering and ownership verification
-- 4. Database RLS - Final enforcement layer

-- ============================================
-- LAYER 2: AUTHORIZATION - Permissions & Role Levels
-- ============================================

-- Extend app_role enum with more granular roles
-- Note: Can't modify enum easily, so we'll use role_level for granularity
DO $$
BEGIN
  -- Add 'moderator' role if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'moderator' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderator';
  END IF;
END $$;

-- Role Levels Table (for hierarchical permissions)
CREATE TABLE IF NOT EXISTS public.role_levels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role public.app_role NOT NULL UNIQUE,
  level INTEGER NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default role levels
INSERT INTO public.role_levels (role, level, description) VALUES
  ('user', 1, 'Standard user with basic access'),
  ('moderator', 5, 'Moderator with elevated access to manage content'),
  ('admin', 10, 'Administrator with full system access')
ON CONFLICT (role) DO NOTHING;

-- Enable RLS
ALTER TABLE public.role_levels ENABLE ROW LEVEL SECURITY;

-- Everyone can read role levels (public reference data)
CREATE POLICY "Anyone can read role levels"
  ON public.role_levels FOR SELECT
  USING (true);

-- Only admins can modify role levels
CREATE POLICY "Admins can manage role levels"
  ON public.role_levels FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- Permissions Table (Granular Permissions)
-- ============================================
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permission naming convention: category.resource.action(_scope)
-- Scopes: _own (user's own data), _household (household data), _all (all data)
INSERT INTO public.permissions (name, category, description) VALUES
  -- Food Management
  ('food.view_own', 'food', 'View own food items'),
  ('food.view_household', 'food', 'View household food items'),
  ('food.create', 'food', 'Create food items'),
  ('food.update_own', 'food', 'Update own food items'),
  ('food.update_household', 'food', 'Update household food items'),
  ('food.delete_own', 'food', 'Delete own food items'),
  ('food.delete_household', 'food', 'Delete household food items'),

  -- Recipe Management
  ('recipe.view_own', 'recipe', 'View own recipes'),
  ('recipe.view_household', 'recipe', 'View household recipes'),
  ('recipe.view_public', 'recipe', 'View public recipes'),
  ('recipe.create', 'recipe', 'Create recipes'),
  ('recipe.update_own', 'recipe', 'Update own recipes'),
  ('recipe.delete_own', 'recipe', 'Delete own recipes'),

  -- Kid/Child Management
  ('kid.view_own', 'kid', 'View own children'),
  ('kid.view_household', 'kid', 'View household children'),
  ('kid.create', 'kid', 'Create child profiles'),
  ('kid.update_own', 'kid', 'Update own children'),
  ('kid.update_household', 'kid', 'Update household children'),
  ('kid.delete_own', 'kid', 'Delete own children'),

  -- Meal Planning
  ('planner.view_own', 'planner', 'View own meal plans'),
  ('planner.view_household', 'planner', 'View household meal plans'),
  ('planner.create', 'planner', 'Create meal plans'),
  ('planner.update_own', 'planner', 'Update own meal plans'),
  ('planner.update_household', 'planner', 'Update household meal plans'),
  ('planner.delete_own', 'planner', 'Delete own meal plans'),

  -- Grocery Lists
  ('grocery.view_own', 'grocery', 'View own grocery lists'),
  ('grocery.view_household', 'grocery', 'View household grocery lists'),
  ('grocery.create', 'grocery', 'Create grocery lists'),
  ('grocery.update_own', 'grocery', 'Update own grocery lists'),
  ('grocery.update_household', 'grocery', 'Update household grocery lists'),
  ('grocery.delete_own', 'grocery', 'Delete own grocery lists'),

  -- Subscription Management
  ('subscription.view_own', 'subscription', 'View own subscription'),
  ('subscription.manage_own', 'subscription', 'Manage own subscription'),

  -- Profile Management
  ('profile.view_own', 'profile', 'View own profile'),
  ('profile.update_own', 'profile', 'Update own profile'),
  ('profile.view_household', 'profile', 'View household profiles'),

  -- Admin Permissions
  ('admin.dashboard', 'admin', 'Access admin dashboard'),
  ('admin.users.view', 'admin', 'View all users'),
  ('admin.users.manage', 'admin', 'Manage user accounts'),
  ('admin.roles.manage', 'admin', 'Manage user roles'),
  ('admin.content.moderate', 'admin', 'Moderate content'),
  ('admin.system.config', 'admin', 'Modify system configuration'),
  ('admin.audit.view', 'admin', 'View audit logs'),
  ('admin.analytics.view', 'admin', 'View analytics data'),

  -- Moderator Permissions
  ('mod.content.review', 'moderator', 'Review flagged content'),
  ('mod.users.view', 'moderator', 'View user information'),
  ('mod.reports.view', 'moderator', 'View user reports')
ON CONFLICT (name) DO NOTHING;

-- Enable RLS
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- Everyone can read permissions
CREATE POLICY "Anyone can read permissions"
  ON public.permissions FOR SELECT
  USING (true);

-- Only admins can manage permissions
CREATE POLICY "Admins can manage permissions"
  ON public.permissions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- Role-Permission Mapping Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role public.app_role NOT NULL,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role, permission_id)
);

-- Default permissions for 'user' role
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'user'::public.app_role, id FROM public.permissions
WHERE name IN (
  'food.view_own', 'food.view_household', 'food.create', 'food.update_own', 'food.update_household', 'food.delete_own',
  'recipe.view_own', 'recipe.view_household', 'recipe.view_public', 'recipe.create', 'recipe.update_own', 'recipe.delete_own',
  'kid.view_own', 'kid.view_household', 'kid.create', 'kid.update_own', 'kid.update_household', 'kid.delete_own',
  'planner.view_own', 'planner.view_household', 'planner.create', 'planner.update_own', 'planner.update_household', 'planner.delete_own',
  'grocery.view_own', 'grocery.view_household', 'grocery.create', 'grocery.update_own', 'grocery.update_household', 'grocery.delete_own',
  'subscription.view_own', 'subscription.manage_own',
  'profile.view_own', 'profile.update_own', 'profile.view_household'
)
ON CONFLICT DO NOTHING;

-- Default permissions for 'moderator' role (includes user permissions + moderator)
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'moderator'::public.app_role, id FROM public.permissions
WHERE name IN (
  -- All user permissions
  'food.view_own', 'food.view_household', 'food.create', 'food.update_own', 'food.update_household', 'food.delete_own',
  'recipe.view_own', 'recipe.view_household', 'recipe.view_public', 'recipe.create', 'recipe.update_own', 'recipe.delete_own',
  'kid.view_own', 'kid.view_household', 'kid.create', 'kid.update_own', 'kid.update_household', 'kid.delete_own',
  'planner.view_own', 'planner.view_household', 'planner.create', 'planner.update_own', 'planner.update_household', 'planner.delete_own',
  'grocery.view_own', 'grocery.view_household', 'grocery.create', 'grocery.update_own', 'grocery.update_household', 'grocery.delete_own',
  'subscription.view_own', 'subscription.manage_own',
  'profile.view_own', 'profile.update_own', 'profile.view_household',
  -- Moderator-specific
  'mod.content.review', 'mod.users.view', 'mod.reports.view'
)
ON CONFLICT DO NOTHING;

-- Default permissions for 'admin' role (all permissions)
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin'::public.app_role, id FROM public.permissions
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Everyone can read role-permission mappings
CREATE POLICY "Anyone can read role permissions"
  ON public.role_permissions FOR SELECT
  USING (true);

-- Only admins can manage role-permission mappings
CREATE POLICY "Admins can manage role permissions"
  ON public.role_permissions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- Helper Functions for Authorization
-- ============================================

-- Function to get user's role level
CREATE OR REPLACE FUNCTION public.get_user_role_level(_user_id UUID)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT MAX(rl.level)
      FROM public.user_roles ur
      JOIN public.role_levels rl ON ur.role = rl.role
      WHERE ur.user_id = _user_id
    ),
    0  -- No role = level 0
  )
$$;

-- Function to check if user has minimum role level
CREATE OR REPLACE FUNCTION public.has_role_level(_user_id UUID, _min_level INTEGER)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_role_level(_user_id) >= _min_level
$$;

-- Function to check if user has specific permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON ur.role = rp.role
    JOIN public.permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = _user_id
      AND p.name = _permission
  )
$$;

-- Function to get all user permissions
CREATE OR REPLACE FUNCTION public.get_user_permissions(_user_id UUID)
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT p.name), ARRAY[]::TEXT[])
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON ur.role = rp.role
  JOIN public.permissions p ON rp.permission_id = p.id
  WHERE ur.user_id = _user_id
$$;

-- ============================================
-- LAYER 3: RESOURCE OWNERSHIP - Tenant/Household Functions
-- ============================================

-- Function to get user's household_id
CREATE OR REPLACE FUNCTION public.get_user_household_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.profiles WHERE id = _user_id
$$;

-- Function to check if user is in same household
CREATE OR REPLACE FUNCTION public.is_same_household(_user_id UUID, _other_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT household_id FROM public.profiles WHERE id = _user_id
  ) = (
    SELECT household_id FROM public.profiles WHERE id = _other_user_id
  )
  AND (SELECT household_id FROM public.profiles WHERE id = _user_id) IS NOT NULL
$$;

-- Function to check if user owns resource (by user_id column)
CREATE OR REPLACE FUNCTION public.is_resource_owner(_user_id UUID, _resource_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id = _resource_user_id
$$;

-- Function to check if resource belongs to user's household
CREATE OR REPLACE FUNCTION public.is_household_resource(_user_id UUID, _resource_household_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_user_household_id(_user_id) = _resource_household_id
    AND _resource_household_id IS NOT NULL
$$;

-- ============================================
-- Security Context Table (for request-level security)
-- ============================================
CREATE TABLE IF NOT EXISTS public.security_contexts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  household_id UUID,
  role_level INTEGER NOT NULL DEFAULT 0,
  permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',
  is_valid BOOLEAN DEFAULT true
);

-- Indexes for security context lookups
CREATE INDEX idx_security_contexts_user_session
  ON public.security_contexts(user_id, session_id);
CREATE INDEX idx_security_contexts_expires
  ON public.security_contexts(expires_at) WHERE is_valid = true;

-- Enable RLS
ALTER TABLE public.security_contexts ENABLE ROW LEVEL SECURITY;

-- Users can only see their own security contexts
CREATE POLICY "Users can view own security contexts"
  ON public.security_contexts FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own security contexts
CREATE POLICY "Users can create own security contexts"
  ON public.security_contexts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can invalidate their own security contexts
CREATE POLICY "Users can update own security contexts"
  ON public.security_contexts FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- Permission Denied Logging (for Layer 2)
-- ============================================
CREATE TABLE IF NOT EXISTS public.permission_denials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  permission_required TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  reason TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying denials
CREATE INDEX idx_permission_denials_user_time
  ON public.permission_denials(user_id, created_at DESC);
CREATE INDEX idx_permission_denials_permission
  ON public.permission_denials(permission_required);

-- Enable RLS
ALTER TABLE public.permission_denials ENABLE ROW LEVEL SECURITY;

-- Users can view their own denials
CREATE POLICY "Users can view own permission denials"
  ON public.permission_denials FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all denials
CREATE POLICY "Admins can view all permission denials"
  ON public.permission_denials FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow inserts for logging
CREATE POLICY "Allow permission denial inserts"
  ON public.permission_denials FOR INSERT
  WITH CHECK (true);

-- ============================================
-- LAYER 4: Enhanced RLS Policies
-- ============================================

-- Add household-aware policies to existing tables
-- Note: These assume tables have user_id and/or household_id columns

-- Function to enforce multi-layer access check
CREATE OR REPLACE FUNCTION public.can_access_resource(
  _user_id UUID,
  _resource_user_id UUID,
  _resource_household_id UUID,
  _permission_own TEXT,
  _permission_household TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Layer 2: Check if user is admin (bypass other checks)
  IF public.has_role(_user_id, 'admin') THEN
    RETURN true;
  END IF;

  -- Layer 3a: Check if user owns the resource
  IF _resource_user_id = _user_id THEN
    -- Layer 2: Check if user has 'own' permission
    RETURN public.has_permission(_user_id, _permission_own);
  END IF;

  -- Layer 3b: Check if resource is in user's household
  IF _permission_household IS NOT NULL AND _resource_household_id IS NOT NULL THEN
    IF public.is_household_resource(_user_id, _resource_household_id) THEN
      -- Layer 2: Check if user has 'household' permission
      RETURN public.has_permission(_user_id, _permission_household);
    END IF;
  END IF;

  -- Default: deny access
  RETURN false;
END;
$$;

-- ============================================
-- Cleanup Functions
-- ============================================

-- Cleanup expired security contexts
CREATE OR REPLACE FUNCTION public.cleanup_expired_security_contexts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.security_contexts
  WHERE expires_at < NOW() OR is_valid = false;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup old permission denials (keep 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_permission_denials(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.permission_denials
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE public.role_levels IS 'Hierarchical role levels for authorization (Layer 2)';
COMMENT ON TABLE public.permissions IS 'Granular permissions for authorization (Layer 2)';
COMMENT ON TABLE public.role_permissions IS 'Mapping of roles to permissions (Layer 2)';
COMMENT ON TABLE public.security_contexts IS 'Request-level security context cache';
COMMENT ON TABLE public.permission_denials IS 'Audit log for permission denial events';

COMMENT ON FUNCTION public.get_user_role_level IS 'Get the highest role level for a user';
COMMENT ON FUNCTION public.has_role_level IS 'Check if user has at least the specified role level';
COMMENT ON FUNCTION public.has_permission IS 'Check if user has a specific permission';
COMMENT ON FUNCTION public.get_user_permissions IS 'Get all permissions for a user';
COMMENT ON FUNCTION public.get_user_household_id IS 'Get household ID for a user (Layer 3)';
COMMENT ON FUNCTION public.is_same_household IS 'Check if two users are in the same household (Layer 3)';
COMMENT ON FUNCTION public.is_resource_owner IS 'Check if user owns a resource (Layer 3)';
COMMENT ON FUNCTION public.is_household_resource IS 'Check if resource belongs to user household (Layer 3)';
COMMENT ON FUNCTION public.can_access_resource IS 'Multi-layer access check combining Layers 2 and 3';
