-- US-796: normalize_product_name -- the shared normalization key that lets
-- a household's own foods be matched against the shared product catalog.
--
-- This MUST reproduce ProductNameNormalizer.normalize in
-- ios/EatPal/EatPal/Models/SmartProduct.swift exactly:
--
--   enum ProductNameNormalizer {
--       static func normalize(_ raw: String) -> String {
--           let lower = raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
--           let parts = lower.split(whereSeparator: { $0.isWhitespace })
--           return parts.joined(separator: " ")
--       }
--   }
--
-- i.e. lowercase, trim, collapse any run of whitespace (including tabs and
-- newlines) to a single space -- and nothing else. In particular it does
-- NOT strip punctuation. The shipped app upserts the catalog
-- ON CONFLICT (name_normalized), so any divergence between this function
-- and the Swift one means the matcher silently matches nothing: a parent's
-- own food would never resolve to an existing catalog row and a duplicate
-- gets created instead.
--
-- This has already gone wrong once. The seed migration that populated
-- grocery_product_catalog originally used a more aggressive normalizer
-- (one that also stripped punctuation), and 90.7% of the ~2,337 seeded
-- rows ended up with a name_normalized value the shipped app could never
-- produce -- e.g. "Hummus, commercial" normalized to a key without the
-- comma, so the app's own upsert would never find it. That seed was fixed
-- to use this same btrim/regexp_replace shape before this migration
-- landed; see supabase/tests/us796_catalog_matcher.test.sql assertion 7,
-- which re-derives the equivalence against the live table rather than
-- trusting this comment.
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

-- Expression index the catalog matcher (Task 2) needs to look up a
-- household's own unlinked foods by their normalized name. Partial on
-- canonical_id IS NULL because the matcher only ever looks at foods rows
-- that have not yet been linked to a catalog entry.
CREATE INDEX IF NOT EXISTS foods_name_normalized_expr_idx
  ON public.foods (public.normalize_product_name(name))
  WHERE canonical_id IS NULL;

-- US-796 Task 2: match_foods_to_catalog -- links a household's own foods
-- rows to the shared catalog by exact identity, and only by exact identity.
--
-- WHY TIMID. foods.is_safe is a flag a parent sets deliberately, and the
-- safe-food ladder reads it through whatever canonical_id a food carries. A
-- wrong link here binds a child's is_safe to the wrong canonical food, so a
-- parent can be shown a food as safe that their child actually reacts to.
-- Every rule below exists to make a false-positive link structurally
-- impossible rather than merely unlikely:
--
--   1. Only rows where canonical_id IS NULL are ever touched. An existing
--      link is never re-pointed, even if a "better" match later appears --
--      see assertion 16 in the test file.
--   2. Barcode match requires no category agreement. A barcode is the
--      product's identity; two rows sharing one are the same product by
--      definition.
--   3. Name match additionally requires f.category = c.default_category.
--      A name alone is not an identity -- "cheddar" as a dairy and
--      "cheddar" as a snack are different foods, and crossing that line is
--      the exact mislink this story exists to avoid. See assertion 12.
--
-- NO LIMIT 1, AND NO TIE-BREAK. grocery_product_catalog_barcode_uq is a
-- partial UNIQUE index on barcode WHERE barcode IS NOT NULL, and
-- grocery_product_catalog_name_uq is a UNIQUE index on name_normalized (see
-- 20260505000000_smart_product_catalog.sql). At most one catalog row can
-- ever satisfy either join condition, so ambiguity is structurally
-- impossible rather than resolved by picking one arbitrarily. A LIMIT 1
-- here would silently paper over a future violation of that invariant
-- (e.g. a unique index dropped by mistake) instead of letting the UPDATE
-- ... FROM raise "more than one row returned" the way a plain join would if
-- it tried to set the same target row from two source rows.
--
-- SECURITY INVOKER, NOT DEFINER. RLS applies to whoever calls this, exactly
-- as it would for a hand-written UPDATE against foods and
-- grocery_product_catalog. A DEFINER function here would let any
-- authenticated user relink every other household's foods. The one-time
-- backfill below runs as the migration role, which bypasses RLS
-- legitimately (it is not a public API caller), so it can still cover every
-- household in one call.
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
  -- Barcode: identity match, no category requirement.
  UPDATE public.foods f
     SET canonical_id = c.id
    FROM public.grocery_product_catalog c
   WHERE f.canonical_id IS NULL
     AND f.barcode IS NOT NULL
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
  'US-796: links household foods rows (canonical_id IS NULL) to grocery_product_catalog by exact barcode, or by normalized name AND matching category. SECURITY INVOKER so RLS scopes every call to the caller''s own household. Returns the number of rows linked. p_household_id NULL means every household.';

-- One-time backfill: link whatever already qualifies under today's rules.
-- Runs as the migration role (bypasses RLS, which is legitimate here -- see
-- the function comment above), so a single NULL call covers every
-- household in one pass.
DO $$
DECLARE
  v_matched INTEGER;
BEGIN
  SELECT public.match_foods_to_catalog() INTO v_matched;
  RAISE NOTICE 'US-796 backfill: matched % household foods row(s) to the shared catalog', v_matched;
END $$;
