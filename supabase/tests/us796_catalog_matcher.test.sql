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

-- Snapshot fixtures 8 (name-matched) and 10 (barcode-matched) full rows,
-- minus only updated_at, before matching runs. canonical_id is deliberately
-- KEPT in this snapshot (unlike an earlier draft) -- assertion 18 needs the
-- original NULL value to compare against, not a stripped copy of it.
-- Assertions 17/18 both read from here.
CREATE TEMP TABLE _us796_snapshot (key TEXT PRIMARY KEY, row_json JSONB);
INSERT INTO _us796_snapshot (key, row_json)
SELECT 'f8_before', to_jsonb(f) - 'updated_at'
  FROM public.foods f WHERE f.id = '79600000-0000-0000-0000-000000000008'
UNION ALL
SELECT 'f10_before', to_jsonb(f) - 'updated_at'
  FROM public.foods f WHERE f.id = '79600000-0000-0000-0000-000000000010';

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

-- 17. Only canonical_id changes (updated_at is the one other column that
--     legitimately changes -- see the function's header comment -- so it's
--     stripped before comparing here, same as it's stripped from the
--     snapshot itself). Compare the whole row minus canonical_id and
--     updated_at, so a column added later is covered without editing this
--     test. Covers BOTH match paths: fixture 8 (name+category) and fixture
--     10 (barcode) -- an earlier draft only checked the name-matched row.
DO $a17$
DECLARE v_before JSONB; v_after JSONB;
BEGIN
  -- Name-matched (fixture 8).
  SELECT row_json INTO v_before FROM _us796_snapshot WHERE key = 'f8_before';
  SELECT to_jsonb(f) - 'updated_at' INTO v_after
    FROM public.foods f WHERE f.id = '79600000-0000-0000-0000-000000000008';
  IF (v_before - 'canonical_id') IS DISTINCT FROM (v_after - 'canonical_id') THEN
    RAISE EXCEPTION 'assertion 17: expected the name-matched row (minus canonical_id/updated_at) unchanged by matching, before=%, after=%', v_before, v_after;
  END IF;

  -- Barcode-matched (fixture 10).
  SELECT row_json INTO v_before FROM _us796_snapshot WHERE key = 'f10_before';
  SELECT to_jsonb(f) - 'updated_at' INTO v_after
    FROM public.foods f WHERE f.id = '79600000-0000-0000-0000-000000000010';
  IF (v_before - 'canonical_id') IS DISTINCT FROM (v_after - 'canonical_id') THEN
    RAISE EXCEPTION 'assertion 17: expected the barcode-matched row (minus canonical_id/updated_at) unchanged by matching, before=%, after=%', v_before, v_after;
  END IF;

  RAISE NOTICE 'assertion 17 ok (both name- and barcode-matched rows unchanged aside from canonical_id/updated_at)';
END $a17$;

-- 18. Reversible: setting canonical_id back to NULL leaves the row exactly
--     as it was before matching ran, including is_safe. Unlike an earlier
--     draft, this does NOT strip canonical_id from the comparison -- the
--     snapshot's canonical_id is NULL (fixture 8's state before the
--     matcher ever ran), and after reverting it must be NULL again too.
--     Stripping canonical_id from both sides (as the earlier draft did)
--     made this a tautology: it would pass even if the matcher had never
--     run, because it only proved an UPDATE doesn't touch columns it
--     wasn't told to. Comparing the full row (minus only updated_at, which
--     legitimately changes on any UPDATE -- see assertion 17) actually
--     proves the round trip: link, then unlink, leaves canonical_id itself
--     back at its true original value, not just "unchanged since a moment
--     ago".
UPDATE public.foods SET canonical_id = NULL WHERE id = '79600000-0000-0000-0000-000000000008';
DO $a18$
DECLARE v_before JSONB; v_after JSONB; v_is_safe BOOLEAN;
BEGIN
  SELECT row_json INTO v_before FROM _us796_snapshot WHERE key = 'f8_before';
  SELECT (to_jsonb(f) - 'updated_at'), f.is_safe INTO v_after, v_is_safe
    FROM public.foods f WHERE f.id = '79600000-0000-0000-0000-000000000008';
  IF v_before IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'assertion 18: expected reverting canonical_id to NULL to restore the pre-match row exactly (canonical_id included), before=%, after=%', v_before, v_after;
  END IF;
  IF v_is_safe IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'assertion 18: expected is_safe = true preserved after revert, got %', v_is_safe;
  END IF;
  RAISE NOTICE 'assertion 18 ok (reverting canonical_id restores the row exactly, including canonical_id itself; is_safe intact)';
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

