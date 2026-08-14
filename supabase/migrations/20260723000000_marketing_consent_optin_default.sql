-- Marketing consent must be opt-in, not defaulted on
-- (GDPR Art. 4(11)/7; PECR; CAN-SPAM). Compliance audit 2026-07.
--
-- This migration originally read:
--
--   ALTER TABLE public.quiz_responses ALTER COLUMN accepts_marketing SET DEFAULT false;
--
-- which fails with "column accepts_marketing of relation quiz_responses does
-- not exist". quiz_responses is created by 20251110000000_picky_eater_quiz and
-- has no such column; the column lives on the LEAD tables. The definition that
-- does list accepts_marketing on quiz_responses is in
-- 20251220000000_admin_tables, but that is a CREATE TABLE IF NOT EXISTS against
-- a table the earlier migration already created, so it never took effect.
--
-- The consequence is worse than a failed migration: the three tables that
-- actually default marketing consent to TRUE were never touched by the
-- compliance fix.
--
--   quiz_leads       (20251110000000_picky_eater_quiz:87)
--   budget_leads     (20251110000001_budget_calculator_meal_planner:87)
--   meal_plan_leads  (20251110000001_budget_calculator_meal_planner:177)
--
-- Driven off information_schema rather than a hardcoded list so it is correct
-- on a clean replay and on any database whose shape drifted from this tree, and
-- so a fourth lead table added later is covered automatically. Re-running is a
-- no-op.
--
-- Backward-compatible (additive per CLAUDE.md migration rules): only the column
-- DEFAULT changes. Existing rows are untouched, older iOS clients that omit the
-- column now get FALSE (safe), and clients sending an explicit value keep
-- working. No drop/rename/type-change/constraint-tightening.
DO $marketing_consent$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'accepts_marketing'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN accepts_marketing SET DEFAULT false',
      rec.table_name
    );
    RAISE NOTICE 'marketing consent: default set to false on public.%', rec.table_name;
  END LOOP;
END
$marketing_consent$;

-- NOTE: historical rows created under the old TRUE default are intentionally
-- left unchanged here. Whether to treat those as valid consent (or backfill them
-- to FALSE / re-solicit opt-in) is a policy decision for the marketing/legal
-- owners and should be handled in a follow-up once decided.
