-- Win Network privacy (20260928000010): the public floor counts distinct
-- households, the aggregate table is not client-readable, and a contribution
-- must reference the caller's own attempt or ladder row and a catalog food.
--
-- Run: bash scripts/dev/local-sql-suite.sh

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

BEGIN;

-- Fixtures: two verified catalog foods, six parents (each gets a household
-- from the signup chain), and per household a kid, a source and target food,
-- a chain suggestion between them and a personal food with no catalog match.
CREATE TEMP TABLE fx (
  n int PRIMARY KEY, uid uuid, hh uuid, kid uuid,
  f_src uuid, f_tgt uuid, f_personal uuid
) ON COMMIT DROP;

DO $fx$
DECLARE
  c_src uuid := '92800010-0000-0000-0000-00000000cc01';
  c_tgt uuid := '92800010-0000-0000-0000-00000000cc02';
  i int;
  u uuid; h uuid; k uuid; fs uuid; ft uuid; fp uuid;
BEGIN
  -- No JWT sub here, so the catalog's verification guard trusts this insert,
  -- the way the seed migration's insert is trusted.
  INSERT INTO public.grocery_product_catalog (id, name, name_normalized, kind, verification, source)
  VALUES (c_src, 'Zz Net Apple', 'zz net apple', 'generic', 'verified', 'admin'),
         (c_tgt, 'Zz Net Pear',  'zz net pear',  'generic', 'verified', 'admin');

  FOR i IN 1..6 LOOP
    u  := format('92800010-0000-0000-0000-0000000001%s', lpad(i::text, 2, '0'))::uuid;
    k  := format('92800010-0000-0000-0000-0000000002%s', lpad(i::text, 2, '0'))::uuid;
    fs := format('92800010-0000-0000-0000-0000000003%s', lpad(i::text, 2, '0'))::uuid;
    ft := format('92800010-0000-0000-0000-0000000004%s', lpad(i::text, 2, '0'))::uuid;
    fp := format('92800010-0000-0000-0000-0000000005%s', lpad(i::text, 2, '0'))::uuid;
    INSERT INTO auth.users (id, email) VALUES (u, format('net-%s@example.test', i));
    SELECT household_id INTO h FROM public.household_members WHERE user_id = u;
    ASSERT h IS NOT NULL, 'the signup chain did not create a household';
    INSERT INTO public.kids (id, user_id, household_id, name, pickiness_level)
      VALUES (k, u, h, 'Kid ' || i, 'mild');
    -- Source maps through canonical_id; target maps by exact catalog name
    -- (odd households) or canonical_id (even), so both paths are used.
    INSERT INTO public.foods (id, user_id, household_id, name, category, canonical_id) VALUES
      (fs, u, h, 'Our Apple Slices ' || i, 'fruit', c_src),
      (ft, u, h, CASE WHEN i % 2 = 1 THEN 'Zz Net Pear' ELSE 'Pear from the tree out back' END,
       'fruit', CASE WHEN i % 2 = 0 THEN c_tgt END),
      (fp, u, h, 'Grandma Joan''s Mash ' || i, 'vegetable', NULL);
    INSERT INTO public.food_chain_suggestions (source_food_id, target_food_id)
      VALUES (fs, ft), (fs, fp);
    INSERT INTO fx VALUES (i, u, h, k, fs, ft, fp);
  END LOOP;
END $fx$;

-- Log an attempt for household n on food f and return the key the web client
-- would send for it (deterministicUuid('<attempt>:<source>')).
CREATE FUNCTION pg_temp.net_attempt(p_n int, p_food uuid, p_outcome text DEFAULT 'success')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r fx; a uuid := gen_random_uuid();
BEGIN
  SELECT * INTO r FROM fx WHERE fx.n = p_n;
  INSERT INTO public.food_attempts (id, kid_id, food_id, outcome) VALUES (a, r.kid, p_food, p_outcome);
  RETURN public.chain_network_key(a::text || ':' || r.f_src::text);
END $$;

-- Call contribute_chain_network as household n's parent, with the names the
-- client would send (ignored by the server).
CREATE FUNCTION pg_temp.net_call(p_n int, p_key uuid,
  p_src text DEFAULT 'Our Apple Slices', p_tgt text DEFAULT 'Zz Net Pear')
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE u uuid; ok boolean;
BEGIN
  SELECT uid INTO u FROM fx WHERE fx.n = p_n;
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  SET LOCAL ROLE authenticated;
  ok := public.contribute_chain_network(p_key, p_src, p_tgt, 'low', 'success');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN ok;
