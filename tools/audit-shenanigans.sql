-- ============================================================================
-- Shenanigans audit — one shot, single result set.
-- Read-only. Run in the Supabase SQL Editor.
--
-- Surfaces:
--   - Triggers on auth.* (most-likely hijack target)
--   - Functions with SECURITY DEFINER + insecure/missing search_path
--   - Functions that mutate sensitive tables (auth.users, user_roles,
--     user_subscriptions, profiles, households)
--   - Public tables without RLS enabled
--   - Tables with RLS enabled but zero policies (deny-all may or may not be intended)
--   - RLS policies that are excessively permissive ('true', no qual)
--   - user_id-shaped columns missing a FK to auth.users
--   - Recently-created public tables (potential out-of-band dashboard creates)
--   - Public functions whose name or body suggests B2B SaaS scaffolding
--     (companies, tenants, organizations, etc.)
-- ============================================================================

WITH

-- 1. Triggers on auth.* schema. We already know about on_auth_user_created;
-- anything else fires on signup/update/delete.
auth_triggers AS (
  SELECT
    'HIGH'::text                                         AS severity,
    '1_auth_triggers'::text                              AS section,
    t.tgname::text                                       AS label,
    (tn.nspname || '.' || tc.relname)::text              AS detail_a,
    ('calls ' || pn.nspname || '.' || p.proname)::text   AS detail_b,
    NULL::text AS detail_c
  FROM pg_trigger t
  JOIN pg_class     tc ON tc.oid = t.tgrelid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  JOIN pg_proc      p  ON p.oid  = t.tgfoid
  JOIN pg_namespace pn ON pn.oid = p.pronamespace
  WHERE NOT t.tgisinternal
    AND tn.nspname IN ('auth','storage')
),

-- 2. SECURITY DEFINER functions in public — these run as table owner and
-- are the standard backdoor vector. Flag those without an explicit
-- search_path setting (mutable -> attackable).
secdef_functions AS (
  SELECT
    CASE
      WHEN p.proconfig IS NULL THEN 'HIGH'
      WHEN NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%') THEN 'HIGH'
      ELSE 'MED'
    END                                                  AS severity,
    '2_secdef_functions'::text                           AS section,
    (n.nspname || '.' || p.proname)::text                AS label,
    ('search_path=' || COALESCE(
       (SELECT split_part(c, '=', 2) FROM unnest(COALESCE(p.proconfig,'{}'::text[])) c WHERE c LIKE 'search_path=%' LIMIT 1),
       '<unset!>'))::text                                AS detail_a,
    pg_get_function_identity_arguments(p.oid)::text      AS detail_b,
    p.proowner::regrole::text                            AS detail_c
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef
    AND n.nspname = 'public'
    AND p.prokind = 'f'
),

-- 3. Functions that touch sensitive tables. Worth reviewing all bodies.
sensitive_writes AS (
  SELECT
    'MED'::text                                          AS severity,
    '3_sensitive_writes'::text                           AS section,
    (n.nspname || '.' || p.proname)::text                AS label,
    (CASE
       WHEN body ILIKE '%auth.users%'              THEN 'auth.users '
       ELSE ''
     END ||
     CASE WHEN body ILIKE '%user_roles%'           THEN 'user_roles '          ELSE '' END ||
     CASE WHEN body ILIKE '%user_subscriptions%'   THEN 'user_subscriptions '  ELSE '' END ||
     CASE WHEN body ILIKE '%public.profiles%'      THEN 'profiles '            ELSE '' END ||
     CASE WHEN body ILIKE '%household_members%'    THEN 'household_members '   ELSE '' END
    )::text                                              AS detail_a,
    (CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'INVOKER' END)::text AS detail_b,
    NULL::text                                           AS detail_c
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL pg_get_functiondef(p.oid) AS body
  WHERE p.prokind = 'f'
    AND n.nspname IN ('public','auth','storage')
    AND (
      body ILIKE '%auth.users%'
      OR body ILIKE '%user_roles%'
      OR body ILIKE '%user_subscriptions%'
      OR body ILIKE '%public.profiles%'
      OR body ILIKE '%household_members%'
    )
),

-- 4. Public tables without RLS. Anything user-scoped here is a leak.
no_rls AS (
  SELECT
    'HIGH'::text                                         AS severity,
    '4_no_rls'::text                                     AS section,
    (n.nspname || '.' || c.relname)::text                AS label,
    'rls_enabled=false'::text                            AS detail_a,
    NULL::text AS detail_b,
    NULL::text AS detail_c
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname = 'public'
    AND NOT c.relrowsecurity
),

-- 5. Tables with RLS enabled but zero policies — implicit deny-all. Worth
-- knowing in case the app expects to read/write them.
rls_no_policies AS (
  SELECT
    'INFO'::text                                         AS severity,
    '5_rls_no_policies'::text                            AS section,
    (n.nspname || '.' || c.relname)::text                AS label,
    'rls_enabled=true, policy_count=0'::text             AS detail_a,
    NULL::text AS detail_b,
    NULL::text AS detail_c
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname = 'public'
    AND c.relrowsecurity
    AND NOT EXISTS (
      SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
    )
),

