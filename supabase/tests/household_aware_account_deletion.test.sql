-- Household-aware account deletion (owner decision 1a, 2026-09-25).
--
-- A parent who deletes their account leaves the family's data with the
-- household's remaining members; a sole member's data is deleted as before.
-- Built against a database made from the migration history, not a mock.
--
-- HOW TO RUN: `bash scripts/dev/local-sql-suite.sh`. Never against production.
--
-- The "delete" below replays what supabase/functions/delete-account/index.ts
-- does, in the same order: transfer_user_household_data, then DELETE ... WHERE
-- user_id = caller over its USER_SCOPED_TABLES, then the auth.users row. Keep
-- the table list here in step with USER_SCOPED_TABLES there.
--
-- Every check prints EXPECTED alongside the value.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.hada_delete_account(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  t text;
BEGIN
  PERFORM public.transfer_user_household_data(p_user, false);
  FOREACH t IN ARRAY ARRAY[
    'agent_events', 'backup_logs', 'budget_calculations', 'delivery_preferences',
    'foods', 'grocery_delivery', 'grocery_delivery_orders', 'grocery_items',
    'grocery_lists', 'kids', 'meal_plan_templates', 'meal_voting',
    'nurture_enrollments', 'plan_entries', 'plan_entry_made_log',
    'push_notifications', 'quiz_responses', 'recipes', 'report_preferences',
    'stock_comparison_samples', 'store_layouts', 'suggestion_feedback',
    'suggestion_preferences', 'user_accessibility_preferences',
    'user_activity_timeline', 'user_attributes', 'user_delivery_accounts',
    'user_roles', 'user_segment_members', 'user_subscriptions', 'voting_sessions'
  ] LOOP
    -- The edge function records a missing table or column and moves on; so
    -- does this. Anything else (a foreign key) fails the suite.
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', t) USING p_user;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      NULL;
    END;
  END LOOP;
  DELETE FROM auth.users WHERE id = p_user;
END;
$$;

DO $$
DECLARE
  leaver     UUID := gen_random_uuid();
  coparent   UUID := gen_random_uuid();
  third      UUID := gen_random_uuid();
  solo       UUID := gen_random_uuid();
  hh         UUID;
  hh_solo    UUID;
  kid_mia    UUID := gen_random_uuid();
  kid_leo    UUID := gen_random_uuid();
  kid_solo   UUID := gen_random_uuid();
  food       UUID := gen_random_uuid();
  food_solo  UUID := gen_random_uuid();
  recipe     UUID := gen_random_uuid();
  entry      UUID := gen_random_uuid();
  list_id    UUID := gen_random_uuid();
  layout     UUID := gen_random_uuid();
  code       TEXT;
  summary    JSONB;
  before_sig TEXT;
  after_sig  TEXT;
  n          INTEGER;
  got        UUID;
  failed     BOOLEAN;
BEGIN
  -- Torn down first so a re-run behaves like a first run.
  UPDATE public.household_members SET invited_by = NULL
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'hada-%@example.test');
  DELETE FROM public.household_invitations
   WHERE invited_by IN (SELECT id FROM auth.users WHERE email LIKE 'hada-%@example.test');
  DELETE FROM public.households
   WHERE id IN (SELECT hm.household_id FROM public.household_members hm
                  JOIN auth.users u ON u.id = hm.user_id
                 WHERE u.email LIKE 'hada-%@example.test');
  DELETE FROM public.user_subscriptions
   WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'hada-%@example.test');
  DELETE FROM auth.users WHERE email LIKE 'hada-%@example.test';

  -- Each insert fires handle_new_user -> ensure_user_household.
  INSERT INTO auth.users (id, email) VALUES
    (leaver,   'hada-leaver@example.test'),
    (coparent, 'hada-coparent@example.test'),
    (third,    'hada-third@example.test'),
    (solo,     'hada-solo@example.test');
  UPDATE public.profiles SET full_name = 'Sam' WHERE id = coparent;

  SELECT household_id INTO hh      FROM public.household_members WHERE user_id = leaver;
  SELECT household_id INTO hh_solo FROM public.household_members WHERE user_id = solo;

  -- Sharing needs a plan with more than one seat (US-840).
  INSERT INTO public.user_subscriptions (user_id, plan_id, status)
    SELECT leaver, id, 'active' FROM public.subscription_plans WHERE name = 'Family Plus';

  -- The co-parent joins first, then a third member. Both invites are the
  -- leaver's, so household_members.invited_by (NO ACTION) points at them.
  PERFORM set_config('request.jwt.claim.sub', leaver::text, true);
  code := public.create_household_invite('parent');
  PERFORM set_config('request.jwt.claim.sub', coparent::text, true);
  PERFORM public.accept_household_invite(code);
  PERFORM set_config('request.jwt.claim.sub', leaver::text, true);
  code := public.create_household_invite('parent');
  PERFORM set_config('request.jwt.claim.sub', third::text, true);
  PERFORM public.accept_household_invite(code);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  -- Make the join order unambiguous: the co-parent joined before the third.
  UPDATE public.household_members SET joined_at = now() - interval '2 days'
   WHERE user_id = coparent AND household_id = hh;
  UPDATE public.household_members SET joined_at = now() - interval '1 day'
   WHERE user_id = third AND household_id = hh;
  UPDATE public.household_members SET joined_at = now() - interval '30 days'
   WHERE user_id = leaver AND household_id = hh;

  -- The leaver created the family's data.
  INSERT INTO public.kids (id, user_id, household_id, name, created_at) VALUES
    (kid_mia, leaver, hh, 'Mia', now() - interval '3 days'),
    (kid_leo, leaver, hh, 'Leo', now() - interval '2 days');
  INSERT INTO public.foods (id, user_id, household_id, name, category)
    VALUES (food, leaver, hh, 'Broccoli', 'vegetable');
  INSERT INTO public.recipes (id, user_id, household_id, name)
    VALUES (recipe, leaver, hh, 'Mac and peas');
  INSERT INTO public.plan_entries (id, user_id, household_id, kid_id, date, meal_slot, food_id)
    VALUES (entry, leaver, hh, kid_mia, current_date, 'dinner', food);
  INSERT INTO public.grocery_lists (id, user_id, household_id, name)
    VALUES (list_id, leaver, hh, 'Weekly');
  INSERT INTO public.grocery_items (user_id, household_id, grocery_list_id, name, category)
    VALUES (leaver, hh, list_id, 'Milk', 'dairy');
  INSERT INTO public.store_layouts (id, user_id, household_id, name)
    VALUES (layout, leaver, hh, 'Corner shop');
  INSERT INTO public.recipe_attempts (user_id, kid_id, recipe_id) VALUES (leaver, kid_leo, recipe);

  -- NO ACTION references to the leaver that used to block deleteUser.
  INSERT INTO public.kid_allergen_change_log (kid_id, changed_by_user_id, source)
    VALUES (kid_mia, leaver, 'parent');
  INSERT INTO public.recipe_photos (recipe_id, photo_url, uploaded_by_user_id)
    VALUES (recipe, 'https://example.test/p.jpg', leaver);
  INSERT INTO public.food_aisle_mappings (store_layout_id, food_name, user_id, food_id)
    VALUES (layout, 'Broccoli', leaver, food);
  INSERT INTO public.household_invitations (household_id, email, invited_by)
    VALUES (hh, 'hada-pending@example.test', leaver);

  -- A sole member with data of their own.
  INSERT INTO public.kids (id, user_id, household_id, name)
    VALUES (kid_solo, solo, hh_solo, 'Ada');
  INSERT INTO public.foods (id, user_id, household_id, name, category)
    VALUES (food_solo, solo, hh_solo, 'Rice', 'carb');

  -- ------------------------------------------------------------ preflight --
  SELECT md5(string_agg(x, ',' ORDER BY x)) INTO before_sig FROM (
    SELECT 'k' || id || user_id FROM public.kids WHERE household_id IN (hh, hh_solo)
    UNION ALL SELECT 'f' || id || user_id FROM public.foods WHERE household_id IN (hh, hh_solo)
    UNION ALL SELECT 'p' || id || user_id FROM public.plan_entries WHERE household_id = hh
    UNION ALL SELECT 'm' || id || user_id || coalesce(invited_by::text, '-') FROM public.household_members
      WHERE household_id IN (hh, hh_solo)
    UNION ALL SELECT 'a' || id || coalesce(changed_by_user_id::text, '-') FROM public.kid_allergen_change_log WHERE kid_id = kid_mia
    UNION ALL SELECT 'i' || id FROM public.household_invitations WHERE household_id = hh
  ) s(x);

  summary := public.transfer_user_household_data(leaver, true);

  SELECT md5(string_agg(x, ',' ORDER BY x)) INTO after_sig FROM (
    SELECT 'k' || id || user_id FROM public.kids WHERE household_id IN (hh, hh_solo)
    UNION ALL SELECT 'f' || id || user_id FROM public.foods WHERE household_id IN (hh, hh_solo)
    UNION ALL SELECT 'p' || id || user_id FROM public.plan_entries WHERE household_id = hh
    UNION ALL SELECT 'm' || id || user_id || coalesce(invited_by::text, '-') FROM public.household_members
      WHERE household_id IN (hh, hh_solo)
    UNION ALL SELECT 'a' || id || coalesce(changed_by_user_id::text, '-') FROM public.kid_allergen_change_log WHERE kid_id = kid_mia
    UNION ALL SELECT 'i' || id FROM public.household_invitations WHERE household_id = hh
  ) s(x);

  RAISE NOTICE '1. preflight writes nothing';
  RAISE NOTICE '   rows unchanged = %  EXPECTED true', before_sig = after_sig;
  ASSERT before_sig = after_sig, 'the dry run changed data';
  RAISE NOTICE '   dry_run = %  EXPECTED true', summary->>'dry_run';
  ASSERT (summary->>'dry_run')::boolean, 'summary does not say dry_run';

  RAISE NOTICE '2. preflight names the successor and the children who stay';
  RAISE NOTICE '   sole_member = %  EXPECTED false', summary->>'sole_member';
  ASSERT NOT (summary->>'sole_member')::boolean, 'a shared household read as sole member';
  RAISE NOTICE '   successor = %  EXPECTED the co-parent (joined before the third member)',
    (summary->'households'->0->>'successor_user_id')::uuid = coparent;
  ASSERT (summary->'households'->0->>'successor_user_id')::uuid = coparent, 'wrong successor';
  RAISE NOTICE '   successor_name = %  EXPECTED Sam', summary->'households'->0->>'successor_name';
  ASSERT summary->'households'->0->>'successor_name' = 'Sam', 'successor name missing';
  RAISE NOTICE '   kid_names = %  EXPECTED ["Mia", "Leo"]', summary->'households'->0->'kid_names';
  ASSERT summary->'households'->0->'kid_names' = '["Mia", "Leo"]'::jsonb, 'kid names wrong';
  RAISE NOTICE '   would transfer kids = %  EXPECTED 2', summary->'transferred'->>'kids';
  ASSERT (summary->'transferred'->>'kids')::int = 2, 'preflight kid count wrong';
  RAISE NOTICE '   would leave kids for deletion = %  EXPECTED 0', summary->'left_for_deletion'->>'kids';
  ASSERT (summary->'left_for_deletion'->>'kids')::int = 0, 'preflight left kids behind';

  summary := public.transfer_user_household_data(solo, true);
  RAISE NOTICE '3. preflight for a sole member says everything is deleted';
  RAISE NOTICE '   sole_member = %  EXPECTED true', summary->>'sole_member';
  ASSERT (summary->>'sole_member')::boolean, 'sole member not recognised';
  RAISE NOTICE '   transferred kids = %, left kids = %  EXPECTED 0, 1',
    summary->'transferred'->>'kids', summary->'left_for_deletion'->>'kids';
  ASSERT (summary->'transferred'->>'kids')::int = 0 AND (summary->'left_for_deletion'->>'kids')::int = 1,
    'sole member counts wrong';

  -- ------------------------------------------------------ the real delete --
  failed := false;
  BEGIN
    PERFORM pg_temp.hada_delete_account(leaver);
  EXCEPTION WHEN foreign_key_violation THEN
    failed := true;
    RAISE NOTICE '   FK error: %', SQLERRM;
  END;
  RAISE NOTICE '4. a NO ACTION reference no longer blocks the account delete';
  RAISE NOTICE '   delete failed = %  EXPECTED false', failed;
  ASSERT NOT failed, 'deleting the leaver hit a foreign key';
  SELECT count(*) INTO n FROM auth.users WHERE id = leaver;
  RAISE NOTICE '   leaver auth rows = %  EXPECTED 0', n;
  ASSERT n = 0, 'the auth user is still there';

  RAISE NOTICE '5. the co-parent keeps the children, food, plan and groceries';
  SELECT count(*) INTO n FROM public.kids WHERE id IN (kid_mia, kid_leo) AND user_id = coparent AND household_id = hh;
  RAISE NOTICE '   kids = %  EXPECTED 2', n;
  ASSERT n = 2, 'kids were lost';
  SELECT count(*) INTO n FROM public.foods WHERE id = food AND user_id = coparent;
  RAISE NOTICE '   foods = %  EXPECTED 1', n;
  ASSERT n = 1, 'food was lost';
  SELECT count(*) INTO n FROM public.recipes WHERE id = recipe AND user_id = coparent;
  RAISE NOTICE '   recipes = %  EXPECTED 1', n;
  ASSERT n = 1, 'recipe was lost';
  SELECT count(*) INTO n FROM public.plan_entries WHERE id = entry AND user_id = coparent;
  RAISE NOTICE '   plan entries = %  EXPECTED 1', n;
  ASSERT n = 1, 'plan entry was lost';
  SELECT count(*) INTO n FROM public.grocery_items WHERE grocery_list_id = list_id AND user_id = coparent;
  RAISE NOTICE '   grocery items = %  EXPECTED 1', n;
  ASSERT n = 1, 'grocery item was lost';
  SELECT count(*) INTO n FROM public.grocery_lists WHERE id = list_id AND user_id = coparent;
  RAISE NOTICE '   grocery lists = %  EXPECTED 1', n;
  ASSERT n = 1, 'grocery list was lost';
  SELECT count(*) INTO n FROM public.store_layouts WHERE id = layout AND user_id = coparent;
  RAISE NOTICE '   store layouts = %  EXPECTED 1', n;
  ASSERT n = 1, 'store layout was lost';
  SELECT count(*) INTO n FROM public.recipe_attempts WHERE kid_id = kid_leo AND user_id = coparent;
  RAISE NOTICE '   recipe attempts = %  EXPECTED 1', n;
  ASSERT n = 1, 'recipe attempt was lost';
  SELECT count(*) INTO n FROM public.food_aisle_mappings WHERE store_layout_id = layout AND user_id = coparent;
  RAISE NOTICE '   aisle mappings = %  EXPECTED 1', n;
  ASSERT n = 1, 'aisle mapping was lost';

  RAISE NOTICE '6. the history survives with the reference released';
  SELECT count(*) INTO n FROM public.kid_allergen_change_log WHERE kid_id = kid_mia AND changed_by_user_id IS NULL;
  RAISE NOTICE '   allergen log rows = %  EXPECTED 1', n;
  ASSERT n = 1, 'allergen change log lost or still pointing at the leaver';
  SELECT count(*) INTO n FROM public.recipe_photos WHERE recipe_id = recipe AND uploaded_by_user_id IS NULL;
  RAISE NOTICE '   recipe photos = %  EXPECTED 1', n;
  ASSERT n = 1, 'recipe photo lost or still pointing at the leaver';
  SELECT count(*) INTO n FROM public.household_members WHERE household_id = hh AND invited_by IS NOT NULL;
  RAISE NOTICE '   memberships still naming an inviter = %  EXPECTED 0', n;
  ASSERT n = 0, 'invited_by still set';
  SELECT count(*) INTO n FROM public.household_invitations WHERE household_id = hh;
  RAISE NOTICE '   the leaver''s pending invitations = %  EXPECTED 0', n;
  ASSERT n = 0, 'pending invitation from the leaver survived';

  RAISE NOTICE '7. ownership passed to the longest-standing remaining member';
  got := public.household_owner_id(hh);
  RAISE NOTICE '   owner is co-parent = %  EXPECTED true', got = coparent;
  ASSERT got = coparent, 'household owner is not the co-parent';
  SELECT count(*) INTO n FROM public.household_members WHERE household_id = hh;
  RAISE NOTICE '   members = %  EXPECTED 2', n;
  ASSERT n = 2, 'membership count wrong';

  RAISE NOTICE '8. a sole member''s data is deleted as before';
  PERFORM pg_temp.hada_delete_account(solo);
  SELECT count(*) INTO n FROM public.kids WHERE id = kid_solo;
  RAISE NOTICE '   kids = %  EXPECTED 0', n;
  ASSERT n = 0, 'sole member kid survived';
  SELECT count(*) INTO n FROM public.foods WHERE id = food_solo;
  RAISE NOTICE '   foods = %  EXPECTED 0', n;
  ASSERT n = 0, 'sole member food survived';
  SELECT count(*) INTO n FROM auth.users WHERE id = solo;
  RAISE NOTICE '   auth rows = %  EXPECTED 0', n;
  ASSERT n = 0, 'sole member auth user survived';

  RAISE NOTICE '9. only the service role can call it';
  RAISE NOTICE '   anon = %, authenticated = %, service_role = %  EXPECTED false, false, true',
    has_function_privilege('anon', 'public.transfer_user_household_data(uuid, boolean)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.transfer_user_household_data(uuid, boolean)', 'EXECUTE'),
    has_function_privilege('service_role', 'public.transfer_user_household_data(uuid, boolean)', 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'public.transfer_user_household_data(uuid, boolean)', 'EXECUTE'),
    'anon can call transfer_user_household_data';
  ASSERT NOT has_function_privilege('authenticated', 'public.transfer_user_household_data(uuid, boolean)', 'EXECUTE'),
    'authenticated can call transfer_user_household_data';
  ASSERT has_function_privilege('service_role', 'public.transfer_user_household_data(uuid, boolean)', 'EXECUTE'),
    'service_role cannot call transfer_user_household_data';

  -- Clean up what is left.
  UPDATE public.household_members SET invited_by = NULL WHERE household_id = hh;
  DELETE FROM public.households WHERE id IN (hh, hh_solo);
  DELETE FROM public.user_subscriptions WHERE user_id IN (coparent, third);
  DELETE FROM auth.users WHERE id IN (coparent, third);
END;
$$;
