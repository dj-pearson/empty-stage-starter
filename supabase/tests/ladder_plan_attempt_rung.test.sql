-- Items 40/41 (20260926000002): a meal result on a laddered food is recorded
-- at the child's rung, exactly once; the exposure_ladder flag row is on; and
-- the trigger function is not executable by the API roles.
--
-- Run: bash scripts/dev/local-sql-suite.sh

\pset format unaligned
\pset tuples_only on

DO $$
DECLARE
  hh        uuid;
  parent    uuid := '92600000-0000-0000-0000-000000000001';
  kid       uuid := '92600000-0000-0000-0000-0000000000a1';
  f_ladder  uuid := '92600000-0000-0000-0000-0000000000b1';
  f_plain   uuid := '92600000-0000-0000-0000-0000000000b2';
  f_paused  uuid := '92600000-0000-0000-0000-0000000000b3';
  f_linked  uuid := '92600000-0000-0000-0000-0000000000b4';
  e_ladder  uuid := '92600000-0000-0000-0000-0000000000c1';
  e_plain   uuid := '92600000-0000-0000-0000-0000000000c2';
  e_paused  uuid := '92600000-0000-0000-0000-0000000000c3';
  e_linked  uuid := '92600000-0000-0000-0000-0000000000c4';
  pre_attempt uuid := '92600000-0000-0000-0000-0000000000d1';
  n         int;
  v_stage   text;
  v_outcome text;
  v_link    uuid;
  v_enabled boolean;
  v_rollout int;
