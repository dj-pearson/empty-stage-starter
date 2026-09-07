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

-- =====================================================================
-- Task 2: match_foods_to_catalog. See
-- supabase/migrations/20260908000000_match_foods_to_catalog.sql for the
-- function and the design rationale (SECURITY INVOKER, no LIMIT 1, barcode
-- needs no category agreement, name match does).
--
-- Fixtures use literal, fixed UUIDs (79600000-0000-... for foods,
-- 79600000-1000-... for catalog rows) so later assertions can re-select an
-- exact fixture instead of matching on free text -- fixture 9 in particular
-- deliberately mangles its name's case/whitespace. Runs unimpersonated, as
-- the table owner, same as assertions 1-7 above and us793's assertions 1-7,
-- so RLS is not in play here.
-- =====================================================================

CREATE TEMP TABLE _us796_lookup (key TEXT PRIMARY KEY, id UUID);
INSERT INTO _us796_lookup (key, id)
SELECT 'cheddar_dairy', id FROM public.grocery_product_catalog
 WHERE name_normalized = 'cheese, cheddar' AND default_category = 'dairy';

DO $us796_setup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _us796_lookup WHERE key = 'cheddar_dairy') THEN
    RAISE EXCEPTION 'setup: expected the US-794 seed to have landed a ''Cheese, cheddar'' / dairy catalog row (name_normalized = ''cheese, cheddar'') -- assertions 8/9/12 depend on it';
  END IF;
  RAISE NOTICE 'setup ok (found seeded cheese, cheddar / dairy catalog row)';
END $us796_setup$;

-- Household foods fixtures. household_id is left NULL throughout -- it is
-- nullable, and enforce_plan_row_limit's per-household count never matches
-- a NULL household_id, so the Free-plan pantry cap never engages here.
INSERT INTO public.foods (id, user_id, name, category, is_safe, is_try_bite, quantity, unit, barcode)
VALUES
  -- 8: exact normalized name + matching category -> must match the seeded row.
  ('79600000-0000-0000-0000-000000000008', '79600000-0000-0000-0000-000000000001', 'Cheese, cheddar', 'dairy', true, false, 2, 'block', NULL),
  -- 9: same, but with case/whitespace noise normalize_product_name should absorb.
  ('79600000-0000-0000-0000-000000000009', '79600000-0000-0000-0000-000000000001', '  CHEESE,   CHEDDAR  ', 'dairy', false, true, 1, 'block', NULL),
  -- 10: barcode match -- name and category deliberately unrelated to the target.
  ('79600000-0000-0000-0000-000000000010', '79600000-0000-0000-0000-000000000001', 'US796 Test Totally Unrelated Name', 'snack', false, false, 1, 'each', '0999796000010'),
  -- 12: same normalized name as the seeded row, but a DIFFERENT category -- must stay NULL.
  ('79600000-0000-0000-0000-000000000012', '79600000-0000-0000-0000-000000000001', 'Cheese, cheddar', 'snack', true, false, 1, 'block', NULL),
  -- 13: 'chicken' must not link to a catalog 'chicken nuggets' row (no substring).
  ('79600000-0000-0000-0000-000000000013', '79600000-0000-0000-0000-000000000001', 'chicken', 'protein', false, false, 1, 'each', NULL),
  -- 14: the reverse direction -- 'chicken nuggets' must not link to a catalog 'chicken'
  -- row. category is deliberately 'snack' (not 'protein' like fixture 13) so this
  -- fixture's own catalog counterpart (.014 below, category-matched to THIS food)
  -- can never accidentally satisfy fixture 13's food ('chicken', category 'protein')
  -- by exact name -- that cross-match is real matcher behavior, just not what this
  -- assertion is testing, so the category split keeps the two directions independent.
  ('79600000-0000-0000-0000-000000000014', '79600000-0000-0000-0000-000000000001', 'chicken nuggets', 'snack', false, false, 1, 'each', NULL),
  -- 15: barcode differs from the catalog row by one digit -- must stay NULL.
  ('79600000-0000-0000-0000-000000000015', '79600000-0000-0000-0000-000000000001', 'US796 Test Off By One Digit', 'snack', false, false, 1, 'each', '0999796000021'),
  -- 16: already linked -- must never be re-pointed even though a better match exists.
  ('79600000-0000-0000-0000-000000000016', '79600000-0000-0000-0000-000000000001', 'US796 Test Better Match Sixteen', 'protein', true, true, 4, 'count', NULL);

