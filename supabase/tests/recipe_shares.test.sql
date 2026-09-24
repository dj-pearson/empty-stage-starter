-- Item 10: public recipe share links.
--
-- What this proves, all of it about the database rather than the page:
--   * anon cannot touch recipe_shares at all, and can call get_shared_recipe
--     (US-804: asserted with has_function_privilege, not by reading a GRANT);
--   * household members list and create their own links, another household
--     cannot see them or mint one for a recipe it does not own;
--   * a client cannot choose the token, and one recipe has one live link;
--   * the public read returns the recipe's public fields and ingredients, and
--     its result has no household, user, kid or allergen column;
--   * a revoked link returns nothing and cannot be switched back on.
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
  rec         UUID := gen_random_uuid();
  rec_legacy  UUID := gen_random_uuid();
  f_pasta     UUID := gen_random_uuid();
  f_cheese    UUID := gen_random_uuid();
  share_token TEXT;
  legacy_tok  TEXT;
  seen        INTEGER;
  refused     BOOLEAN;
  rls_on      BOOLEAN;
  got_name    TEXT;
  got_ings    JSONB;
  result_cols TEXT;
BEGIN
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'recipe-shares-%@example.test');
  DELETE FROM auth.users WHERE email LIKE 'recipe-shares-%@example.test';

  INSERT INTO auth.users (id, email) VALUES
    (owner_id,    'recipe-shares-owner@example.test'),
    (partner_id,  'recipe-shares-partner@example.test'),
    (outsider_id, 'recipe-shares-outsider@example.test');

  SELECT household_id INTO hh_owner FROM public.household_members WHERE user_id = owner_id LIMIT 1;
  SELECT household_id INTO hh_outsider FROM public.household_members WHERE user_id = outsider_id LIMIT 1;
  UPDATE public.household_members SET household_id = hh_owner WHERE user_id = partner_id;

  INSERT INTO public.foods (id, user_id, household_id, name, category, allergens) VALUES
    (f_pasta,  owner_id, hh_owner, 'Pasta',  'carb',  ARRAY['wheat']),
    (f_cheese, owner_id, hh_owner, 'Cheese', 'dairy', ARRAY['milk']);
  INSERT INTO public.recipes (id, user_id, household_id, name, instructions, prep_time, cook_time,
                              total_time_minutes, servings, tips, rating, description, food_ids)
    VALUES (rec, owner_id, hh_owner, 'Mac and cheese', '["Boil pasta","Stir in cheese"]', '5', '15',
            20, '4', 'Robin likes it plain', 5, 'For Robin', ARRAY[f_pasta, f_cheese]);
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, sort_order, optional_notes)
    VALUES (rec, 'Macaroni', 2, 'cups', 0, 'secret note'),
           (rec, 'Cheddar',  1, 'cup',  1, NULL);
  INSERT INTO public.recipes (id, user_id, household_id, name, food_ids)
    VALUES (rec_legacy, owner_id, hh_owner, 'Pasta plain', ARRAY[f_cheese, f_pasta]);

  -- 1. RLS on, and anon holds no privilege on the table.
  SELECT c.relrowsecurity INTO rls_on
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'recipe_shares';
  RAISE NOTICE '1. recipe_shares RLS enabled = %  EXPECTED true', rls_on;
  ASSERT rls_on IS TRUE, 'recipe_shares is missing or has RLS disabled';
  -- The table-level grants are not asserted here: local-sql-suite.sh runs
  -- GRANT ALL ON ALL TABLES after the migrations to stand in for Supabase's
  -- default ACL, which overwrites them. What is asserted below is behaviour
  -- that holds either way (RLS, the triggers, the function).

  -- 2. US-804: the public read is callable by anon and authenticated.
  ASSERT has_function_privilege('anon', 'public.get_shared_recipe(text)', 'EXECUTE'),
    'anon cannot execute get_shared_recipe; a signed-out visitor sees nothing';
  ASSERT has_function_privilege('authenticated', 'public.get_shared_recipe(text)', 'EXECUTE'),
    'authenticated cannot execute get_shared_recipe';
  RAISE NOTICE '2. get_shared_recipe callable by anon and authenticated';

  -- 3. The result has no private column.
  SELECT pg_get_function_result('public.get_shared_recipe(text)'::regprocedure) INTO result_cols;
  RAISE NOTICE '3. result columns: %', result_cols;
  ASSERT result_cols !~* '(household|user|kid|allergen|rating|tips|note|description|created_by)',
    'get_shared_recipe returns a private column: ' || result_cols;

  SET LOCAL ROLE authenticated;

  -- 4. The owner creates a link; the database mints the token.
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  INSERT INTO public.recipe_shares (recipe_id, household_id) VALUES (rec, hh_owner)
    RETURNING token INTO share_token;
  RAISE NOTICE '4. token length = %  EXPECTED 64', char_length(share_token);
  ASSERT char_length(share_token) = 64, 'token was not minted by the database';

  -- 4b. A token sent by the client is ignored.
  INSERT INTO public.recipe_shares (recipe_id, household_id, token)
    VALUES (rec_legacy, hh_owner, repeat('b', 64))
    RETURNING token INTO legacy_tok;
  RAISE NOTICE '4b. client token kept = %  EXPECTED false', legacy_tok = repeat('b', 64);
  ASSERT legacy_tok <> repeat('b', 64), 'a client chose its own token';

  -- 4c. A link cannot be repointed at another recipe.
  refused := false;
  BEGIN
    UPDATE public.recipe_shares SET recipe_id = rec WHERE token = legacy_tok;
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  RAISE NOTICE '4c. repoint refused = %  EXPECTED true', refused;
  ASSERT refused, 'a share link was repointed at another recipe';

  -- 4d. No DELETE policy: a link is revoked, not erased.
  DELETE FROM public.recipe_shares WHERE token = legacy_tok;
  GET DIAGNOSTICS seen = ROW_COUNT;
  RAISE NOTICE '4d. deleted rows = %  EXPECTED 0', seen;
  ASSERT seen = 0, 'a household member deleted a share row';

  -- 5. A second live link for the same recipe is refused.
  refused := false;
  BEGIN
    INSERT INTO public.recipe_shares (recipe_id, household_id) VALUES (rec, hh_owner);
  EXCEPTION WHEN unique_violation THEN
    refused := true;
  END;
  RAISE NOTICE '5. second live link refused = %  EXPECTED true', refused;
  ASSERT refused, 'two live links exist for one recipe';

  -- 6. The partner lists it; an outsider does not.
  PERFORM set_config('request.jwt.claim.sub', partner_id::text, true);
  SELECT count(*) INTO seen FROM public.recipe_shares WHERE recipe_id = rec;
  RAISE NOTICE '6. partner sees % link(s)  EXPECTED 1', seen;
  ASSERT seen = 1, 'the other parent cannot see the household''s share link';

  PERFORM set_config('request.jwt.claim.sub', outsider_id::text, true);
  SELECT count(*) INTO seen FROM public.recipe_shares WHERE recipe_id = rec;
  RAISE NOTICE '   outsider sees % link(s)  EXPECTED 0', seen;
  ASSERT seen = 0, 'another household can list this household''s share links';

  -- 7. An outsider cannot mint a link to this household's recipe, under
  --    either household id.
  refused := false;
  BEGIN
    INSERT INTO public.recipe_shares (recipe_id, household_id) VALUES (rec_legacy, hh_outsider);
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  RAISE NOTICE '7. outsider link under own household refused = %  EXPECTED true', refused;
  ASSERT refused, 'an outsider shared a recipe it does not own';
  refused := false;
  BEGIN
    INSERT INTO public.recipe_shares (recipe_id, household_id) VALUES (rec_legacy, hh_owner);
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  ASSERT refused, 'an outsider wrote a link into another household';

  -- 8. (The legacy recipe was shared in 4b; legacy_tok is that link.)

  RESET ROLE;
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  -- 9. anon reading the table directly gets nothing: refused by the grants
  --    on Supabase, zero rows under RLS where a blanket grant sits on top.
  refused := false;
  BEGIN
    SELECT count(*) INTO seen FROM public.recipe_shares;
    refused := seen = 0;
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  RAISE NOTICE '9. anon direct read empty or refused = %  EXPECTED true', refused;
  ASSERT refused, 'anon can read recipe_shares directly';

  -- 10. anon reads the shared recipe through the function.
  SELECT g.name, g.ingredients INTO got_name, got_ings FROM public.get_shared_recipe(share_token) g;
  RAISE NOTICE '10. name = %, ingredients = %', got_name, got_ings;
  ASSERT got_name = 'Mac and cheese', 'the shared recipe did not come back';
  ASSERT jsonb_array_length(got_ings) = 2, 'expected the two recipe_ingredients rows';
  ASSERT got_ings->0->>'name' = 'Macaroni' AND got_ings->1->>'name' = 'Cheddar', 'ingredient order is wrong';
  ASSERT got_ings::text !~* '(secret note|wheat|milk)', 'a note or an allergen leaked into the ingredients';

  SELECT g.ingredients INTO got_ings FROM public.get_shared_recipe(legacy_tok) g;
  RAISE NOTICE '    legacy ingredients = %', got_ings;
  ASSERT got_ings->0->>'name' = 'Cheese' AND got_ings->1->>'name' = 'Pasta',
    'a recipe with only food_ids should list its foods in order';

  -- 11. Unknown and malformed tokens return nothing.
  SELECT count(*) INTO seen FROM public.get_shared_recipe(repeat('a', 64));
  ASSERT seen = 0, 'an unknown token returned a recipe';
  SELECT count(*) INTO seen FROM public.get_shared_recipe('short');
  ASSERT seen = 0, 'a malformed token returned a recipe';
  SELECT count(*) INTO seen FROM public.get_shared_recipe(NULL);
  ASSERT seen = 0, 'a null token returned a recipe';
  RAISE NOTICE '11. unknown, short and null tokens return nothing';

  -- 12. The partner revokes; the link goes dark and stays dark.
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', partner_id::text, true);
  UPDATE public.recipe_shares SET revoked_at = now() WHERE token = share_token;
  GET DIAGNOSTICS seen = ROW_COUNT;
  RAISE NOTICE '12. revoked rows = %  EXPECTED 1', seen;
  ASSERT seen = 1, 'a household member could not revoke the link';

  UPDATE public.recipe_shares SET revoked_at = NULL WHERE token = share_token;
  GET DIAGNOSTICS seen = ROW_COUNT;
  RAISE NOTICE '    un-revoke rows = %  EXPECTED 0', seen;
  ASSERT seen = 0, 'a revoked link was switched back on';

  PERFORM set_config('request.jwt.claim.sub', outsider_id::text, true);
  UPDATE public.recipe_shares SET revoked_at = now() WHERE token = legacy_tok;
  GET DIAGNOSTICS seen = ROW_COUNT;
  ASSERT seen = 0, 'an outsider revoked another household''s link';

  RESET ROLE;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO seen FROM public.get_shared_recipe(share_token);
  RAISE NOTICE '    revoked token returns % row(s)  EXPECTED 0', seen;
  ASSERT seen = 0, 'a revoked link still shows the recipe';

  -- 13. After a revoke the recipe can be shared again, under a new token.
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  INSERT INTO public.recipe_shares (recipe_id, household_id) VALUES (rec, hh_owner)
    RETURNING token INTO legacy_tok;
  ASSERT legacy_tok <> share_token, 'a new link reused the revoked token';
  RAISE NOTICE '13. re-share after revoke gets a fresh token';

  RESET ROLE;
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'recipe-shares-%@example.test');
  DELETE FROM auth.users WHERE email LIKE 'recipe-shares-%@example.test';
  RAISE NOTICE 'recipe_shares: all assertions passed';
END
$$;
