-- Continue US-559: tighten the over-permissive automation_email_queue policy.
--
-- "System can manage email queue" was FOR ALL USING (true) WITH CHECK (true)
-- with no role restriction, so any authenticated (or anon) user could read,
-- update, or delete every queued email row. The queue is written only by the
-- SECURITY DEFINER function queue_email() (RLS-exempt), no client code writes
-- it directly, and users read their own rows via the retained
-- "Users can view their own email queue" SELECT policy. Dropping the
-- permissive policy is therefore backward-compatible and safe.
--
-- Deliberately NOT changed here (see US-559 notes):
--   * automation_email_events — inserted (open/click tracking) AND read (admin
--     analytics dashboard) directly by the client, relying on the permissive
--     policy. It needs *replacement* admin-SELECT + scoped-INSERT policies
--     before the permissive one can be dropped; a naive scope-to-service_role
--     would break the admin analytics dashboard. Left for a dedicated change.
--   * ai_usage_logs INSERT — already scoped to auth.uid() = user_id by
--     20260613000004_rls_privilege_gaps.sql (US-328); no further change needed.

DROP POLICY IF EXISTS "System can manage email queue" ON public.automation_email_queue;
