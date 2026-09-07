-- US-796: converge an already-applied database with a fresh one.
--
-- WHY THIS FILE EXISTS. 20260908000000_match_foods_to_catalog.sql was
-- applied to production, out of band, before this branch merged -- before
-- the fix-round corrections below were written. Supabase records a
-- migration as applied by filename, so editing 20260908000000.sql after
-- the fact (which this branch did) changes what a FRESH database gets, but
-- can never re-run against a database that already has that filename
-- marked applied. Production would otherwise be stuck on the buggy version
-- forever, with no mechanism to pick up the fix -- editing the original
-- file a second time wouldn't help either, for the same reason. This
-- migration is that mechanism: a second file, with a new timestamp, whose
-- entire job is to bring a database sitting on the OLD 20260908000000 up
-- to the exact state a database that ran the CORRECTED 20260908000000
-- would already be in.
--
-- It corrects four things, all already fixed in 20260908000000.sql itself
-- (so a fresh database -- test, a new environment -- never sees the old
-- versions at all; this file is purely for a database that already has the
-- old versions installed):
--
--   1. THE BUG: match_foods_to_catalog's barcode pass guarded
--      f.barcode IS NOT NULL but not emptiness. A catalog row planted with
--      barcode = '' matched every empty-barcode food in every household,
--      regardless of category. Fixed by btrim(...) <> '' on both sides of
--      the barcode comparison.
--   2. An unused expression index (foods_name_normalized_expr_idx) that
--      EXPLAIN showed the planner never used, and that made every
--      canonical_id write non-HOT for no benefit. Dropped.
--   3. match_foods_to_catalog was executable by PUBLIC (so anon could
--      drive a full-table scan over RPC). EXECUTE is now revoked from
--      PUBLIC and granted only to authenticated.
--   4. A comment on the function claimed Postgres raises "more than one
--      row returned" if UPDATE ... FROM joins a target row to more than
--      one source row. It doesn't -- it silently picks one arbitrarily.
--      The comment is corrected in the CREATE OR REPLACE below.
--
-- SAFE ON BOTH a fresh database (where 20260908000000 already produced the
-- corrected state) and an early-applied one like production (where it
-- produced the old state): every statement here is idempotent.
-- CREATE OR REPLACE on a function whose body is already identical is a
-- no-op; DROP INDEX IF EXISTS on an index that was never created is a
-- no-op; REVOKE/GRANT are idempotent by nature; the precondition guard
-- only ever raises, never mutates.
--
-- WHAT THIS DELIBERATELY DOES NOT DO. It does not call
-- match_foods_to_catalog and does not run any repair UPDATE. Production's
-- backfill already ran under the old code and its links are legitimate --
-- canonical_id was still only ever set from a genuine barcode or
-- name+category match, just with the blank-barcode hole also live at the
-- time. The user confirmed no catalog row on production ever had a blank
-- barcode, so nothing was actually mislinked by the bug -- there is
-- nothing to repair. Any further backfill, on any database, runs from the
-- checked-in operator script (supabase/diagnostics/us-796-backfill-match-foods.sql)
-- in committed per-household batches, deliberately outside any migration
-- transaction -- not from here.

-- Same precondition as 20260908000000.sql: fail loudly and by name if a
-- database is missing a column this file depends on, rather than a raw
-- "column does not exist" from inside the function body. Cheap insurance
-- on the same reasoning as the original -- see that file's header comment.
DO $precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'foods' AND column_name = 'canonical_id'
  ) THEN
    RAISE EXCEPTION
      'public.foods.canonical_id is missing. Apply 20260906000000_canonical_food_catalog.sql (US-793) first: this matcher writes that column and cannot work without it.'
      USING ERRCODE = 'undefined_column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'grocery_product_catalog' AND column_name = 'name_normalized'
  ) THEN
    RAISE EXCEPTION
      'public.grocery_product_catalog.name_normalized is missing. Apply 20260505000000_smart_product_catalog.sql first: this matcher joins on that column and cannot work without it.'
      USING ERRCODE = 'undefined_column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'grocery_product_catalog' AND column_name = 'barcode'
  ) THEN
    RAISE EXCEPTION
      'public.grocery_product_catalog.barcode is missing. Apply 20260505000000_smart_product_catalog.sql first: this matcher joins on that column and cannot work without it.'
      USING ERRCODE = 'undefined_column';
  END IF;
