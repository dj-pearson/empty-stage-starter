-- queue_email is server-only and escapes HTML; contribute_chain_network honours
-- the sharing opt-out (20260928000008).
--
-- Privileges are asserted with has_function_privilege, not by reading the
-- migration for REVOKE (see us804_function_privileges.test.sql for why).
--
-- Run: bash scripts/dev/local-sql-suite.sh

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

BEGIN;

-- 1. queue_email: no client role may execute it; service_role still can.
DO $a1$
DECLARE fn TEXT := 'public.queue_email(uuid, text, text, jsonb, integer, integer)';
BEGIN
  ASSERT NOT has_function_privilege('anon', fn, 'EXECUTE'), 'anon can execute queue_email';
  ASSERT NOT has_function_privilege('authenticated', fn, 'EXECUTE'), 'authenticated can execute queue_email';
  ASSERT has_function_privilege('service_role', fn, 'EXECUTE'), 'service_role lost EXECUTE on queue_email';
  ASSERT NOT has_function_privilege('anon', 'public.html_escape_text(text)', 'EXECUTE'),
    'anon can execute html_escape_text';
  ASSERT NOT has_function_privilege('authenticated', 'public.html_escape_text(text)', 'EXECUTE'),
    'authenticated can execute html_escape_text';
  RAISE NOTICE 'assertion 1 ok (queue_email: service_role only)';
END $a1$;

-- 2. And the refusal is what a signed-in client actually gets.
DO $a2$
DECLARE u uuid := '92800008-0000-0000-0000-0000000000e1'; refused boolean := false;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'queue-email-client@example.test');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  BEGIN
    PERFORM public.queue_email(u, 'welcome', 'victim@example.test', '{}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  ASSERT refused, 'authenticated called queue_email without a 42501';
  RAISE NOTICE 'assertion 2 ok (authenticated gets 42501)';
END $a2$;

-- 3. The escape helper covers all five characters, & first.
DO $a3$
BEGIN
  ASSERT public.html_escape_text($s$<a href="x" title='y'>&amp;</a>$s$)
       = '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;amp;&lt;/a&gt;',
    format('html_escape_text gave %s', public.html_escape_text($s$<a href="x" title='y'>&amp;</a>$s$));
  ASSERT public.html_escape_text('plain text') = 'plain text', 'plain text changed';
  ASSERT public.html_escape_text(NULL) IS NULL, 'NULL in should be NULL out';
  RAISE NOTICE 'assertion 3 ok (html_escape_text)';
END $a3$;

-- 4. queue_email escapes into html_body only; subject and text stay raw; a
--    null variable does not null the body. Called as service_role, as the
--    edge functions do.
DO $a4$
DECLARE
  u uuid := '92800008-0000-0000-0000-0000000000e2';
  v_id uuid;
  r record;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'queue-email-escape@example.test');
  INSERT INTO public.automation_email_templates
    (template_key, template_name, subject, html_body, text_body, category)
  VALUES
    ('t_escape_test', 'escape test', 'Hi {{name}}',
     '<p>Hi {{name}}</p><a href="{{url}}">go</a><p>{{missing}}</p>',
     'Hi {{name}} {{url}}', 'transactional');

  SET LOCAL ROLE service_role;
  v_id := public.queue_email(
    u, 't_escape_test', 'queue-email-escape@example.test',
    jsonb_build_object(
      'name', '<script>alert(1)</script> & "Bob''s"',
      'url', 'https://x.test/?a=1&b="2"',
      'missing', NULL
    ));
  RESET ROLE;

  SELECT subject, html_body, text_body INTO r FROM public.automation_email_queue WHERE id = v_id;
  ASSERT FOUND, 'queue_email inserted nothing';
  ASSERT r.html_body =
    '<p>Hi &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Bob&#39;s&quot;</p>'
    || '<a href="https://x.test/?a=1&amp;b=&quot;2&quot;">go</a><p></p>',
    format('html_body was %s', r.html_body);
  ASSERT r.subject = 'Hi <script>alert(1)</script> & "Bob''s"', format('subject was %s', r.subject);
  ASSERT r.text_body = 'Hi <script>alert(1)</script> & "Bob''s" https://x.test/?a=1&b="2"',
    format('text_body was %s', r.text_body);
  RAISE NOTICE 'assertion 4 ok (html escaped, subject/text raw, null var -> empty)';