-- 6. Dangerously permissive policies (qual = 'true' or NULL).
permissive_policies AS (
  SELECT
    'HIGH'::text                                         AS severity,
    '6_permissive_policies'::text                        AS section,
    (c.relname || ' :: ' || pol.polname)                 AS label,
    (CASE pol.polcmd
       WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
       WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
       ELSE 'ALL' END)::text                             AS detail_a,
    ('using=' || COALESCE(pg_get_expr(pol.polqual, pol.polrelid), 'NULL')) AS detail_b,
    ('check=' || COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), 'NULL')) AS detail_c
  FROM pg_policy pol
  JOIN pg_class     c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND (
      pg_get_expr(pol.polqual, pol.polrelid) IN ('true', 'TRUE')
      OR pol.polqual IS NULL
    )
    -- Skip INSERT-only policies where NULL qual is normal (they use WITH CHECK)
    AND pol.polcmd <> 'a'
),

-- 7. user_id-shaped columns without a FK pointing at auth.users.
unanchored_user_ids AS (
  SELECT
    'MED'::text                                          AS severity,
    '7_unanchored_user_id'::text                         AS section,
    (table_schema || '.' || table_name || '.' || column_name)::text AS label,
    'no FK to auth.users'::text                          AS detail_a,
    data_type::text                                      AS detail_b,
    NULL::text                                           AS detail_c
  FROM information_schema.columns col
  WHERE table_schema = 'public'
    AND column_name IN ('user_id','owner_id','created_by','updated_by')
    AND data_type = 'uuid'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class     cl     ON cl.oid     = con.conrelid
      JOIN pg_namespace fn     ON fn.oid     = cl.relnamespace
      JOIN pg_class     confcl ON confcl.oid = con.confrelid
      JOIN pg_namespace tn     ON tn.oid     = confcl.relnamespace
      JOIN pg_attribute a      ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
      WHERE con.contype = 'f'
        AND fn.nspname = col.table_schema
        AND cl.relname = col.table_name
        AND a.attname = col.column_name
        AND tn.nspname = 'auth'
        AND confcl.relname = 'users'
    )
),

-- 8. Public tables created in the last 90 days. Cross-check against
-- supabase/migrations/ to confirm each one is tracked in source.
recent_tables AS (
  SELECT
    'INFO'::text                                         AS severity,
    '8_recent_tables'::text                              AS section,
    (n.nspname || '.' || c.relname)::text                AS label,
    -- pg doesn't store create timestamp directly, so we approximate via the
    -- earliest column attnum default expression's mtime via pg_stat. Since
    -- that is unreliable, use pg_class.relfilenode as a stand-in heuristic
    -- for "recently rewritten". Instead, just list ALL tables sorted by
    -- their rough creation order (oid ascending = older).
    'oid='::text || c.oid::text                          AS detail_a,
    pg_size_pretty(pg_total_relation_size(c.oid))        AS detail_b,
    NULL::text                                           AS detail_c
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname = 'public'
  ORDER BY c.oid DESC
  LIMIT 25
),

-- 9. Public schema objects whose name suggests other SaaS scaffolds.
suspicious_names AS (
  SELECT
    'MED'::text                                          AS severity,
    '9_suspicious_names'::text                           AS section,
    (n.nspname || '.' || c.relname)::text                AS label,
    (CASE c.relkind
       WHEN 'r' THEN 'table'
       WHEN 'v' THEN 'view'
       WHEN 'm' THEN 'matview'
       WHEN 'S' THEN 'sequence'
       ELSE c.relkind::text
     END)::text                                          AS detail_a,
    NULL::text AS detail_b,
    NULL::text AS detail_c
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r','v','m')
    AND (
      c.relname ~* '(tenant|organization|workspace|invoice|crm|lead_score_old|legacy|deprecated|temp_|tmp_|test_|backup_|old_|companies|projects|teams|materials|time_entries|financial_)'
    )
),

-- 10. Indexes named like 'lovable', 'cursor', 'temp' — non-fatal but a
-- signal that someone created stuff out of band.
suspicious_indexes AS (
  SELECT
    'INFO'::text                                         AS severity,
    '10_suspicious_indexes'::text                        AS section,
    (i.schemaname || '.' || i.indexname)::text           AS label,
    i.tablename::text                                    AS detail_a,
    LEFT(i.indexdef, 120)::text                          AS detail_b,
    NULL::text                                           AS detail_c
  FROM pg_indexes i
  WHERE i.schemaname = 'public'
    AND (
      i.indexname ~* '(lovable|cursor|tmp|temp|backup|old)'
      OR i.indexdef ~* '(lovable|cursor|tmp|temp|backup|old)'
    )
)

SELECT
  severity, section, label, detail_a, detail_b, detail_c
FROM (
  SELECT * FROM auth_triggers
  UNION ALL SELECT * FROM secdef_functions
  UNION ALL SELECT * FROM sensitive_writes
  UNION ALL SELECT * FROM no_rls
  UNION ALL SELECT * FROM rls_no_policies
  UNION ALL SELECT * FROM permissive_policies
  UNION ALL SELECT * FROM unanchored_user_ids
  UNION ALL SELECT * FROM recent_tables
  UNION ALL SELECT * FROM suspicious_names
  UNION ALL SELECT * FROM suspicious_indexes
) all_findings
ORDER BY
  CASE severity WHEN 'HIGH' THEN 1 WHEN 'MED' THEN 2 WHEN 'INFO' THEN 3 ELSE 4 END,
  section,
  label;
