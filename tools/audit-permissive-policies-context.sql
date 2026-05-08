-- Show ALL policies on the 8 tables flagged with `using=true` so we can write
-- a precise lockdown migration without breaking legit user-scoped policies.
-- Read-only.

SELECT
  c.relname                                 AS table_name,
  pol.polname                               AS policy_name,
  CASE pol.polcmd
    WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
    ELSE 'ALL' END                          AS cmd,
  -- Roles this policy applies to (Postgres stores as oid array)
  COALESCE(
    (SELECT string_agg(r.rolname, ',')
     FROM pg_roles r WHERE r.oid = ANY(pol.polroles)),
    'PUBLIC'
  )                                         AS roles,
  pol.polpermissive                         AS is_permissive,
  COALESCE(pg_get_expr(pol.polqual, pol.polrelid), 'NULL')         AS using_expr,
  COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), 'NULL')    AS check_expr
FROM pg_policy pol
JOIN pg_class     c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'automation_email_events',
    'automation_email_queue',
    'backup_logs',
    'login_history',
    'rate_limits',
    'referral_codes',
    'referral_rewards',
    'referrals'
  )
ORDER BY c.relname, pol.polname;
