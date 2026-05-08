-- ============================================================================
-- Audit the full construction-industry scaffold before dropping it.
-- Read-only. Run in SQL Editor.
-- ============================================================================

WITH
scaffold_tables(t) AS (
  VALUES
    ('user_profiles'), ('companies'), ('projects'),
    ('financial_records'), ('teams'), ('project_team_assignments'),
    ('financial_snapshots')
),
row_counts AS (
  -- Run dynamic counts via a single query that works around the lack of
  -- bind parameters in plain SELECTs. We just hardcode the seven counts.
  SELECT
    '1_row_counts'::text AS section,
    'all_tables'::text   AS label,
    'user_profiles=' || (SELECT COUNT(*) FROM public.user_profiles)                      ||
    '  companies=' || (SELECT COUNT(*) FROM public.companies)                            ||
    '  projects=' || (SELECT COUNT(*) FROM public.projects)                              ||
    '  financial_records=' || (SELECT COUNT(*) FROM public.financial_records)            ||
    '  teams=' || (SELECT COUNT(*) FROM public.teams)                                    ||
    '  project_team_assignments=' || (SELECT COUNT(*) FROM public.project_team_assignments) ||
    '  financial_snapshots=' || (SELECT COUNT(*) FROM public.financial_snapshots)
      AS detail_a,
    NULL::text AS detail_b,
    NULL::text AS detail_c
),
all_policies AS (
  -- Every policy on any scaffold table
  SELECT
    '2_policies'::text                    AS section,
    (c.relname || ' :: ' || pol.polname)  AS label,
    (CASE pol.polcmd
       WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
       WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
       ELSE 'ALL' END)::text                                                  AS detail_a,
    LEFT(COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '-'), 200)          AS detail_b,
    NULL::text AS detail_c
  FROM pg_policy pol
  JOIN pg_class     c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (SELECT t FROM scaffold_tables)
),
all_fks AS (
  -- Every FK touching any scaffold table (in either direction)
  SELECT
    '3_fks'::text                                AS section,
    con.conname::text                            AS label,
    (fn.nspname || '.' || cl.relname)::text      AS detail_a,
    ('-> ' || tn.nspname || '.' || confcl.relname)::text AS detail_b,
    NULL::text AS detail_c
  FROM pg_constraint con
  JOIN pg_class     cl     ON cl.oid     = con.conrelid
  JOIN pg_namespace fn     ON fn.oid     = cl.relnamespace
  JOIN pg_class     confcl ON confcl.oid = con.confrelid
  JOIN pg_namespace tn     ON tn.oid     = confcl.relnamespace
  WHERE con.contype = 'f'
    AND (
      cl.relname     IN (SELECT t FROM scaffold_tables)
      OR confcl.relname IN (SELECT t FROM scaffold_tables)
    )
),
fn_refs AS (
  -- Functions whose body mentions ANY scaffold table or get_user_role/company
  SELECT
    '4_fn_refs'::text                                AS section,
    (n.nspname || '.' || p.proname)::text            AS label,
    pg_get_function_identity_arguments(p.oid)::text  AS detail_a,
    NULL::text AS detail_b,
    NULL::text AS detail_c
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind = 'f'
    AND n.nspname IN ('public','auth','storage','extensions')
    AND (
      pg_get_functiondef(p.oid) ILIKE '%user_profiles%'
      OR pg_get_functiondef(p.oid) ILIKE '%public.companies%'
      OR pg_get_functiondef(p.oid) ILIKE '%public.projects%'
      OR pg_get_functiondef(p.oid) ILIKE '%financial_records%'
      OR pg_get_functiondef(p.oid) ILIKE '%public.teams%'
      OR pg_get_functiondef(p.oid) ILIKE '%project_team_assignments%'
      OR pg_get_functiondef(p.oid) ILIKE '%financial_snapshots%'
      OR pg_get_functiondef(p.oid) ILIKE '%get_user_role%'
      OR pg_get_functiondef(p.oid) ILIKE '%get_user_company%'
    )
),
view_refs AS (
  SELECT
    '5_views'::text                          AS section,
    (n.nspname || '.' || c.relname)::text    AS label,
    (CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'matview' END)::text AS detail_a,
    NULL::text AS detail_b,
    NULL::text AS detail_c
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('v','m')
    AND n.nspname IN ('public','auth','storage','extensions')
    AND (
      pg_get_viewdef(c.oid) ILIKE '%user_profiles%'
      OR pg_get_viewdef(c.oid) ILIKE '%public.companies%'
      OR pg_get_viewdef(c.oid) ILIKE '%public.projects%'
      OR pg_get_viewdef(c.oid) ILIKE '%financial_records%'
      OR pg_get_viewdef(c.oid) ILIKE '%public.teams%'
      OR pg_get_viewdef(c.oid) ILIKE '%project_team_assignments%'
      OR pg_get_viewdef(c.oid) ILIKE '%financial_snapshots%'
    )
),
columns_per_table AS (
  -- Just so we can spot any column types that might be reused (e.g.
  -- user_role enum somewhere unexpected)
  SELECT
    '6_enum_users'::text                AS section,
    (table_schema || '.' || table_name || '.' || column_name)::text AS label,
    udt_name::text                      AS detail_a,
    NULL::text AS detail_b,
    NULL::text AS detail_c
  FROM information_schema.columns
  WHERE udt_name = 'user_role'
)
SELECT * FROM row_counts
UNION ALL SELECT * FROM all_policies
UNION ALL SELECT * FROM all_fks
UNION ALL SELECT * FROM fn_refs
UNION ALL SELECT * FROM view_refs
UNION ALL SELECT * FROM columns_per_table
ORDER BY section, label;
