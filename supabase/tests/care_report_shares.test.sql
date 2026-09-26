-- Care report share links (20260930000001).
--
-- What this proves, all of it about the database rather than the page:
--   * anon cannot touch care_report_shares, and can call
--     get_shared_care_report (US-804: asserted with has_function_privilege);
--   * household members list and create links for their own children; another
--     household cannot see them or mint one for a child it does not have;
--   * a client cannot choose the token, backdate the link, stretch the expiry
--     past 90 days, or touch the view counters;
--   * the public read returns the snapshot and its dates, nothing else, and
--     counts each view;
--   * revoked and expired links return nothing, and a revoke is one-way.
--
-- HOW TO RUN: bash scripts/dev/local-sql-suite.sh. Never against production.

\set ON_ERROR_STOP on

DO $$
DECLARE
  owner_id    UUID := gen_random_uuid();
  partner_id  UUID := gen_random_uuid();
  outsider_id UUID := gen_random_uuid();
  hh_owner    UUID;
  hh_outsider UUID;
  kid         UUID := gen_random_uuid();
  kid_other   UUID := gen_random_uuid();
  share_id    UUID;
  share_token TEXT;
  second_tok  TEXT;
  seen        INTEGER;
  refused     BOOLEAN;
  rls_on      BOOLEAN;
  got_report  JSONB;
  got_expires TIMESTAMPTZ;
  result_cols TEXT;
  snapshot    JSONB := '{"version":1,"kidFirstName":"Robin","from":"2026-09-01","to":"2026-09-30"}';
