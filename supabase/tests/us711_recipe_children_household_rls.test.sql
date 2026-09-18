-- US-711 test suite: a household member must be able to read (and edit) the
-- ingredients and components of a recipe their partner saved.
--
-- The bug: `recipes` has been household-scoped since 20251008035900, but
-- recipe_ingredients (US-265) and recipe_components (US-612) scoped through
-- `r.user_id = auth.uid()`. A partner could open the recipe and find it empty.
--
-- REWRITTEN FOR CI (US-800). This ran against the tiny standalone schema its
-- .bootstrap.sql builds, and three things made that impossible in CI:
--
--   1. The CI step runs *.test.sql only and never the bootstraps, so against a
--      database built from migrations the bootstrap's CREATE TABLE statements
--      would collide and its FK-free household_members never existed. The real
--      one has a foreign key to auth.users, which the old fixture ignored.
--   2. CASE 5 expected an RLS refusal and let psql raise it. Under
--      ON_ERROR_STOP=1 -- which is how CI invokes psql -- the expected failure
--      aborted the file, so this suite could never report success.
--   3. It printed values next to the word EXPECTED and left the comparison to
--      a person. Nothing was asserted, so it could only fail by erroring.
--
-- So it is one DO block that ASSERTs, catches the refusal it expects, and
-- cleans up after itself so a second run behaves like the first.
--
-- Run it against a database built only from migrations:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/us711_recipe_children_household_rls.test.sql

\pset format unaligned
\pset tuples_only on

-- The cases below run as `authenticated`, the role PostgREST switches to for a
-- signed-in request. Two reasons, and the second cost an hour:
--
--   * RLS is bypassed for a table's owner and for superusers, so an RLS test
--     run as postgres passes while testing nothing.
--   * A purpose-made role is NOT equivalent. `auth.uid()` lives in schema
--     `auth`, and a fresh role has no USAGE on it -- the policies then fail
--     with "permission denied for schema auth", which is the same wall US-800
--     records the bootstraps hitting. `authenticated` already carries every
--     grant production gives it, so running as it tests the policies as they
--     are actually evaluated rather than an approximation of them.

DO $$
DECLARE
  hh_a       uuid;
  owner_a    uuid := '11110000-0000-0000-0000-000000000001';
  partner_a  uuid := '11110000-0000-0000-0000-000000000002';
  outsider_b uuid := '22220000-0000-0000-0000-000000000001';
  rec        uuid := 'cccc0000-0000-0000-0000-0000000000c1';
  ingredients int;
  components  int;
  refused     boolean;
