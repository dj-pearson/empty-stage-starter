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
