-- A store a household made is visible to that household only; the seeded
-- chain catalog stays visible to everyone (20260925000003).
--
-- Before that migration the store_layouts SELECT policy treated every
-- household_id IS NULL row as catalog, and a user-created row could end up
-- NULL (written without a JWT, or before the household resolved). That row,
-- street address included, was readable by every account.
--
-- HOW TO RUN: `bash scripts/dev/local-sql-suite.sh`. Never against production.
-- Runs from the repo root (as CI does): step 1 re-applies the migration with
-- \i to exercise its backfill against a row written the old way. Everything
-- happens in one transaction that is rolled back.

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE slhp_ids (k text PRIMARY KEY, v uuid);
GRANT SELECT ON slhp_ids TO authenticated;

DO $$
DECLARE
  owner_a   UUID := gen_random_uuid();
  partner_a UUID := gen_random_uuid();
  outsider  UUID := gen_random_uuid();
  hh_a      UUID;
BEGIN
  -- Each insert fires handle_new_user -> ensure_user_household.
  INSERT INTO auth.users (id, email) VALUES
    (owner_a,   'slhp-owner@example.test'),
    (partner_a, 'slhp-partner@example.test'),
    (outsider,  'slhp-outsider@example.test');

  SELECT household_id INTO hh_a FROM public.household_members WHERE user_id = owner_a;
  ASSERT hh_a IS NOT NULL, 'the signup chain did not give the owner a household';

  -- The partner joins household A; the later joined_at makes it theirs.
  INSERT INTO public.household_members (household_id, user_id, role, joined_at)
    VALUES (hh_a, partner_a, 'parent', clock_timestamp() + interval '1 minute');
  ASSERT public.get_user_household_id(partner_a) = hh_a, 'partner did not resolve to household A';
  ASSERT public.get_user_household_id(outsider) <> hh_a, 'outsider resolved to household A';

  INSERT INTO slhp_ids VALUES ('owner_a', owner_a), ('partner_a', partner_a),
                              ('outsider', outsider), ('hh_a', hh_a);
END $$;

-- 1. A row written the old way: user-created, household_id NULL. Triggers off
--    so neither auto_fill_household_id nor the new sync fill can heal it --
--    that is the state rows in production are in.
ALTER TABLE public.store_layouts DISABLE TRIGGER USER;
INSERT INTO public.store_layouts (id, user_id, household_id, name, store_name, slug, store_location)
  SELECT gen_random_uuid(), v, NULL, 'Corner Market', 'Corner Market', 'slhp_legacy', '12 Elm St'
    FROM slhp_ids WHERE k = 'owner_a';
ALTER TABLE public.store_layouts ENABLE TRIGGER USER;

\i supabase/migrations/20260925000003_store_layouts_household_privacy.sql

DO $$
DECLARE
  hh_a UUID := (SELECT v FROM slhp_ids WHERE k = 'hh_a');
  got  UUID;
BEGIN
  SELECT household_id INTO got FROM public.store_layouts WHERE slug = 'slhp_legacy';
  RAISE NOTICE '1. backfill: legacy row household_id = %  EXPECTED %', got, hh_a;
  ASSERT got = hh_a, 'the backfill did not give the legacy store its creator''s household';
END $$;

-- 2. The trigger fills household_id from user_id when the writer has no JWT
--    (service role, scripts), which is how NULL rows were made.
INSERT INTO public.store_layouts (user_id, name, store_location)
  SELECT v, 'Service Written', '9 Oak Ave' FROM slhp_ids WHERE k = 'owner_a';

DO $$
DECLARE
  hh_a UUID := (SELECT v FROM slhp_ids WHERE k = 'hh_a');
  got  UUID;
BEGIN
  SELECT household_id INTO got FROM public.store_layouts WHERE name = 'Service Written';
  RAISE NOTICE '2. trigger: no-JWT insert household_id = %  EXPECTED %', got, hh_a;
  ASSERT got = hh_a, 'a user-created store written without a JWT kept household_id NULL';
END $$;

-- 3. Visibility, as each user.
DO $$
DECLARE
  owner_a   UUID := (SELECT v FROM slhp_ids WHERE k = 'owner_a');
  partner_a UUID := (SELECT v FROM slhp_ids WHERE k = 'partner_a');
  outsider  UUID := (SELECT v FROM slhp_ids WHERE k = 'outsider');
  hh_a      UUID := (SELECT v FROM slhp_ids WHERE k = 'hh_a');
  hh_b      UUID := public.get_user_household_id(outsider);
  n         INTEGER;
  refused   BOOLEAN;
