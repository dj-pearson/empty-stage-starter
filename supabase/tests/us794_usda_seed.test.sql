-- US-794: the USDA generic backbone is seeded into the shared catalog.
-- Run: psql -f supabase/tests/us794_usda_seed.test.sql
--
-- Same fail-loud style as supabase/tests/us793_canonical_catalog.test.sql --
-- every assertion below is a DO block that RAISEs on mismatch, so a failure
-- reddens the run (ON_ERROR_STOP only trips on a real SQL error, not on a
-- printed string -- a bare SELECT never fails the script).
\set ON_ERROR_STOP on
BEGIN;

-- 1. At least 1500 rows landed with source = 'usda'.
DO $a1$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM public.grocery_product_catalog WHERE source = 'usda';
  IF n < 1500 THEN
    RAISE EXCEPTION 'assertion 1: expected at least 1500 usda rows, got %', n;
  END IF;
  RAISE NOTICE 'assertion 1 ok (% usda rows)', n;
END $a1$;

-- 2. Every usda row has a non-null category, a non-null aisle-equivalent
--    column, and a non-null calories_kcal_100. The catalog's aisle column
--    is default_aisle_section and its category column is default_category
--    (there is no "aisle" or "category" column on this table).
DO $a2$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM public.grocery_product_catalog
   WHERE source = 'usda'
     AND (default_category IS NULL
          OR default_aisle_section IS NULL
          OR calories_kcal_100 IS NULL);
  IF n <> 0 THEN
    RAISE EXCEPTION 'assertion 2: expected 0 usda rows missing category/aisle/calories, got %', n;
  END IF;
  RAISE NOTICE 'assertion 2 ok (no usda rows missing category/aisle/calories)';
END $a2$;

-- 3. Every usda row is kind = 'generic', verification = 'verified', and has
--    a non-null source_ref.
DO $a3$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM public.grocery_product_catalog
   WHERE source = 'usda'
     AND (kind <> 'generic' OR verification <> 'verified' OR source_ref IS NULL);
  IF n <> 0 THEN
    RAISE EXCEPTION 'assertion 3: expected 0 usda rows off-shape, got %', n;
  END IF;
  RAISE NOTICE 'assertion 3 ok (all usda rows generic/verified/sourced)';
END $a3$;

-- 4. Every nutrition value is inside its CHECK bounds. The gpc_nutrition_sane
--    constraint already enforces this on write -- an out-of-bounds value
--    could never have been INSERTed in the first place -- so this assertion
--    is not re-deriving that guarantee. It is asserting that the seed was
--    actually loaded through a normal INSERT (and so was checked), rather
--    than by some other path (e.g. a direct COPY with constraints disabled,
--    or session_replication_role = replica) that could have bypassed it.
DO $a4$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM public.grocery_product_catalog
   WHERE source = 'usda'
     AND NOT (
       (calories_kcal_100 IS NULL OR calories_kcal_100 BETWEEN 0 AND 900)
       AND (protein_g_100 IS NULL OR protein_g_100 BETWEEN 0 AND 100)
       AND (carbs_g_100   IS NULL OR carbs_g_100   BETWEEN 0 AND 100)
       AND (fat_g_100     IS NULL OR fat_g_100     BETWEEN 0 AND 100)
       AND (fiber_g_100   IS NULL OR fiber_g_100   BETWEEN 0 AND 100)
       AND (sugar_g_100   IS NULL OR sugar_g_100   BETWEEN 0 AND 100)
       AND (sodium_mg_100 IS NULL OR sodium_mg_100 BETWEEN 0 AND 100000)
     );
  IF n <> 0 THEN
    RAISE EXCEPTION 'assertion 4: expected 0 usda rows outside CHECK bounds, got %', n;
  END IF;
  RAISE NOTICE 'assertion 4 ok (all usda rows within nutrition CHECK bounds)';
END $a4$;

-- 5. source_ref is unique across seeded (usda) rows.
DO $a5$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT source_ref FROM public.grocery_product_catalog
     WHERE source = 'usda'
     GROUP BY source_ref
    HAVING count(*) > 1
  ) AS dupes;
  IF n <> 0 THEN
    RAISE EXCEPTION 'assertion 5: expected source_ref unique across usda rows, got % duplicated values', n;
  END IF;
  RAISE NOTICE 'assertion 5 ok (source_ref unique across usda rows)';
END $a5$;

-- 6. Idempotency: re-running the migration body a second time inserts zero
--    additional rows. \ir the migration file itself rather than retyping its
--    body, so this test can never drift from what actually ships. The
--    before-count is stashed in a temp table because a psql variable set
--    from SQL (\gset) does not survive as cleanly across an \ir boundary as
--    a table row does, and this keeps the comparison inside a single DO
--    block at the end.
CREATE TEMP TABLE _us794_idempotency_check (n_before INT);
INSERT INTO _us794_idempotency_check (n_before)
  SELECT count(*) FROM public.grocery_product_catalog WHERE source = 'usda';

\ir ../migrations/20260907000000_seed_usda_generic_foods.sql

DO $a6$
DECLARE
  v_before INT;
  v_after INT;
BEGIN
  SELECT n_before INTO v_before FROM _us794_idempotency_check;
  SELECT count(*) INTO v_after FROM public.grocery_product_catalog WHERE source = 'usda';
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'assertion 6: expected re-running the migration to insert 0 rows, went from % to %', v_before, v_after;
  END IF;
  RAISE NOTICE 'assertion 6 ok (re-run inserted 0 rows, still %)', v_after;
END $a6$;

ROLLBACK;
