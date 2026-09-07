-- US-793: the catalog can describe a generic food and a branded product.
-- Run: psql -f supabase/tests/us793_canonical_catalog.test.sql
--
-- Every assertion below is a DO block that RAISEs on mismatch, so a failure
-- reddens the run (ON_ERROR_STOP only trips on a real SQL error, not on a
-- printed "EXPECTED x, GOT y" string -- a bare SELECT never fails the script).
-- Fixtures use a 'us793-test-' prefix so this file stays re-runnable against
-- a seeded database without colliding with a real catalog row.
\set ON_ERROR_STOP on
BEGIN;

-- 1. The columns exist.
DO $a1$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'grocery_product_catalog'
     AND column_name IN (
       'kind','parent_food_id','calories_kcal_100','protein_g_100','carbs_g_100',
       'fat_g_100','fiber_g_100','sugar_g_100','sodium_mg_100','serving_size_g',
       'allergens','source','source_ref','verification','verified_at','verified_by',
       'name_normalized'
     );
  IF n <> 17 THEN
    RAISE EXCEPTION 'assertion 1: expected 17 catalog columns, got %', n;
  END IF;
  RAISE NOTICE 'assertion 1 ok (% columns)', n;
END $a1$;

-- 2. A generic row inserts and defaults to unverified.
INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, source, calories_kcal_100)
VALUES ('US793 Test Cheddar Cheese', 'us793-test-cheddar-cheese', 'generic', 'usda', 416);
DO $a2$
DECLARE v TEXT;
BEGIN
  SELECT verification INTO v FROM public.grocery_product_catalog
   WHERE name_normalized = 'us793-test-cheddar-cheese';
  IF v IS DISTINCT FROM 'unverified' THEN
    RAISE EXCEPTION 'assertion 2: expected unverified, got %', v;
  END IF;
  RAISE NOTICE 'assertion 2 ok (verification = %)', v;
END $a2$;

-- 3. A branded row may point at a generic parent.
INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, source, parent_food_id)
SELECT 'US793 Test Cathedral City Mature 350g', 'us793-test-cathedral-city-mature-350g', 'branded', 'openfoodfacts', id
FROM public.grocery_product_catalog WHERE name_normalized = 'us793-test-cheddar-cheese';
DO $a3$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM public.grocery_product_catalog
   WHERE kind = 'branded' AND parent_food_id IS NOT NULL
     AND name_normalized = 'us793-test-cathedral-city-mature-350g';
  IF n <> 1 THEN
    RAISE EXCEPTION 'assertion 3: expected 1 branded row with parent, got %', n;
  END IF;
  RAISE NOTICE 'assertion 3 ok (% branded row with parent)', n;
END $a3$;

-- 4. A generic row may NOT have a parent.
DO $a4$
BEGIN
  INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, parent_food_id)
  VALUES ('US793 Test Bad Generic', 'us793-test-bad-generic', 'generic',
          (SELECT id FROM public.grocery_product_catalog WHERE name_normalized = 'us793-test-cheddar-cheese'));
  RAISE EXCEPTION 'assertion 4: expected reject, got insert accepted for generic with parent';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'assertion 4 ok (check_violation)';
END $a4$;

-- 5. Impossible calories are rejected. 900 kcal/100g is pure fat.
DO $a5$
BEGIN
  INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, calories_kcal_100)
  VALUES ('US793 Test Impossible', 'us793-test-impossible', 'generic', 4000);
  RAISE EXCEPTION 'assertion 5: expected reject, got insert accepted at 4000 kcal/100g';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'assertion 5 ok (check_violation)';
END $a5$;

-- 6. BACKWARD COMPATIBILITY: the shape the shipped iOS app selects still works.
DO $a6$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT id, name, name_normalized, barcode, default_aisle_section,
           default_category, default_unit, brand, package_size, times_added
    FROM public.grocery_product_catalog
    WHERE name_normalized LIKE 'us793-test-%'
  ) AS ios_shape;
  IF n < 2 THEN
    RAISE EXCEPTION 'assertion 6: expected at least 2 rows selectable in the iOS shape, got %', n;
  END IF;
  RAISE NOTICE 'assertion 6 ok (% rows selectable in the iOS shape)', n;
