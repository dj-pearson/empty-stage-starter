-- US-523: Harden every SECURITY DEFINER function with a pinned search_path.
--
-- A SECURITY DEFINER function that does not pin search_path runs with the
-- CALLER's search_path. Because Postgres searches pg_temp first, a caller can
-- create a shadowing object (table/function) in their temp schema and have the
-- privileged, definer-owned function resolve to it — a classic privilege-
-- escalation vector. Pinning search_path so pg_temp is searched LAST closes it.
--
-- This is done data-driven (ALTER FUNCTION ... SET search_path) rather than by
-- re-declaring ~50 function bodies, so it is:
--   * Additive & backward-compatible — no body/signature/behavior change, only
--     the function's search_path GUC is pinned. Old iOS clients are unaffected.
--   * Comprehensive — covers every SECURITY DEFINER function in `public`,
--     including any this repo did not author, without listing signatures.
--   * Idempotent — skips functions that already pin search_path, so re-running
--     (or a partial prior fix like has_role) is safe.
--
-- search_path = public, extensions, pg_temp keeps unqualified references
-- resolving to the trusted schemas that hold our objects, while forcing
-- pg_temp to be consulted LAST (defeating the shadowing attack). Setting an
-- extensions schema that does not exist locally is harmless.

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef                                   -- SECURITY DEFINER only
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'                   -- not already pinned
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, extensions, pg_temp',
      fn.sig
    );
    RAISE NOTICE 'Pinned search_path on SECURITY DEFINER function %', fn.sig;
  END LOOP;
END $$;
