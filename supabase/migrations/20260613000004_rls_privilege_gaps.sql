-- US-328: close RLS / privilege gaps. Policy-only, additive, RLS stays enabled.
-- Read paths for shipped clients are unchanged (users still see their own
-- roles; admins still manage all roles; the legitimate ai_usage_logs writer is
-- the SECURITY DEFINER log_ai_usage() RPC, which bypasses RLS).

-- 1) user_roles admin policies queried user_roles inside their own USING/CHECK
--    (self-reference -> infinite-recursion risk). Route the admin check through
--    the existing SECURITY DEFINER helper has_role(), which bypasses RLS.
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) ai_usage_logs INSERT was WITH CHECK(true): any authenticated user could
--    write rows attributed to anyone. The real writer is the SECURITY DEFINER
--    log_ai_usage() RPC (RLS-exempt) and no client inserts directly, so scope
--    direct inserts to the caller's own user_id.
DROP POLICY IF EXISTS "System can insert AI usage logs" ON public.ai_usage_logs;

CREATE POLICY "Users insert their own AI usage logs"
  ON public.ai_usage_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
