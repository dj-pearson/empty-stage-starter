-- Recipe collections, store aisles and aisle mappings are shared inside a
-- household and nowhere else (20260925000006, items 7 and 14).
--
-- Before that migration a co-parent could see their partner's collection
-- (recipe_collections was household-scoped) but not a single recipe in it,
-- and could not see or edit the aisles of a store their household made.
--
-- HOW TO RUN: `bash scripts/dev/local-sql-suite.sh`. Never against production.
-- Everything happens in one transaction that is rolled back. The cases run as
-- `authenticated`, since RLS is bypassed for the table owner and superusers.

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE hsca_ids (k text PRIMARY KEY, v uuid);
GRANT SELECT, INSERT ON hsca_ids TO authenticated;

DO $$
DECLARE
  owner_a   UUID := gen_random_uuid();
  partner_a UUID := gen_random_uuid();
  outsider  UUID := gen_random_uuid();
  hh_a      UUID;
  hh_b      UUID;
  rec_1     UUID := gen_random_uuid();
  rec_2     UUID := gen_random_uuid();
BEGIN
  -- Each insert fires handle_new_user -> ensure_user_household.
  INSERT INTO auth.users (id, email) VALUES
    (owner_a,   'hsca-owner@example.test'),
    (partner_a, 'hsca-partner@example.test'),
    (outsider,  'hsca-outsider@example.test');

  SELECT household_id INTO hh_a FROM public.household_members WHERE user_id = owner_a;
  ASSERT hh_a IS NOT NULL, 'the signup chain did not give the owner a household';

  -- The partner joins household A; the later joined_at makes it theirs.
  INSERT INTO public.household_members (household_id, user_id, role, joined_at)
    VALUES (hh_a, partner_a, 'parent', clock_timestamp() + interval '1 minute');
  ASSERT public.get_user_household_id(partner_a) = hh_a, 'partner did not resolve to household A';
  hh_b := public.get_user_household_id(outsider);
  ASSERT hh_b IS NOT NULL AND hh_b <> hh_a, 'outsider did not get a household of their own';

  INSERT INTO public.recipes (id, user_id, household_id, name) VALUES
    (rec_1, owner_a, hh_a, 'Pasta'),
    (rec_2, owner_a, hh_a, 'Soup');

  INSERT INTO hsca_ids VALUES ('owner_a', owner_a), ('partner_a', partner_a),
                              ('outsider', outsider), ('hh_a', hh_a), ('hh_b', hh_b),
                              ('rec_1', rec_1), ('rec_2', rec_2);
END $$;

DO $$
DECLARE
  owner_a   UUID := (SELECT v FROM hsca_ids WHERE k = 'owner_a');
  partner_a UUID := (SELECT v FROM hsca_ids WHERE k = 'partner_a');
  outsider  UUID := (SELECT v FROM hsca_ids WHERE k = 'outsider');
  hh_a      UUID := (SELECT v FROM hsca_ids WHERE k = 'hh_a');
  hh_b      UUID := (SELECT v FROM hsca_ids WHERE k = 'hh_b');
  rec_1     UUID := (SELECT v FROM hsca_ids WHERE k = 'rec_1');
  rec_2     UUID := (SELECT v FROM hsca_ids WHERE k = 'rec_2');
  coll      UUID := gen_random_uuid();
  store     UUID := gen_random_uuid();
  aisle_1   UUID := gen_random_uuid();
  aisle_2   UUID := gen_random_uuid();
  catalog   UUID;
  n         INTEGER;
  refused   BOOLEAN;
