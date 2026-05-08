-- ============================================================================
-- AUDIT: public.user_profiles — read-only discovery (single result set)
-- ============================================================================
-- Run in Supabase SQL Editor. Returns ONE table with rows from every section.
-- The `section` column tells you which audit step the row belongs to.
-- Empty sections produce a single "<none>" row so you can confirm "nothing
-- found" vs "section didn't run".
-- ============================================================================

WITH
row_counts AS (
  SELECT
    '1_row_counts'::text AS section,
    'totals'::text       AS label,
    'total='   || COUNT(*)::text                                                                ||
    '  admins=' || COUNT(*) FILTER (WHERE role = 'admin')::text                                 ||
    '  bogus_admins=' || COUNT(*) FILTER (WHERE role = 'admin' AND id <> 'dc48c711-f059-443a-b4f2-585be6683c63')::text ||
    '  non_admins=' || COUNT(*) FILTER (WHERE role IS DISTINCT FROM 'admin')::text              AS detail_a,
    NULL::text AS detail_b,
    NULL::text AS detail_c
  FROM public.user_profiles
),
columns AS (
  SELECT
    '2_columns'::text                                  AS section,
    column_name::text                                  AS label,
    ('type=' || data_type)::text                       AS detail_a,
    ('default=' || COALESCE(column_default,'<none>'))::text AS detail_b,
    ('nullable=' || is_nullable)::text                 AS detail_c
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_profiles'
),
functions AS (
  SELECT
    '3_functions'::text  AS section,
    (n.nspname || '.' || p.proname)::text AS label,
    pg_get_function_identity_arguments(p.oid)::text AS detail_a,
    NULL::text AS detail_b,
    NULL::text AS detail_c
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind = 'f'
    AND n.nspname IN ('public','auth','storage','extensions')
    AND pg_get_functiondef(p.oid) ILIKE '%user_profiles%'
),
triggers AS (
  SELECT
    '4_triggers'::text  AS section,
    t.tgname::text      AS label,
    ('on '   || tn.nspname || '.' || tc.relname)::text AS detail_a,
    ('calls ' || pn.nspname || '.' || p.proname)::text AS detail_b,
    NULL::text AS detail_c
  FROM pg_trigger t
  JOIN pg_class     tc ON tc.oid = t.tgrelid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  JOIN pg_proc      p  ON p.oid  = t.tgfoid
  JOIN pg_namespace pn ON pn.oid = p.pronamespace
  WHERE NOT t.tgisinternal
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ILIKE '%user_profiles%'
),
rls_policies AS (
  SELECT
    '5_rls_policies'::text AS section,
    pol.polname::text      AS label,
    (CASE pol.polcmd
       WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
       WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
       ELSE 'ALL' END)::text                                  AS detail_a,
    ('using=' || COALESCE(pg_get_expr(pol.polqual, pol.polrelid),'-'))::text       AS detail_b,
    ('check=' || COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid),'-'))::text  AS detail_c
  FROM pg_policy pol
  JOIN pg_class     c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'user_profiles'
),
views AS (
  SELECT
    '6_views'::text                          AS section,
    (n.nspname || '.' || c.relname)::text    AS label,
    (CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'matview' END)::text AS detail_a,
    NULL::text AS detail_b,
    NULL::text AS detail_c
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('v','m')
    AND n.nspname IN ('public','auth','storage','extensions')
    AND pg_get_viewdef(c.oid) ILIKE '%user_profiles%'
),
fks AS (
  SELECT
    '7_fks'::text       AS section,
    con.conname::text   AS label,
    (fn.nspname || '.' || cl.relname)::text     AS detail_a,
    ('-> ' || tn.nspname || '.' || confcl.relname)::text AS detail_b,
    NULL::text AS detail_c
  FROM pg_constraint con
  JOIN pg_class     cl     ON cl.oid     = con.conrelid
  JOIN pg_namespace fn     ON fn.oid     = cl.relnamespace
  JOIN pg_class     confcl ON confcl.oid = con.confrelid
  JOIN pg_namespace tn     ON tn.oid     = confcl.relnamespace
  WHERE con.contype = 'f'
    AND (cl.relname = 'user_profiles' OR confcl.relname = 'user_profiles')
),
column_defaults AS (
  SELECT
    '8_column_defaults'::text                   AS section,
    (table_schema || '.' || table_name || '.' || column_name)::text AS label,
    ('default=' || column_default)::text        AS detail_a,
    NULL::text AS detail_b,
    NULL::text AS detail_c
  FROM information_schema.columns
  WHERE column_default ILIKE '%user_profiles%'
),
all_rows AS (
  SELECT * FROM row_counts
  UNION ALL SELECT * FROM columns
  UNION ALL SELECT * FROM functions
  UNION ALL SELECT * FROM triggers
  UNION ALL SELECT * FROM rls_policies
  UNION ALL SELECT * FROM views
  UNION ALL SELECT * FROM fks
  UNION ALL SELECT * FROM column_defaults
),
sections AS (
  SELECT unnest(ARRAY[
    '1_row_counts','2_columns','3_functions','4_triggers',
    '5_rls_policies','6_views','7_fks','8_column_defaults'
  ]) AS section
)
SELECT
  COALESCE(a.section, s.section) AS section,
  COALESCE(a.label,   '<none>')  AS label,
  a.detail_a,
  a.detail_b,
  a.detail_c
FROM sections s
LEFT JOIN all_rows a USING (section)
ORDER BY section, label;
