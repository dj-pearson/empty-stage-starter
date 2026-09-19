-- US-798: three SEPARATE households, not three rows.
-- Run: psql -f supabase/tests/us798_generic_promotion.test.sql
--
-- The assertion the story names is number 2: one household adding the same
-- food three times must NOT become a candidate. That is the whole reason the
-- count is count(DISTINCT household_id) computed live rather than a stored
-- times_added, which counts adds. US-784 and US-785 exist in this repo because
-- a denormalised count drifted from the rows it summarised.
--
-- Fixtures use a 'US798 Test' prefix and a fixed uuid range so the file is
-- re-runnable, and everything rolls back.
\set ON_ERROR_STOP on
BEGIN;

-- Three households and an admin to read the queue as.
INSERT INTO public.households (id, name) VALUES
  ('79800000-0000-0000-0000-000000000001', 'US798 Test Household A'),
  ('79800000-0000-0000-0000-000000000002', 'US798 Test Household B'),
  ('79800000-0000-0000-0000-000000000003', 'US798 Test Household C');

-- foods.user_id is NOT NULL, so each household needs an owner. Triggers are
-- suppressed for the fixture users because on_auth_user_created would create
-- a household, a profile and a preferences row this file has no use for.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('79800000-0000-0000-0000-0000000000ad'),
  ('79800000-0000-0000-0000-00000000000a'),
  ('79800000-0000-0000-0000-00000000000b'),
  ('79800000-0000-0000-0000-00000000000c')
ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = DEFAULT;
INSERT INTO public.user_roles (user_id, role)
VALUES ('79800000-0000-0000-0000-0000000000ad', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Helper: read the queue as the admin.
CREATE TEMP VIEW us798_candidates AS
  SELECT * FROM public.generic_promotion_candidates(3, 500);

-- 1. Three separate households typing the same name IS a candidate.
INSERT INTO public.foods (user_id, household_id, name, category, is_safe, is_try_bite) VALUES
  ('79800000-0000-0000-0000-00000000000a', '79800000-0000-0000-0000-000000000001', 'US798 Test Oat Milk', 'dairy', false, false),
  ('79800000-0000-0000-0000-00000000000b', '79800000-0000-0000-0000-000000000002', 'us798 test oat milk', 'dairy', false, false),
  ('79800000-0000-0000-0000-00000000000c', '79800000-0000-0000-0000-000000000003', 'US798 Test Oat Milk  ', 'dairy', false, false);

DO $a1$
DECLARE v RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '79800000-0000-0000-0000-0000000000ad', true);
  SELECT * INTO v FROM public.generic_promotion_candidates(3, 500)
   WHERE name_normalized = 'us798 test oat milk';

  IF v IS NULL THEN
    RAISE EXCEPTION 'assertion 1: three separate households typed it and it is not a candidate';
  END IF;
  IF v.household_count <> 3 THEN
    RAISE EXCEPTION 'assertion 1: expected household_count 3, got %', v.household_count;
  END IF;
  RAISE NOTICE 'assertion 1 ok (3 households -> candidate, count %) ', v.household_count;
END $a1$;

-- 2. THE ASSERTION THE STORY NAMES. One household, same food three times, is
--    NOT a candidate. A counter of adds would have said 3 here.
INSERT INTO public.foods (user_id, household_id, name, category, is_safe, is_try_bite) VALUES
  ('79800000-0000-0000-0000-00000000000a', '79800000-0000-0000-0000-000000000001', 'US798 Test Rice Cakes', 'carb', false, false),
  ('79800000-0000-0000-0000-00000000000a', '79800000-0000-0000-0000-000000000001', 'US798 Test Rice Cakes', 'carb', false, false),
  ('79800000-0000-0000-0000-00000000000a', '79800000-0000-0000-0000-000000000001', 'us798 test rice cakes', 'carb', false, false);

DO $a2$
DECLARE n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '79800000-0000-0000-0000-0000000000ad', true);
  SELECT count(*) INTO n FROM public.generic_promotion_candidates(3, 500)
   WHERE name_normalized = 'us798 test rice cakes';

  IF n <> 0 THEN
    RAISE EXCEPTION 'assertion 2: one household adding a food three times became a candidate. '
      'The count is not counting DISTINCT households.';
  END IF;
  RAISE NOTICE 'assertion 2 ok (one household x3 is not a candidate)';
END $a2$;