BEGIN
  SET LOCAL ROLE authenticated;

  -- ===================================================== recipe collections ==
  -- The owner makes a collection the way useRecipeCollections does and puts
  -- a recipe in it.
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  INSERT INTO public.recipe_collections (id, user_id, household_id, name)
    VALUES (coll, owner_a, hh_a, 'Weeknights');
  INSERT INTO public.recipe_collection_items (collection_id, recipe_id) VALUES (coll, rec_1);

  -- 1. The co-parent reads the items, adds one, and removes one.
  PERFORM set_config('request.jwt.claim.sub', partner_a::text, true);
  SELECT count(*) INTO n FROM public.recipe_collection_items WHERE collection_id = coll;
  RAISE NOTICE '1a. partner sees collection items = %  EXPECTED 1', n;
  ASSERT n = 1, 'a co-parent cannot see the recipes in their partner''s collection';

  INSERT INTO public.recipe_collection_items (collection_id, recipe_id) VALUES (coll, rec_2);
  SELECT count(*) INTO n FROM public.recipe_collection_items WHERE collection_id = coll;
  RAISE NOTICE '1b. partner added an item, now = %  EXPECTED 2', n;
  ASSERT n = 2, 'a co-parent cannot add a recipe to a household collection';

  DELETE FROM public.recipe_collection_items WHERE collection_id = coll AND recipe_id = rec_1;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '1c. partner deleted items = %  EXPECTED 1', n;
  ASSERT n = 1, 'a co-parent cannot remove a recipe from a household collection';

  -- The owner sees the partner's edits.
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  SELECT count(*) INTO n FROM public.recipe_collection_items
   WHERE collection_id = coll AND recipe_id = rec_2;
  RAISE NOTICE '1d. owner sees the partner''s item = %  EXPECTED 1', n;
  ASSERT n = 1, 'the owner cannot see an item their partner added';

  -- 2. Another household sees nothing and writes nothing.
  PERFORM set_config('request.jwt.claim.sub', outsider::text, true);
  SELECT count(*) INTO n FROM public.recipe_collections WHERE id = coll;
  RAISE NOTICE '2a. outsider sees household A collection = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household can read household A''s collection';

  SELECT count(*) INTO n FROM public.recipe_collection_items WHERE collection_id = coll;
  RAISE NOTICE '2b. outsider sees household A items = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household can read household A''s collection items';

  refused := false;
  BEGIN
    INSERT INTO public.recipe_collection_items (collection_id, recipe_id) VALUES (coll, rec_1);
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RAISE NOTICE '2c. outsider insert into household A collection refused = %  EXPECTED t', refused;
  ASSERT refused, 'another household added a recipe to household A''s collection';

  DELETE FROM public.recipe_collection_items WHERE collection_id = coll;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '2d. outsider deleted household A items = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household deleted household A''s collection items';

  -- 3. A collection cannot be planted in, or moved to, another household.
  refused := false;
  BEGIN
    INSERT INTO public.recipe_collections (user_id, household_id, name)
      VALUES (outsider, hh_a, 'Planted');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RAISE NOTICE '3a. collection inserted into another household refused = %  EXPECTED t', refused;
  ASSERT refused, 'a user created a collection in another household';

  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  refused := false;
  BEGIN
    UPDATE public.recipe_collections SET household_id = hh_b WHERE id = coll;
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RAISE NOTICE '3b. collection moved into another household refused = %  EXPECTED t', refused;
  ASSERT refused, 'the creator moved a collection into another household';

  -- ======================================================== store aisles ====
  INSERT INTO public.store_layouts (id, user_id, household_id, name, store_name)
    VALUES (store, owner_a, hh_a, 'Family Grocer', 'Family Grocer');
  INSERT INTO public.store_aisles (id, store_layout_id, aisle_name, sort_order)
    VALUES (aisle_1, store, 'Produce', 0);

  -- 4. The co-parent reads, adds, edits and deletes the store's aisles.
  PERFORM set_config('request.jwt.claim.sub', partner_a::text, true);
  SELECT count(*) INTO n FROM public.store_aisles WHERE store_layout_id = store;
  RAISE NOTICE '4a. partner sees household store aisles = %  EXPECTED 1', n;
  ASSERT n = 1, 'a co-parent cannot see the aisles of a household store';

  INSERT INTO public.store_aisles (id, store_layout_id, aisle_name, sort_order)
    VALUES (aisle_2, store, 'Dairy', 1);
  UPDATE public.store_aisles SET sort_order = 5 WHERE id = aisle_1;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '4b. partner reordered an aisle = %  EXPECTED 1', n;
  ASSERT n = 1, 'a co-parent cannot reorder a household store''s aisles';

  -- 5. Aisle mappings: the co-parent maps a food, re-places one the owner
  --    mapped (the web's upsert), and removes one.
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  INSERT INTO public.food_aisle_mappings (store_layout_id, food_name, store_aisle_id, aisle_id, user_id)
    VALUES (store, 'apples', aisle_1, aisle_1, owner_a);

  PERFORM set_config('request.jwt.claim.sub', partner_a::text, true);
  SELECT count(*) INTO n FROM public.food_aisle_mappings WHERE store_layout_id = store;
  RAISE NOTICE '5a. partner sees household mappings = %  EXPECTED 1', n;
  ASSERT n = 1, 'a co-parent cannot see the household''s aisle mappings';

  INSERT INTO public.food_aisle_mappings (store_layout_id, food_name, store_aisle_id, aisle_id, user_id)
    VALUES (store, 'apples', aisle_2, aisle_2, partner_a)
    ON CONFLICT (store_layout_id, food_name)
    DO UPDATE SET store_aisle_id = EXCLUDED.store_aisle_id, aisle_id = EXCLUDED.aisle_id,
                  user_id = EXCLUDED.user_id;
  SELECT count(*) INTO n FROM public.food_aisle_mappings
   WHERE store_layout_id = store AND food_name = 'apples' AND store_aisle_id = aisle_2;
  RAISE NOTICE '5b. partner re-placed the owner''s mapping = %  EXPECTED 1', n;
  ASSERT n = 1, 'a co-parent cannot re-place a food their partner mapped';

  INSERT INTO public.food_aisle_mappings (store_layout_id, food_name, store_aisle_id, aisle_id, user_id)
    VALUES (store, 'milk', aisle_2, aisle_2, partner_a);

  refused := false;
  BEGIN
    INSERT INTO public.food_aisle_mappings (store_layout_id, food_name, user_id)
      VALUES (store, 'forged', owner_a);
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RAISE NOTICE '5c. mapping written in the partner''s name refused = %  EXPECTED t', refused;
  ASSERT refused, 'a co-parent wrote a mapping attributed to someone else';

  -- 6. Another household sees and changes none of it.
  PERFORM set_config('request.jwt.claim.sub', outsider::text, true);
  SELECT count(*) INTO n FROM public.store_aisles WHERE store_layout_id = store;
  RAISE NOTICE '6a. outsider sees household A aisles = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household can read household A''s aisles';

  SELECT count(*) INTO n FROM public.food_aisle_mappings WHERE store_layout_id = store;
  RAISE NOTICE '6b. outsider sees household A mappings = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household can read household A''s aisle mappings';

  refused := false;
  BEGIN
    INSERT INTO public.store_aisles (store_layout_id, aisle_name) VALUES (store, 'Planted');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RAISE NOTICE '6c. outsider aisle insert refused = %  EXPECTED t', refused;
  ASSERT refused, 'another household added an aisle to household A''s store';

  -- The legacy user_id policy would have let this through on its own.
  refused := false;
  BEGIN
    INSERT INTO public.food_aisle_mappings (store_layout_id, food_name, user_id)
      VALUES (store, 'planted', outsider);
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RAISE NOTICE '6d. outsider mapping on household A store refused = %  EXPECTED t', refused;
  ASSERT refused, 'another household attached a mapping to household A''s store';

  UPDATE public.store_aisles SET aisle_name = 'Hijacked' WHERE store_layout_id = store;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '6e. outsider updated household A aisles = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household renamed household A''s aisles';

  DELETE FROM public.store_aisles WHERE store_layout_id = store;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '6f. outsider deleted household A aisles = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household deleted household A''s aisles';

  DELETE FROM public.food_aisle_mappings WHERE store_layout_id = store;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '6g. outsider deleted household A mappings = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household deleted household A''s aisle mappings';

  -- 7. A mapping on a catalog store stays with the user who made it.
  SELECT id INTO catalog FROM public.store_layouts WHERE slug = 'walmart';
  INSERT INTO public.food_aisle_mappings (store_layout_id, food_name, user_id)
    VALUES (catalog, 'hsca-bread', outsider);

  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  SELECT count(*) INTO n FROM public.food_aisle_mappings WHERE food_name = 'hsca-bread';
  RAISE NOTICE '7. owner sees another household''s catalog mapping = %  EXPECTED 0', n;
  ASSERT n = 0, 'a catalog-store mapping leaked to another household';

  -- 8. Back in household A, the partner deletes an aisle and a mapping.
  PERFORM set_config('request.jwt.claim.sub', partner_a::text, true);
  DELETE FROM public.food_aisle_mappings WHERE store_layout_id = store AND food_name = 'apples';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '8a. partner deleted a mapping = %  EXPECTED 1', n;
  ASSERT n = 1, 'a co-parent cannot delete a household aisle mapping';

  DELETE FROM public.store_aisles WHERE id = aisle_1;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '8b. partner deleted an aisle = %  EXPECTED 1', n;
  ASSERT n = 1, 'a co-parent cannot delete a household store''s aisle';

  -- 9. Signed out sees none of it.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO n FROM public.store_aisles WHERE store_layout_id = store;
  ASSERT n = 0, 'a request with no user can read household aisles';
  SELECT count(*) INTO n FROM public.recipe_collection_items WHERE collection_id = coll;
  ASSERT n = 0, 'a request with no user can read household collection items';
  RAISE NOTICE '9. no JWT sees household aisles and items = 0  EXPECTED 0';

  RESET ROLE;
END $$;

ROLLBACK;
