-- auto_add_restock_items: restock rows land in the user's household.
--
-- Before 20260925000005 the function inserted grocery_items with no
-- household_id. Every grocery_items policy is
-- `household_id = get_user_household_id(auth.uid())`, and the auto_fill trigger
-- only fills the column when auth.uid() is set, which it is not when the cron
-- path (scheduled_auto_restock) runs. So the rows were written with a NULL
-- household_id and no member of any household could ever see them. Its
-- "already on the list" check was also by user_id, so a co-parent's unchecked
-- row for the same food was duplicated instead of topped up. And anon and
-- authenticated held EXECUTE on both functions through the schema default ACL
-- (US-804), though nothing but the cron wrapper calls them.
--
-- These cases assert on what a call DOES and on has_function_privilege, not on
-- the migration's text.
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
  kid         UUID := gen_random_uuid();
  food_milk   UUID := gen_random_uuid();
  food_peas   UUID := gen_random_uuid();
  n           INTEGER;
  qty         INTEGER;
  hh          UUID;
  refused     BOOLEAN;
BEGIN
  -- Torn down first so a re-run behaves like a first run.
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'rah-%@example.test');
  DELETE FROM auth.users WHERE email LIKE 'rah-%@example.test';

  -- Each insert fires handle_new_user -> ensure_user_household.
  INSERT INTO auth.users (id, email) VALUES
    (owner_id,    'rah-owner@example.test'),
    (partner_id,  'rah-partner@example.test'),
    (outsider_id, 'rah-outsider@example.test');

  SELECT household_id INTO hh_owner
    FROM public.household_members WHERE user_id = owner_id LIMIT 1;

  -- The partner joins the owner's household, the way an accepted invite does.
  UPDATE public.household_members SET household_id = hh_owner WHERE user_id = partner_id;

  -- Two safe foods, both out of stock, both planned tomorrow: detect_restock_needs
  -- recommends each of them.
  INSERT INTO public.foods (id, user_id, household_id, name, category, is_safe, quantity) VALUES
    (food_milk, owner_id, hh_owner, 'Milk', 'dairy',     true, 0),
    (food_peas, owner_id, hh_owner, 'Peas', 'vegetable', true, 0);
  INSERT INTO public.kids (id, user_id, household_id, name)
    VALUES (kid, owner_id, hh_owner, 'Sam');
  INSERT INTO public.plan_entries (user_id, household_id, kid_id, date, meal_slot, food_id) VALUES
    (owner_id, hh_owner, kid, CURRENT_DATE + 1, 'dinner', food_milk),
    (owner_id, hh_owner, kid, CURRENT_DATE + 1, 'lunch',  food_peas);

  -- The partner already has Peas on the shared list, unchecked, quantity 1.
  INSERT INTO public.grocery_items (user_id, household_id, name, quantity, unit, category, checked)
    VALUES (partner_id, hh_owner, 'peas', 1, 'servings', 'vegetable', false);

  RAISE NOTICE '1. the cron path (no session) writes rows into the owner''s household';
  -- Called as the table owner with no auth.uid(), which is how
  -- scheduled_auto_restock runs it.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  n := public.auto_add_restock_items(owner_id);
  RAISE NOTICE '   returned = %  EXPECTED 2', n;
  ASSERT n = 2, 'auto_add_restock_items did not report two restocked foods';

  SELECT count(*), max(household_id::text)::uuid INTO n, hh
    FROM public.grocery_items
   WHERE user_id = owner_id AND lower(name) = 'milk';
  RAISE NOTICE '   milk rows = %, household matches = %  EXPECTED 1, true', n, hh = hh_owner;
  ASSERT n = 1 AND hh = hh_owner,
    'the restock row was written without the owner''s household_id';

  RAISE NOTICE '2. the partner''s existing Peas row was topped up, not duplicated';
  SELECT count(*), max(quantity) INTO n, qty
    FROM public.grocery_items
   WHERE household_id = hh_owner AND lower(name) = 'peas' AND checked = false;
  RAISE NOTICE '   peas rows = %, quantity = %  EXPECTED 1, 3', n, qty;
  ASSERT n = 1, 'a second Peas row was added next to the co-parent''s';
  ASSERT qty = 3, 'the co-parent''s Peas row was not raised to the recommendation';
  SELECT count(*) INTO n FROM public.grocery_items
   WHERE household_id IS NULL AND user_id IN (owner_id, partner_id);
  ASSERT n = 0, 'a restock row was written with no household';

  RAISE NOTICE '3. both household members can see the restock row under RLS';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  SELECT count(*) INTO n FROM public.grocery_items WHERE lower(name) = 'milk';
  RESET ROLE;
  RAISE NOTICE '   owner sees = %  EXPECTED 1', n;
  ASSERT n = 1, 'the owner cannot see their own restock row';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', partner_id::text, true);
  SELECT count(*) INTO n FROM public.grocery_items WHERE lower(name) = 'milk';
  RESET ROLE;
  RAISE NOTICE '   partner sees = %  EXPECTED 1', n;
  ASSERT n = 1, 'the co-parent cannot see the household''s restock row';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', outsider_id::text, true);
  SELECT count(*) INTO n FROM public.grocery_items WHERE lower(name) = 'milk';
  RESET ROLE;
  RAISE NOTICE '   outsider sees = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household can see this household''s restock row';
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE '4. a second run adds nothing new';
  n := public.auto_add_restock_items(owner_id);
  SELECT count(*) INTO qty FROM public.grocery_items WHERE household_id = hh_owner;
  RAISE NOTICE '   returned = %, rows = %  EXPECTED 0, 2', n, qty;
  ASSERT n = 0 AND qty = 2, 're-running restock duplicated or re-counted rows';

  RAISE NOTICE '5. anon and authenticated cannot execute either function';
  ASSERT NOT has_function_privilege('anon',
    'public.auto_add_restock_items(uuid, uuid)', 'EXECUTE'),
    'anon can still call auto_add_restock_items';
  ASSERT NOT has_function_privilege('authenticated',
    'public.auto_add_restock_items(uuid, uuid)', 'EXECUTE'),
    'authenticated can still call auto_add_restock_items for any p_user_id';
  ASSERT NOT has_function_privilege('anon',
    'public.scheduled_auto_restock()', 'EXECUTE'),
    'anon can still call scheduled_auto_restock';
  ASSERT NOT has_function_privilege('authenticated',
    'public.scheduled_auto_restock()', 'EXECUTE'),
    'authenticated can still call scheduled_auto_restock';
  RAISE NOTICE '   anon/authenticated EXECUTE = false  EXPECTED false';

  RAISE NOTICE '6. service_role keeps EXECUTE for a server-side run';
  ASSERT has_function_privilege('service_role',
    'public.auto_add_restock_items(uuid, uuid)', 'EXECUTE'),
    'service_role lost EXECUTE on auto_add_restock_items';
  ASSERT has_function_privilege('service_role',
    'public.scheduled_auto_restock()', 'EXECUTE'),
    'service_role lost EXECUTE on scheduled_auto_restock';
  RAISE NOTICE '   service_role EXECUTE = true  EXPECTED true';

  RAISE NOTICE '7. a signed-in call is refused and writes nothing';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', outsider_id::text, true);
  refused := false;
  BEGIN
    PERFORM public.auto_add_restock_items(owner_id);
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RAISE NOTICE '   refused = %  EXPECTED true', refused;
  ASSERT refused, 'an authenticated caller ran restock for another user';

  DELETE FROM public.grocery_items WHERE household_id = hh_owner OR user_id IN (owner_id, partner_id, outsider_id);
  DELETE FROM public.plan_entries WHERE kid_id = kid;
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'rah-%@example.test');
  DELETE FROM auth.users WHERE email LIKE 'rah-%@example.test';
END $$;
