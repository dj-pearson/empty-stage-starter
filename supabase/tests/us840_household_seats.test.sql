-- US-840: household seats are gated by the household owner's plan.
--
-- Run against a real Postgres, not a mock. Every case prints the EXPECTED
-- value beside the measured one so a reader can check the assertion without
-- reconstructing the setup, and every case fails the file rather than printing
-- a warning (ON_ERROR_STOP in the CI step; the ASSERTs raise).
--
-- Prerequisite: us840_household_seats.bootstrap.sql, then the migration
-- supabase/migrations/20260909000000_household_seat_limit.sql.

\set ON_ERROR_STOP on

DO $$
DECLARE
  owner_free   UUID := gen_random_uuid();
  owner_family UUID := gen_random_uuid();
  owner_apple  UUID := gen_random_uuid();
  joiner_a     UUID := gen_random_uuid();
  joiner_b     UUID := gen_random_uuid();
  late_joiner  UUID := gen_random_uuid();
  hh_free      UUID;
  hh_family    UUID;
  hh_apple     UUID;
  free_plan    UUID;
  family_plan  UUID;
  code         TEXT;
  got_limit    INTEGER;
  got_owner    UUID;
  seats        INTEGER;
  failed       BOOLEAN;
  msg          TEXT;
BEGIN
  SELECT id INTO free_plan   FROM public.subscription_plans WHERE name = 'Free';
  SELECT id INTO family_plan FROM public.subscription_plans WHERE name = 'Family Plus';

  -- US-800: torn down first, so a re-run behaves like a first run. Deleting
  -- the auth users cascades to their memberships and the households that have
  -- no members left go with them.
  -- household_members.invited_by references auth.users with no cascade, and
  -- accept_household_invite fills it in, so it has to be released first.
  DELETE FROM public.apple_subscriptions WHERE original_transaction_id = 'us840-original-transaction';
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'us840-%@example.test');
  DELETE FROM auth.users WHERE email LIKE 'us840-%@example.test';

  -- US-800: emails, because every account this suite is about has one.
  -- auth.users.email is nullable and an emailless signup is allowed through
  -- since 20260918000006, but a fixture that omits it tests the wrong shape.
  INSERT INTO auth.users (id, email) VALUES
    (owner_free,   'us840-free@example.test'),
    (owner_family, 'us840-family@example.test'),
    (owner_apple,  'us840-apple@example.test'),
    (joiner_a,     'us840-joiner-a@example.test'),
    (joiner_b,     'us840-joiner-b@example.test');

  -- US-800: THE HOUSEHOLDS BELOW ARE THE ONES THE SIGNUP CHAIN ALREADY MADE.
  -- Inserting an auth user fires handle_new_user -> ensure_user_household,
  -- which gives every account a household and a membership. This fixture used
  -- to create a SECOND household for the same people, and
  -- get_user_household_id does `LIMIT 1` with no ORDER BY -- so
  -- create_household_invite, which resolves the caller's household through it,
  -- minted a code for whichever of the two Postgres happened to return. Case 3
  -- then failed because joiner_b joined the other household: it read 2 seats
  -- and expected 3, which looked like a seat-limit bug and was not one.

  -- ---------------------------------------------------------------- seeding
  RAISE NOTICE '1. the seed puts a limit on the paid-for tiers and not on the others';
  SELECT max_household_members INTO got_limit FROM public.subscription_plans WHERE name = 'Free';
  RAISE NOTICE '   Free max_household_members = %  EXPECTED 1', got_limit;
  ASSERT got_limit = 1, 'Free should allow 1 seat';

  SELECT max_household_members INTO got_limit FROM public.subscription_plans WHERE name = 'Pro';
  RAISE NOTICE '   Pro max_household_members = %  EXPECTED 1', got_limit;
  ASSERT got_limit = 1, 'Pro should allow 1 seat (the agreed table sells sharing on Family Plus)';

  SELECT max_household_members INTO got_limit FROM public.subscription_plans WHERE name = 'Family Plus';
  RAISE NOTICE '   Family Plus max_household_members = %  EXPECTED NULL (unlimited)', got_limit;
  ASSERT got_limit IS NULL, 'Family Plus should be unlimited';

  -- ------------------------------------------------------------ owner lookup
  RAISE NOTICE '2. the household owner is its earliest member, not its newest';
  SELECT household_id INTO hh_family FROM public.household_members WHERE user_id = owner_family;
  ASSERT hh_family IS NOT NULL, 'the signup chain did not give owner_family a household';
  UPDATE public.household_members
     SET joined_at = now() - INTERVAL '10 days'
   WHERE household_id = hh_family AND user_id = owner_family;
  -- joiner_a moves into it, which is what accepting an invite does.
  UPDATE public.household_members
     SET household_id = hh_family, role = 'guardian', joined_at = now()
   WHERE user_id = joiner_a;

  got_owner := public.household_owner_id(hh_family);
  RAISE NOTICE '   owner = %  EXPECTED % (the earlier row)', got_owner, owner_family;
  ASSERT got_owner = owner_family, 'the earliest member owns the household';

  -- ----------------------------------------------------------- paid is unlimited
  RAISE NOTICE '3. a Family Plus household has no seat ceiling';
  INSERT INTO public.user_subscriptions (user_id, plan_id, status)
    VALUES (owner_family, family_plan, 'active');
  got_limit := public.household_seat_limit(hh_family);
  RAISE NOTICE '   seat limit = %  EXPECTED NULL (unlimited)', got_limit;
  ASSERT got_limit IS NULL, 'a Family Plus household should be uncapped';

  PERFORM set_config('request.jwt.claim.sub', joiner_b::text, true);
  PERFORM set_config('request.jwt.claim.sub', owner_family::text, true);
  code := public.create_household_invite('guardian');
  PERFORM set_config('request.jwt.claim.sub', joiner_b::text, true);
  PERFORM public.accept_household_invite(code);
  SELECT COUNT(*) INTO seats FROM public.household_members WHERE household_id = hh_family;
  RAISE NOTICE '   members after a third joins = %  EXPECTED 3', seats;
  ASSERT seats = 3, 'Family Plus should have taken the third member';

  -- ------------------------------------------------------------- free is capped
  RAISE NOTICE '4. a Free household is one seat, and is told why';
  SELECT household_id INTO hh_free FROM public.household_members WHERE user_id = owner_free;
  ASSERT hh_free IS NOT NULL, 'the signup chain did not give owner_free a household';

  got_limit := public.household_seat_limit(hh_free);
  RAISE NOTICE '   seat limit with no entitlement = %  EXPECTED 1 (falls back to the Free row)', got_limit;
  ASSERT got_limit = 1, 'no entitlement should read the Free plan, not a hardcoded number';

  failed := FALSE;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', owner_free::text, true);
    code := public.create_household_invite('guardian');
  EXCEPTION WHEN check_violation THEN
    failed := TRUE;
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
  END;
  RAISE NOTICE '   minting a link on a full Free household raised = %  EXPECTED true', failed;
  RAISE NOTICE '   message: %', msg;
  ASSERT failed, 'a full household should not be able to mint a link';
  ASSERT msg LIKE '%Family Plus%', 'the message should say what to do about it';

  -- ------------------------------------- an outstanding link cannot outlive the plan
  RAISE NOTICE '5. a link minted while paid stops working when the plan does';
  -- Mint on Family Plus, then take the entitlement away before it is redeemed.
  PERFORM set_config('request.jwt.claim.sub', owner_family::text, true);
  code := public.create_household_invite('guardian');
  DELETE FROM public.user_subscriptions WHERE user_id = owner_family;
  -- Free now, and the household already holds 3 members.
  -- A REAL user, inserted into auth.users first. The first version of this
  -- case impersonated a random uuid and caught `others`, so the foreign key on
  -- household_members.user_id would have satisfied it -- a case that passes
  -- whether or not the seat gate exists is not a case.
  INSERT INTO auth.users (id) VALUES (late_joiner);
  failed := FALSE;
  msg := NULL;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', late_joiner::text, true);
    PERFORM public.accept_household_invite(code);
  EXCEPTION WHEN check_violation THEN
    failed := TRUE;
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
  END;
  RAISE NOTICE '   redeeming it after downgrade raised check_violation = %  EXPECTED true', failed;
  ASSERT failed, 'the accept path is authoritative, not the mint path';
  ASSERT msg LIKE '%full%', 'it should fail on seats, not on something else';

  -- ------------------------------------------------- nobody already in is evicted
  RAISE NOTICE '6. a household over its new limit keeps everyone it has';
  SELECT COUNT(*) INTO seats FROM public.household_members WHERE household_id = hh_family;
  got_limit := public.household_seat_limit(hh_family);
  RAISE NOTICE '   members = % against a limit of %  EXPECTED 3 members kept, limit 1', seats, got_limit;
  ASSERT seats = 3, 'downgrading must not remove a caregiver from a child''s history';
  ASSERT got_limit = 1, 'the limit itself should have dropped to Free';

  -- ------------------------------------------- re-redeeming your own code is free
  RAISE NOTICE '7. re-redeeming a code you already used is a no-op, not an error';
  PERFORM set_config('request.jwt.claim.sub', owner_free::text, true);
  INSERT INTO public.household_invite_codes (household_id, code, role, created_by)
    VALUES (hh_free, 'REUSED01', 'guardian', owner_free);
  -- owner_free is already a member of hh_free and the household is full.
  PERFORM public.accept_household_invite('REUSED01');
  SELECT COUNT(*) INTO seats FROM public.household_members WHERE household_id = hh_free;
  RAISE NOTICE '   members after re-redeem = %  EXPECTED 1 (unchanged, no exception)', seats;
  ASSERT seats = 1, 'the idempotent branch must run before the seat check';

  -- --------------------------------------------------- App Store counts as paid
  RAISE NOTICE '8. an App Store subscriber gets the seats they paid for';
  SELECT household_id INTO hh_apple FROM public.household_members WHERE user_id = owner_apple;
  ASSERT hh_apple IS NOT NULL, 'the signup chain did not give owner_apple a household';
  -- US-800: original_transaction_id is NOT NULL with no default. The fixture
  -- omitted it, which nothing noticed because this file had never been run.
  INSERT INTO public.apple_subscriptions (user_id, original_transaction_id, product_id, status)
    VALUES (owner_apple, 'us840-original-transaction', 'com.eatpal.app.familyplus.monthly', 'active');

  got_limit := public.household_seat_limit(hh_apple);
  RAISE NOTICE '   App Store Family Plus seat limit = %  EXPECTED NULL (unlimited)', got_limit;
  ASSERT got_limit IS NULL, 'US-780 made Apple count as paid; seats must honour that too';

  -- US-800: leave the database as we found it, so suite order never matters.
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (owner_free, owner_family, owner_apple, joiner_a, joiner_b);
  DELETE FROM public.apple_subscriptions WHERE original_transaction_id = 'us840-original-transaction';
  DELETE FROM auth.users WHERE id IN (owner_free, owner_family, owner_apple, joiner_a, joiner_b);
  DELETE FROM public.households h
   WHERE NOT EXISTS (SELECT 1 FROM public.household_members m WHERE m.household_id = h.id)
     AND h.id IN (hh_free, hh_family, hh_apple);

  RAISE NOTICE 'ALL US-840 CASES PASSED';
END $$;
