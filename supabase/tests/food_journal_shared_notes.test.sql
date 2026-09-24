-- Food journal: a note one caregiver writes is readable by the other, and
-- plan_entries.amount_eaten accepts only the three recorded amounts.
--
-- Before 20260924000000 plan_entry_feedback was owner-only on SELECT, so the
-- note the iOS "How was it?" sheet saved could be read back by nobody but its
-- author. A nanny and a parent sharing a household never saw each other's.
--
-- Run: bash scripts/dev/local-sql-suite.sh

\pset format unaligned
\pset tuples_only on

DO $$
DECLARE
  hh_a       uuid;
  parent_a   uuid := '92400000-0000-0000-0000-000000000001';
  nanny_a    uuid := '92400000-0000-0000-0000-000000000002';
  outsider_b uuid := '92400000-0000-0000-0000-000000000003';
  kid        uuid := '92400000-0000-0000-0000-0000000000a1';
  food       uuid := '92400000-0000-0000-0000-0000000000b1';
  entry      uuid := '92400000-0000-0000-0000-0000000000c1';
  n          int;
  refused    boolean;
BEGIN
  DELETE FROM auth.users WHERE id IN (parent_a, nanny_a, outsider_b);

  -- Signup gives each account its own household; the nanny then joins the
  -- parent's, which is what accepting an invite does.
  INSERT INTO auth.users (id, email) VALUES
    (parent_a,   'fj-parent@example.test'),
    (nanny_a,    'fj-nanny@example.test'),
    (outsider_b, 'fj-outsider@example.test');

  SELECT household_id INTO hh_a FROM public.household_members WHERE user_id = parent_a;
  ASSERT hh_a IS NOT NULL, 'the signup chain did not give the parent a household';
  UPDATE public.household_members SET household_id = hh_a WHERE user_id = nanny_a;

  INSERT INTO public.kids (id, user_id, household_id, name)
    VALUES (kid, parent_a, hh_a, 'Sam');
  INSERT INTO public.foods (id, user_id, household_id, name, category)
    VALUES (food, parent_a, hh_a, 'Crackers', 'snack');
  INSERT INTO public.plan_entries (id, user_id, household_id, kid_id, food_id, date, meal_slot)
    VALUES (entry, parent_a, hh_a, kid, food, CURRENT_DATE, 'lunch');

  -- The nanny's note, as the iOS sheet writes it.
  INSERT INTO public.plan_entry_feedback (plan_entry_id, user_id, rating, note)
    VALUES (entry, nanny_a, 3, 'Only ate the corners');

  RAISE NOTICE '1. amount_eaten accepts a_lot, some, nibbles and NULL';
  UPDATE public.plan_entries SET amount_eaten = 'a_lot'   WHERE id = entry;
  UPDATE public.plan_entries SET amount_eaten = 'some'    WHERE id = entry;
  UPDATE public.plan_entries SET amount_eaten = 'nibbles' WHERE id = entry;
  UPDATE public.plan_entries SET amount_eaten = NULL      WHERE id = entry;

  RAISE NOTICE '2. amount_eaten refuses anything else';
  refused := false;
  BEGIN
    UPDATE public.plan_entries SET amount_eaten = 'half' WHERE id = entry;
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  ASSERT refused, 'amount_eaten accepted a value outside a_lot/some/nibbles';

  SET LOCAL ROLE authenticated;

  RAISE NOTICE '3. the author still reads their own note';
  PERFORM set_config('request.jwt.claim.sub', nanny_a::text, true);
  SELECT count(*) INTO n FROM public.plan_entry_feedback WHERE plan_entry_id = entry;
  ASSERT n = 1, 'the author cannot read their own note';

  RAISE NOTICE '4. the parent in the same household reads the nanny''s note';
  PERFORM set_config('request.jwt.claim.sub', parent_a::text, true);
  SELECT count(*) INTO n FROM public.plan_entry_feedback WHERE plan_entry_id = entry;
  RAISE NOTICE '   rows = %  EXPECTED 1 (0 before the migration)', n;
  ASSERT n = 1, 'a household member cannot read a note written about their child';

  RAISE NOTICE '5. the parent still cannot edit the nanny''s note';
  UPDATE public.plan_entry_feedback SET note = 'changed' WHERE plan_entry_id = entry;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'a household member rewrote someone else''s note';

  RAISE NOTICE '6. another household reads nothing';
  PERFORM set_config('request.jwt.claim.sub', outsider_b::text, true);
  SELECT count(*) INTO n FROM public.plan_entry_feedback WHERE plan_entry_id = entry;
  ASSERT n = 0, 'another household can read this note';

  RESET ROLE;
  DELETE FROM auth.users WHERE id IN (parent_a, nanny_a, outsider_b);
  DELETE FROM public.households WHERE id = hh_a;
END $$;
