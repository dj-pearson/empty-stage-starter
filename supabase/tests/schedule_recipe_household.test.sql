-- schedule_recipe_to_plan: signed-in members of the kid's household only.
--
-- The function is SECURITY DEFINER, so RLS does not apply inside it. Before
-- 20260925000002 a call with no session passed its guard (NULL <> uuid is not
-- true), anon held EXECUTE, any recipe uuid was accepted, and a co-parent was
-- refused for a kid the other parent created. These cases assert on what a
-- call DOES and on has_function_privilege, not on the migration's text.
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
  hh_outsider UUID;
  kid         UUID := gen_random_uuid();
  recipe      UUID := gen_random_uuid();
  foreign_recipe UUID := gen_random_uuid();
  food_a      UUID := gen_random_uuid();
  food_b      UUID := gen_random_uuid();
  foreign_food UUID := gen_random_uuid();
  n           INTEGER;
  refused     BOOLEAN;
BEGIN
  -- Torn down first so a re-run behaves like a first run.
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'srp-%@example.test');
  DELETE FROM auth.users WHERE email LIKE 'srp-%@example.test';

  -- Each insert fires handle_new_user -> ensure_user_household.
  INSERT INTO auth.users (id, email) VALUES
    (owner_id,    'srp-owner@example.test'),
    (partner_id,  'srp-partner@example.test'),
    (outsider_id, 'srp-outsider@example.test');

  SELECT household_id INTO hh_owner
    FROM public.household_members WHERE user_id = owner_id LIMIT 1;
  SELECT household_id INTO hh_outsider
    FROM public.household_members WHERE user_id = outsider_id LIMIT 1;

  -- The partner joins the owner's household, the way an accepted invite does.
  UPDATE public.household_members SET household_id = hh_owner WHERE user_id = partner_id;

  -- Seeded as the table owner: the fixture is state, not the thing under test.
  INSERT INTO public.foods (id, user_id, household_id, name, category) VALUES
    (food_a,       owner_id,    hh_owner,    'Pasta',  'carb'),
    (food_b,       owner_id,    hh_owner,    'Peas',   'vegetable'),
    (foreign_food, outsider_id, hh_outsider, 'Tacos',  'protein');
  INSERT INTO public.kids (id, user_id, household_id, name)
    VALUES (kid, owner_id, hh_owner, 'Sam');
  INSERT INTO public.recipes (id, user_id, household_id, name, food_ids) VALUES
    (recipe,         owner_id,    hh_owner,    'Pasta night', ARRAY[food_a, food_b]),
    (foreign_recipe, outsider_id, hh_outsider, 'Taco night',  ARRAY[foreign_food]);

  RAISE NOTICE '1. anon cannot execute it';
  ASSERT NOT has_function_privilege('anon',
    'public.schedule_recipe_to_plan(uuid, uuid, date, text)', 'EXECUTE'),
    'anon can still call schedule_recipe_to_plan';
  RAISE NOTICE '   anon EXECUTE = false  EXPECTED false';

  RAISE NOTICE '2. authenticated and service_role still can';
  ASSERT has_function_privilege('authenticated',
    'public.schedule_recipe_to_plan(uuid, uuid, date, text)', 'EXECUTE'),
    'authenticated lost EXECUTE; the web planner would break';
  ASSERT has_function_privilege('service_role',
    'public.schedule_recipe_to_plan(uuid, uuid, date, text)', 'EXECUTE'),
    'service_role lost EXECUTE';
  RAISE NOTICE '   authenticated/service_role EXECUTE = true  EXPECTED true';

  RAISE NOTICE '3. no session is refused and writes nothing';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  refused := false;
  BEGIN
    PERFORM public.schedule_recipe_to_plan(kid, recipe, DATE '2026-10-05', 'dinner');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.plan_entries WHERE kid_id = kid;
  RAISE NOTICE '   refused = %, rows = %  EXPECTED true, 0', refused, n;
  ASSERT refused AND n = 0, 'a call with no auth.uid() scheduled a recipe';

  RAISE NOTICE '4. a user from another household is refused';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', outsider_id::text, true);
  refused := false;
  BEGIN
    PERFORM public.schedule_recipe_to_plan(kid, recipe, DATE '2026-10-05', 'dinner');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.plan_entries WHERE kid_id = kid;
  RAISE NOTICE '   refused = %, rows = %  EXPECTED true, 0', refused, n;
  ASSERT refused AND n = 0, 'a non-member scheduled into another household''s plan';

  RAISE NOTICE '5. the co-parent can schedule for a kid the other parent created';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', partner_id::text, true);
  n := public.schedule_recipe_to_plan(kid, recipe, DATE '2026-10-05', 'dinner');
  RESET ROLE;
  RAISE NOTICE '   returned = %  EXPECTED 2', n;
  ASSERT n = 2, 'the co-parent could not schedule a household recipe';
  SELECT count(*) INTO n FROM public.plan_entries
   WHERE kid_id = kid AND recipe_id = recipe AND household_id = hh_owner;
  RAISE NOTICE '   rows in owner household = %  EXPECTED 2', n;
  ASSERT n = 2, 'the co-parent''s rows did not land in the household';

  RAISE NOTICE '6. the owner can still schedule (re-run replaces, does not duplicate)';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  n := public.schedule_recipe_to_plan(kid, recipe, DATE '2026-10-05', 'dinner');
  RESET ROLE;
  SELECT count(*) INTO n FROM public.plan_entries WHERE kid_id = kid AND recipe_id = recipe;
  RAISE NOTICE '   rows = %  EXPECTED 2', n;
  ASSERT n = 2, 'the owner could not reschedule their own recipe';

  RAISE NOTICE '7. a recipe from another household is refused, even for a member of the kid''s';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  refused := false;
  BEGIN
    PERFORM public.schedule_recipe_to_plan(kid, foreign_recipe, DATE '2026-10-06', 'lunch');
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.plan_entries WHERE recipe_id = foreign_recipe;
  RAISE NOTICE '   refused = %, rows = %  EXPECTED true, 0', refused, n;
  ASSERT refused AND n = 0, 'another household''s recipe was copied into this plan';

  DELETE FROM public.plan_entries WHERE kid_id = kid;
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'srp-%@example.test');
  DELETE FROM auth.users WHERE email LIKE 'srp-%@example.test';
END $$;