END $a6$;

-- 7. The name_normalized unique index is UNCHANGED (iOS upserts on it).
DO $a7$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname = 'grocery_product_catalog_name_uq'
     AND indexdef LIKE '%UNIQUE%(name_normalized)%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'assertion 7: expected grocery_product_catalog_name_uq to be UNIQUE(name_normalized), got % matching indexes', n;
  END IF;
  RAISE NOTICE 'assertion 7 ok (name_uq intact)';
END $a7$;

-- 8. A non-admin cannot set verification='verified'.
--    RLS is deliberately NOT tightened -- iOS creates catalog rows -- so the
--    trust boundary is this column, not write access.
--    NOTE: auth.uid() reads request.jwt.claim.sub (see us711/us780 tests); a
--    bare SET LOCAL ROLE authenticated leaves it NULL, which the catalog's
--    existing "auth.uid() IS NOT NULL" RLS policies then reject outright, so
--    the non-admin identity is impersonated the same way those tests do.
--    Assert on SQLERRM too, not just the SQLSTATE: insufficient_privilege
--    (42501) is also what an RLS WITH CHECK violation or a bare "permission
--    denied for table" raises, so the code alone doesn't prove the trigger is
--    what fired.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '93930000-0000-0000-0000-000000000001', true);
DO $a8$
BEGIN
  UPDATE public.grocery_product_catalog
     SET verification = 'verified'
   WHERE name_normalized = 'us793-test-cheddar-cheese';
  RAISE EXCEPTION 'assertion 8: expected reject, got a non-admin promoted a row to verified';
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM NOT LIKE '%only an admin may change the verification state of a catalog row%' THEN
    RAISE EXCEPTION 'assertion 8: expected the guard trigger message, got %', SQLERRM;
  END IF;
  RAISE NOTICE 'assertion 8 ok (rejected with guard trigger message)';
END $a8$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- 9. A non-admin may still INSERT, because the iOS flow depends on it.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '93930000-0000-0000-0000-000000000001', true);
INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, source)
VALUES ('US793 Test User Typed Thing', 'us793-test-user-typed-thing', 'generic', 'user');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $a9$
DECLARE v TEXT;
BEGIN
  SELECT verification INTO v FROM public.grocery_product_catalog
   WHERE name_normalized = 'us793-test-user-typed-thing';
  IF v IS DISTINCT FROM 'unverified' THEN
    RAISE EXCEPTION 'assertion 9: expected unverified, got %', v;
  END IF;
  RAISE NOTICE 'assertion 9 ok (non-admin insert lands unverified)';
END $a9$;

