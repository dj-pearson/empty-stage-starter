-- US-797: the database refuses what Task 1/2's TypeScript already filters,
-- and refuses a forged verification from an ordinary caller -- but the
-- service-role promotion path itself is trusted, and this file says so
-- honestly rather than leaving that boundary implicit. See assertion 7.
-- Run: psql -f supabase/tests/us797_barcode_promotion.test.sql
--
-- Same fail-loud style as supabase/tests/us796_catalog_matcher.test.sql --
-- every assertion below is a DO block that RAISEs on mismatch and RAISE
-- NOTICEs on success, so a failure reddens the run (ON_ERROR_STOP only
-- trips on a real SQL error, not on a printed string -- a bare SELECT never
-- fails the script). Fixtures use a 'US797 Test' prefix / '0999797...'
-- barcode range so this file stays re-runnable against a seeded database
-- without colliding with real rows.
\set ON_ERROR_STOP on
BEGIN;

-- 1. calories_kcal_100 = 2100 (a kJ figure landing in a kcal field, exactly
--    the bug Task 1's caloriesKcal100/energyValueUnconfirmedUnit split
--    exists to prevent upstream) is rejected by the database too. Catch
--    check_violation specifically AND assert on the constraint name via GET
--    STACKED DIAGNOSTICS -- a NOT NULL violation, a different CHECK, or a
--    typo'd column would also raise check_violation-adjacent errors, and
--    only naming gpc_nutrition_sane proves it's the nutrition-sanity
--    constraint that fired, not some other rejection.
DO $a1$
DECLARE v_constraint TEXT;
BEGIN
  INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, source, calories_kcal_100)
  VALUES ('US797 Test Bad Calories', 'us797 test bad calories', 'generic', 'openfoodfacts', 2100);
  RAISE EXCEPTION 'assertion 1: expected reject, got insert accepted at calories_kcal_100 = 2100';
EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint IS DISTINCT FROM 'gpc_nutrition_sane' THEN
    RAISE EXCEPTION 'assertion 1: expected gpc_nutrition_sane to fire, got constraint %', v_constraint;
  END IF;
  RAISE NOTICE 'assertion 1 ok (gpc_nutrition_sane rejected calories_kcal_100 = 2100, constraint name confirmed)';
END $a1$;

-- 2. A macro above 100 g/100g (protein_g_100 = 150) is rejected the same
--    way. Same constraint-name assertion as above.
DO $a2$
DECLARE v_constraint TEXT;
BEGIN
  INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, source, protein_g_100)
  VALUES ('US797 Test Bad Protein', 'us797 test bad protein', 'generic', 'openfoodfacts', 150);
  RAISE EXCEPTION 'assertion 2: expected reject, got insert accepted at protein_g_100 = 150';
EXCEPTION WHEN check_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint IS DISTINCT FROM 'gpc_nutrition_sane' THEN
    RAISE EXCEPTION 'assertion 2: expected gpc_nutrition_sane to fire, got constraint %', v_constraint;
  END IF;
  RAISE NOTICE 'assertion 2 ok (gpc_nutrition_sane rejected protein_g_100 = 150, constraint name confirmed)';
END $a2$;