-- =====================================================================
-- Household scoping (20-21). Every fixture above uses household_id NULL
-- and every call above uses the NULL default, so neither p_household_id
-- nor the RLS-scoping claim in the migration's SECURITY INVOKER comment
-- was exercised by anything above. These two assertions fix that:
--   20 proves p_household_id itself filters the UPDATE, run unimpersonated
--      (as the table owner, so RLS is not what's restricting it -- the
--      WHERE clause is).
--   21 proves RLS independently scopes an ordinary authenticated caller to
--      their own household even when p_household_id is left at its NULL
--      ("every household") default -- the actual claim the migration's
--      comment makes about SECURITY INVOKER, tested against a real
--      non-superuser identity rather than only by the RLS-bypassing role
--      every assertion above runs as.
-- =====================================================================

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('79600000-3000-0000-0000-00000000000a'),
  ('79600000-3000-0000-0000-00000000000b')
ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = DEFAULT;

INSERT INTO public.households (id, name) VALUES
  ('79600000-2000-0000-0000-00000000000a', 'US796 Test Household A'),
  ('79600000-2000-0000-0000-00000000000b', 'US796 Test Household B');

INSERT INTO public.household_members (household_id, user_id) VALUES
  ('79600000-2000-0000-0000-00000000000a', '79600000-3000-0000-0000-00000000000a'),
  ('79600000-2000-0000-0000-00000000000b', '79600000-3000-0000-0000-00000000000b');

-- 20 fixtures: one qualifying (name+category) pair per household.
INSERT INTO public.grocery_product_catalog (id, name, name_normalized, default_category, default_unit, default_quantity, times_added, last_added_at)
VALUES
  ('79600000-1000-0000-0000-000000000020', 'US796 Test Household Scope A', 'us796 test household scope a', 'protein', 'each', 1, 1, now()),
  ('79600000-1000-0000-0000-000000000021', 'US796 Test Household Scope B', 'us796 test household scope b', 'protein', 'each', 1, 1, now());

INSERT INTO public.foods (id, user_id, household_id, name, category, is_safe, is_try_bite, quantity, unit)
VALUES
  ('79600000-0000-0000-0000-000000000020', '79600000-3000-0000-0000-00000000000a', '79600000-2000-0000-0000-00000000000a', 'US796 Test Household Scope A', 'protein', false, false, 1, 'each'),
  ('79600000-0000-0000-0000-000000000021', '79600000-3000-0000-0000-00000000000b', '79600000-2000-0000-0000-00000000000b', 'US796 Test Household Scope B', 'protein', false, false, 1, 'each');

-- Scope to household A only.
SELECT public.match_foods_to_catalog('79600000-2000-0000-0000-00000000000a');

DO $a20$
DECLARE v_a UUID; v_b UUID;
BEGIN
  SELECT canonical_id INTO v_a FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000020';
  SELECT canonical_id INTO v_b FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000021';
  IF v_a IS DISTINCT FROM '79600000-1000-0000-0000-000000000020'::uuid THEN
    RAISE EXCEPTION 'assertion 20: expected household A''s food linked when scoped to household A, got %', v_a;
  END IF;
  IF v_b IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 20: expected household B''s food untouched when scoped to household A, got %', v_b;
  END IF;
  RAISE NOTICE 'assertion 20 ok (p_household_id scoped the update to household A, household B untouched)';
END $a20$;