-- 10. An admin CAN verify. Every assertion above tests the deny path; without
--     this, a broken has_role() (or an inverted condition) would leave the
--     suite green while no row could ever legitimately reach 'verified'.
--     on_auth_user_created / on_user_created_create_referral_code are
--     unrelated pre-existing schema drift on this DB (a broken
--     create_default_notification_preferences() referencing a column that
--     doesn't exist on its trigger row) that this fix round does not touch;
--     the test role isn't the table owner so it can't ALTER TABLE ... DISABLE
--     TRIGGER, but it can flip session_replication_role, which every catalog
--     assertion below needs back at its default to exercise gpc_guard_verification.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES ('93930000-0000-0000-0000-00000000ad33')
  ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = DEFAULT;
INSERT INTO public.user_roles (user_id, role) VALUES ('93930000-0000-0000-0000-00000000ad33', 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '93930000-0000-0000-0000-00000000ad33', true);
UPDATE public.grocery_product_catalog
   SET verification = 'verified'
 WHERE name_normalized = 'us793-test-cheddar-cheese';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $a10$
DECLARE v_after RECORD;
BEGIN
  SELECT verification, verified_at, verified_by INTO v_after
    FROM public.grocery_product_catalog
   WHERE name_normalized = 'us793-test-cheddar-cheese';
  IF v_after.verification IS DISTINCT FROM 'verified'
     OR v_after.verified_at IS NULL
     OR v_after.verified_by IS DISTINCT FROM '93930000-0000-0000-0000-00000000ad33'::uuid THEN
    RAISE EXCEPTION 'assertion 10: expected verified/stamped by the admin, got verification=%, verified_at=%, verified_by=%',
      v_after.verification, v_after.verified_at, v_after.verified_by;
  END IF;
  RAISE NOTICE 'assertion 10 ok (admin promoted and stamped the row)';
END $a10$;

-- 11. The escape hatch (auth.uid() IS NULL) is not reachable from the public
--     API. anon cannot even INSERT into the catalog -- the catalog's existing
--     "Catalog insertable by authenticated users" policy already blocks it --
--     which is what makes a null auth.uid() safe to treat as trusted below.
SET LOCAL ROLE anon;
DO $a11$
BEGIN
  INSERT INTO public.grocery_product_catalog (name, name_normalized, kind)
  VALUES ('US793 Test Anon Should Fail', 'us793-test-anon-should-fail', 'generic');
  RAISE EXCEPTION 'assertion 11: expected reject, got anon inserted into the catalog';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'assertion 11 ok (anon rejected)';
END $a11$;
RESET ROLE;

-- 12. The seeding path US-794 needs: a verified INSERT with no JWT claim set
--     (auth.uid() IS NULL -- psql/service_role/a migration) succeeds, and
--     lands with verified_at stamped but verified_by NULL, because nobody
--     authenticated did the verifying. Runs as the unimpersonated session
--     role (postgres); request.jwt.claim.sub was cleared after assertions
--     8-10 so auth.uid() reads NULL here.
INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, source, verification)
VALUES ('US793 Test Seeded Verified', 'us793-test-seeded-verified', 'generic', 'usda', 'verified');
DO $a12$
DECLARE v_after RECORD;
BEGIN
  SELECT verification, verified_at, verified_by INTO v_after
    FROM public.grocery_product_catalog
   WHERE name_normalized = 'us793-test-seeded-verified';
  IF v_after.verification IS DISTINCT FROM 'verified'
     OR v_after.verified_at IS NULL
     OR v_after.verified_by IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 12: expected verified/stamped/no verifier, got verification=%, verified_at=%, verified_by=%',
      v_after.verification, v_after.verified_at, v_after.verified_by;
  END IF;
  RAISE NOTICE 'assertion 12 ok (seeding path lands verified with no verifier)';
END $a12$;

-- 13. A non-admin cannot set verified_at on an unverified row. The trigger
--     now also fires on UPDATE OF verified_at/verified_by (not just
--     verification), so a caller-supplied stamp on a row that never went
--     through the guard gets forced back to NULL.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '93930000-0000-0000-0000-000000000001', true);
UPDATE public.grocery_product_catalog
   SET verified_at = '2020-01-01T00:00:00Z'
 WHERE name_normalized = 'us793-test-user-typed-thing';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $a13$
DECLARE v_after RECORD;
BEGIN
  SELECT verification, verified_at, verified_by INTO v_after
    FROM public.grocery_product_catalog
   WHERE name_normalized = 'us793-test-user-typed-thing';
  IF v_after.verification IS DISTINCT FROM 'unverified'
     OR v_after.verified_at IS NOT NULL
     OR v_after.verified_by IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 13: expected the forged stamp to be nulled on an unverified row, got verification=%, verified_at=%, verified_by=%',
      v_after.verification, v_after.verified_at, v_after.verified_by;
  END IF;
  RAISE NOTICE 'assertion 13 ok (forged stamp on unverified row nulled)';
