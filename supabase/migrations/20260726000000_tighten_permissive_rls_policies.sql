-- Tighten over-permissive "System can manage" RLS policies (audit US-559).
--
-- These policies were declared FOR ALL USING (true) WITH CHECK (true) with no
-- role restriction, so they applied to EVERY role (including anon and
-- authenticated) and overrode the adjacent per-user policy. In effect any
-- signed-in (or anonymous) client could read, update, or delete every row in
-- these tables — e.g. reset another user's rate limits or read another user's
-- backup history.
--
-- Removing them is backward-compatible and safe because all *writes* to these
-- tables happen through paths that bypass RLS entirely:
--   * rate_limits  — inserted/updated only by the SECURITY DEFINER function
--                    check_rate_limit(); no client writes exist.
--   * backup_logs  — written only by service_role edge functions
--                    (backup-scheduler, backup-user-data, delete-account);
--                    the web/native clients only SELECT their own rows.
-- The per-user SELECT policies ("Users can view their own ...") remain intact,
-- so shipped iOS/web clients keep working unchanged. Additive/tightening only;
-- no table, column, or type changes, so types.ts is unaffected.

DROP POLICY IF EXISTS "System can manage rate limits" ON public.rate_limits;
DROP POLICY IF EXISTS "System can manage backup logs" ON public.backup_logs;

-- NOTE (deferred, see US-559 notes): automation_email_queue,
-- automation_email_events, and ai_usage_logs carry the same USING(true)
-- pattern, but they are populated by AFTER INSERT triggers (e.g. on profiles
-- during signup). Removing their permissive policies is only safe once those
-- trigger functions are confirmed SECURITY DEFINER; otherwise signup inserts
-- would fail. Left in place pending that verification.
