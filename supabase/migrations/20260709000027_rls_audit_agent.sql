-- Agentic OS — US-511: RLS / permission audit agent.
--
-- Three parts:
--   1. agent_rls_audit() — SECURITY DEFINER RPC returning per-table RLS status +
--      policy summaries from the pg catalogs (service-role only). pg_catalog is
--      not reachable through PostgREST, so the agent goes through this function.
--   2. agent_rls_snapshots — stores each week's audit so the next run can diff
--      new/removed tables and policies.
--   3. The seeded 'rls-audit' agent (weekly, DISABLED by default).
--
-- Additive/backward-compatible: new function + new table (RLS on) + new seed.

-- ---------------------------------------------------------------------------
-- 1. Per-table RLS status + policy summary RPC.
-- ---------------------------------------------------------------------------
-- Reports, for every base table in `public`: whether row-level security is on,
-- whether the table carries owner-scoped data (a user_id/household_id column),
-- and a JSON summary of its policies (name, command, USING, WITH CHECK, roles).
CREATE OR REPLACE FUNCTION public.agent_rls_audit()
RETURNS TABLE (
  schemaname    text,
  tablename     text,
  rls_enabled   boolean,
  has_user_data boolean,
  policies      jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    n.nspname::text AS schemaname,
    c.relname::text AS tablename,
    c.relrowsecurity AS rls_enabled,
    EXISTS (
      SELECT 1
      FROM pg_attribute a
      WHERE a.attrelid = c.oid
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND a.attname IN ('user_id', 'household_id')
    ) AS has_user_data,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'policyname', pol.policyname,
        'cmd', pol.cmd,
        'qual', pol.qual,
        'with_check', pol.with_check,
        'roles', pol.roles
      ) ORDER BY pol.policyname)
      FROM pg_policies pol
      WHERE pol.schemaname = n.nspname AND pol.tablename = c.relname
    ), '[]'::jsonb) AS policies
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname = 'public'
  ORDER BY c.relname;
$$;

COMMENT ON FUNCTION public.agent_rls_audit() IS
  'US-511: per-table RLS status + policy summary for the rls-audit agent. SECURITY DEFINER so the service role can read pg_catalog without exposing it broadly.';

REVOKE ALL ON FUNCTION public.agent_rls_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_rls_audit() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Weekly audit snapshots (for week-over-week diffing).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_rls_snapshots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot   JSONB NOT NULL DEFAULT '{}'::jsonb,
  findings   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_rls_snapshots_created
  ON public.agent_rls_snapshots(created_at DESC);

ALTER TABLE public.agent_rls_snapshots ENABLE ROW LEVEL SECURITY;

-- Admins may read snapshots; the agent writes with the service role (which
-- bypasses RLS). No INSERT/UPDATE/DELETE policy for regular users.
CREATE POLICY "Admins can view rls snapshots"
  ON public.agent_rls_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

COMMENT ON TABLE public.agent_rls_snapshots IS
  'US-511: weekly RLS-audit snapshots; each run diffs against the previous row to surface new/removed tables and policies.';

-- ---------------------------------------------------------------------------
-- 3. Seed the agent (weekly Monday 06:00 UTC, disabled by default).
-- ---------------------------------------------------------------------------
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'rls-audit',
  'dev_maintenance',
  'Weekly RLS/permission audit: flags tables with RLS disabled, RLS-on-but-no-policies, and USING(true) leaks on owner-scoped data; diffs against last week.',
  'You write terse security audit summaries for engineers. Lead with the most dangerous finding (user data exposed). Reference the exact table and policy names. Do not overstate risk on public reference tables.',
  'claude-haiku-4-5-20251001',
  '0 6 * * 1',
  '{}'::jsonb,
  2,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
