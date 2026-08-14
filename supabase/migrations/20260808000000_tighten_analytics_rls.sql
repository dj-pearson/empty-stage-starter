-- US-620: remove the public-write RLS policies on the revenue/workflow
-- analytics tables (codebase review, 2026-08-08).
--
-- Each of these was declared `FOR ALL ... WITH CHECK (TRUE)` with no `TO`
-- clause, so it applied to PUBLIC — including `anon`. For INSERT that is
-- unambiguous: anyone holding the anon key (which ships inside the web bundle)
-- could POST rows straight to /rest/v1/revenue_metrics_daily and poison the
-- MRR / ARR / churn figures the admin dashboard reads. revenue_churn_predictions
-- is keyed to auth.users(id), so per-user risk scores could be written for
-- arbitrary accounts.
--
-- Same class of policy already retired in 20260514000000_lock_down_system_policies
-- and 20260726000000_tighten_permissive_rls_policies; these four were simply out
-- of scope then.
--
-- WHY THIS IS BACKWARD-COMPATIBLE (verified before writing this migration):
--   * No edge function writes to any of the four.
--   * The only client references are SELECTs in
--     src/components/admin/RevenueOperationsCenter.tsx (lines 113, 127, 168),
--     and the admin-only SELECT policies are left untouched below.
--   * The real writers are update_all_churn_predictions() and
--     trigger_churn_interventions(), both SECURITY DEFINER in
--     20251220000000_admin_tables.sql, which bypasses RLS entirely.
--   * workflow_executions has no writer in the repo at all; it is populated by
--     service-role automation, which also bypasses RLS.
--
-- Policy-only and additive: RLS stays enabled, no table/column/type changes, so
-- src/integrations/supabase/types.ts is unaffected and every shipped iOS build
-- keeps working.

DROP POLICY IF EXISTS "System can update revenue metrics"    ON public.revenue_metrics_daily;
DROP POLICY IF EXISTS "System can update churn predictions"  ON public.revenue_churn_predictions;
DROP POLICY IF EXISTS "System can update cohort data"        ON public.revenue_cohort_retention;
DROP POLICY IF EXISTS "System can manage executions"         ON public.workflow_executions;

-- Belt and braces: these must never be readable by anon either.
--
-- CORRECTION: the line above used to read "RLS is already enabled on all four
-- (20251220000000_admin_tables.sql)". That is not true, and the unconditional
-- ALTER ... ENABLE ROW LEVEL SECURITY below aborted a clean replay with
--
--   ERROR: ALTER action ENABLE ROW SECURITY cannot be performed on relation
--          "revenue_metrics_daily" (SQLSTATE 42809)
--
-- Two of the four are MATERIALIZED VIEWS, created earlier in
-- 20251109000002_revenue_operations_command_center (revenue_metrics_daily:340,
-- revenue_cohort_retention:230). The CREATE TABLE IF NOT EXISTS forms in
-- admin_tables.sql are no-ops against objects that already existed under a
-- different relkind, so the "tables" this migration described never existed.
-- A materialized view cannot carry RLS at all.
--
-- So: enable RLS on the two real tables, and harden the two matviews the only
-- way available to them, by revoking the grant. anon loses SELECT (Supabase's
-- default privileges hand it out for anything created in public). authenticated
-- KEEPS SELECT deliberately — RevenueOperationsCenter.tsx:113,168 reads both
-- through supabase-js with the user's own JWT, so revoking it would black out
-- the admin dashboard.
--
-- RESIDUAL GAP, deliberately not closed here: with RLS unavailable and the
-- authenticated grant retained, any signed-in user can still SELECT the revenue
-- rollups. Restricting those to admins needs a SECURITY DEFINER accessor gated
-- on has_role(auth.uid(), 'admin') and a client change to call it — a product
-- change, out of scope for a policy migration.
DO $tighten$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'revenue_metrics_daily', 'revenue_churn_predictions',
        'revenue_cohort_retention', 'workflow_executions'
      )
  LOOP
    IF rec.relkind = 'r' THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.relname);
    ELSE
      -- 'm' (materialized view) or 'v' (view): no RLS to enable.
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', rec.relname);
      RAISE NOTICE
        'public.% is relkind %, not a table: revoked anon instead of enabling RLS',
        rec.relname, rec.relkind;
    END IF;
  END LOOP;
END
$tighten$;

-- COMMENT ON TABLE is likewise wrong for the two matviews, so the object
-- keyword is chosen from relkind here too.
DO $describe$
DECLARE
  rec record;
  kw  text;
  txt text;
BEGIN
  FOR rec IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'revenue_metrics_daily', 'revenue_churn_predictions',
        'revenue_cohort_retention', 'workflow_executions'
      )
  LOOP
    kw := CASE rec.relkind WHEN 'm' THEN 'MATERIALIZED VIEW'
                           WHEN 'v' THEN 'VIEW'
                           ELSE 'TABLE' END;
    txt := CASE rec.relname
      WHEN 'revenue_metrics_daily' THEN
        'Daily revenue rollup. Written only by SECURITY DEFINER functions / service role; no anon or authenticated write policy (US-620).'
      WHEN 'revenue_churn_predictions' THEN
        'Per-user churn risk. Written only by update_all_churn_predictions() (SECURITY DEFINER); no anon or authenticated write policy (US-620).'
      WHEN 'revenue_cohort_retention' THEN
        'Cohort retention rollup. Written only by SECURITY DEFINER functions / service role; no anon or authenticated write policy (US-620).'
      ELSE
        'Automation run log. Written only by service-role automation; no anon or authenticated write policy (US-620).'
    END;
    EXECUTE format('COMMENT ON %s public.%I IS %L', kw, rec.relname, txt);
  END LOOP;
END
$describe$;
