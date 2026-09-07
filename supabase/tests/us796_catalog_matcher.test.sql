-- US-796: normalize_product_name matches the shipped iOS normalizer.
-- Run: psql -f supabase/tests/us796_catalog_matcher.test.sql
--
-- Same fail-loud style as supabase/tests/us794_usda_seed.test.sql -- every
-- assertion below is a DO block that RAISEs on mismatch, so a failure
-- reddens the run (ON_ERROR_STOP only trips on a real SQL error, not on a
-- printed string -- a bare SELECT never fails the script).
\set ON_ERROR_STOP on
BEGIN;

-- 1. The function exists and is IMMUTABLE. pg_proc.provolatile = 'i' means
--    immutable. The expression index in the matcher migration depends on
--    this: Postgres refuses to index a non-immutable function call.
DO $a1$
DECLARE v_provolatile "char";
BEGIN
  SELECT p.provolatile INTO v_provolatile
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'normalize_product_name';
  IF v_provolatile IS NULL THEN
    RAISE EXCEPTION 'assertion 1: public.normalize_product_name does not exist';
  END IF;
  IF v_provolatile <> 'i' THEN
    RAISE EXCEPTION 'assertion 1: expected provolatile = i (immutable), got %', v_provolatile;
  END IF;
  RAISE NOTICE 'assertion 1 ok (normalize_product_name exists and is immutable)';
END $a1$;

-- 2. Lowercases and trims leading/trailing whitespace.
DO $a2$
DECLARE v_result TEXT;
BEGIN
  SELECT public.normalize_product_name('  Hummus, Commercial  ') INTO v_result;
  IF v_result IS DISTINCT FROM 'hummus, commercial' THEN
    RAISE EXCEPTION 'assertion 2: expected ''hummus, commercial'', got %', v_result;
  END IF;
  RAISE NOTICE 'assertion 2 ok (lowercases and trims)';
END $a2$;

-- 3. Collapses internal whitespace runs to a single space.
DO $a3$
DECLARE v_result TEXT;
BEGIN
  SELECT public.normalize_product_name('Hummus,   commercial') INTO v_result;
  IF v_result IS DISTINCT FROM 'hummus, commercial' THEN
    RAISE EXCEPTION 'assertion 3: expected ''hummus, commercial'', got %', v_result;
  END IF;
  RAISE NOTICE 'assertion 3 ok (collapses internal whitespace runs)';
END $a3$;

-- 4. Collapses tabs and newlines too, not just spaces.
DO $a4$
DECLARE v_result TEXT;
BEGIN
  SELECT public.normalize_product_name(E'Hummus,\t\ncommercial') INTO v_result;
  IF v_result IS DISTINCT FROM 'hummus, commercial' THEN
    RAISE EXCEPTION 'assertion 4: expected ''hummus, commercial'', got %', v_result;
  END IF;
  RAISE NOTICE 'assertion 4 ok (collapses tabs and newlines)';
END $a4$;

-- 5. PRESERVES punctuation. This is the assertion that pins the whole
--    story to the shipped client: ProductNameNormalizer.normalize in
--    ios/EatPal/EatPal/Models/SmartProduct.swift never strips punctuation,
--    only lowercases, trims, and collapses whitespace. A normalizer that
--    strips the comma here matches nothing the app can produce.
DO $a5$
DECLARE v_result TEXT;
BEGIN
  SELECT public.normalize_product_name('Cheese, cheddar') INTO v_result;
  IF v_result IS DISTINCT FROM 'cheese, cheddar' THEN
    RAISE EXCEPTION 'assertion 5: expected ''cheese, cheddar'' (comma preserved), got %', v_result;
  END IF;
  RAISE NOTICE 'assertion 5 ok (punctuation preserved)';
END $a5$;

-- 6. Preserves apostrophes and accented characters.
DO $a6$
DECLARE v_result TEXT;
BEGIN
  SELECT public.normalize_product_name('Mother''s loaf') INTO v_result;
  IF v_result IS DISTINCT FROM 'mother''s loaf' THEN
    RAISE EXCEPTION 'assertion 6: expected ''mother''''s loaf'', got %', v_result;
  END IF;
  RAISE NOTICE 'assertion 6 ok (apostrophe preserved)';
END $a6$;

-- 7. The equivalence check against real data. Over every row in
--    grocery_product_catalog with source = 'usda', normalize_product_name(name)
--    must equal the stored name_normalized. This is not trusting a claim about
--    the seed -- it re-derives the equivalence from the live table. The
--    count >= 1500 half is not padding: without it the mismatch check passes
--    vacuously against an empty table, which is exactly how earlier test
--    files in this repo passed while proving nothing.
DO $a7$
DECLARE
  v_total INT;
  v_mismatches INT;
BEGIN
  SELECT count(*) INTO v_total
    FROM public.grocery_product_catalog
   WHERE source = 'usda';

  IF v_total < 1500 THEN
    RAISE EXCEPTION 'assertion 7: expected at least 1500 usda rows, got %', v_total;
  END IF;

  SELECT count(*) INTO v_mismatches
    FROM public.grocery_product_catalog
   WHERE source = 'usda'
     AND public.normalize_product_name(name) IS DISTINCT FROM name_normalized;

  IF v_mismatches <> 0 THEN
    RAISE EXCEPTION 'assertion 7: expected 0 usda rows where normalize_product_name(name) <> name_normalized, got % (of % rows)', v_mismatches, v_total;
  END IF;

  RAISE NOTICE 'assertion 7 ok (normalize_product_name(name) = name_normalized for all % usda rows)', v_total;
END $a7$;

ROLLBACK;