END $a13$;

-- 14. A promotion overwrites any caller-supplied stamp, so an admin cannot be
--     tricked (or accidentally coerced) into rubber-stamping a forged
--     verified_at/verified_by that arrived alongside verification='verified'.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES ('93930000-0000-0000-0000-00000000fe33')
  ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = DEFAULT;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '93930000-0000-0000-0000-00000000ad33', true);
UPDATE public.grocery_product_catalog
   SET verification = 'verified',
       verified_at = '2020-01-01T00:00:00Z',
       verified_by = '93930000-0000-0000-0000-00000000fe33'
 WHERE name_normalized = 'us793-test-user-typed-thing';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $a14$
DECLARE v_after RECORD;
BEGIN
  SELECT verification, verified_at, verified_by INTO v_after
    FROM public.grocery_product_catalog
   WHERE name_normalized = 'us793-test-user-typed-thing';
  IF v_after.verification IS DISTINCT FROM 'verified'
     OR v_after.verified_at IS NULL
     OR v_after.verified_at < now() - interval '1 minute'
     OR v_after.verified_by IS DISTINCT FROM '93930000-0000-0000-0000-00000000ad33'::uuid THEN
    RAISE EXCEPTION 'assertion 14: expected the promotion to overwrite the forged stamp with now()/the admin, got verification=%, verified_at=%, verified_by=%',
      v_after.verification, v_after.verified_at, v_after.verified_by;
  END IF;
  RAISE NOTICE 'assertion 14 ok (promotion overwrote the forged stamp)';
END $a14$;

-- 15. HOLE B: a non-admin cannot demote a verified row back to 'unverified'.
--     The earlier guard only ever fired when NEW.verification = 'verified',
--     so it guarded promotion and nothing else -- demotion was wide open.
--     Uses the cheddar row, which assertion 10 promoted to verified.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '93930000-0000-0000-0000-000000000001', true);
DO $a15$
BEGIN
  UPDATE public.grocery_product_catalog
     SET verification = 'unverified'
   WHERE name_normalized = 'us793-test-cheddar-cheese';
  RAISE EXCEPTION 'assertion 15: expected reject, got a non-admin demoted a verified row to unverified';
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM NOT LIKE '%only an admin may change the verification state of a catalog row%' THEN
    RAISE EXCEPTION 'assertion 15: expected the guard trigger message, got %', SQLERRM;
  END IF;
  RAISE NOTICE 'assertion 15 ok (demotion rejected)';
END $a15$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- 16. HOLE B (variant): a non-admin cannot set 'rejected' on a verified row
--     either -- the guard rejects any change to `verification` it doesn't
--     trust, not just a move toward 'unverified'.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '93930000-0000-0000-0000-000000000001', true);
DO $a16$
BEGIN
  UPDATE public.grocery_product_catalog
     SET verification = 'rejected'
   WHERE name_normalized = 'us793-test-cheddar-cheese';
  RAISE EXCEPTION 'assertion 16: expected reject, got a non-admin set a verified row to rejected';
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM NOT LIKE '%only an admin may change the verification state of a catalog row%' THEN
    RAISE EXCEPTION 'assertion 16: expected the guard trigger message, got %', SQLERRM;
  END IF;
  RAISE NOTICE 'assertion 16 ok (rejected-state write rejected)';
END $a16$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