END $$;

CREATE FUNCTION pg_temp.net_fetch(p_n int, p_src text)
RETURNS SETOF record LANGUAGE plpgsql AS $$
DECLARE u uuid;
BEGIN
  SELECT uid INTO u FROM fx WHERE fx.n = p_n;
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  SET LOCAL ROLE authenticated;
  RETURN QUERY SELECT t.target_food_key, t.total_count FROM public.fetch_chain_network_targets(p_src, 'low', 25) t;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.net_call(int, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.net_fetch(int, text) TO authenticated;
GRANT SELECT ON fx TO authenticated;

-- 1. Privileges. The RPCs are authenticated-only, pinned, and SECURITY
--    DEFINER; the open aggregate policy is gone and no policy other than the
--    admin ones lets a client role see the four tables. Table GRANTs are not
--    asserted here: local-sql-suite.sh re-grants ALL on every public table
--    after the migrations run, which undoes the migration's REVOKE locally
--    (on Supabase the REVOKE stands). Assertion 2 checks the effect instead.
DO $a1$
DECLARE fn text;
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chain_network_aggregates'
                      AND policyname = 'Authenticated users read aggregates'),
    'the open aggregate SELECT policy is still there';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('chain_network_aggregates', 'chain_network_contributions',
                         'chain_network_secret', 'chain_network_contribution_quota')
       AND cmd IN ('SELECT', 'ALL')
       AND qual IS DISTINCT FROM 'false'
       AND qual NOT LIKE '%has_role(auth.uid(), ''admin''%'),
    'a non-admin policy exposes a chain network table';
  ASSERT (SELECT bool_and(relrowsecurity) FROM pg_class
           WHERE oid IN ('public.chain_network_aggregates'::regclass, 'public.chain_network_contributions'::regclass,
                         'public.chain_network_secret'::regclass, 'public.chain_network_contribution_quota'::regclass)),
    'RLS is off on a chain network table';

  FOREACH fn IN ARRAY ARRAY['public.chain_network_fnv1a_hex(text)', 'public.chain_network_key(text)',
                            'public.chain_network_food_key(uuid)'] LOOP
    ASSERT NOT has_function_privilege('anon', fn, 'EXECUTE'), format('anon can execute %s', fn);
    ASSERT NOT has_function_privilege('authenticated', fn, 'EXECUTE'), format('authenticated can execute %s', fn);
  END LOOP;
  FOREACH fn IN ARRAY ARRAY['public.contribute_chain_network(uuid, text, text, text, text)',
                            'public.fetch_chain_network_targets(text, text, integer)'] LOOP
    ASSERT NOT has_function_privilege('anon', fn, 'EXECUTE'), format('anon can execute %s', fn);
    ASSERT has_function_privilege('authenticated', fn, 'EXECUTE'), format('authenticated lost %s', fn);
    ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = fn::regprocedure), format('%s is not SECURITY DEFINER', fn);
    ASSERT (SELECT 'search_path=public, pg_temp' = ANY(proconfig) FROM pg_proc WHERE oid = fn::regprocedure),
      format('%s search_path not pinned', fn);
  END LOOP;
  ASSERT (SELECT count(*) FROM public.chain_network_secret) = 1, 'no salt row';
  RAISE NOTICE 'assertion 1 ok (no client policy, RPCs authenticated-only, definer, pinned)';
END $a1$;

