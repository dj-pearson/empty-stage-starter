-- US-804: make the revokes that were already written actually revoke.
--
-- WHAT IS WRONG
-- Supabase sets a schema-level default ACL on public:
--
--   pg_default_acl = {anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- so every function created in public gets EXECUTE granted DIRECTLY to anon,
-- authenticated and service_role at creation. REVOKE ALL ON FUNCTION ... FROM
-- PUBLIC removes the PUBLIC grant, which was never what made the function
-- callable, and leaves the direct role grants untouched. The statement reads
-- like a lock and does nothing.
--
-- MEASURED, not inferred. Against a database built from this migration tree
-- with that default ACL in place, has_function_privilege('anon', fn, 'EXECUTE')
-- was TRUE for fourteen functions carrying a REVOKE, thirteen of them SECURITY
-- DEFINER. The three that were genuinely locked --  prune_auth_rate_limits,
-- auth_rate_limit_client_ip and effective_plan_id -- are exactly the three
-- whose migrations named anon explicitly. That is the whole mechanism, visible
-- as a natural experiment inside this repo.
--
-- THE WORST OF THEM: rpc_merge_items is SECURITY DEFINER, rewrites
-- recipe_ingredients, plan_entries, grocery_items, item_aliases and the kid
-- food ladder across a household, and contains no auth.uid() check of any kind.
-- It was callable by anon. rpc_reconcile_item_stock and
-- rpc_stock_mirror_divergence take a household id directly and are the same
-- shape.
--
-- THE DECISION PER FUNCTION (US-804 AC4). Not everything here should be locked
-- down, and the two that must stay open are the point of recording this.
--
--   PRIVATE -- no client role calls these. Cron, triggers, one-off backfills,
--   admin tooling, and helpers invoked only from inside other SECURITY DEFINER
--   functions (which run as the definer, so revoking these does not break
--   them). Verified: no RLS policy references any of them.
--       agent_recent_auth_events, agent_rls_audit, backfill_initial_movements,
--       detect_item_stock_drift, record_item_stock_drift, household_owner_id,
--       household_seat_limit
--   Plus the three kitchen-loop RPCs, which have no caller in the app today AND
--   no authorization inside them. Private is the safe state until the story
--   that needs them adds the grant and the membership check together:
--       rpc_merge_items, rpc_reconcile_item_stock, rpc_stock_mirror_divergence
--
--   AUTHENTICATED ONLY -- called from app code by a signed-in user:
--       contribute_chain_network, fetch_chain_network_targets
--
--   DELIBERATELY ANON, LEFT ALONE -- the signup flow runs BEFORE
--   authentication, so anon is the role that calls these. Revoking them would
--   break signup, and their REVOKE ... FROM PUBLIC was never meant to shut anon
--   out:
--       is_disposable_email_domain, is_disposable_email
--
-- Backward compatible: privileges only. No shipped iOS build calls any of the
-- functions being closed -- the two an app calls keep their authenticated
-- grant, and the two signup helpers are untouched.

-- ---------------------------------------------------------------- private ---
REVOKE ALL ON FUNCTION public.agent_recent_auth_events(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_rls_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backfill_initial_movements(INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.detect_item_stock_drift() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_item_stock_drift() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_owner_id(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_seat_limit(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_merge_items(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_reconcile_item_stock(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_stock_mirror_divergence(UUID) FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------- authenticated only ---
REVOKE ALL ON FUNCTION public.contribute_chain_network(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contribute_chain_network(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.fetch_chain_network_targets(TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_chain_network_targets(TEXT, TEXT, INTEGER) TO authenticated;

-- ------------------------------------------------- deliberately left open ---
COMMENT ON FUNCTION public.is_disposable_email_domain(TEXT) IS
  'US-804: anon EXECUTE is deliberate. The signup flow calls this before a '
  'session exists (src/lib/disposable-email.ts), so anon is the caller. '
  'SECURITY DEFINER and it returns only a boolean about a domain, never a row.';

COMMENT ON FUNCTION public.is_disposable_email(TEXT) IS
  'US-804: anon EXECUTE is deliberate, same pre-auth signup path as '
  'is_disposable_email_domain. No caller in the app today; kept open because '
  'its whole purpose is validating an address before there is a session.';
