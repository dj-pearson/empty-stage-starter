-- US-007: Fix overly permissive RLS INSERT policies on security-critical tables
-- Replaces WITH CHECK (true) and USING (true) with proper auth checks

-- ============================================
-- 1. login_history: Restrict to own user_id
-- ============================================
DROP POLICY IF EXISTS "Allow login history inserts" ON public.login_history;
CREATE POLICY "Users can insert own login history"
  ON public.login_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can update login history" ON public.login_history;
CREATE POLICY "Users can update own login history"
  ON public.login_history FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 2. security_audit_logs: Require authentication
-- ============================================
DROP POLICY IF EXISTS "Allow audit log inserts" ON public.security_audit_logs;
CREATE POLICY "Authenticated users can insert audit logs"
  ON public.security_audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- 3. rate_limits: Service role only (no user access)
-- ============================================
-- Drop any existing overly-permissive policies
DROP POLICY IF EXISTS "rate_limits_all" ON public.rate_limits;
DROP POLICY IF EXISTS "Service role only" ON public.rate_limits;

-- rate_limits has RLS enabled but no policies = only service role can access
-- This is intentional: no user-facing policies means only service_role key works

-- ============================================
-- 4. automation_email_queue: Admin role only for writes
-- ============================================
DROP POLICY IF EXISTS "System can manage email queue" ON public.automation_email_queue;
CREATE POLICY "Admins can manage email queue"
  ON public.automation_email_queue FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- ============================================
-- 5. backup_logs: Admin role only for writes
-- ============================================
DROP POLICY IF EXISTS "System can manage backup logs" ON public.backup_logs;
CREATE POLICY "Admins can manage backup logs"
  ON public.backup_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- ============================================
-- 6. blog_comments: Require authentication for INSERT
-- ============================================
DROP POLICY IF EXISTS "Anyone can submit comments" ON public.blog_comments;
CREATE POLICY "Authenticated users can submit comments"
  ON public.blog_comments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