-- 2. A direct SELECT gets nothing for anon or a signed-in non-admin, while
--    the rows exist: permission denied on Supabase (REVOKE), zero rows here
--    (RLS with no client policy). Either way nothing leaks.
DO $a2$
DECLARE r text; t text; n int; leaked int;
BEGIN
  INSERT INTO public.chain_network_aggregates
    (source_food_key, target_food_key, pickiness_bucket, success_count, total_count)
  VALUES ('zz direct read', 'zz thin row', 'low', 2, 2);
  INSERT INTO public.chain_network_contributions
    (contribution_key, source_food_key, target_food_key, pickiness_bucket, outcome)
  VALUES (gen_random_uuid(), 'zz direct read', 'zz thin row', 'low', 'success');
  FOREACH t IN ARRAY ARRAY['public.chain_network_aggregates', 'public.chain_network_contributions',
                           'public.chain_network_secret'] LOOP
    EXECUTE format('SELECT count(*) FROM %s', t) INTO n;
    ASSERT n > 0, format('fixture: %s is empty', t);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      leaked := 0;
      PERFORM set_config('request.jwt.claim.sub',
        CASE WHEN r = 'authenticated' THEN (SELECT uid::text FROM fx WHERE fx.n = 1) ELSE '' END, true);
      EXECUTE format('SET LOCAL ROLE %I', r);
      BEGIN
        EXECUTE format('SELECT count(*) FROM %s', t) INTO leaked;
      EXCEPTION WHEN insufficient_privilege THEN leaked := 0;
      END;
      RESET ROLE;
      ASSERT leaked = 0, format('%s read %s rows of %s directly', r, leaked, t);
    END LOOP;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  DELETE FROM public.chain_network_aggregates WHERE source_food_key = 'zz direct read';
  DELETE FROM public.chain_network_contributions WHERE source_food_key = 'zz direct read';
  RAISE NOTICE 'assertion 2 ok (direct reads return nothing to anon and authenticated)';
END $a2$;

-- 3. The server key matches the web client's deterministicUuid(). Expected
--    values come from src/lib/chainNetworkKeys.ts run under node.
DO $a3$
BEGIN
  ASSERT public.chain_network_key('ladder:92800010-0000-0000-0000-0000000000f1')
       = '4d00ac82-b306-4bcf-8b40-be91b506c024'::uuid,
    format('ladder key drifted: %s', public.chain_network_key('ladder:92800010-0000-0000-0000-0000000000f1'));
  ASSERT public.chain_network_key('92800010-0000-0000-0000-0000000000a1:92800010-0000-0000-0000-0000000000b1')
       = '6c607b0e-feb1-4211-8ffb-22adf8b117a8'::uuid, 'attempt key drifted';
  RAISE NOTICE 'assertion 3 ok (chain_network_key == deterministicUuid)';
END $a3$;

-- 4. One household contributing ten times stays hidden.
DO $a4$
DECLARE i int; ok boolean; n int; agg record;
BEGIN
  FOR i IN 1..10 LOOP
    ok := pg_temp.net_call(1, pg_temp.net_attempt(1, (SELECT f_tgt FROM fx WHERE fx.n = 1)));
    ASSERT ok, format('household 1 contribution %s was refused', i);
  END LOOP;
  SELECT * INTO agg FROM public.chain_network_aggregates
   WHERE source_food_key = 'zz net apple' AND target_food_key = 'zz net pear' AND pickiness_bucket = 'low';
  ASSERT agg.total_count = 10 AND agg.distinct_contributors = 1,
    format('expected 10 contributions from 1 household, got %s from %s', agg.total_count, agg.distinct_contributors);
  SELECT count(*) INTO n FROM pg_temp.net_fetch(2, 'Zz Net Apple') AS t(k text, c int);
  ASSERT n = 0, 'a row one household built alone is visible';
  RAISE NOTICE 'assertion 4 ok (1 household x 10 attempts stays under the floor)';
END $a4$;

-- 5. Five distinct households make it visible, to someone else, under the
--    catalog name and via their own food's name.
DO $a5$
DECLARE i int; n int; tk text; tc int;
BEGIN
  FOR i IN 2..4 LOOP
    ASSERT pg_temp.net_call(i, pg_temp.net_attempt(i, (SELECT f_tgt FROM fx WHERE fx.n = i))),
      format('household %s refused', i);
  END LOOP;
  SELECT count(*) INTO n FROM pg_temp.net_fetch(6, 'Zz Net Apple') AS t(k text, c int);
  ASSERT n = 0, 'visible at four households';

  ASSERT pg_temp.net_call(5, pg_temp.net_attempt(5, (SELECT f_tgt FROM fx WHERE fx.n = 5))), 'household 5 refused';
  ASSERT (SELECT distinct_contributors FROM public.chain_network_aggregates
           WHERE source_food_key = 'zz net apple' AND target_food_key = 'zz net pear'
             AND pickiness_bucket = 'low') = 5, 'distinct_contributors is not 5';

  SELECT k, c INTO tk, tc FROM pg_temp.net_fetch(6, 'Zz Net Apple') AS t(k text, c int);
  ASSERT tk = 'zz net pear' AND tc = 14, format('fetch by catalog name gave %s/%s', tk, tc);
  -- Household 6 names its apple "Our Apple Slices 6"; that resolves too.
  SELECT k INTO tk FROM pg_temp.net_fetch(6, 'Our Apple Slices 6') AS t(k text, c int);
  ASSERT tk = 'zz net pear', 'fetch by the household''s own food name did not resolve to the catalog key';
  RAISE NOTICE 'assertion 5 ok (5 distinct households -> visible)';
