-- US-804: the revoke that was written is the revoke that happened.
-- Run: psql -f supabase/tests/us804_function_privileges.test.sql
--
-- These assert on has_function_privilege, never on a migration containing the
-- word REVOKE. That distinction is the story: fourteen functions carried
-- `REVOKE ALL ON FUNCTION ... FROM PUBLIC` and stayed callable by anon, because
-- Supabase's schema default ACL grants EXECUTE DIRECTLY to anon, authenticated
-- and service_role at creation, and revoking PUBLIC does not touch a direct
-- grant. The statement existing is exactly what gave the false confidence.
--
-- Each function is listed under the decision made for it, so a later change
-- that opens one has to argue with the list.
\set ON_ERROR_STOP on
BEGIN;

-- 1. The default ACL this story is about is present. Without it the rest of
--    this file would pass on a database that never had the problem, which is
--    how a green run could mean nothing.
DO $a1$
DECLARE acl TEXT;
BEGIN
  SELECT array_to_string(defaclacl, ',') INTO acl
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
   WHERE n.nspname = 'public' AND d.defaclobjtype = 'f'
   LIMIT 1;

  IF acl IS NULL THEN
    RAISE NOTICE 'assertion 1 skipped: no function default ACL on public. '
      'On Supabase this exists and grants anon EXECUTE at creation; a database '
      'without it cannot reproduce US-804.';
  ELSIF acl NOT LIKE '%anon=X%' THEN
    RAISE EXCEPTION 'assertion 1: default ACL no longer grants anon EXECUTE (%). '
      'If Supabase changed this, the reasoning in US-804 needs revisiting.', acl;
  ELSE
    RAISE NOTICE 'assertion 1 ok (default ACL grants anon EXECUTE: %)', acl;
  END IF;
END $a1$;

-- 2. PRIVATE: no client role may execute these.
DO $a2$
DECLARE fn TEXT; leaked TEXT[] := '{}';
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.agent_recent_auth_events(integer)',
    'public.agent_rls_audit()',
    'public.backfill_initial_movements(integer)',
    'public.detect_item_stock_drift()',
    'public.record_item_stock_drift()',
    'public.household_owner_id(uuid)',
    'public.household_seat_limit(uuid)',
    'public.rpc_merge_items(uuid, uuid[])',
    'public.rpc_reconcile_item_stock(uuid)',
    'public.rpc_stock_mirror_divergence(uuid)'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN
      leaked := leaked || (fn || ' [anon]');
    END IF;
    IF has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      leaked := leaked || (fn || ' [authenticated]');
    END IF;
  END LOOP;

  IF array_length(leaked, 1) > 0 THEN
    RAISE EXCEPTION 'assertion 2: these are meant to be private and are executable: %',
      array_to_string(leaked, ', ');
  END IF;
  RAISE NOTICE 'assertion 2 ok (10 private functions unreachable by anon and authenticated)';
END $a2$;

-- 3. rpc_merge_items specifically, because it is the one that mattered most:
--    SECURITY DEFINER, rewrites recipe_ingredients, plan_entries,
--    grocery_items, item_aliases and the kid food ladder across a household,
--    and carries no auth.uid() check at all. Anon could call it.
DO $a3$
BEGIN
  IF has_function_privilege('anon', 'public.rpc_merge_items(uuid, uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion 3: anon can execute rpc_merge_items, which is '
      'SECURITY DEFINER, writes across a household and authorizes nobody';
  END IF;
  RAISE NOTICE 'assertion 3 ok (rpc_merge_items closed to anon)';
END $a3$;

-- 4. AUTHENTICATED ONLY: the app calls these from a signed-in session, so
--    authenticated keeps EXECUTE and anon does not.
DO $a4$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.contribute_chain_network(uuid, text, text, text, text)',
    'public.fetch_chain_network_targets(text, text, integer)'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'assertion 4: % should not be callable by anon', fn;
    END IF;
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'assertion 4: % must stay callable by a signed-in user; '
        'src/lib/chainNetwork.ts calls it', fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'assertion 4 ok (chain-network RPCs are authenticated-only)';
END $a4$;

-- 5. DELIBERATELY OPEN: signup runs before a session exists, so anon is the
--    caller. This assertion exists so a later "lock everything down" pass
--    cannot quietly break signup.
DO $a5$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.is_disposable_email_domain(text)',
    'public.is_disposable_email(text)'
  ] LOOP
    IF NOT has_function_privilege('anon', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'assertion 5: % must stay callable by anon -- the signup '
        'flow calls it before authentication, and revoking it breaks signup', fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'assertion 5 ok (pre-auth signup helpers still reachable by anon)';
END $a5$;

-- 6. DELIBERATELY OPEN, AND EMPTY FOR ANON (20260928000007): the two RLS
--    helpers. 82 policies declared for every role call them, and Postgres
--    checks EXECUTE when a query starts, so a revoke turns every signed-out
--    read of foods, recipes, kids and the rest into "permission denied for
--    function get_user_household_id". The fix is in the body instead: for the
--    anon role they answer false / NULL whatever they are asked. This checks
--    both halves, so neither a revoke nor a body rewrite passes unnoticed.
DO $a6$
DECLARE fn TEXT; member UUID; hh UUID; belongs BOOLEAN; resolved UUID;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.user_belongs_to_household(uuid, uuid)',
    'public.get_user_household_id(uuid)'
  ] LOOP
    IF NOT has_function_privilege('anon', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'assertion 6: % must stay executable by anon; policies '
        'declared for every role call it and signed-out reads would error', fn;
    END IF;
  END LOOP;

  -- A real member to ask about. Signup gives the account a household; the
  -- whole file rolls back.
  member := gen_random_uuid();
  INSERT INTO auth.users (id, email) VALUES (member, 'us804-a6@example.test');
  SELECT household_id INTO hh FROM public.household_members WHERE user_id = member;
  IF hh IS NULL THEN
    RAISE EXCEPTION 'assertion 6: signup did not create a membership to probe with';
  END IF;
  SET LOCAL ROLE anon;
  belongs  := public.user_belongs_to_household(member, hh);
  resolved := public.get_user_household_id(member);
  RESET ROLE;
  IF belongs OR resolved IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 6: anon learned a real membership (belongs=%, household=%)',
      belongs, resolved;
  END IF;
  RAISE NOTICE 'assertion 6 ok (RLS helpers executable by anon, and answer it nothing)';
END $a6$;

ROLLBACK;
