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

-- Belt and braces: these tables must never be readable by anon either. RLS is
-- already enabled on all four (20251220000000_admin_tables.sql); re-asserting is
-- idempotent and guards against a future migration flipping it off.
ALTER TABLE public.revenue_metrics_daily      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_churn_predictions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_cohort_retention   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_executions        ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.revenue_metrics_daily IS
  'Daily revenue rollup. Written only by SECURITY DEFINER functions / service role; no anon or authenticated write policy (US-620).';
COMMENT ON TABLE public.revenue_churn_predictions IS
  'Per-user churn risk. Written only by update_all_churn_predictions() (SECURITY DEFINER); no anon or authenticated write policy (US-620).';
COMMENT ON TABLE public.revenue_cohort_retention IS
  'Cohort retention rollup. Written only by SECURITY DEFINER functions / service role; no anon or authenticated write policy (US-620).';
COMMENT ON TABLE public.workflow_executions IS
  'Automation run log. Written only by service-role automation; no anon or authenticated write policy (US-620).';
