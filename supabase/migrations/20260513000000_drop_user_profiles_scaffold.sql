-- ============================================================================
-- Drop the construction-industry SaaS scaffold (full scope)
-- ============================================================================
-- Apply ONLY after 20260512000000_restore_handle_new_user.sql has been
-- deployed and verified (fresh signups produce profiles + households +
-- household_members rows).
--
-- AUDITED 2026-05-07: every table below is either empty (0 rows) or, in the
-- case of user_profiles, holds only the 37 bogus rows the hijacked trigger
-- created. No meal-planning table has any FK into this scaffold. The
-- helpers and enum are referenced only by the scaffold's own RLS policies.
--
-- Removes:
--   Tables (with bootstrap_* RLS policies):
--     public.user_profiles      (37 bogus rows, all dropped)
--     public.companies          (0 rows)
--     public.projects           (0 rows)
--     public.financial_records  (0 rows)
--     public.financial_snapshots (0 rows)
--     public.teams              (0 rows)
--     public.project_team_assignments (0 rows)
--   Tables reachable only via FK from the scaffold:
--     public.materials, public.material_usage,
--     public.project_assignments, public.time_entries
--   Helpers: public.get_user_role(uuid), public.get_user_company(uuid)
--   Enum:    public.user_role
--
-- Safety: a precondition check aborts the migration if any of the scaffold
-- tables (other than user_profiles, which we expect populated) has data.
-- If you ever decide to use any of these tables for the meal app, abort
-- and rename them out of the scaffold instead of dropping.
-- ============================================================================

-- 1. Safety check: refuse to drop tables that contain data (other than
--    user_profiles, which we know holds 37 bogus rows).
DO $check$
DECLARE
  tname text;
  cnt   integer;
  errs  text := '';
BEGIN
  FOREACH tname IN ARRAY ARRAY[
    'companies','projects','financial_records','financial_snapshots',
    'teams','project_team_assignments',
    'materials','material_usage','project_assignments','time_entries'
  ] LOOP
    -- Skip tables that don't exist on this instance (be tolerant).
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tname AND c.relkind = 'r'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('SELECT COUNT(*) FROM public.%I', tname) INTO cnt;
    IF cnt > 0 THEN
      errs := errs || ' ' || tname || '=' || cnt;
    END IF;
  END LOOP;

  IF length(errs) > 0 THEN
    RAISE EXCEPTION
      'Aborting cleanup. Scaffold tables contain data:%s. Investigate before dropping.',
      errs;
  END IF;
END $check$;

-- 2. Drop the helper functions with CASCADE. This automatically removes
--    every bootstrap_* RLS policy that depends on them (15 policies across
--    7 tables — see audit results).
DROP FUNCTION IF EXISTS public.get_user_role(uuid)    CASCADE;
DROP FUNCTION IF EXISTS public.get_user_company(uuid) CASCADE;

-- 3. Drop the scaffold tables. Order is leaf-to-root, but CASCADE makes
--    order forgiving. IF EXISTS keeps it idempotent.
DROP TABLE IF EXISTS public.material_usage           CASCADE;
DROP TABLE IF EXISTS public.project_assignments      CASCADE;
DROP TABLE IF EXISTS public.time_entries             CASCADE;
DROP TABLE IF EXISTS public.project_team_assignments CASCADE;
DROP TABLE IF EXISTS public.financial_records        CASCADE;
DROP TABLE IF EXISTS public.financial_snapshots      CASCADE;
DROP TABLE IF EXISTS public.teams                    CASCADE;
DROP TABLE IF EXISTS public.materials                CASCADE;
DROP TABLE IF EXISTS public.projects                 CASCADE;
DROP TABLE IF EXISTS public.user_profiles            CASCADE;
DROP TABLE IF EXISTS public.companies                CASCADE;

-- 4. Drop the enum (no more references after the tables and helpers go).
DROP TYPE IF EXISTS public.user_role;
