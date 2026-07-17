-- US-007: Fix overly permissive RLS INSERT policies on security-critical tables
-- Replaces WITH CHECK (true) and USING (true) with proper auth checks
--
-- NOTE: Each block is guarded with to_regclass(...) IS NOT NULL so this migration
-- is safe to run regardless of whether a given table has been created yet on this
-- environment, and safe to re-run (idempotent) once it has.

-- ============================================
-- 1. login_history: Restrict to own user_id
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.login_history') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow login history inserts" ON public.login_history';
    EXECUTE 'DROP POLICY IF EXISTS "Users can insert own login history" ON public.login_history';
    EXECUTE 'CREATE POLICY "Users can insert own login history"
      ON public.login_history FOR INSERT
      WITH CHECK (auth.uid() = user_id)';

    EXECUTE 'DROP POLICY IF EXISTS "Service role can update login history" ON public.login_history';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update own login history" ON public.login_history';
    EXECUTE 'CREATE POLICY "Users can update own login history"
      ON public.login_history FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id)';
  END IF;
END
$$;

-- ============================================
-- 2. security_audit_logs: Require authentication
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.security_audit_logs') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow audit log inserts" ON public.security_audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.security_audit_logs';
    EXECUTE 'CREATE POLICY "Authenticated users can insert audit logs"
      ON public.security_audit_logs FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL)';
  END IF;
END
$$;

-- ============================================
-- 3. rate_limits: Service role only (no user access)
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.rate_limits') IS NOT NULL THEN
    -- Drop any existing overly-permissive policies
    EXECUTE 'DROP POLICY IF EXISTS "rate_limits_all" ON public.rate_limits';
    EXECUTE 'DROP POLICY IF EXISTS "Service role only" ON public.rate_limits';

    -- rate_limits has RLS enabled but no policies = only service role can access
    -- This is intentional: no user-facing policies means only service_role key works
  END IF;
END
$$;

-- ============================================
-- 4. automation_email_queue: Admin role only for writes
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.automation_email_queue') IS NOT NULL
     AND to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "System can manage email queue" ON public.automation_email_queue';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage email queue" ON public.automation_email_queue';
    EXECUTE 'CREATE POLICY "Admins can manage email queue"
      ON public.automation_email_queue FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = ''admin''
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = ''admin''
        )
      )';
  END IF;
END
$$;

-- ============================================
-- 5. backup_logs: Admin role only for writes
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.backup_logs') IS NOT NULL
     AND to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "System can manage backup logs" ON public.backup_logs';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage backup logs" ON public.backup_logs';
    EXECUTE 'CREATE POLICY "Admins can manage backup logs"
      ON public.backup_logs FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = ''admin''
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = ''admin''
        )
      )';
  END IF;
END
$$;

-- ============================================
-- 6. blog_comments: Require authentication for INSERT
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.blog_comments') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can submit comments" ON public.blog_comments';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can submit comments" ON public.blog_comments';
    EXECUTE 'CREATE POLICY "Authenticated users can submit comments"
      ON public.blog_comments FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL)';
  END IF;
END
$$;