END $a4$;

-- 5. contribute_chain_network: anon still cannot call it, authenticated can.
DO $a5$
DECLARE fn TEXT := 'public.contribute_chain_network(uuid, text, text, text, text)';
BEGIN
  ASSERT NOT has_function_privilege('anon', fn, 'EXECUTE'), 'anon can execute contribute_chain_network';
  ASSERT has_function_privilege('authenticated', fn, 'EXECUTE'),
    'authenticated lost EXECUTE on contribute_chain_network (shipped web clients call it)';
  ASSERT (SELECT 'search_path=public, pg_temp' = ANY(proconfig) FROM pg_proc
           WHERE oid = fn::regprocedure), 'contribute_chain_network search_path not pinned';
  ASSERT (SELECT 'search_path=public, pg_temp' = ANY(proconfig) FROM pg_proc
           WHERE oid = 'public.queue_email(uuid, text, text, jsonb, integer, integer)'::regprocedure),
    'queue_email search_path not pinned';
  RAISE NOTICE 'assertion 5 ok (contribute_chain_network privileges, search_path pinned)';
END $a5$;

-- 6. Consent, as each kind of caller.
--    Since 20260928000010 a contribution must reference one of the caller's
--    own attempts and catalog-mapped foods, and its key is the web client's
--    deterministicUuid('<attempt>:<source food>') (public.chain_network_key),
--    so each caller gets a household fixture. See chain_network_privacy.test.sql
--    for the rest of that contract.
DO $a6$
DECLARE
  u_out  uuid := '92800008-0000-0000-0000-0000000000c1';  -- share_chain_outcomes = false
  u_in   uuid := '92800008-0000-0000-0000-0000000000c2';  -- share_chain_outcomes = true
  u_none uuid := '92800008-0000-0000-0000-0000000000c3';  -- no row
  c_src  uuid := '92800008-0000-0000-0000-00000000cc01';
  c_tgt  uuid := '92800008-0000-0000-0000-00000000cc02';
  u uuid; h uuid; kid uuid; fs uuid; ft uuid; att uuid;
  k_out uuid; k_in uuid; k_none uuid; k_anon uuid; k_late uuid;
  ok boolean;
  n int;
  agg int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (u_out, 'chain-out@example.test'), (u_in, 'chain-in@example.test'), (u_none, 'chain-none@example.test');
  INSERT INTO public.picky_win_preferences (user_id, share_chain_outcomes) VALUES
    (u_out, false), (u_in, true);
  INSERT INTO public.grocery_product_catalog (id, name, name_normalized, kind, verification, source)
  VALUES (c_src, 'Zz Consent Apple', 'zz consent apple', 'generic', 'verified', 'admin'),
         (c_tgt, 'Zz Consent Pear',  'zz consent pear',  'generic', 'verified', 'admin');

  -- One kid, one source->target chain and one success attempt per user; the
  -- key is what the web client would send for that attempt.
  FOREACH u IN ARRAY ARRAY[u_out, u_in, u_none] LOOP
    SELECT household_id INTO h FROM public.household_members WHERE user_id = u;
    kid := gen_random_uuid(); fs := gen_random_uuid(); ft := gen_random_uuid();
    INSERT INTO public.kids (id, user_id, household_id, name) VALUES (kid, u, h, 'Consent kid');
    INSERT INTO public.foods (id, user_id, household_id, name, category, canonical_id) VALUES
      (fs, u, h, 'Apple', 'fruit', c_src), (ft, u, h, 'Pear', 'fruit', c_tgt);
    INSERT INTO public.food_chain_suggestions (source_food_id, target_food_id) VALUES (fs, ft);
    att := gen_random_uuid();
    INSERT INTO public.food_attempts (id, kid_id, food_id, outcome) VALUES (att, kid, ft, 'success');
    IF u = u_out THEN k_out := public.chain_network_key(att::text || ':' || fs::text);
    ELSIF u = u_in THEN
      k_in := public.chain_network_key(att::text || ':' || fs::text);
      att := gen_random_uuid();
      INSERT INTO public.food_attempts (id, kid_id, food_id, outcome) VALUES (att, kid, ft, 'success');
      k_late := public.chain_network_key(att::text || ':' || fs::text);
    ELSE
      k_none := public.chain_network_key(att::text || ':' || fs::text);
      att := gen_random_uuid();
      INSERT INTO public.food_attempts (id, kid_id, food_id, outcome) VALUES (att, kid, ft, 'success');
      k_anon := public.chain_network_key(att::text || ':' || fs::text);
    END IF;
  END LOOP;

  -- Opted out: returns false, no contribution row, no aggregate change.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_out::text, true);
  ok := public.contribute_chain_network(k_out, 'Zz Consent Apple', 'Zz Consent Pear', 'low', 'success');
  RESET ROLE;
  ASSERT ok = false, 'an opted-out user''s contribution returned true';
  SELECT count(*) INTO n FROM public.chain_network_contributions WHERE contribution_key = k_out;
  ASSERT n = 0, 'an opted-out user''s contribution was recorded';
  SELECT count(*) INTO agg FROM public.chain_network_aggregates
   WHERE source_food_key = 'zz consent apple' AND target_food_key = 'zz consent pear';
  ASSERT agg = 0, 'an opted-out user''s contribution reached the aggregate';

  -- Opted in: recorded.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_in::text, true);
  ok := public.contribute_chain_network(k_in, 'Zz Consent Apple', 'Zz Consent Pear', 'low', 'success');
  RESET ROLE;
  ASSERT ok = true, 'an opted-in user''s contribution returned false';
  SELECT count(*) INTO n FROM public.chain_network_contributions WHERE contribution_key = k_in;
  ASSERT n = 1, 'an opted-in user''s contribution was not recorded';

  -- No row: the column default, opted in.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_none::text, true);
  ok := public.contribute_chain_network(k_none, 'Zz Consent Apple', 'Zz Consent Pear', 'low', 'partial');
  RESET ROLE;
  ASSERT ok = true, 'a user with no preference row was treated as opted out';
  SELECT count(*) INTO n FROM public.chain_network_contributions WHERE contribution_key = k_none;
  ASSERT n = 1, 'a user with no preference row contributed nothing';

  SELECT total_count INTO agg FROM public.chain_network_aggregates
   WHERE source_food_key = 'zz consent apple' AND target_food_key = 'zz consent pear' AND pickiness_bucket = 'low';
  ASSERT agg = 2, format('aggregate total is %s, expected 2 (in + no-row, not out)', agg);

  -- Flipping the opt-out later stops further contributions from that user.
  UPDATE public.picky_win_preferences SET share_chain_outcomes = false WHERE user_id = u_in;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', u_in::text, true);
  ok := public.contribute_chain_network(k_late, 'Zz Consent Apple', 'Zz Consent Pear', 'low', 'success');
  RESET ROLE;
  ASSERT ok = false, 'a user who opted out after contributing can still contribute';

  -- No end user (no JWT sub): nobody's consent to check, so nothing recorded.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  ok := public.contribute_chain_network(k_anon, 'Zz Consent Apple', 'Zz Consent Pear', 'low', 'success');
  ASSERT ok = false, 'a call with no auth.uid() contributed';
  SELECT count(*) INTO n FROM public.chain_network_contributions WHERE contribution_key = k_anon;
  ASSERT n = 0, 'a call with no auth.uid() was recorded';

  RAISE NOTICE 'assertion 6 ok (opt-out no-op, opt-in and no-row contribute, null uid no-op)';
END $a6$;

ROLLBACK;