-- 3. Two households is under the threshold.
INSERT INTO public.foods (user_id, household_id, name, category, is_safe, is_try_bite) VALUES
  ('79800000-0000-0000-0000-00000000000a', '79800000-0000-0000-0000-000000000001', 'US798 Test Halloumi', 'protein', false, false),
  ('79800000-0000-0000-0000-00000000000b', '79800000-0000-0000-0000-000000000002', 'US798 Test Halloumi', 'protein', false, false);

DO $a3$
DECLARE n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '79800000-0000-0000-0000-0000000000ad', true);
  SELECT count(*) INTO n FROM public.generic_promotion_candidates(3, 500)
   WHERE name_normalized = 'us798 test halloumi';
  IF n <> 0 THEN
    RAISE EXCEPTION 'assertion 3: two households tripped a threshold of three';
  END IF;
  RAISE NOTICE 'assertion 3 ok (two households is under the threshold)';
END $a3$;

-- 4. The threshold is a parameter: the same data at 2 IS a candidate. This is
--    what "raised without a migration" means -- the caller decides.
DO $a4$
DECLARE n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '79800000-0000-0000-0000-0000000000ad', true);
  SELECT count(*) INTO n FROM public.generic_promotion_candidates(2, 500)
   WHERE name_normalized = 'us798 test halloumi';
  IF n <> 1 THEN
    RAISE EXCEPTION 'assertion 4: expected halloumi at a threshold of 2, got % rows', n;
  END IF;
  RAISE NOTICE 'assertion 4 ok (threshold is a parameter)';
END $a4$;

-- 5. A threshold of 1 is refused. One household is not a frequency gate, it is
--    publishing somebody's private row.
DO $a5$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '79800000-0000-0000-0000-0000000000ad', true);
  PERFORM * FROM public.generic_promotion_candidates(1, 500);
  RAISE EXCEPTION 'assertion 5: a threshold of 1 was accepted';
EXCEPTION WHEN invalid_parameter_value THEN
  RAISE NOTICE 'assertion 5 ok (a threshold below 2 is refused)';
END $a5$;

-- 6. A name already in the catalog is not a candidate, however many households
--    typed it.
INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, source, verification)
VALUES ('US798 Test Oat Milk', 'us798 test oat milk', 'generic', 'usda', 'verified');

DO $a6$
DECLARE n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '79800000-0000-0000-0000-0000000000ad', true);
  SELECT count(*) INTO n FROM public.generic_promotion_candidates(3, 500)
   WHERE name_normalized = 'us798 test oat milk';
  IF n <> 0 THEN
    RAISE EXCEPTION 'assertion 6: a name already in the catalog is still queued';
  END IF;
  RAISE NOTICE 'assertion 6 ok (already catalogued -> not a candidate)';
END $a6$;

-- 7. It leaks nothing. The result carries a name and a count and no identifier
--    of any kind, which is what lets an operator look at this queue at all.
DO $a7$
DECLARE cols TEXT;
BEGIN
  SELECT string_agg(p.name, ',' ORDER BY p.ordinality) INTO cols
    FROM unnest(
      (SELECT proargnames FROM pg_proc
        WHERE proname = 'generic_promotion_candidates'
          AND pronamespace = 'public'::regnamespace)
    ) WITH ORDINALITY AS p(name, ordinality)
   WHERE p.name NOT LIKE 'p\_%';

  IF cols IS DISTINCT FROM 'name_normalized,household_count,sample_name' THEN
    RAISE EXCEPTION 'assertion 7: the candidate row shape changed to (%). It must carry no '
      'household id, user id or row id -- this queue is read by an operator and the '
      'privacy gate is the whole point of the story.', cols;
  END IF;
  RAISE NOTICE 'assertion 7 ok (no identifiers in the candidate row)';
END $a7$;

-- 8. A non-admin cannot read the queue at all.
DO $a8$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '79800000-0000-0000-0000-00000000beef', true);
  PERFORM * FROM public.generic_promotion_candidates(3, 500);
  RAISE EXCEPTION 'assertion 8: a non-admin read the promotion queue';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'assertion 8 ok (non-admin refused)';
END $a8$;

-- 9. anon cannot execute it. US-804: a REVOKE naming only PUBLIC would have
--    left the default-ACL grant in place and this would be false.
DO $a9$
BEGIN
  IF has_function_privilege('anon', 'public.generic_promotion_candidates(integer, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion 9: anon can execute the promotion queue function';
  END IF;
  RAISE NOTICE 'assertion 9 ok (anon has no EXECUTE)';
END $a9$;

ROLLBACK;
