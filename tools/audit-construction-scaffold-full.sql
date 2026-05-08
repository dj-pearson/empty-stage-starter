-- ============================================================================
-- Final scope of the construction-industry scaffold.
-- Identifies every table whose RLS policies reference get_user_role or
-- get_user_company, plus their row counts. This is the definitive list of
-- "tables that will break if we drop those helpers" — i.e. the scaffold.
-- Read-only.
-- ============================================================================

-- A) Every table with at least one policy referencing the scaffold helpers.
WITH scaffold_tables AS (
  SELECT DISTINCT
    n.nspname || '.' || c.relname AS qualified,
    c.relname                     AS table_name
  FROM pg_policy pol
  JOIN pg_class     c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND (
      COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '')      ILIKE '%get_user_role%'
      OR COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '')   ILIKE '%get_user_company%'
      OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid),'') ILIKE '%get_user_role%'
      OR COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid),'') ILIKE '%get_user_company%'
    )
)
SELECT
  '1_scaffold_tables'::text AS section,
  qualified                 AS label,
  -- xpath trick: build a query that returns the row count using
  -- query_to_xml, then extract its text. Lets us count without dynamic SQL.
  (xpath('/row/c/text()',
         query_to_xml(
           format('SELECT COUNT(*) AS c FROM %s', qualified),
           true, false, ''
         )
  ))[1]::text::text         AS detail_a,
  NULL::text                AS detail_b,
  NULL::text                AS detail_c
FROM scaffold_tables

UNION ALL

-- B) Every policy on those tables (full list, in case you want to inspect)
SELECT
  '2_policies'::text                              AS section,
  c.relname || ' :: ' || pol.polname              AS label,
  (CASE pol.polcmd
     WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
     WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
     ELSE 'ALL' END)::text                        AS detail_a,
  LEFT(COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '-'), 200) AS detail_b,
  NULL::text AS detail_c
FROM pg_policy pol
JOIN pg_class     c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    SELECT DISTINCT c2.relname
    FROM pg_policy pol2
    JOIN pg_class     c2 ON c2.oid = pol2.polrelid
    JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
    WHERE n2.nspname = 'public'
      AND (
        COALESCE(pg_get_expr(pol2.polqual, pol2.polrelid), '')      ILIKE '%get_user_role%'
        OR COALESCE(pg_get_expr(pol2.polqual, pol2.polrelid), '')   ILIKE '%get_user_company%'
        OR COALESCE(pg_get_expr(pol2.polwithcheck, pol2.polrelid),'') ILIKE '%get_user_role%'
        OR COALESCE(pg_get_expr(pol2.polwithcheck, pol2.polrelid),'') ILIKE '%get_user_company%'
      )
  )

UNION ALL

-- C) Sanity check: any meal-planning table FK'ing INTO the scaffold?
--    If this returns rows, the scaffold is NOT safely orphan.
SELECT
  '3_meal_to_scaffold_fks'::text         AS section,
  con.conname::text                      AS label,
  (fn.nspname || '.' || cl.relname)::text AS detail_a,
  ('-> ' || tn.nspname || '.' || confcl.relname)::text AS detail_b,
  NULL::text AS detail_c
FROM pg_constraint con
JOIN pg_class     cl     ON cl.oid     = con.conrelid
JOIN pg_namespace fn     ON fn.oid     = cl.relnamespace
JOIN pg_class     confcl ON confcl.oid = con.confrelid
JOIN pg_namespace tn     ON tn.oid     = confcl.relnamespace
WHERE con.contype = 'f'
  AND confcl.relname IN (
    SELECT DISTINCT c2.relname
    FROM pg_policy pol2
    JOIN pg_class     c2 ON c2.oid = pol2.polrelid
    JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
    WHERE n2.nspname = 'public'
      AND (
        COALESCE(pg_get_expr(pol2.polqual, pol2.polrelid), '')      ILIKE '%get_user_role%'
        OR COALESCE(pg_get_expr(pol2.polqual, pol2.polrelid), '')   ILIKE '%get_user_company%'
      )
  )
  AND cl.relname NOT IN (
    -- exclude FKs that originate from another scaffold table
    SELECT DISTINCT c2.relname
    FROM pg_policy pol2
    JOIN pg_class     c2 ON c2.oid = pol2.polrelid
    JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
    WHERE n2.nspname = 'public'
      AND (
        COALESCE(pg_get_expr(pol2.polqual, pol2.polrelid), '')      ILIKE '%get_user_role%'
        OR COALESCE(pg_get_expr(pol2.polqual, pol2.polrelid), '')   ILIKE '%get_user_company%'
      )
  )
  -- ALSO exclude FKs from tables that have NO policies but are still part
  -- of the scaffold (materials, time_entries, etc.) — we'll detect those
  -- by checking if the originating table has any FK back to scaffold
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint con2
    JOIN pg_class     cl2     ON cl2.oid     = con2.conrelid
    JOIN pg_class     confcl2 ON confcl2.oid = con2.confrelid
    WHERE con2.contype = 'f'
      AND cl2.oid = cl.oid
      AND confcl2.relname IN (
        SELECT DISTINCT c2.relname
        FROM pg_policy pol2
        JOIN pg_class     c2 ON c2.oid = pol2.polrelid
        JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
        WHERE n2.nspname = 'public'
          AND (
            COALESCE(pg_get_expr(pol2.polqual, pol2.polrelid), '')      ILIKE '%get_user_role%'
            OR COALESCE(pg_get_expr(pol2.polqual, pol2.polrelid), '')   ILIKE '%get_user_company%'
          )
      )
  )

ORDER BY section, label;
