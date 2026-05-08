-- Step 2: dump the actual bodies of the three suspect functions, the
-- user_role enum values, and a row count of companies. Read-only.
WITH
fn_bodies AS (
  SELECT
    'A_function_body'::text                               AS section,
    (n.nspname || '.' || p.proname)::text                 AS label,
    pg_get_functiondef(p.oid)::text                       AS detail_a,
    NULL::text AS detail_b,
    NULL::text AS detail_c
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('handle_new_user','get_user_role','get_user_company')
    AND p.prokind = 'f'
),
enum_vals AS (
  SELECT
    'B_user_role_enum'::text   AS section,
    e.enumlabel::text          AS label,
    e.enumsortorder::text      AS detail_a,
    NULL::text                 AS detail_b,
    NULL::text                 AS detail_c
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE t.typname = 'user_role'
),
companies_info AS (
  SELECT
    'C_companies'::text                                                    AS section,
    'row_count'::text                                                      AS label,
    COUNT(*)::text                                                         AS detail_a,
    NULL::text AS detail_b,
    NULL::text AS detail_c
  FROM public.companies
),
companies_cols AS (
  SELECT
    'C_companies'::text             AS section,
    column_name::text               AS label,
    ('type=' || data_type)::text    AS detail_a,
    ('default=' || COALESCE(column_default,'<none>'))::text AS detail_b,
    ('nullable=' || is_nullable)::text AS detail_c
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'companies'
)
SELECT * FROM fn_bodies
UNION ALL SELECT * FROM enum_vals
UNION ALL SELECT * FROM companies_info
UNION ALL SELECT * FROM companies_cols
ORDER BY section, label;
