-- US-871: a child's badges live in the database, are shared with the second
-- parent, and cannot be earned twice.
--
-- The repo-side guard is src/lib/badgeDurability.test.ts, which reads the
-- Swift. That cannot see the database, and the claims worth proving here are
-- all database claims: that the RLS derivation actually lets a household
-- partner read a badge (AC1's "invisible to a second parent"), that the
-- unique index really is the idempotency key the offline replay leans on, and
-- that an earn is append-only. If any of those were wrong, the Swift would
-- fail at runtime having looked correct through review -- which is what
-- happened to US-609's premises until they were measured.
--
-- HOW TO RUN: `bash scripts/dev/local-sql-suite.sh` builds a throwaway
-- Postgres from the whole migration history and runs every
-- supabase/tests/*.test.sql. Never against production.
--
-- Every check prints EXPECTED alongside the value.

\set ON_ERROR_STOP on

DO $$
DECLARE
  owner_id    UUID := gen_random_uuid();
  partner_id  UUID := gen_random_uuid();
  outsider_id UUID := gen_random_uuid();
  hh_owner    UUID;
  kid         UUID := gen_random_uuid();
  seen        INTEGER;
  refused     BOOLEAN;
  rls_on      BOOLEAN;
  has_update  BOOLEAN;
  stored_at   TIMESTAMPTZ;
BEGIN
  -- Torn down first so a re-run behaves like a first run. Deleting the auth
  -- users cascades through their memberships and households, and the kid goes
  -- with the household.
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'us871-%@example.test');
  DELETE FROM auth.users WHERE email LIKE 'us871-%@example.test';

  -- Inserting an auth user fires handle_new_user -> ensure_user_household, so
  -- each of these already has a household and a membership. Creating a second
  -- one by hand is what made the US-840 fixture flaky.
  INSERT INTO auth.users (id, email) VALUES
    (owner_id,    'us871-owner@example.test'),
    (partner_id,  'us871-partner@example.test'),
    (outsider_id, 'us871-outsider@example.test');

  SELECT household_id INTO hh_owner
    FROM public.household_members WHERE user_id = owner_id LIMIT 1;

  -- The partner joins the owner's household, the way an accepted invite does.
  UPDATE public.household_members SET household_id = hh_owner WHERE user_id = partner_id;

  -- Seeded as the table owner, which bypasses RLS on purpose: the fixture is
  -- state, not the thing under test.
  INSERT INTO public.kids (id, user_id, household_id, name)
    VALUES (kid, owner_id, hh_owner, 'Robin');

  -- -------------------------------------------------------------------------
  -- 1. The table exists with RLS on.
  -- -------------------------------------------------------------------------
  SELECT c.relrowsecurity INTO rls_on
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'kid_badges';
  RAISE NOTICE '1. kid_badges RLS enabled = %  EXPECTED true', rls_on;
  ASSERT rls_on IS TRUE, 'kid_badges is missing or has RLS disabled';

  -- ------------------------------------------------------------- the cases --
  SET LOCAL ROLE authenticated;

  RAISE NOTICE '2. the owner earns a badge and reads it back';
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  INSERT INTO public.kid_badges (kid_id, badge_id, earned_at)
    VALUES (kid, 'first_bite', TIMESTAMPTZ '2026-03-01 18:00:00+00');
  SELECT count(*) INTO seen FROM public.kid_badges WHERE kid_id = kid;
  RAISE NOTICE '   badges = %  EXPECTED 1', seen;
  ASSERT seen = 1, 'the kid''s owner cannot read a badge they just wrote';

  RAISE NOTICE '3. earned_at is the date the child earned it, not the insert time';
  SELECT earned_at INTO stored_at FROM public.kid_badges WHERE kid_id = kid;
  RAISE NOTICE '   earned_at = %  EXPECTED 2026-03-01 18:00:00+00', stored_at;
  ASSERT stored_at = TIMESTAMPTZ '2026-03-01 18:00:00+00',
    'a supplied earned_at was overwritten -- a badge earned offline and synced later loses its real date';

  RAISE NOTICE '4. the PARTNER in the same household sees it too (AC1)';
  PERFORM set_config('request.jwt.claim.sub', partner_id::text, true);
  SELECT count(*) INTO seen FROM public.kid_badges WHERE kid_id = kid;
  RAISE NOTICE '   badges = %  EXPECTED 1 (0 while badges lived in UserDefaults)', seen;
  ASSERT seen = 1, 'US-871: the second parent opens the badge grid and it is empty';

  RAISE NOTICE '5. a user in ANOTHER household sees nothing';
  PERFORM set_config('request.jwt.claim.sub', outsider_id::text, true);
  SELECT count(*) INTO seen FROM public.kid_badges WHERE kid_id = kid;
  RAISE NOTICE '   badges = %  EXPECTED 0', seen;
  ASSERT seen = 0, 'another household can read this child''s badges';

  RAISE NOTICE '6. the same badge cannot be earned twice';
  -- This is the idempotency key the offline replay leans on: a queued earn
  -- that already landed from the other parent's phone comes back as a
  -- unique_violation, which the executor reads as "already there" rather than
  -- retrying forever.
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  refused := false;
  BEGIN
    INSERT INTO public.kid_badges (kid_id, badge_id) VALUES (kid, 'first_bite');
  EXCEPTION WHEN unique_violation THEN
    refused := true;
  END;
  RAISE NOTICE '   duplicate refused = %  EXPECTED true', refused;
  ASSERT refused, 'a duplicate (kid_id, badge_id) was stored -- the dedupe key does not hold';

  SELECT count(*) INTO seen FROM public.kid_badges WHERE kid_id = kid;
  RAISE NOTICE '   badges after the duplicate = %  EXPECTED 1', seen;
  ASSERT seen = 1, 'the duplicate landed anyway';

  RAISE NOTICE '7. an earn is append-only: no UPDATE policy exists';
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'kid_badges'
       AND cmd IN ('UPDATE', 'ALL')
  ) INTO has_update;
  RAISE NOTICE '   update policy present = %  EXPECTED false', has_update;
  ASSERT has_update IS FALSE,
    'kid_badges gained an UPDATE policy -- there is nothing about "earned this on this day" a later write should revise';

  RAISE NOTICE '8. ... and RLS therefore denies the update itself';
  seen := 0;
  UPDATE public.kid_badges SET badge_id = 'rewritten' WHERE kid_id = kid;
  GET DIAGNOSTICS seen = ROW_COUNT;
  RAISE NOTICE '   rows updated = %  EXPECTED 0', seen;
  ASSERT seen = 0, 'an earned badge could be rewritten';

  RAISE NOTICE '9. the partner can add a badge, not just read one';
  PERFORM set_config('request.jwt.claim.sub', partner_id::text, true);
  INSERT INTO public.kid_badges (kid_id, badge_id) VALUES (kid, 'week_streak');
  SELECT count(*) INTO seen FROM public.kid_badges WHERE kid_id = kid;
  RAISE NOTICE '   badges = %  EXPECTED 2', seen;
  ASSERT seen = 2, 'the household partner could not record a badge';

  RAISE NOTICE '10. the outsider cannot write into this household''s badges';
  PERFORM set_config('request.jwt.claim.sub', outsider_id::text, true);
  refused := false;
  BEGIN
    INSERT INTO public.kid_badges (kid_id, badge_id) VALUES (kid, 'sabotage');
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  RAISE NOTICE '   refused = %  EXPECTED true', refused;
  ASSERT refused, 'another household could write a badge onto this child';

  RESET ROLE;

  RAISE NOTICE '11. deleting the child takes their badges with them';
  DELETE FROM public.kids WHERE id = kid;
  SELECT count(*) INTO seen FROM public.kid_badges WHERE kid_id = kid;
  RAISE NOTICE '   orphaned badges = %  EXPECTED 0', seen;
  ASSERT seen = 0, 'badges outlived the child they belonged to';

  RAISE NOTICE 'US-871 kid_badges: all assertions passed';
END $$;
