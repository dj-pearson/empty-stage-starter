-- deduct_food_quantity only touches the caller's own household's foods.
--
-- The function is SECURITY DEFINER, so RLS on foods does not apply inside it.
-- Before 20260922000000 its body updated any row by id: a signed-in user from
-- another household could zero a pantry row, and anon held EXECUTE through the
-- schema default ACL. These cases assert on what a call DOES and on
-- has_function_privilege, not on the migration's text.
--
-- HOW TO RUN: `bash scripts/dev/local-sql-suite.sh`. Never against production.
--
-- Every check prints EXPECTED alongside the value.

\set ON_ERROR_STOP on

DO $$
DECLARE
  owner_id    UUID := gen_random_uuid();
  partner_id  UUID := gen_random_uuid();
  outsider_id UUID := gen_random_uuid();
  hh_owner    UUID;
  food        UUID := gen_random_uuid();
  qty         INTEGER;
BEGIN
  -- Torn down first so a re-run behaves like a first run. Each deduction is
  -- mirrored into the ledger as a movement, which references the food, so the
  -- movements go before the users (whose households cascade to the food).
  DELETE FROM public.inventory_movements
   WHERE item_id IN (SELECT f.id FROM public.foods f
                       JOIN auth.users u ON u.id = f.user_id
                      WHERE u.email LIKE 'dfq-%@example.test');
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'dfq-%@example.test');
  DELETE FROM auth.users WHERE email LIKE 'dfq-%@example.test';

  -- Each insert fires handle_new_user -> ensure_user_household, so every
  -- account already has its own household and membership.
  INSERT INTO auth.users (id, email) VALUES
    (owner_id,    'dfq-owner@example.test'),
    (partner_id,  'dfq-partner@example.test'),
    (outsider_id, 'dfq-outsider@example.test');

  SELECT household_id INTO hh_owner
    FROM public.household_members WHERE user_id = owner_id LIMIT 1;

  -- The partner joins the owner's household, the way an accepted invite does.
  UPDATE public.household_members SET household_id = hh_owner WHERE user_id = partner_id;

  -- Seeded as the table owner: the fixture is state, not the thing under test.
  INSERT INTO public.foods (id, user_id, household_id, name, category, quantity)
    VALUES (food, owner_id, hh_owner, 'Dino nuggets', 'protein', 10);

  RAISE NOTICE '1. anon cannot execute it';
  ASSERT NOT has_function_privilege('anon', 'public.deduct_food_quantity(uuid, integer)', 'EXECUTE'),
    'anon can still call deduct_food_quantity';
  RAISE NOTICE '   anon EXECUTE = false  EXPECTED false';

  RAISE NOTICE '2. a signed-in user still can (the web planner and shipped iOS builds call it)';
  ASSERT has_function_privilege('authenticated', 'public.deduct_food_quantity(uuid, integer)', 'EXECUTE'),
    'authenticated lost EXECUTE; shipped iOS builds would break';
  RAISE NOTICE '   authenticated EXECUTE = true  EXPECTED true';

  SET LOCAL ROLE authenticated;

  RAISE NOTICE '3. a user in ANOTHER household cannot change the row';
  PERFORM set_config('request.jwt.claim.sub', outsider_id::text, true);
  PERFORM public.deduct_food_quantity(food, 10);
  RESET ROLE;
  SELECT quantity INTO qty FROM public.foods WHERE id = food;
  RAISE NOTICE '   quantity = %  EXPECTED 10', qty;
  ASSERT qty = 10, 'another household zeroed this pantry row';

  SET LOCAL ROLE authenticated;

  RAISE NOTICE '4. the owner can deduct';
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  PERFORM public.deduct_food_quantity(food, 3);
  RESET ROLE;
  SELECT quantity INTO qty FROM public.foods WHERE id = food;
  RAISE NOTICE '   quantity = %  EXPECTED 7', qty;
  ASSERT qty = 7, 'the owner could not deduct from their own food';

  SET LOCAL ROLE authenticated;

  RAISE NOTICE '5. the partner in the same household can deduct a food the owner added';
  PERFORM set_config('request.jwt.claim.sub', partner_id::text, true);
  PERFORM public.deduct_food_quantity(food, 2);
  RESET ROLE;
  SELECT quantity INTO qty FROM public.foods WHERE id = food;
  RAISE NOTICE '   quantity = %  EXPECTED 5', qty;
  ASSERT qty = 5, 'a household partner could not deduct';

  SET LOCAL ROLE authenticated;

  RAISE NOTICE '6. no session changes nothing';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM public.deduct_food_quantity(food, 5);
  RESET ROLE;
  SELECT quantity INTO qty FROM public.foods WHERE id = food;
  RAISE NOTICE '   quantity = %  EXPECTED 5', qty;
  ASSERT qty = 5, 'a call with no auth.uid() changed the row';

  DELETE FROM public.inventory_movements WHERE item_id = food;
  DELETE FROM public.foods WHERE id = food;
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'dfq-%@example.test');
  DELETE FROM auth.users WHERE email LIKE 'dfq-%@example.test';
END $$;