-- Catalog counterparts. .160 is fixture 16's ORIGINAL (pre-existing) link;
-- .161 is the "better match" the matcher must never reach for fixture 16,
-- because that food already carries a canonical_id.
INSERT INTO public.grocery_product_catalog (id, name, name_normalized, default_category, default_unit, default_quantity, barcode, times_added, last_added_at)
VALUES
  ('79600000-1000-0000-0000-000000000010', 'US796 Test Barcode Target', 'us796 test barcode target', 'protein', 'each', 1, '0999796000010', 1, now()),
  ('79600000-1000-0000-0000-000000000013', 'Chicken nuggets', 'chicken nuggets', 'protein', 'each', 1, NULL, 1, now()),
  ('79600000-1000-0000-0000-000000000014', 'Chicken', 'chicken', 'snack', 'each', 1, NULL, 1, now()),
  ('79600000-1000-0000-0000-000000000015', 'US796 Test Off By One Digit Catalog', 'us796 test off by one digit catalog', 'snack', 'each', 1, '0999796000020', 1, now()),
  ('79600000-1000-0000-0000-000000000160', 'US796 Test Original Match Sixteen', 'us796 test original match sixteen', 'protein', 'count', 1, NULL, 1, now()),
  ('79600000-1000-0000-0000-000000000161', 'US796 Test Better Match Sixteen', 'us796 test better match sixteen', 'protein', 'count', 1, NULL, 1, now());

-- Pre-link fixture 16 to its ORIGINAL catalog row before the matcher ever runs.
UPDATE public.foods SET canonical_id = '79600000-1000-0000-0000-000000000160'
 WHERE id = '79600000-0000-0000-0000-000000000016';

-- Snapshot fixture 8's full row, minus canonical_id and updated_at, before
-- matching runs -- assertions 17/18 compare against this.
CREATE TEMP TABLE _us796_snapshot (key TEXT PRIMARY KEY, row_json JSONB);
INSERT INTO _us796_snapshot (key, row_json)
SELECT 'f8_before', to_jsonb(f) - 'canonical_id' - 'updated_at'
  FROM public.foods f WHERE f.id = '79600000-0000-0000-0000-000000000008';

-- First run: link everything that qualifies.
CREATE TEMP TABLE _us796_counts (key TEXT PRIMARY KEY, n INT);
INSERT INTO _us796_counts (key, n) SELECT 'first_run', public.match_foods_to_catalog();

-- 8. Exact normalized name AND same category links to the seeded row.
DO $a8$
DECLARE v_canonical_id UUID; v_expected UUID;
BEGIN
  SELECT id INTO v_expected FROM _us796_lookup WHERE key = 'cheddar_dairy';
  SELECT canonical_id INTO v_canonical_id FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000008';
  IF v_canonical_id IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'assertion 8: expected canonical_id = % (seeded cheddar/dairy row), got %', v_expected, v_canonical_id;
  END IF;
  RAISE NOTICE 'assertion 8 ok (exact name + category linked to seeded row)';
END $a8$;

-- 9. Case and whitespace differences still link to the same row.
DO $a9$
DECLARE v_canonical_id UUID; v_expected UUID;
BEGIN
  SELECT id INTO v_expected FROM _us796_lookup WHERE key = 'cheddar_dairy';
  SELECT canonical_id INTO v_canonical_id FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000009';
  IF v_canonical_id IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'assertion 9: expected canonical_id = % (case/whitespace normalized), got %', v_expected, v_canonical_id;
  END IF;
  RAISE NOTICE 'assertion 9 ok (case/whitespace normalized name linked)';
END $a9$;

-- 10. Exact barcode links even when names differ entirely.
DO $a10$
DECLARE v_canonical_id UUID;
BEGIN
  SELECT canonical_id INTO v_canonical_id FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000010';
  IF v_canonical_id IS DISTINCT FROM '79600000-1000-0000-0000-000000000010'::uuid THEN
    RAISE EXCEPTION 'assertion 10: expected canonical_id = 79600000-1000-0000-0000-000000000010 (barcode match), got %', v_canonical_id;
  END IF;
  RAISE NOTICE 'assertion 10 ok (barcode match links despite unrelated name/category)';
END $a10$;

-- 11. The function returns the count of rows it linked (3: fixtures 8, 9,
--     10 above), and running it a second time returns 0 -- nothing left
--     unlinked to do.
INSERT INTO _us796_counts (key, n) SELECT 'second_run', public.match_foods_to_catalog();
DO $a11$
DECLARE v_first INT; v_second INT;
BEGIN
  SELECT n INTO v_first FROM _us796_counts WHERE key = 'first_run';
  SELECT n INTO v_second FROM _us796_counts WHERE key = 'second_run';
  IF v_first <> 3 THEN
    RAISE EXCEPTION 'assertion 11: expected the first run to link 3 rows, got %', v_first;
  END IF;
  IF v_second <> 0 THEN
    RAISE EXCEPTION 'assertion 11: expected a second run to link 0 rows, got %', v_second;
  END IF;
  RAISE NOTICE 'assertion 11 ok (first run linked %, second run linked %)', v_first, v_second;
END $a11$;

-- 12. Same name, DIFFERENT category is left NULL. Never across categories.
DO $a12$
DECLARE v_canonical_id UUID;
BEGIN
  SELECT canonical_id INTO v_canonical_id FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000012';
  IF v_canonical_id IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 12: expected NULL (name matches but category does not), got %', v_canonical_id;
  END IF;
  RAISE NOTICE 'assertion 12 ok (cross-category same-name food left unmatched)';
END $a12$;