-- =====================================================================
-- 3. THE PRODUCTION PATH. lookup-barcode/index.ts:332-335 builds its
--    Supabase client with SUPABASE_SERVICE_ROLE_KEY, so the promotion
--    insert actually runs as `service_role`, with no request.jwt.claim.sub
--    set at all -- not as an authenticated end user. service_role has
--    BYPASSRLS (confirmed against this local stack's pg_roles), so the
--    catalog's "auth.uid() IS NOT NULL" RLS policies never even engage
--    here. This is the row shape Task 1's toCatalogRow actually produces,
--    inserted the way production actually inserts it.
-- =====================================================================
SET LOCAL ROLE service_role;
INSERT INTO public.grocery_product_catalog
  (name, name_normalized, barcode, kind, source, source_ref, verification,
   brand, allergens, calories_kcal_100, protein_g_100, carbs_g_100, fat_g_100,
   fiber_g_100, sugar_g_100, sodium_mg_100)
VALUES
  ('US797 Test Promoted Product', 'us797 test promoted product', '0999797000001',
   'branded', 'openfoodfacts', '0999797000001', 'unverified',
   'US797 Test Brand', ARRAY['milk', 'soy'], 250, 8.5, 30, 10, 2, 5, 400);
RESET ROLE;

DO $a3$
DECLARE v RECORD;
BEGIN
  SELECT verification, kind, source, source_ref, barcode INTO v
    FROM public.grocery_product_catalog WHERE barcode = '0999797000001';
  IF v.barcode IS NULL THEN
    RAISE EXCEPTION 'assertion 3: expected the Task-1-shaped row to insert via the service_role production path, got no row';
  END IF;
  IF v.verification IS DISTINCT FROM 'unverified' THEN
    RAISE EXCEPTION 'assertion 3: expected verification = unverified, got %', v.verification;
  END IF;
  IF v.kind IS DISTINCT FROM 'branded' OR v.source IS DISTINCT FROM 'openfoodfacts' OR v.source_ref IS DISTINCT FROM '0999797000001' THEN
    RAISE EXCEPTION 'assertion 3: expected kind=branded, source=openfoodfacts, source_ref=0999797000001, got kind=%, source=%, source_ref=%', v.kind, v.source, v.source_ref;
  END IF;
  RAISE NOTICE 'assertion 3 ok (production path: service_role insert of a Task-1-shaped row lands verification = unverified)';
END $a3$;

-- =====================================================================
-- 4. DEFENSE IN DEPTH, NOT THE PRODUCTION PATH. The same row shape also
--    inserts successfully under RLS as an ordinary, impersonated non-admin
--    authenticated user (same impersonation pattern as
--    us793_canonical_catalog.test.sql assertion 8: a bare SET LOCAL ROLE
--    authenticated leaves auth.uid() NULL, which the catalog's own
--    "auth.uid() IS NOT NULL" RLS policies then reject outright, so the
--    identity is impersonated via request.jwt.claim.sub). Nothing in
--    lookup-barcode/index.ts takes this path today -- it's here because a
--    promotion insert running under an end user's own JWT, rather than the
--    service key, must still be possible and must still land unverified,
--    in case that ever changes.
-- =====================================================================
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES ('79700000-0000-0000-0000-000000000001')
  ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = DEFAULT;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '79700000-0000-0000-0000-000000000001', true);
INSERT INTO public.grocery_product_catalog
  (name, name_normalized, barcode, kind, source, source_ref, verification,
   brand, allergens, calories_kcal_100, protein_g_100, carbs_g_100, fat_g_100,
   fiber_g_100, sugar_g_100, sodium_mg_100)
VALUES
  ('US797 Test Promoted Product Authenticated', 'us797 test promoted product authenticated', '0999797000003',
   'branded', 'openfoodfacts', '0999797000003', 'unverified',
   'US797 Test Brand', ARRAY['milk', 'soy'], 250, 8.5, 30, 10, 2, 5, 400);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

DO $a4$
DECLARE v RECORD;
BEGIN
  SELECT barcode, verification, kind INTO v
    FROM public.grocery_product_catalog WHERE barcode = '0999797000003';
  IF v.barcode IS NULL OR v.verification IS DISTINCT FROM 'unverified' OR v.kind IS DISTINCT FROM 'branded' THEN
    RAISE EXCEPTION 'assertion 4: expected a non-admin authenticated insert of the same shape to also land verification = unverified, got verification=%, kind=%', v.verification, v.kind;
  END IF;
  RAISE NOTICE 'assertion 4 ok (defense in depth, not the production path: non-admin authenticated insert also lands verification = unverified)';
END $a4$;

-- 5. A non-admin promotion that tries to set verification = 'verified' is
--    rejected by gpc_guard_verification. Assert on the message text, not
--    only the SQLSTATE: insufficient_privilege (42501) is also what an RLS
--    WITH CHECK violation or a bare "permission denied for table" raises, so
--    the code alone doesn't prove the trigger -- rather than a deleted
--    trigger falling through to some other insufficient_privilege source --
--    is what fired. This exact trap was found and fixed in US-793.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '79700000-0000-0000-0000-000000000001', true);
DO $a5$
BEGIN
  INSERT INTO public.grocery_product_catalog
    (name, name_normalized, barcode, kind, source, source_ref, verification, calories_kcal_100)
  VALUES
    ('US797 Test Forged Verified', 'us797 test forged verified', '0999797000002',
     'branded', 'openfoodfacts', '0999797000002', 'verified', 250);
  RAISE EXCEPTION 'assertion 5: expected reject, got a non-admin promotion landed verification = verified';
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM NOT LIKE '%only an admin may change the verification state of a catalog row%' THEN
    RAISE EXCEPTION 'assertion 5: expected the gpc_guard_verification message, got %', SQLERRM;
  END IF;
  RAISE NOTICE 'assertion 5 ok (rejected with the guard trigger message, not merely the SQLSTATE)';
END $a5$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

DO $a5b$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM public.grocery_product_catalog WHERE barcode = '0999797000002';
  IF n <> 0 THEN
    RAISE EXCEPTION 'assertion 5: expected the rejected insert to have written nothing, got % row(s)', n;
  END IF;
  RAISE NOTICE 'assertion 5 ok (no row was left behind by the rejected insert)';
END $a5b$;