END $a5$;

-- 6. A key built from another household's attempt is refused and recorded
--    nowhere.
DO $a6$
DECLARE k uuid; before int; n int;
BEGIN
  k := pg_temp.net_attempt(1, (SELECT f_tgt FROM fx WHERE fx.n = 1));
  SELECT total_count INTO before FROM public.chain_network_aggregates
   WHERE source_food_key = 'zz net apple' AND target_food_key = 'zz net pear' AND pickiness_bucket = 'low';
  ASSERT pg_temp.net_call(6, k) = false, 'household 6 contributed household 1''s attempt';
  SELECT count(*) INTO n FROM public.chain_network_contributions WHERE contribution_key = k;
  ASSERT n = 0, 'the foreign key was recorded';
  -- A random key matches nothing.
  ASSERT pg_temp.net_call(6, gen_random_uuid()) = false, 'a random key was accepted';
  ASSERT (SELECT total_count FROM public.chain_network_aggregates
           WHERE source_food_key = 'zz net apple' AND target_food_key = 'zz net pear'
             AND pickiness_bucket = 'low') = before, 'the aggregate moved';
  -- The owner can still use it.
  ASSERT pg_temp.net_call(1, k), 'the owner''s own key was refused';
  -- And only once.
  ASSERT pg_temp.net_call(1, k) = false, 'a duplicate key was counted twice';
  RAISE NOTICE 'assertion 6 ok (foreign and random keys refused; owner once)';
END $a6$;

-- 7. A food with no catalog mapping is not contributed, and client-sent names
--    never reach the network.
DO $a7$
DECLARE k uuid; n int;
BEGIN
  k := pg_temp.net_attempt(6, (SELECT f_personal FROM fx WHERE fx.n = 6));
  ASSERT pg_temp.net_call(6, k, 'Our Apple Slices 6', 'Grandma Joan''s Mash 6') = false,
    'a personal food was contributed';
  -- A valid key with made-up names lands under the catalog names.
  k := pg_temp.net_attempt(6, (SELECT f_tgt FROM fx WHERE fx.n = 6));
  ASSERT pg_temp.net_call(6, k, 'Smith Family Secret', 'Acme Brand Pear Cups'), 'valid key refused';
  SELECT count(*) INTO n FROM public.chain_network_contributions
   WHERE source_food_key ~ '(grandma|smith|acme|our apple|tree out back)'
      OR target_food_key ~ '(grandma|smith|acme|our apple|tree out back)';
  ASSERT n = 0, format('%s contributions carry a household or client-sent name', n);
  SELECT count(*) INTO n FROM public.chain_network_aggregates
   WHERE source_food_key ~ '(grandma|smith|acme|our apple|tree out back)'
      OR target_food_key ~ '(grandma|smith|acme|our apple|tree out back)';
  ASSERT n = 0, 'an aggregate carries a household or client-sent name';
  ASSERT (SELECT source_food_key || '>' || target_food_key FROM public.chain_network_contributions
           WHERE contribution_key = k) = 'zz net apple>zz net pear', 'names were not taken from the catalog';
  RAISE NOTICE 'assertion 7 ok (unmapped food refused; client names ignored)';
END $a7$;