-- Now scope to household B -- proves the parameter isn't just "household A
-- always wins" by coincidence of fixture order.
SELECT public.match_foods_to_catalog('79600000-2000-0000-0000-00000000000b');

DO $a20b$
DECLARE v_b UUID;
BEGIN
  SELECT canonical_id INTO v_b FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000021';
  IF v_b IS DISTINCT FROM '79600000-1000-0000-0000-000000000021'::uuid THEN
    RAISE EXCEPTION 'assertion 20: expected household B''s food linked once scoped to household B, got %', v_b;
  END IF;
  RAISE NOTICE 'assertion 20 ok (p_household_id also scoped correctly to household B on a second call)';
END $a20b$;

-- 21 fixtures: fresh, still-unmatched pair (20's are already linked).
INSERT INTO public.grocery_product_catalog (id, name, name_normalized, default_category, default_unit, default_quantity, times_added, last_added_at)
VALUES
  ('79600000-1000-0000-0000-000000000022', 'US796 Test RLS Scope C', 'us796 test rls scope c', 'protein', 'each', 1, 1, now()),
  ('79600000-1000-0000-0000-000000000023', 'US796 Test RLS Scope D', 'us796 test rls scope d', 'protein', 'each', 1, 1, now());

INSERT INTO public.foods (id, user_id, household_id, name, category, is_safe, is_try_bite, quantity, unit)
VALUES
  ('79600000-0000-0000-0000-000000000022', '79600000-3000-0000-0000-00000000000a', '79600000-2000-0000-0000-00000000000a', 'US796 Test RLS Scope C', 'protein', false, false, 1, 'each'),
  ('79600000-0000-0000-0000-000000000023', '79600000-3000-0000-0000-00000000000b', '79600000-2000-0000-0000-00000000000b', 'US796 Test RLS Scope D', 'protein', false, false, 1, 'each');

-- Impersonate household A's member and call with NO household filter --
-- the function's own logic treats NULL as "every household", so if this
-- only touches household A's food, it's RLS doing the scoping, not the
-- parameter. Same impersonation pattern as us793_canonical_catalog.test.sql
-- assertion 8 (SET LOCAL ROLE authenticated + request.jwt.claim.sub).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '79600000-3000-0000-0000-00000000000a', true);
SELECT public.match_foods_to_catalog();
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

DO $a21$
DECLARE v_c UUID; v_d UUID;
BEGIN
  SELECT canonical_id INTO v_c FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000022';
  SELECT canonical_id INTO v_d FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000023';
  IF v_c IS DISTINCT FROM '79600000-1000-0000-0000-000000000022'::uuid THEN
    RAISE EXCEPTION 'assertion 21: expected household A''s member to link household A''s own food even with no household filter passed, got %', v_c;
  END IF;
  IF v_d IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 21: expected RLS to block household A''s member from linking household B''s food, got %', v_d;
  END IF;
  RAISE NOTICE 'assertion 21 ok (RLS scoped a real authenticated non-admin caller to their own household despite p_household_id defaulting to every household)';
END $a21$;

-- =====================================================================
-- Empty/whitespace barcode guard (22-24). The reported defect: the
-- barcode pass originally guarded only f.barcode IS NOT NULL, not
-- emptiness. A single catalog row planted with barcode = '' -- which any
-- authenticated user can INSERT, and the partial unique index on barcode
-- permits exactly one of -- matched EVERY empty-barcode food in EVERY
-- household on the next run, regardless of category: Grilled Chicken
-- Breast (protein) and Whole Milk (dairy) both linked to one planted
-- 'Planted Snack Row' (snack). Fixed with btrim(...) <> '' on both sides
-- of the barcode comparison. See the migration's WHY TIMID rule 2.
-- =====================================================================