-- 6. grocery_product_catalog_barcode_uq is a PARTIAL unique index (WHERE
--    barcode IS NOT NULL). Task 2 deliberately uses a plain insert and
--    treats a 23505 as "already promoted" rather than an ON CONFLICT
--    upsert, because PostgREST cannot express a partial index as an
--    ON CONFLICT arbiter (see lookup-barcode/index.ts). So this asserts
--    what the code actually does: a second insert of the same barcode
--    raises unique_violation via that named index, and the existing row
--    (assertion 3's production-path fixture) is unchanged.
DO $a6$
DECLARE
  v_before JSONB;
  v_after JSONB;
  v_constraint TEXT;
BEGIN
  SELECT to_jsonb(g) INTO v_before FROM public.grocery_product_catalog g WHERE barcode = '0999797000001';

  BEGIN
    INSERT INTO public.grocery_product_catalog
      (name, name_normalized, barcode, kind, source, source_ref, verification, calories_kcal_100)
    VALUES
      ('US797 Test Duplicate Barcode', 'us797 test duplicate barcode', '0999797000001',
       'branded', 'usda', '0999797000001', 'unverified', 300);
    RAISE EXCEPTION 'assertion 6: expected reject, got a second promotion of the same barcode inserted a duplicate row';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'grocery_product_catalog_barcode_uq' THEN
      RAISE EXCEPTION 'assertion 6: expected grocery_product_catalog_barcode_uq to fire, got constraint %', v_constraint;
    END IF;
  END;

  SELECT to_jsonb(g) INTO v_after FROM public.grocery_product_catalog g WHERE barcode = '0999797000001';
  IF v_before IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'assertion 6: expected the existing row unchanged by the rejected duplicate insert, before=%, after=%', v_before, v_after;
  END IF;
  IF (SELECT count(*) FROM public.grocery_product_catalog WHERE barcode = '0999797000001') <> 1 THEN
    RAISE EXCEPTION 'assertion 6: expected exactly 1 row to remain for the barcode after the rejected duplicate';
  END IF;
  RAISE NOTICE 'assertion 6 ok (duplicate barcode raised unique_violation via grocery_product_catalog_barcode_uq; existing row unchanged)';
END $a6$;

-- =====================================================================
-- 7. THE BOUNDARY, DOCUMENTED ON PURPOSE. Under service_role (the same
--    trusted-context path lookup-barcode/index.ts's promotion insert
--    actually runs under -- see assertion 3, and the same escape hatch
--    US-793's gpc_guard_verification grants to the US-794 seed migration:
--    "auth.uid() IS NULL ... a service_role key that bypasses RLS by
--    design"), an insert that sets verification = 'verified' directly
--    SUCCEEDS. This is not a hole to close -- anyone holding the service
--    key can already write anything to any table, so the trigger has
--    nothing left to defend at that privilege level. It means the
--    guarantee this whole file is otherwise testing -- "a promoted row is
--    unverified" -- is NOT enforced by gpc_guard_verification for the
--    actual promotion code path. It is enforced entirely in TypeScript, by
--    toCatalogRow hard-coding the literal 'unverified'
--    (supabase/functions/_shared/catalogPromotion.ts) and never deriving
--    it from provider input, and pinned there by
--    supabase/functions/_shared/catalogPromotion.test.ts's dedicated tests
--    that iterate all three providers and a "high-confidence" payload. A
--    future change to lookup-barcode/index.ts that starts trusting a
--    provider-supplied verification value would NOT be caught by this SQL
--    suite -- only by that Deno test, or by a reviewer reading this
--    comment.
-- =====================================================================
DO $a7$
DECLARE v RECORD;
BEGIN
  SET LOCAL ROLE service_role;
  INSERT INTO public.grocery_product_catalog
    (name, name_normalized, barcode, kind, source, source_ref, verification, calories_kcal_100)
  VALUES
    ('US797 Test Service Role Verified', 'us797 test service role verified', '0999797000004',
     'branded', 'openfoodfacts', '0999797000004', 'verified', 250);
  RESET ROLE;

  SELECT verification, verified_at, verified_by INTO v
    FROM public.grocery_product_catalog WHERE barcode = '0999797000004';
  IF v.verification IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'assertion 7: expected service_role to be able to write verification = verified directly (it is a trusted context, same as the US-794 seed path), got verification = %', v.verification;
  END IF;
  IF v.verified_at IS NULL THEN
    RAISE EXCEPTION 'assertion 7: expected verified_at stamped by the guard trigger even under service_role, got NULL';
  END IF;
  IF v.verified_by IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 7: expected verified_by NULL (no authenticated actor did the verifying under service_role), got %', v.verified_by;
  END IF;
  RAISE NOTICE 'assertion 7 ok (service_role can write verification = verified directly, by design -- the unverified-by-default guarantee for the promotion path lives in toCatalogRow, not in this trigger)';
END $a7$;

ROLLBACK;
