-- Item 25: kids.pickiness_level, texture_sensitivity_level and
-- preferred_preparations exist, are nullable, and a signed-in household
-- member can write them under the kids RLS policies -- which is what the web
-- intake and the iOS editor do. Another household cannot.
--
-- Migration: supabase/migrations/20260925000004_kids_intake_columns.sql.
-- One DO block that ASSERTs, run against a database built from migrations:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/kids_intake_columns.test.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  owner_a    uuid := '25250000-0000-0000-0000-000000000001';
  partner_a  uuid := '25250000-0000-0000-0000-000000000002';
  outsider_b uuid := '25250000-0000-0000-0000-000000000003';
  kid        uuid := '25250000-0000-0000-0000-0000000000c1';
  hh_a       uuid;
  n          int;
  got_pick   text;
  got_tex    text;
  got_prep   text[];
  col_count  int;
  backup     jsonb;
BEGIN
  -- Torn down first so a re-run behaves like a first run.
  DELETE FROM public.kids WHERE id = kid;
  DELETE FROM auth.users WHERE id IN (owner_a, partner_a, outsider_b);

  RAISE NOTICE '1. the three columns exist, are nullable, and have the client-facing types';
  SELECT count(*) INTO col_count
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'kids' AND is_nullable = 'YES'
     AND ((column_name = 'pickiness_level'           AND data_type = 'text')
       OR (column_name = 'texture_sensitivity_level' AND data_type = 'text')
       OR (column_name = 'preferred_preparations'    AND data_type = 'ARRAY' AND udt_name = '_text'));
  RAISE NOTICE '   matching nullable columns = %  EXPECTED 3', col_count;
  ASSERT col_count = 3, 'kids is missing one of the intake columns, or it is NOT NULL / the wrong type';

  -- The signup chain gives each user a household; the partner then joins the
  -- owner's, which is what accepting an invite does.
  INSERT INTO auth.users (id, email) VALUES
    (owner_a,    'kids-intake-owner@example.test'),
    (partner_a,  'kids-intake-partner@example.test'),
    (outsider_b, 'kids-intake-outsider@example.test');
  SELECT household_id INTO hh_a FROM public.household_members WHERE user_id = owner_a;
  ASSERT hh_a IS NOT NULL, 'the signup chain did not give the owner a household';
  UPDATE public.household_members SET household_id = hh_a WHERE user_id = partner_a;

  -- Seeded as table owner (RLS bypassed): the fixture is state, not the test.
  -- The new columns are left out, the way an older iOS build inserts.
  INSERT INTO public.kids (id, user_id, household_id, name) VALUES (kid, owner_a, hh_a, 'Maya');
  SELECT pickiness_level, texture_sensitivity_level, preferred_preparations
    INTO got_pick, got_tex, got_prep FROM public.kids WHERE id = kid;
  RAISE NOTICE '2. an insert that omits them leaves all three NULL: %, %, %  EXPECTED NULL x3', got_pick, got_tex, got_prep;
  ASSERT got_pick IS NULL AND got_tex IS NULL AND got_prep IS NULL, 'the new columns should have no default';

  SET LOCAL ROLE authenticated;

  RAISE NOTICE '3. the PARTNER in the same household saves the intake answers';
  PERFORM set_config('request.jwt.claim.sub', partner_a::text, true);
  UPDATE public.kids
     SET pickiness_level = 'extremely_picky',
         texture_sensitivity_level = 'strong',
         preferred_preparations = ARRAY['Only cold foods']
   WHERE id = kid;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '   rows updated = %  EXPECTED 1', n;
  ASSERT n = 1, 'a household member cannot save the intake columns';

  RAISE NOTICE '4. the OWNER reads them back, and can clear them with NULL';
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  SELECT pickiness_level, texture_sensitivity_level, preferred_preparations
    INTO got_pick, got_tex, got_prep FROM public.kids WHERE id = kid;
  RAISE NOTICE '   read = %, %, %  EXPECTED extremely_picky, strong, {"Only cold foods"}', got_pick, got_tex, got_prep;
  ASSERT got_pick = 'extremely_picky' AND got_tex = 'strong' AND got_prep = ARRAY['Only cold foods'],
    'the owner does not read back what the partner saved';
  -- An old iOS label is accepted: there is deliberately no CHECK.
  UPDATE public.kids SET pickiness_level = 'Very Picky', texture_sensitivity_level = NULL WHERE id = kid;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'the owner cannot update the intake columns, or a free-text label was rejected';

  RAISE NOTICE '5. a user in ANOTHER household can neither read nor write them';
  PERFORM set_config('request.jwt.claim.sub', outsider_b::text, true);
  SELECT count(*) INTO n FROM public.kids WHERE id = kid;
  RAISE NOTICE '   visible rows = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household can read this kid';
  UPDATE public.kids SET pickiness_level = 'not_picky' WHERE id = kid;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '   rows updated = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household can write this kid''s intake columns';

  RESET ROLE;
  SELECT pickiness_level INTO got_pick FROM public.kids WHERE id = kid;
  ASSERT got_pick = 'Very Picky', 'the outsider''s update landed';

  RAISE NOTICE '6. the kids query in extract_user_backup_data, which reads k.pickiness_level, resolves';
  -- The whole function cannot be called here: it fails further down on
  -- food_attempts (fa.user_id does not exist), which is a separate defect.
  -- This is its kids SELECT, verbatim in the columns it names.
  SELECT jsonb_agg(jsonb_build_object(
           'id', k.id, 'name', k.name, 'age', k.age, 'date_of_birth', k.date_of_birth,
           'allergens', k.allergens, 'pickiness_level', k.pickiness_level,
           'favorite_foods', k.favorite_foods, 'texture_preferences', k.texture_preferences,
           'texture_dislikes', k.texture_dislikes, 'flavor_preferences', k.flavor_preferences,
           'dietary_restrictions', k.dietary_restrictions, 'created_at', k.created_at))
    INTO backup FROM public.kids k WHERE k.user_id = owner_a;
  RAISE NOTICE '   kids[0].pickiness_level = %  EXPECTED Very Picky', backup #>> '{0,pickiness_level}';
  ASSERT backup #>> '{0,pickiness_level}' = 'Very Picky', 'the backup kids query does not carry pickiness_level';

  -- Clean up so the next run starts from nothing.
  DELETE FROM public.kids WHERE id = kid;
  DELETE FROM auth.users WHERE id IN (owner_a, partner_a, outsider_b);
END
$$;