BEGIN
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'care-shares-%@example.test');
  DELETE FROM auth.users WHERE email LIKE 'care-shares-%@example.test';

  INSERT INTO auth.users (id, email) VALUES
    (owner_id,    'care-shares-owner@example.test'),
    (partner_id,  'care-shares-partner@example.test'),
    (outsider_id, 'care-shares-outsider@example.test');

  SELECT household_id INTO hh_owner FROM public.household_members WHERE user_id = owner_id LIMIT 1;
  SELECT household_id INTO hh_outsider FROM public.household_members WHERE user_id = outsider_id LIMIT 1;
  UPDATE public.household_members SET household_id = hh_owner WHERE user_id = partner_id;

  INSERT INTO public.kids (id, user_id, household_id, name) VALUES
    (kid, owner_id, hh_owner, 'Robin Example'),
    (kid_other, outsider_id, hh_outsider, 'Other Kid');

  -- 1. RLS on.
  SELECT c.relrowsecurity INTO rls_on
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'care_report_shares';
  ASSERT rls_on IS TRUE, 'care_report_shares is missing or has RLS disabled';
  RAISE NOTICE '1. care_report_shares RLS enabled';

  -- 2. US-804: the public read is callable by anon and authenticated.
  ASSERT has_function_privilege('anon', 'public.get_shared_care_report(text)', 'EXECUTE'),
    'anon cannot execute get_shared_care_report; a signed-out clinician sees nothing';
  ASSERT has_function_privilege('authenticated', 'public.get_shared_care_report(text)', 'EXECUTE'),
    'authenticated cannot execute get_shared_care_report';
  RAISE NOTICE '2. get_shared_care_report callable by anon and authenticated';

  -- 3. The result carries the snapshot and dates, no private column.
  SELECT pg_get_function_result('public.get_shared_care_report(text)'::regprocedure) INTO result_cols;
  RAISE NOTICE '3. result columns: %', result_cols;
  ASSERT result_cols !~* '(household|user|kid|label|created_by|token|view)',
    'get_shared_care_report returns a private column: ' || result_cols;

  SET LOCAL ROLE authenticated;

  -- 4. The owner creates a link; the database mints the token and zeroes the counters.
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  INSERT INTO public.care_report_shares (household_id, kid_id, label, report, consent_version, expires_at)
    VALUES (hh_owner, kid, 'Dr. Lee', snapshot, 'v1', now() + interval '30 days')
    RETURNING id, token INTO share_id, share_token;
  ASSERT char_length(share_token) = 64, 'token was not minted by the database';
  RAISE NOTICE '4. link created, token length 64';

  -- 4b. A client token, a backdated created_at or preset counters never land.
  --     Supabase refuses on the column grant; under a blanket grant the
  --     trigger overwrites them. Either is a pass.
  second_tok := NULL;
  BEGIN
    INSERT INTO public.care_report_shares
      (household_id, kid_id, report, consent_version, expires_at, token, view_count, created_at)
      VALUES (hh_owner, kid, snapshot, 'v1', now() + interval '1 day', repeat('b', 64), 99, now() - interval '1 year')
      RETURNING token INTO second_tok;
  EXCEPTION WHEN insufficient_privilege THEN
    second_tok := NULL;
  END;
  ASSERT second_tok IS DISTINCT FROM repeat('b', 64), 'a client chose its own token';
  IF second_tok IS NOT NULL THEN
    SELECT view_count INTO seen FROM public.care_report_shares WHERE token = second_tok;
    ASSERT seen = 0, 'a client preset the view counter';
    SELECT count(*) INTO seen FROM public.care_report_shares
     WHERE token = second_tok AND created_at < now() - interval '1 day';
    ASSERT seen = 0, 'a client backdated a link';
  END IF;
  RAISE NOTICE '4b. client token, counters and created_at ignored';

  -- 4c. Expiry is capped at 90 days, and must be in the future.
  refused := false;
  BEGIN
    INSERT INTO public.care_report_shares (household_id, kid_id, report, consent_version, expires_at)
      VALUES (hh_owner, kid, snapshot, 'v1', now() + interval '91 days');
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  ASSERT refused, 'a link was made to last longer than 90 days';
  refused := false;
  BEGIN
    INSERT INTO public.care_report_shares (household_id, kid_id, report, consent_version, expires_at)
      VALUES (hh_owner, kid, snapshot, 'v1', now() - interval '1 minute');
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  ASSERT refused, 'a link was made already expired';
  RAISE NOTICE '4c. expiry past 90 days or in the past refused';

  -- 4d. No consent version, no link.
  refused := false;
  BEGIN
    INSERT INTO public.care_report_shares (household_id, kid_id, report, consent_version, expires_at)
      VALUES (hh_owner, kid, snapshot, '', now() + interval '1 day');
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  ASSERT refused, 'a link was made without a consent version';
  RAISE NOTICE '4d. empty consent version refused';

  -- 4e. The snapshot, expiry and counters cannot be edited after the fact.
  refused := false;
  BEGIN
    UPDATE public.care_report_shares SET report = '{"version":1}' WHERE id = share_id;
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  ASSERT refused, 'a shared snapshot was rewritten';
  refused := false;
  BEGIN
    UPDATE public.care_report_shares SET expires_at = expires_at + interval '1 day' WHERE id = share_id;
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  ASSERT refused, 'a link''s expiry was extended';
  refused := false;
  BEGIN
    UPDATE public.care_report_shares SET view_count = 0 WHERE id = share_id;
    -- 0 -> 0 is no change; push it somewhere real.
    UPDATE public.care_report_shares SET view_count = 500 WHERE id = share_id;
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  ASSERT refused, 'a client wrote the view counter';
  RAISE NOTICE '4e. snapshot, expiry and view counter are read-only to members';

  -- 4f. No DELETE: a link is revoked, not erased.
  BEGIN
    DELETE FROM public.care_report_shares WHERE id = share_id;
    GET DIAGNOSTICS seen = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    seen := 0;
  END;
  ASSERT seen = 0, 'a household member deleted a share row';
  RAISE NOTICE '4f. delete refused';

  -- 5. The partner sees it; an outsider does not.
  PERFORM set_config('request.jwt.claim.sub', partner_id::text, true);
  SELECT count(*) INTO seen FROM public.care_report_shares WHERE id = share_id;
  ASSERT seen = 1, 'the other parent cannot see the household''s share link';
  PERFORM set_config('request.jwt.claim.sub', outsider_id::text, true);
  SELECT count(*) INTO seen FROM public.care_report_shares WHERE id = share_id;
  ASSERT seen = 0, 'another household can list this household''s care report links';
  RAISE NOTICE '5. partner sees the link, outsider does not';

  -- 6. An outsider cannot share this household's child, under either household.
  refused := false;
  BEGIN
    INSERT INTO public.care_report_shares (household_id, kid_id, report, consent_version, expires_at)
      VALUES (hh_outsider, kid, snapshot, 'v1', now() + interval '1 day');
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  ASSERT refused, 'an outsider shared a report for a child in another household';
  refused := false;
  BEGIN
    INSERT INTO public.care_report_shares (household_id, kid_id, report, consent_version, expires_at)
      VALUES (hh_owner, kid, snapshot, 'v1', now() + interval '1 day');
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  ASSERT refused, 'an outsider wrote a link into another household';
  -- And the owner cannot share the outsider's child under their own household.
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  refused := false;
  BEGIN
    INSERT INTO public.care_report_shares (household_id, kid_id, report, consent_version, expires_at)
      VALUES (hh_owner, kid_other, snapshot, 'v1', now() + interval '1 day');
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  ASSERT refused, 'a member shared another household''s child';
  RAISE NOTICE '6. cross-household shares refused';

  RESET ROLE;
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- 7. anon reading the table directly gets nothing.
  refused := false;
  BEGIN
    SELECT count(*) INTO seen FROM public.care_report_shares;
    refused := seen = 0;
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  ASSERT refused, 'anon can read care_report_shares directly';
  RAISE NOTICE '7. anon direct read empty or refused';

  -- 8. anon reads the snapshot through the function, and each read is counted.
  SELECT g.report, g.expires_at INTO got_report, got_expires FROM public.get_shared_care_report(share_token) g;
  ASSERT got_report = snapshot, 'the shared snapshot did not come back unchanged';
  ASSERT got_expires > now() + interval '29 days', 'the expiry did not come back';
  PERFORM * FROM public.get_shared_care_report(share_token);
  RESET ROLE;
  SELECT view_count INTO seen FROM public.care_report_shares WHERE id = share_id;
  ASSERT seen = 2, 'views were not counted: ' || seen;
  RAISE NOTICE '8. snapshot returned, 2 views counted';

  -- 9. Unknown, malformed and null tokens return nothing.
  SET LOCAL ROLE anon;
  SELECT count(*) INTO seen FROM public.get_shared_care_report(repeat('a', 64));
  ASSERT seen = 0, 'an unknown token returned a report';
  SELECT count(*) INTO seen FROM public.get_shared_care_report('short');
  ASSERT seen = 0, 'a malformed token returned a report';
  SELECT count(*) INTO seen FROM public.get_shared_care_report(NULL);
  ASSERT seen = 0, 'a null token returned a report';
  RAISE NOTICE '9. unknown, short and null tokens return nothing';

  -- 10. An expired link returns nothing. Expiry cannot be set in the past
  --     through the table, so age the row as the owner of the table would.
  RESET ROLE;
  ALTER TABLE public.care_report_shares DISABLE TRIGGER care_report_shares_before_update;
  ALTER TABLE public.care_report_shares DROP CONSTRAINT care_report_shares_expiry_window;
  INSERT INTO public.care_report_shares (household_id, kid_id, report, consent_version, expires_at)
    VALUES (hh_owner, kid, snapshot, 'v1', now() + interval '1 day')
    RETURNING token INTO second_tok;
  UPDATE public.care_report_shares SET expires_at = now() - interval '1 second' WHERE token = second_tok;
  ALTER TABLE public.care_report_shares ENABLE TRIGGER care_report_shares_before_update;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO seen FROM public.get_shared_care_report(second_tok);
  ASSERT seen = 0, 'an expired link still shows the report';
  RESET ROLE;
  SELECT view_count INTO seen FROM public.care_report_shares WHERE token = second_tok;
  ASSERT seen = 0, 'an expired read was counted';
  RAISE NOTICE '10. expired link returns nothing and counts nothing';

  -- 11. The partner revokes; the link goes dark and stays dark.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', partner_id::text, true);
  UPDATE public.care_report_shares SET revoked_at = now() WHERE id = share_id;
  GET DIAGNOSTICS seen = ROW_COUNT;
  ASSERT seen = 1, 'a household member could not revoke the link';
  UPDATE public.care_report_shares SET revoked_at = NULL WHERE id = share_id;
  GET DIAGNOSTICS seen = ROW_COUNT;
  ASSERT seen = 0, 'a revoked link was switched back on';

  RESET ROLE;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO seen FROM public.get_shared_care_report(share_token);
  ASSERT seen = 0, 'a revoked link still shows the report';
  RAISE NOTICE '11. revoke is one-way and the link goes dark';

  -- 12. Removing the child takes the links with it.
  RESET ROLE;
  DELETE FROM public.kids WHERE id = kid;
  SELECT count(*) INTO seen FROM public.care_report_shares WHERE kid_id = kid;
  ASSERT seen = 0, 'share links outlived the child they describe';
  RAISE NOTICE '12. links cascade with the child';

  -- The harness rebuilds from scratch, but put the constraint back so a
  -- suite that runs after this one sees the real table.
  DELETE FROM public.care_report_shares WHERE expires_at <= now();
  ALTER TABLE public.care_report_shares ADD CONSTRAINT care_report_shares_expiry_window CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '90 days'
  );

  DELETE FROM public.kids WHERE id = kid_other;
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'care-shares-%@example.test');
  DELETE FROM auth.users WHERE email LIKE 'care-shares-%@example.test';
  RAISE NOTICE 'care_report_shares: all assertions passed';
END
$$;