-- One planted row per blank-ish barcode value. Only one row may ever carry
-- barcode = '' (grocery_product_catalog_barcode_uq is a partial UNIQUE
-- index on barcode WHERE barcode IS NOT NULL, and '' satisfies NOT NULL),
-- so every "food with a blank barcode" fixture below necessarily contends
-- for the SAME planted row -- which is exactly the real-world shape of the
-- reported defect (one planted row captures every victim).
INSERT INTO public.grocery_product_catalog (id, name, name_normalized, default_category, default_unit, default_quantity, barcode, times_added, last_added_at)
VALUES
  ('79600000-1000-0000-0000-000000000030', 'US796 Test Planted Blank Barcode Row', 'us796 test planted blank barcode row', 'snack', 'each', 1, '', 1, now()),
  ('79600000-1000-0000-0000-000000000031', 'US796 Test Planted Whitespace Barcode Row', 'us796 test planted whitespace barcode row', 'snack', 'each', 1, '   ', 1, now());

INSERT INTO public.foods (id, user_id, name, category, is_safe, is_try_bite, quantity, unit, barcode)
VALUES
  -- 22: blank barcode, category 'protein' -- crosses category against the
  -- planted row's 'snack', reproducing the "Grilled Chicken Breast" victim
  -- from the reported probe.
  ('79600000-0000-0000-0000-000000000026', '79600000-0000-0000-0000-000000000001', 'US796 Test Blank Barcode Chicken', 'protein', false, false, 1, 'each', ''),
  -- 23: blank barcode, category 'dairy' -- a SECOND victim of the SAME
  -- planted row, reproducing "Whole Milk": one planted row, multiple
  -- unrelated categories, all must stay excluded.
  ('79600000-0000-0000-0000-000000000027', '79600000-0000-0000-0000-000000000001', 'US796 Test Blank Barcode Milk', 'dairy', true, false, 1, 'each', ''),
  -- 24: whitespace-only barcode (not literally empty) against the SEPARATE
  -- planted whitespace row -- proves btrim generalizes the guard beyond
  -- the empty string specifically ('   ' = '   ' would satisfy the raw
  -- equality f.barcode = c.barcode with no guard at all, same as '' = '').
  ('79600000-0000-0000-0000-000000000028', '79600000-0000-0000-0000-000000000001', 'US796 Test Whitespace Barcode Apple', 'fruit', true, false, 1, 'each', '   ');

-- This call also happens to pick up two rows that are NOT about the
-- barcode guard: fixture 8 (deliberately unlinked back to NULL by
-- assertion 18's revert, and never re-matched since) and fixture 23 (household
-- B's RLS-scoped food, left unmatched on purpose by assertion 21's
-- RLS-restricted impersonated call, now reachable because this call runs
-- unimpersonated). Both are legitimate re-matches of already-proven
-- fixtures, not something this section is testing -- assertions 22-24
-- below check the NEW blank/whitespace fixtures by id, so the extra count
-- is harmless noise, not a hidden assertion on this return value.
SELECT public.match_foods_to_catalog();

DO $a22$
DECLARE v_id UUID;
BEGIN
  SELECT canonical_id INTO v_id FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000026';
  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 22: expected NULL (blank barcode must never match, even cross-category), got %', v_id;
  END IF;
  RAISE NOTICE 'assertion 22 ok (blank-barcode food, category protein, left unmatched against the planted blank-barcode snack row)';
END $a22$;

DO $a23$
DECLARE v_id UUID;
BEGIN
  SELECT canonical_id INTO v_id FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000027';
  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 23: expected NULL (a second blank-barcode victim of the same planted row must also stay unmatched), got %', v_id;
  END IF;
  RAISE NOTICE 'assertion 23 ok (second blank-barcode food, category dairy, also left unmatched against the same planted row)';
END $a23$;

DO $a24$
DECLARE v_id UUID;
BEGIN
  SELECT canonical_id INTO v_id FROM public.foods WHERE id = '79600000-0000-0000-0000-000000000028';
  IF v_id IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 24: expected NULL (whitespace-only barcode must never match either), got %', v_id;
  END IF;
  RAISE NOTICE 'assertion 24 ok (whitespace-only-barcode food left unmatched against the planted whitespace-barcode row)';