-- 17. HOLE A: a non-admin cannot rewrite verified_by/verified_at on a row
--     that is already verified and stays verified. The guard only checks
--     `verification` itself, so this write is not rejected outright -- the
--     stamping logic is what closes the hole, by carrying OLD.verified_at/
--     OLD.verified_by through untouched whenever the row was already
--     verified and stays verified. Assert both angles: the write does not
--     raise (it is not the guard's job here), and the stored stamp is
--     unchanged from before the attempt, not the forged values.
DO $a17$
DECLARE
  v_before RECORD;
  v_after RECORD;
BEGIN
  SELECT verified_at, verified_by INTO v_before
    FROM public.grocery_product_catalog WHERE name_normalized = 'us793-test-cheddar-cheese';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '93930000-0000-0000-0000-000000000001', true);
  UPDATE public.grocery_product_catalog
     SET verified_by = '93930000-0000-0000-0000-00000000fe33',
         verified_at = '1999-01-01T00:00:00Z'
   WHERE name_normalized = 'us793-test-cheddar-cheese';
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT verified_at, verified_by INTO v_after
    FROM public.grocery_product_catalog WHERE name_normalized = 'us793-test-cheddar-cheese';

  IF v_after.verified_at IS DISTINCT FROM v_before.verified_at
     OR v_after.verified_by IS DISTINCT FROM v_before.verified_by THEN
    RAISE EXCEPTION 'assertion 17: expected a non-admin rewrite of verified_at/verified_by on a verified row to have no effect, got verified_at=%, verified_by=% (was verified_at=%, verified_by=%)',
      v_after.verified_at, v_after.verified_by, v_before.verified_at, v_before.verified_by;
  END IF;
  RAISE NOTICE 'assertion 17 ok (non-admin rewrite of verified_at/verified_by on a verified row had no effect)';
END $a17$;

-- 18. An admin touching an already-verified row also preserves the ORIGINAL
--     verified_at/verified_by rather than re-stamping them, even when the
--     admin's own UPDATE explicitly (and legitimately) sets
--     verification='verified' again alongside a forged stamp. The
--     preservation is unconditional on the transition (not on who is
--     writing), which is what makes assertion 17 hold for a non-admin too.
DO $a18$
DECLARE
  v_before RECORD;
  v_after RECORD;
BEGIN
  SELECT verified_at, verified_by INTO v_before
    FROM public.grocery_product_catalog WHERE name_normalized = 'us793-test-cheddar-cheese';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '93930000-0000-0000-0000-00000000ad33', true);
  UPDATE public.grocery_product_catalog
     SET verification = 'verified',
         verified_by = '93930000-0000-0000-0000-00000000fe33',
         verified_at = '1999-01-01T00:00:00Z'
   WHERE name_normalized = 'us793-test-cheddar-cheese';
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT verified_at, verified_by INTO v_after
    FROM public.grocery_product_catalog WHERE name_normalized = 'us793-test-cheddar-cheese';

  IF v_after.verified_at IS DISTINCT FROM v_before.verified_at
     OR v_after.verified_by IS DISTINCT FROM v_before.verified_by THEN
    RAISE EXCEPTION 'assertion 18: expected an admin re-touching an already-verified row to preserve the original stamp, got verified_at=%, verified_by=% (was verified_at=%, verified_by=%)',
      v_after.verified_at, v_after.verified_by, v_before.verified_at, v_before.verified_by;
  END IF;
  RAISE NOTICE 'assertion 18 ok (admin re-touch of an already-verified row preserved the original stamp)';
END $a18$;

-- 19. foods.canonical_id exists, is NULLABLE, and points at the catalog.
--     Nullable is load-bearing: an unmatched household row must keep working
--     exactly as it does today.
DO $a19$
DECLARE nullable TEXT;
BEGIN
  SELECT is_nullable INTO nullable FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'foods' AND column_name = 'canonical_id';
  IF nullable IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'assertion 19: expected foods.canonical_id to be nullable, got is_nullable=%', nullable;
  END IF;
  RAISE NOTICE 'assertion 19 ok (foods.canonical_id nullable)';
END $a19$;

DO $a20$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.table_name = 'foods' AND tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'grocery_product_catalog';
  IF n <> 1 THEN
    RAISE EXCEPTION 'assertion 20: expected 1 FK from foods to grocery_product_catalog, got %', n;
  END IF;
  RAISE NOTICE 'assertion 20 ok (foods.canonical_id FK to grocery_product_catalog)';
END $a20$;

ROLLBACK;