END $precondition$;

-- Unchanged from the original -- carried here verbatim, alongside
-- match_foods_to_catalog below, purely so CREATE OR REPLACE is a single
-- predictable no-op on a database that already has this exact body (a
-- fresh database) rather than something to reason about column by column.
CREATE OR REPLACE FUNCTION public.normalize_product_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(lower(p_name), '\s+', ' ', 'g'));
$$;

COMMENT ON FUNCTION public.normalize_product_name(text) IS
  'US-796: reproduces ProductNameNormalizer.normalize in ios/EatPal/EatPal/Models/SmartProduct.swift (lowercase, trim, collapse whitespace runs). Punctuation is intentionally preserved -- do not add punctuation stripping here without changing the Swift side first, or the catalog matcher silently stops matching.';

-- Correction 2: drop the expression index. Production has it (the applied
-- 20260908000000 created it); a fresh database never created it (the
-- corrected 20260908000000 no longer does). IF EXISTS makes this the same
-- statement either way.
DROP INDEX IF EXISTS public.foods_name_normalized_expr_idx;

-- Corrections 1, 3, and 4: the btrim guard (1), the fixed "NO LIMIT 1"
-- comment (4), and the REVOKE/GRANT below (3). Same function, same rules,
-- same rationale as 20260908000000.sql -- see that file for the full "WHY
-- TIMID" walkthrough; this is the corrected body it already carries,
-- reapplied here so a database that ran the OLD version gets it too.
CREATE OR REPLACE FUNCTION public.match_foods_to_catalog(p_household_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_barcode_matched INTEGER;
  v_name_matched INTEGER;
BEGIN
  -- Barcode: identity match, no category requirement -- but only a real
  -- barcode counts as an identity. btrim(...) <> '' on BOTH sides excludes
  -- NULL (already excluded by IS NOT NULL), '', and whitespace-only values
  -- from ever satisfying the join, on either side of it. See the "WHY
  -- TIMID" comment in 20260908000000_match_foods_to_catalog.sql (rule 2)
  -- for why this is load-bearing rather than decorative.
  UPDATE public.foods f
     SET canonical_id = c.id
    FROM public.grocery_product_catalog c
   WHERE f.canonical_id IS NULL
     AND f.barcode IS NOT NULL
     AND btrim(f.barcode) <> ''
     AND c.barcode IS NOT NULL
     AND btrim(c.barcode) <> ''
     AND f.barcode = c.barcode
     AND (p_household_id IS NULL OR f.household_id = p_household_id);
  GET DIAGNOSTICS v_barcode_matched = ROW_COUNT;

  -- Name: normalized name AND category must both agree. Runs after the
  -- barcode pass and re-checks canonical_id IS NULL, so a row the barcode
  -- pass already linked is excluded here even if its name would also match.
  UPDATE public.foods f
     SET canonical_id = c.id
    FROM public.grocery_product_catalog c
   WHERE f.canonical_id IS NULL
     AND public.normalize_product_name(f.name) = c.name_normalized
     AND f.category = c.default_category
     AND (p_household_id IS NULL OR f.household_id = p_household_id);
  GET DIAGNOSTICS v_name_matched = ROW_COUNT;

  RETURN v_barcode_matched + v_name_matched;
END;
$$;

COMMENT ON FUNCTION public.match_foods_to_catalog(uuid) IS
  'US-796: links household foods rows (canonical_id IS NULL) to grocery_product_catalog by exact non-blank barcode, or by normalized name AND matching category. SECURITY INVOKER so RLS scopes every call to the caller''s own household -- EXECUTE is granted only to authenticated, not PUBLIC. Returns the number of rows linked. p_household_id NULL means every household the caller''s RLS allows. Also bumps updated_at on every matched row via the pre-existing update_foods_updated_at trigger. Not called by this migration -- run the operator script at supabase/diagnostics/us-796-backfill-match-foods.sql to backfill, in committed per-household batches rather than inside one migration transaction.';

-- Correction 3: close PUBLIC execute. Idempotent regardless of the
-- database's starting state -- REVOKE on a privilege already absent, and
-- GRANT on a privilege already present, are each no-ops.
REVOKE ALL ON FUNCTION public.match_foods_to_catalog(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_foods_to_catalog(uuid) TO authenticated;