BEGIN
  -- ------------------------------------------------------------- fixtures --
  -- Torn down first so a re-run behaves like a first run.
  DELETE FROM public.recipes WHERE id = rec;
  DELETE FROM auth.users WHERE id IN (owner_a, partner_a, outsider_b);

  -- household_members.user_id references auth.users, so these are required.
  -- Each carries an email: auth.users.email is nullable and an emailless
  -- signup is allowed through since US-800, but every account this suite is
  -- about has one.
  --
  -- THE HOUSEHOLDS ARE NOT CREATED HERE ON PURPOSE. Inserting an auth user
  -- fires the whole signup chain (handle_new_user -> ensure_user_household),
  -- which gives each account a household and a membership of its own. Adding
  -- another membership on top would give a user TWO, and
  -- get_user_household_id does `LIMIT 1` with no ORDER BY -- so which
  -- household they were in would be whichever row Postgres handed back that
  -- day. An earlier version of this fixture did exactly that and read zero
  -- rows for the recipe's own owner.
  INSERT INTO auth.users (id, email) VALUES
    (owner_a,    'us711-owner@example.test'),
    (partner_a,  'us711-partner@example.test'),
    (outsider_b, 'us711-outsider@example.test');

  SELECT household_id INTO hh_a FROM public.household_members WHERE user_id = owner_a;
  ASSERT hh_a IS NOT NULL, 'the signup chain did not give the owner a household';

  -- The partner joins the owner's household, which is what accepting an
  -- invite does. The outsider stays in their own.
  UPDATE public.household_members SET household_id = hh_a WHERE user_id = partner_a;

  -- Seeded as the owner of the tables, which bypasses RLS on purpose: the
  -- fixture is state, not a thing under test.
  INSERT INTO public.recipes (id, user_id, household_id, name)
    VALUES (rec, owner_a, hh_a, 'Partner''s pasta');
  INSERT INTO public.recipe_ingredients (recipe_id, name, sort_order)
    VALUES (rec, 'Spaghetti', 0);
  INSERT INTO public.recipe_components (recipe_id, name, sort_order)
    VALUES (rec, 'The sauce', 0);

  -- ------------------------------------------------------------- the cases --
  SET LOCAL ROLE authenticated;

  RAISE NOTICE '1. the OWNER still reads their own recipe children';
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  SELECT count(*) INTO ingredients FROM public.recipe_ingredients WHERE recipe_id = rec;
  SELECT count(*) INTO components  FROM public.recipe_components  WHERE recipe_id = rec;
  RAISE NOTICE '   ingredients = %, components = %  EXPECTED 1, 1', ingredients, components;
  ASSERT ingredients = 1, 'the recipe owner cannot read their own ingredients';
  ASSERT components = 1,  'the recipe owner cannot read their own components';

  RAISE NOTICE '2. the PARTNER in the same household reads them too (US-711)';
  PERFORM set_config('request.jwt.claim.sub', partner_a::text, true);
  SELECT count(*) INTO ingredients FROM public.recipe_ingredients WHERE recipe_id = rec;
  SELECT count(*) INTO components  FROM public.recipe_components  WHERE recipe_id = rec;
  RAISE NOTICE '   ingredients = %, components = %  EXPECTED 1, 1 (0 before the migration)', ingredients, components;
  ASSERT ingredients = 1, 'US-711: a household partner opens the recipe and the ingredients are empty';
  ASSERT components = 1,  'US-711: a household partner opens the recipe and the components are empty';

  RAISE NOTICE '3. a user in ANOTHER household reads nothing';
  PERFORM set_config('request.jwt.claim.sub', outsider_b::text, true);
  SELECT count(*) INTO ingredients FROM public.recipe_ingredients WHERE recipe_id = rec;
  SELECT count(*) INTO components  FROM public.recipe_components  WHERE recipe_id = rec;
  RAISE NOTICE '   ingredients = %, components = %  EXPECTED 0, 0', ingredients, components;
  ASSERT ingredients = 0, 'another household can read these ingredients';
  ASSERT components = 0,  'another household can read these components';

  RAISE NOTICE '4. the partner can INSERT, UPDATE and DELETE, not just read';
  PERFORM set_config('request.jwt.claim.sub', partner_a::text, true);
  INSERT INTO public.recipe_ingredients (recipe_id, name, sort_order) VALUES (rec, 'Basil', 1);
  UPDATE public.recipe_ingredients SET name = 'Fresh basil' WHERE recipe_id = rec AND name = 'Basil';
  SELECT count(*) INTO ingredients FROM public.recipe_ingredients WHERE recipe_id = rec AND name = 'Fresh basil';
  RAISE NOTICE '   rows renamed = %  EXPECTED 1', ingredients;
  ASSERT ingredients = 1, 'the partner could not insert-then-update an ingredient';

  DELETE FROM public.recipe_ingredients WHERE recipe_id = rec AND name = 'Fresh basil';
  SELECT count(*) INTO ingredients FROM public.recipe_ingredients WHERE recipe_id = rec;
  RAISE NOTICE '   ingredients after delete = %  EXPECTED 1', ingredients;
  ASSERT ingredients = 1, 'the partner could not delete the ingredient they added';

  RAISE NOTICE '5. the outsider cannot INSERT into the other household''s recipe';
  PERFORM set_config('request.jwt.claim.sub', outsider_b::text, true);
  refused := false;
  BEGIN
    INSERT INTO public.recipe_ingredients (recipe_id, name, sort_order) VALUES (rec, 'Sabotage', 9);
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  RAISE NOTICE '   refused = %  EXPECTED true', refused;
  ASSERT refused, 'an outsider inserted into another household''s recipe';

  RESET ROLE;

  -- --------------------------------------------------------------- cleanup --
  -- Deleting the auth users cascades to their memberships; the households the
  -- signup chain made for them go with the fixture rather than being left to
  -- accumulate across runs.
  DELETE FROM public.recipes WHERE id = rec;
  DELETE FROM auth.users WHERE id IN (owner_a, partner_a, outsider_b);
  DELETE FROM public.households h
   WHERE NOT EXISTS (SELECT 1 FROM public.household_members m WHERE m.household_id = h.id)
     AND h.id = hh_a;

  RAISE NOTICE 'us711: all 5 cases passed';
END $$;
