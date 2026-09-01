-- Close the TRUNCATE hole in the agent audit log.
--
-- 20260709000001 makes agent_audit_log append-only and says so in its own
-- COMMENT: "Append-only audit trail of every agent and human action.
-- UPDATE/DELETE revoked from client roles." It then revokes exactly UPDATE and
-- DELETE:
--
--   REVOKE UPDATE, DELETE ON public.agent_audit_log FROM authenticated;
--   REVOKE UPDATE, DELETE ON public.agent_audit_log FROM anon;
--
-- TRUNCATE is a separate privilege and it was not revoked. Supabase grants the
-- client roles ALL privileges on public tables by default, so it is still held,
-- and RLS does not help: TRUNCATE is not row-level, so having no DELETE policy
-- to satisfy stops nothing. One statement erases the entire audit trail, and
-- because it is a DDL-ish operation rather than a stream of DELETEs it leaves
-- markedly less trace than the thing it destroys was there to provide.
--
-- The kitchen-loop ledger got this right by copying the pattern rather than the
-- code: inventory_movements (20260901000001) and item_stock (20260901000002)
-- both revoke TRUNCATE explicitly. This brings the older table into line.
--
-- BACKWARD COMPATIBILITY: removing a privilege no client legitimately uses.
-- Nothing in the app truncates an audit log; the service role, which owns the
-- table and bypasses RLS, is unaffected and can still do maintenance.

REVOKE TRUNCATE ON public.agent_audit_log FROM authenticated;
REVOKE TRUNCATE ON public.agent_audit_log FROM anon;

COMMENT ON TABLE public.agent_audit_log IS
  'Append-only audit trail of every agent and human action. UPDATE, DELETE and TRUNCATE revoked from client roles.';

-- The other two tables from that same migration. Neither is append-only --
-- an approval is meant to be updated -- so this is not the same finding, just
-- the same privilege: no client role has any business truncating either one,
-- and doing all three here means one review instead of rediscovering it a
-- table at a time. Guarded on existence so the migration is safe to run
-- against a database where that release has not landed.
DO $$
DECLARE
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY['agent_approvals', 'agent_escalations']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = target AND c.relkind = 'r'
    ) THEN
      EXECUTE format('REVOKE TRUNCATE ON public.%I FROM authenticated', target);
      EXECUTE format('REVOKE TRUNCATE ON public.%I FROM anon', target);
      RAISE NOTICE 'revoked TRUNCATE on public.% from client roles', target;
    END IF;
  END LOOP;
END $$;