END $a24$;

-- =====================================================================
-- 25. Matcher prerequisite columns (migration precondition guard).
--
-- 20260908000000_match_foods_to_catalog.sql opens with a DO block that
-- RAISEs a named, specific error if foods.canonical_id or
-- grocery_product_catalog.name_normalized/barcode are missing, rather than
-- letting a database missing one of those (e.g. one that hasn't applied
-- 20260906000000_canonical_food_catalog.sql yet) apply this migration
-- cleanly and fail later, four stack frames down inside
-- match_foods_to_catalog, with a raw "column does not exist".
--
-- This assertion covers the happy path: on this (fully migrated) test
-- database, all three columns are present, which both documents the
-- contract and proves the guard doesn't false-positive reject a normal,
-- up-to-date schema (everything above this line already depended on that
-- being true, but nothing said so explicitly).
--
-- The negative path -- the guard actually raising on a database that IS
-- missing one of these columns -- is deliberately NOT exercised here. The
-- guard itself is a DO block that already ran once, at migration-apply
-- time; it is not re-checked inside match_foods_to_catalog on every call,
-- so reproducing its raise here would mean physically dropping
-- foods.canonical_id (or one of the catalog columns) inside this
-- transaction. That cascades through the canonical_id FK constraint and
-- the foods_canonical_id_idx partial index, and would break every
-- assertion above that depends on canonical_id existing -- for a
-- ROLLBACK-wrapped transaction, that risk buys nothing a direct read of
-- the guard's SQL (top of 20260908000000_match_foods_to_catalog.sql)
-- doesn't already show by inspection.
DO $a25$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE (table_schema, table_name, column_name) IN (
     ('public', 'foods', 'canonical_id'),
     ('public', 'grocery_product_catalog', 'name_normalized'),
     ('public', 'grocery_product_catalog', 'barcode')
   );
  IF n <> 3 THEN
    RAISE EXCEPTION 'assertion 25: expected all 3 matcher prerequisite columns present on this migrated database, got %', n;
  END IF;
  RAISE NOTICE 'assertion 25 ok (matcher prerequisite columns present: foods.canonical_id, grocery_product_catalog.name_normalized/barcode)';
END $a25$;

-- 26. anon genuinely cannot execute match_foods_to_catalog -- not "the
-- REVOKE statement is present in the migration", which proves nothing (see
-- 20260908000001_matcher_blank_barcode_and_grants.sql's header: a bare
-- REVOKE ALL ... FROM PUBLIC compiled cleanly and changed nothing here,
-- because this platform grants anon EXECUTE directly at CREATE FUNCTION
-- time via a schema-level default ACL, not through PUBLIC). This is the
-- assertion that actually tests the intent, using the same privilege check
-- (has_function_privilege) that caught the gap in the first place. authenticated
-- is checked too, as the positive control -- without it, a REVOKE ALL that
-- accidentally also stripped authenticated's access would leave this
-- assertion (and only this one) green while the function became
-- unusable for every legitimate caller.
DO $a26$
DECLARE v_anon_can_execute BOOLEAN; v_authenticated_can_execute BOOLEAN;
BEGIN
  SELECT has_function_privilege('anon', 'public.match_foods_to_catalog(uuid)', 'EXECUTE')
    INTO v_anon_can_execute;
  SELECT has_function_privilege('authenticated', 'public.match_foods_to_catalog(uuid)', 'EXECUTE')
    INTO v_authenticated_can_execute;
  IF v_anon_can_execute THEN
    RAISE EXCEPTION 'assertion 26: expected anon to NOT have EXECUTE on match_foods_to_catalog, got true';
  END IF;
  IF NOT v_authenticated_can_execute THEN
    RAISE EXCEPTION 'assertion 26: expected authenticated to still have EXECUTE on match_foods_to_catalog, got false';
  END IF;
  RAISE NOTICE 'assertion 26 ok (anon cannot execute match_foods_to_catalog, authenticated still can)';
END $a26$;

ROLLBACK;