BEGIN
  SET LOCAL ROLE authenticated;

  -- The owner adds a store the way the web does (CreateStoreLayoutDialog).
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  INSERT INTO public.store_layouts (user_id, household_id, name, store_name, store_location)
    VALUES (owner_a, hh_a, 'Family Grocer', 'Family Grocer', '5 Pine Rd');

  -- ... and one with household_id omitted, as an older client would.
  INSERT INTO public.store_layouts (user_id, name) VALUES (owner_a, 'No Household Sent');
  SELECT count(*) INTO n FROM public.store_layouts
   WHERE name = 'No Household Sent' AND household_id = hh_a;
  RAISE NOTICE '3a. omitted household_id filled = %  EXPECTED 1', n;
  ASSERT n = 1, 'an insert without household_id did not land in the caller''s household';

  SELECT count(*) INTO n FROM public.store_layouts WHERE user_id IS NOT NULL;
  RAISE NOTICE '3b. owner sees own-household stores = %  EXPECTED 4', n;
  ASSERT n = 4, 'the owner cannot see their household''s stores';

  PERFORM set_config('request.jwt.claim.sub', partner_a::text, true);
  SELECT count(*) INTO n FROM public.store_layouts WHERE user_id IS NOT NULL;
  RAISE NOTICE '3c. partner in same household sees = %  EXPECTED 4', n;
  ASSERT n = 4, 'a household partner cannot see the stores the owner made';

  PERFORM set_config('request.jwt.claim.sub', outsider::text, true);
  SELECT count(*) INTO n FROM public.store_layouts WHERE user_id IS NOT NULL;
  RAISE NOTICE '3d. other household sees household A stores = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household can read household A''s stores';

  -- 4. The catalog is still shared: five seeded chains, readable by both.
  SELECT count(*) INTO n FROM public.store_layouts
   WHERE slug IN ('walmart', 'target', 'trader_joes', 'whole_foods', 'costco');
  RAISE NOTICE '4a. outsider sees catalog chains = %  EXPECTED 5', n;
  ASSERT n = 5, 'the catalog is no longer visible to household B';

  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  SELECT count(*) INTO n FROM public.store_layouts
   WHERE slug IN ('walmart', 'target', 'trader_joes', 'whole_foods', 'costco');
  RAISE NOTICE '4b. owner sees catalog chains = %  EXPECTED 5', n;
  ASSERT n = 5, 'the catalog is no longer visible to household A';

  -- 5. The owner cannot publish a store by clearing its household: the
  --    trigger puts it back, and it stays out of household B's view.
  UPDATE public.store_layouts SET household_id = NULL WHERE name = 'Family Grocer';
  SELECT count(*) INTO n FROM public.store_layouts
   WHERE name = 'Family Grocer' AND household_id = hh_a;
  RAISE NOTICE '5a. household cleared then refilled = %  EXPECTED 1', n;
  ASSERT n = 1, 'clearing household_id on update left the store unscoped';

  -- ... nor move one into household B.
  refused := false;
  BEGIN
    UPDATE public.store_layouts SET household_id = hh_b WHERE name = 'Family Grocer';
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RAISE NOTICE '5b. update into another household refused = %  EXPECTED t', refused;
  ASSERT refused, 'a user moved their store into another household';

  -- ... nor insert one straight into household B.
  refused := false;
  BEGIN
    INSERT INTO public.store_layouts (user_id, household_id, name)
      VALUES (owner_a, hh_b, 'Planted Store');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RAISE NOTICE '5c. insert into another household refused = %  EXPECTED t', refused;
  ASSERT refused, 'a user inserted a store into another household';

  -- ... nor mint a catalog row.
  refused := false;
  BEGIN
    INSERT INTO public.store_layouts (user_id, household_id, name)
      VALUES (NULL, NULL, 'Fake Chain');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RAISE NOTICE '5d. user-minted catalog row refused = %  EXPECTED t', refused;
  ASSERT refused, 'a signed-in user created a catalog store';

  -- 6. Signed out sees the catalog rows only through the policy's own terms;
  --    auth.uid() NULL matches no household, so no custom store.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO n FROM public.store_layouts WHERE user_id IS NOT NULL;
  RAISE NOTICE '6. no JWT sees custom stores = %  EXPECTED 0', n;
  ASSERT n = 0, 'a request with no user can read custom stores';

  RESET ROLE;
END $$;

ROLLBACK;
