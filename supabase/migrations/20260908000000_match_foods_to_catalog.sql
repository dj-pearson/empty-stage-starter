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