-- 13. 'chicken' does not link to a catalog 'chicken nuggets' row. No
--     substring, no prefix.
DO $a13$
DECLARE v_canonical_id UUID;
BEGIN
  SELECT canonical_id INTO v_canonical_id FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000013';
  IF v_canonical_id IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 13: expected NULL (''chicken'' must not link to catalog ''chicken nuggets''), got %', v_canonical_id;
  END IF;
  RAISE NOTICE 'assertion 13 ok (''chicken'' left unmatched against catalog ''chicken nuggets'')';
END $a13$;

-- 14. The reverse direction: 'chicken nuggets' does not link to a catalog
--     'chicken' row either.
DO $a14$
DECLARE v_canonical_id UUID;
BEGIN
  SELECT canonical_id INTO v_canonical_id FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000014';
  IF v_canonical_id IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 14: expected NULL (''chicken nuggets'' must not link to catalog ''chicken''), got %', v_canonical_id;
  END IF;
  RAISE NOTICE 'assertion 14 ok (''chicken nuggets'' left unmatched against catalog ''chicken'')';
END $a14$;

-- 15. A barcode differing by ONE digit does not link.
DO $a15$
DECLARE v_canonical_id UUID;
BEGIN
  SELECT canonical_id INTO v_canonical_id FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000015';
  IF v_canonical_id IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 15: expected NULL (barcode differs by one digit), got %', v_canonical_id;
  END IF;
  RAISE NOTICE 'assertion 15 ok (off-by-one-digit barcode left unmatched)';
END $a15$;

-- 16. A food that already has a canonical_id is not re-pointed at a
--     different row, even though a better match exists (catalog row .161
--     shares fixture 16's exact name + category).
DO $a16$
DECLARE v_canonical_id UUID;
BEGIN
  SELECT canonical_id INTO v_canonical_id FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000016';
  IF v_canonical_id IS DISTINCT FROM '79600000-1000-0000-0000-000000000160'::uuid THEN
    RAISE EXCEPTION 'assertion 16: expected canonical_id to stay at the original 79600000-1000-0000-0000-000000000160, got %', v_canonical_id;
  END IF;
  RAISE NOTICE 'assertion 16 ok (pre-existing link untouched despite a better match existing)';
END $a16$;

-- 17. Only canonical_id changes. Compare the whole row minus canonical_id
--     and updated_at, so a column added later is covered without editing
--     this test.
DO $a17$
DECLARE v_before JSONB; v_after JSONB;
BEGIN
  SELECT row_json INTO v_before FROM _us796_snapshot WHERE key = 'f8_before';
  SELECT to_jsonb(f) - 'canonical_id' - 'updated_at' INTO v_after
    FROM public.foods f WHERE f.id = '79600000-0000-0000-0000-000000000008';
  IF v_before IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'assertion 17: expected the row (minus canonical_id/updated_at) unchanged by matching, before=%, after=%', v_before, v_after;
  END IF;
  RAISE NOTICE 'assertion 17 ok (row unchanged aside from canonical_id/updated_at)';
END $a17$;

-- 18. Reversible: setting canonical_id back to NULL leaves the row exactly
--     as it was before matching ran, including is_safe.
UPDATE public.foods SET canonical_id = NULL WHERE id = '79600000-0000-0000-0000-000000000008';
DO $a18$
DECLARE v_before JSONB; v_after JSONB; v_is_safe BOOLEAN;
BEGIN
  SELECT row_json INTO v_before FROM _us796_snapshot WHERE key = 'f8_before';
  SELECT (to_jsonb(f) - 'canonical_id' - 'updated_at'), f.is_safe INTO v_after, v_is_safe
    FROM public.foods f WHERE f.id = '79600000-0000-0000-0000-000000000008';
  IF v_before IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'assertion 18: expected reverting canonical_id to NULL to restore the pre-match row exactly, before=%, after=%', v_before, v_after;
  END IF;
  IF v_is_safe IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'assertion 18: expected is_safe = true preserved after revert, got %', v_is_safe;
  END IF;
  RAISE NOTICE 'assertion 18 ok (reverting canonical_id restores the row exactly, is_safe intact)';
END $a18$;

-- 19. An unmatched food keeps canonical_id NULL and is still selectable --
--     a shipped client reading it sees nothing new. Reuses fixture 12,
--     which assertion 12 already proved stayed unmatched.
DO $a19$
DECLARE v_row RECORD;
BEGIN
  SELECT id, name, category, canonical_id INTO v_row FROM public.foods
   WHERE id = '79600000-0000-0000-0000-000000000012';
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'assertion 19: expected the unmatched food to still be selectable, got no row';
  END IF;
  IF v_row.canonical_id IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 19: expected canonical_id NULL on the unmatched food, got %', v_row.canonical_id;
  END IF;
  IF v_row.name IS DISTINCT FROM 'Cheese, cheddar' OR v_row.category IS DISTINCT FROM 'snack' THEN
    RAISE EXCEPTION 'assertion 19: expected the unmatched food''s other columns intact, got name=%, category=%', v_row.name, v_row.category;
  END IF;
  RAISE NOTICE 'assertion 19 ok (unmatched food stays NULL and selectable)';
END $a19$;

ROLLBACK;