BEGIN
  DELETE FROM auth.users WHERE id = parent;
  INSERT INTO auth.users (id, email) VALUES (parent, 'ladder-rung@example.test');
  SELECT household_id INTO hh FROM public.household_members WHERE user_id = parent;
  ASSERT hh IS NOT NULL, 'the signup chain did not give the parent a household';

  INSERT INTO public.kids (id, user_id, household_id, name) VALUES (kid, parent, hh, 'Rae');
  INSERT INTO public.foods (id, user_id, household_id, name, category) VALUES
    (f_ladder, parent, hh, 'Broccoli', 'vegetable'),
    (f_plain,  parent, hh, 'Toast',    'carb'),
    (f_paused, parent, hh, 'Peas',     'vegetable'),
    (f_linked, parent, hh, 'Carrot',   'vegetable');

  INSERT INTO public.kid_food_ladder (kid_id, food_id, current_rung, status, next_due_on) VALUES
    (kid, f_ladder, 'touching', 'active', NULL),
    (kid, f_paused, 'licking',  'paused', NULL),
    (kid, f_linked, 'smelling', 'active', NULL);

  INSERT INTO public.plan_entries (id, user_id, household_id, kid_id, food_id, date, meal_slot) VALUES
    (e_ladder, parent, hh, kid, f_ladder, CURRENT_DATE, 'dinner'),
    (e_plain,  parent, hh, kid, f_plain,  CURRENT_DATE, 'breakfast'),
    (e_paused, parent, hh, kid, f_paused, CURRENT_DATE, 'lunch'),
    (e_linked, parent, hh, kid, f_linked, CURRENT_DATE, 'snack1');

  -- The web ladder log inserts its own attempt first, then links it.
  INSERT INTO public.food_attempts (id, kid_id, food_id, stage, outcome, plan_entry_id)
    VALUES (pre_attempt, kid, f_linked, 'smelling', 'success', e_linked);

  -- Everything below runs as the signed-in parent, the way PostgREST does.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', parent::text, true);

  RAISE NOTICE '1. a result on an active ladder food is recorded at its rung';
  UPDATE public.plan_entries SET result = 'tasted' WHERE id = e_ladder;
  SELECT stage, outcome INTO v_stage, v_outcome
    FROM public.food_attempts WHERE plan_entry_id = e_ladder;
  RAISE NOTICE '   stage = %  EXPECTED touching (small_bite before the migration)', v_stage;
  ASSERT v_stage = 'touching', 'the attempt was not recorded at the ladder rung';
  ASSERT v_outcome = 'partial', 'tasted must map to partial, as useFoodLadder.quickLog maps held';
  SELECT food_attempt_id INTO v_link FROM public.plan_entries WHERE id = e_ladder;
  ASSERT v_link IS NOT NULL, 'the plan entry was not linked to its attempt';

  RAISE NOTICE '2. changing the result later writes no second attempt';
  UPDATE public.plan_entries SET result = 'ate' WHERE id = e_ladder;
  SELECT count(*) INTO n FROM public.food_attempts WHERE plan_entry_id = e_ladder;
  ASSERT n = 1, format('expected one attempt for the entry, found %s', n);

  RAISE NOTICE '3. undo then re-log writes no second attempt either';
  UPDATE public.plan_entries SET result = NULL WHERE id = e_ladder;
  UPDATE public.plan_entries SET result = 'refused' WHERE id = e_ladder;
  SELECT count(*) INTO n FROM public.food_attempts WHERE plan_entry_id = e_ladder;
  ASSERT n = 1, format('undo + re-log doubled the attempt: %s rows', n);

  RAISE NOTICE '4. a food with no ladder row keeps the fixed stage';
  UPDATE public.plan_entries SET result = 'ate' WHERE id = e_plain;
  SELECT stage, outcome INTO v_stage, v_outcome
    FROM public.food_attempts WHERE plan_entry_id = e_plain;
  ASSERT v_stage = 'full_portion' AND v_outcome = 'success',
    format('unladdered food: got %s/%s', v_stage, v_outcome);

  RAISE NOTICE '5. a paused ladder row is not treated as active';
  UPDATE public.plan_entries SET result = 'refused' WHERE id = e_paused;
  SELECT stage INTO v_stage FROM public.food_attempts WHERE plan_entry_id = e_paused;
  ASSERT v_stage = 'looking', format('paused food: got stage %s', v_stage);

  RAISE NOTICE '6. the ladder''s own log (result + food_attempt_id together) adds nothing';
  UPDATE public.plan_entries SET result = 'ate', food_attempt_id = pre_attempt WHERE id = e_linked;
  SELECT count(*) INTO n FROM public.food_attempts WHERE food_id = f_linked;
  ASSERT n = 1, format('the ladder log was double-written: %s attempts', n);

  RAISE NOTICE '7. the trigger does not move the ladder (the client folds it in)';
  SELECT current_rung INTO v_stage FROM public.kid_food_ladder WHERE kid_id = kid AND food_id = f_ladder;
  ASSERT v_stage = 'touching', format('the trigger moved the rung to %s', v_stage);

  RESET ROLE;

  RAISE NOTICE '8. the API roles cannot execute the trigger function';
  ASSERT NOT has_function_privilege('anon', 'public.create_attempt_from_plan_result()', 'EXECUTE'),
    'anon can execute create_attempt_from_plan_result';
  ASSERT NOT has_function_privilege('authenticated', 'public.create_attempt_from_plan_result()', 'EXECUTE'),
    'authenticated can execute create_attempt_from_plan_result';

  RAISE NOTICE '9. the exposure_ladder flag row is on for everyone';
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'feature_flags') THEN
    SELECT enabled, rollout_percentage INTO v_enabled, v_rollout
      FROM public.feature_flags WHERE key = 'exposure_ladder';
    ASSERT v_enabled AND v_rollout = 100,
      format('exposure_ladder is enabled=%s rollout=%s', v_enabled, v_rollout);
    ASSERT public.evaluate_feature_flag('exposure_ladder', parent),
      'evaluate_feature_flag does not return true for exposure_ladder';
  ELSE
    RAISE NOTICE '   feature_flags not present here; skipped';
  END IF;

  DELETE FROM auth.users WHERE id = parent;
  DELETE FROM public.households WHERE id = hh;
END $$;