-- 8. Rate limit: 100 calls per user per day reach the resolver, the 101st
--    does not, even with a valid key.
DO $a8$
DECLARE k uuid; u uuid;
BEGIN
  SELECT uid INTO u FROM fx WHERE fx.n = 3;
  INSERT INTO public.chain_network_contribution_quota (user_id, day, calls)
  VALUES (u, (now() AT TIME ZONE 'utc')::date, 98)
  ON CONFLICT (user_id, day) DO UPDATE SET calls = 98;
  ASSERT pg_temp.net_call(3, pg_temp.net_attempt(3, (SELECT f_tgt FROM fx WHERE fx.n = 3))), 'call 99 refused';
  ASSERT pg_temp.net_call(3, pg_temp.net_attempt(3, (SELECT f_tgt FROM fx WHERE fx.n = 3))), 'call 100 refused';
  k := pg_temp.net_attempt(3, (SELECT f_tgt FROM fx WHERE fx.n = 3));
  ASSERT pg_temp.net_call(3, k) = false, 'call 101 was accepted';
  ASSERT NOT EXISTS (SELECT 1 FROM public.chain_network_contributions WHERE contribution_key = k),
    'the over-limit call was recorded';
  -- Another user is unaffected.
  ASSERT pg_temp.net_call(4, pg_temp.net_attempt(4, (SELECT f_tgt FROM fx WHERE fx.n = 4))), 'the limit leaked across users';
  RAISE NOTICE 'assertion 8 ok (rate limit 100/day per user)';
END $a8$;

-- 9. An opted-out user is still a no-op, with a valid key.
DO $a9$
DECLARE k uuid; u uuid;
BEGIN
  SELECT uid INTO u FROM fx WHERE fx.n = 2;
  INSERT INTO public.picky_win_preferences (user_id, share_chain_outcomes) VALUES (u, false)
  ON CONFLICT (user_id) DO UPDATE SET share_chain_outcomes = false;
  k := pg_temp.net_attempt(2, (SELECT f_tgt FROM fx WHERE fx.n = 2));
  ASSERT pg_temp.net_call(2, k) = false, 'an opted-out user contributed';
  ASSERT NOT EXISTS (SELECT 1 FROM public.chain_network_contributions WHERE contribution_key = k),
    'the opted-out contribution was recorded';
  RAISE NOTICE 'assertion 9 ok (opt-out no-op)';
END $a9$;

-- 10. The ladder path: a mastered row's key is accepted, an active one is not.
DO $a10$
DECLARE r fx; l_m uuid := gen_random_uuid(); l_a uuid := gen_random_uuid(); fb uuid := gen_random_uuid();
BEGIN
  SELECT * INTO r FROM fx WHERE fx.n = 5;
  INSERT INTO public.foods (id, user_id, household_id, name, category, canonical_id)
    VALUES (fb, r.uid, r.hh, 'Zz Net Pear', 'fruit', NULL);
  INSERT INTO public.kid_food_ladder (id, kid_id, food_id, status, paired_safe_food_id, next_due_on)
    VALUES (l_m, r.kid, r.f_tgt, 'mastered', r.f_src, NULL),
           (l_a, r.kid, fb, 'active', r.f_src, NULL);
  ASSERT pg_temp.net_call(5, public.chain_network_key('ladder:' || l_m::text)), 'mastered ladder key refused';
  ASSERT pg_temp.net_call(5, public.chain_network_key('ladder:' || l_a::text)) = false, 'active ladder key accepted';
  RAISE NOTICE 'assertion 10 ok (ladder keys)';
END $a10$;

-- 11. fetch returns only rows over the floor: a pre-migration style row with
--     a large total and no hashed contributors stays hidden.
DO $a11$
DECLARE n int; bad int;
BEGIN
  INSERT INTO public.chain_network_aggregates
    (source_food_key, target_food_key, pickiness_bucket, success_count, total_count)
  VALUES ('zz net apple', 'zz legacy plum', 'low', 50, 50);
  ASSERT (SELECT distinct_contributors FROM public.chain_network_aggregates
           WHERE target_food_key = 'zz legacy plum') = 1, 'legacy default is not 1';
  SELECT count(*), count(*) FILTER (WHERE k <> 'zz net pear')
    INTO n, bad FROM pg_temp.net_fetch(6, 'Zz Net Apple') AS t(k text, c int);
  ASSERT n = 1 AND bad = 0, format('fetch returned %s rows, %s under the floor', n, bad);
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.chain_network_aggregates a
    WHERE a.source_food_key = 'zz net apple' AND a.distinct_contributors < 5
      AND a.target_food_key IN (SELECT k FROM pg_temp.net_fetch(6, 'Zz Net Apple') AS t(k text, c int))),
    'a row under the floor came back';
  RAISE NOTICE 'assertion 11 ok (only floor-passing rows are returned)';
END $a11$;

ROLLBACK;
