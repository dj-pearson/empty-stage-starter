-- Accepting a co-parent invite puts you in ONE household, with your data.
--
-- Before 20260922000001 the joiner kept the household signup made for them,
-- gained a second membership, and get_user_household_id (LIMIT 1, no ORDER BY)
-- resolved to the OLD one. Every RLS policy reads that function, so the
-- joining parent saw none of their partner's data. Measured on a database
-- built from the migration history, not assumed.
--
-- HOW TO RUN: `bash scripts/dev/local-sql-suite.sh`. Never against production.
--
-- Every check prints EXPECTED alongside the value.

\set ON_ERROR_STOP on

DO $$
DECLARE
  owner_id    UUID := gen_random_uuid();
  joiner_id   UUID := gen_random_uuid();
  sharer_id   UUID := gen_random_uuid();
  sharer_mate UUID := gen_random_uuid();
  hh_owner    UUID;
  hh_joiner   UUID;
  hh_sharer   UUID;
  kid         UUID := gen_random_uuid();
  food        UUID := gen_random_uuid();
  item        UUID := gen_random_uuid();
  code        TEXT;
  n           INTEGER;
  got         UUID;
BEGIN
  DELETE FROM public.inventory_movements
   WHERE household_id IN (SELECT hm.household_id FROM public.household_members hm
                            JOIN auth.users u ON u.id = hm.user_id
                           WHERE u.email LIKE 'hjm-%@example.test');
  DELETE FROM public.user_subscriptions
   WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'hjm-%@example.test');
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'hjm-%@example.test');
  DELETE FROM public.households
   WHERE id IN (SELECT hm.household_id FROM public.household_members hm
                  JOIN auth.users u ON u.id = hm.user_id
                 WHERE u.email LIKE 'hjm-%@example.test');
  DELETE FROM auth.users WHERE email LIKE 'hjm-%@example.test';

  -- Each insert fires handle_new_user -> ensure_user_household.
  INSERT INTO auth.users (id, email) VALUES
    (owner_id,    'hjm-owner@example.test'),
    (joiner_id,   'hjm-joiner@example.test'),
    (sharer_id,   'hjm-sharer@example.test'),
    (sharer_mate, 'hjm-sharer-mate@example.test');

  SELECT household_id INTO hh_owner  FROM public.household_members WHERE user_id = owner_id;
  SELECT household_id INTO hh_joiner FROM public.household_members WHERE user_id = joiner_id;
  SELECT household_id INTO hh_sharer FROM public.household_members WHERE user_id = sharer_id;

  -- Sharing needs a plan with more than one seat (US-840).
  INSERT INTO public.user_subscriptions (user_id, plan_id, status)
    SELECT owner_id, id, 'active' FROM public.subscription_plans WHERE name = 'Family Plus';

  -- The joiner used the app alone before being invited: a child, a food and a
  -- list item in their own household.
  INSERT INTO public.kids (id, user_id, household_id, name)
    VALUES (kid, joiner_id, hh_joiner, 'Maya');
  INSERT INTO public.foods (id, user_id, household_id, name, category, quantity, allergens)
    VALUES (food, joiner_id, hh_joiner, 'Annie''s bunnies', 'carb', 2, ARRAY['wheat']);
  INSERT INTO public.grocery_items (id, user_id, household_id, name, quantity, unit, category)
    VALUES (item, joiner_id, hh_joiner, 'Milk', 1, 'gallon', 'dairy');
  -- A direct quantity write is translated into ledger rows (US-668), so the
  -- move has real inventory_movements and item_stock to carry.
  UPDATE public.foods SET quantity = 5 WHERE id = food;

  -- -------------------------------------------------------------- the join --
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  code := public.create_household_invite('parent');
  PERFORM set_config('request.jwt.claim.sub', joiner_id::text, true);
  got := public.accept_household_invite(code);

  RAISE NOTICE '1. the joiner belongs to exactly one household';
  SELECT count(*) INTO n FROM public.household_members WHERE user_id = joiner_id;
  RAISE NOTICE '   memberships = %  EXPECTED 1 (was 2)', n;
  ASSERT n = 1, 'the joiner is still in two households';

  RAISE NOTICE '2. "your household" is the partner''s';
  got := public.get_user_household_id(joiner_id);
  RAISE NOTICE '   resolves to owner household = %  EXPECTED true', got = hh_owner;
  ASSERT got = hh_owner, 'the joiner still resolves to their old household';

  RAISE NOTICE '3. the joiner''s child, food and list item came with them';
  SELECT count(*) INTO n FROM public.kids WHERE id = kid AND household_id = hh_owner;
  RAISE NOTICE '   kid moved = %  EXPECTED 1', n;
  ASSERT n = 1, 'the joiner''s child was left behind';
  SELECT count(*) INTO n FROM public.foods WHERE id = food AND household_id = hh_owner;
  RAISE NOTICE '   food moved = %  EXPECTED 1', n;
  ASSERT n = 1, 'the joiner''s food was left behind';
  SELECT count(*) INTO n FROM public.grocery_items WHERE id = item AND household_id = hh_owner;
  RAISE NOTICE '   grocery item moved = %  EXPECTED 1', n;
  ASSERT n = 1, 'the joiner''s grocery item was left behind';

  SELECT count(*) INTO n FROM public.inventory_movements WHERE item_id = food AND household_id <> hh_owner;
  RAISE NOTICE '   ledger rows left in another household = %  EXPECTED 0', n;
  ASSERT n = 0, 'the joiner''s ledger rows were left behind';
  SELECT count(*) INTO n FROM public.inventory_movements WHERE item_id = food;
  RAISE NOTICE '   ledger rows for the food = %  EXPECTED > 0', n;
  ASSERT n > 0, 'the fixture wrote no ledger rows, so the move above proved nothing';

  RAISE NOTICE '4. the emptied household is gone';
  SELECT count(*) INTO n FROM public.households WHERE id = hh_joiner;
  RAISE NOTICE '   old household rows = %  EXPECTED 0', n;
  ASSERT n = 0, 'the joiner''s old household still exists';

  RAISE NOTICE '5. the partner can see the joiner''s child under RLS';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  SELECT count(*) INTO n FROM public.kids WHERE id = kid;
  RESET ROLE;
  RAISE NOTICE '   visible to owner = %  EXPECTED 1', n;
  ASSERT n = 1, 'the partner cannot see the child that was merged in';

  -- ------------------------------------------------ a shared old household --
  -- sharer and sharer_mate already share hh_sharer. When sharer joins the
  -- owner, hh_sharer's data belongs to sharer_mate too, so it must not move.
  UPDATE public.household_members SET household_id = hh_sharer WHERE user_id = sharer_mate;

  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  code := public.create_household_invite('parent');
  PERFORM set_config('request.jwt.claim.sub', sharer_id::text, true);
  PERFORM public.accept_household_invite(code);

  RAISE NOTICE '6. a household someone else also belongs to is left alone';
  SELECT count(*) INTO n FROM public.households WHERE id = hh_sharer;
  RAISE NOTICE '   shared household rows = %  EXPECTED 1', n;
  ASSERT n = 1, 'a shared household was deleted';
  SELECT count(*) INTO n FROM public.household_members WHERE household_id = hh_sharer AND user_id = sharer_mate;
  RAISE NOTICE '   other member still there = %  EXPECTED 1', n;
  ASSERT n = 1, 'the other member lost their household';

  RAISE NOTICE '7. and the joiner still resolves to the household they just joined';
  got := public.get_user_household_id(sharer_id);
  RAISE NOTICE '   resolves to owner household = %  EXPECTED true', got = hh_owner;
  ASSERT got = hh_owner, 'a joiner with a shared old household resolves to the old one';

  RAISE NOTICE '8. clients cannot call the merge';
  ASSERT NOT has_function_privilege('anon', 'public.merge_sole_member_households_into(uuid, uuid)', 'EXECUTE'),
    'anon can call merge_sole_member_households_into';
  ASSERT NOT has_function_privilege('authenticated', 'public.merge_sole_member_households_into(uuid, uuid)', 'EXECUTE'),
    'authenticated can call merge_sole_member_households_into';
  RAISE NOTICE '   anon/authenticated EXECUTE = false  EXPECTED false';

  -- ---------------------------------------------------------------- teardown
  DELETE FROM public.inventory_movements WHERE household_id IN (hh_owner, hh_sharer);
  DELETE FROM public.user_subscriptions WHERE user_id = owner_id;
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'hjm-%@example.test');
  DELETE FROM public.households WHERE id IN (hh_owner, hh_sharer);
  DELETE FROM auth.users WHERE email LIKE 'hjm-%@example.test';
END $$;
