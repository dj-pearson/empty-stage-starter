-- ============================================================================
-- Lock down 8 over-permissive "System can manage X" RLS policies
-- ============================================================================
-- AUDITED 2026-05-08: Eight policies on automation/billing/admin tables had
-- `USING (true)` (or `WITH CHECK (true)`) with `roles = PUBLIC`. The intent
-- was clearly "service role only" — they just forgot `TO service_role`,
-- leaving every authenticated request free to read/write the rows.
--
-- Highest impact: a regular user could grant themselves referral_rewards,
-- inflate their referral_codes counts, mark referrals as completed, clear
-- their own rate_limits, and read/falsify backup_logs.
--
-- Each affected table already has a separate user-scoped policy for the
-- legitimate access pattern (e.g. "Users can view their own rate limits").
-- This migration only tightens the system-side policies; user-facing access
-- is unchanged.
--
-- Note: Supabase's service_role typically has BYPASSRLS, so the recreated
-- policies are technically belt-and-suspenders. They make intent explicit
-- and continue to work even if BYPASSRLS is ever revoked.
-- ============================================================================

-- 1. automation_email_events  (table is service-role-only; no user policy exists)
DROP POLICY IF EXISTS "System can manage email events" ON public.automation_email_events;
CREATE POLICY "service_role manages email events"
  ON public.automation_email_events
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 2. automation_email_queue  (users keep SELECT-own via existing policy)
DROP POLICY IF EXISTS "System can manage email queue" ON public.automation_email_queue;
CREATE POLICY "service_role manages email queue"
  ON public.automation_email_queue
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 3. backup_logs  (users keep SELECT-own via existing policy)
DROP POLICY IF EXISTS "System can manage backup logs" ON public.backup_logs;
CREATE POLICY "service_role manages backup logs"
  ON public.backup_logs
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 4. login_history  (users + admins keep SELECT via existing policies)
DROP POLICY IF EXISTS "Service role can update login history" ON public.login_history;
CREATE POLICY "service_role updates login history"
  ON public.login_history
  FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- 5. rate_limits  (users keep SELECT-own via existing policy)
DROP POLICY IF EXISTS "System can manage rate limits" ON public.rate_limits;
CREATE POLICY "service_role manages rate limits"
  ON public.rate_limits
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 6. referral_codes  (users keep SELECT-own + INSERT-own; admins keep SELECT-all)
DROP POLICY IF EXISTS "System can update referral code stats" ON public.referral_codes;
CREATE POLICY "service_role updates referral code stats"
  ON public.referral_codes
  FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);

-- 7. referral_rewards  (users keep SELECT-own; admins keep SELECT-all)
DROP POLICY IF EXISTS "System can manage rewards" ON public.referral_rewards;
CREATE POLICY "service_role manages rewards"
  ON public.referral_rewards
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 8. referrals  (users keep SELECT-own; admins keep ALL via has_role)
DROP POLICY IF EXISTS "System can update referrals" ON public.referrals;
CREATE POLICY "service_role updates referrals"
  ON public.referrals
  FOR UPDATE
  TO service_role
  USING (true) WITH CHECK (true);
