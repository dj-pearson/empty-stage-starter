-- US-799 AC2: the catalog fills its own derived columns.
--
-- Two of grocery_product_catalog's columns are derived from another column in
-- the same row -- name_normalized from name, and serving_size_g from
-- serving_size_text -- and neither had a default, so every writer had to
-- compute them. That is how a value the shipped app can never find gets
-- written (see the normalize_product_name comment in 20260908000000).
--
-- WHY A TRIGGER AND NOT A PARSER IN THE CLIENT. serving_size_g is derived from
-- serving_size_text by parse_serving_grams (20260918000003), and there are now
-- four writers that would each need that logic: the admin CRUD screen, the bulk
-- import, the barcode scanner, and lookup-barcode's promotion path. A fifth is
-- the shipped iOS build, which cannot be changed at all. Reimplementing the
-- parser in TypeScript puts two parsers in the tree that must agree forever,
-- and the one that drifts is the one nobody tests -- so the rule lives once,
-- next to the data, and every writer gets it including the ones already in
-- users' pockets.
--
-- ADDITIVE AND BACKWARD-COMPATIBLE. Nothing is renamed, dropped or retyped, no
-- column becomes NOT NULL, and a caller that supplies serving_size_g itself
-- keeps its value: the trigger only fills a NULL, or refreshes a mass whose
-- text has changed underneath it. A shipped client that sends neither column is
-- unaffected, and one that sends both is taken at its word.
--
-- THE REFRESH CASE IS THE ONE THAT BITES. An operator correcting
-- "1 cup (240 ml)" (no mass: ml is not grams without a density) to
-- "1 cup (245 g)" updates only the text. Without the second branch the row
-- keeps its old mass -- NULL here, but on another row a stale number that now
-- disagrees with the text beside it, which is worse than none.

-- The DEFAULT is what makes the trigger reachable from a typed client.
-- name_normalized is NOT NULL with no default, so `supabase gen types` marks
-- it REQUIRED on Insert and TypeScript rejects the very omission this trigger
-- exists to handle. A default makes it optional in the generated types; the
-- trigger then treats the empty string as "not supplied", the same as NULL.
-- Additive: no existing writer sends an empty name_normalized, and one that
-- sends a real value is unaffected.
ALTER TABLE public.grocery_product_catalog
  ALTER COLUMN name_normalized SET DEFAULT '';

CREATE OR REPLACE FUNCTION public.gpc_fill_derived()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- name_normalized is NOT NULL with no default, so a writer that omits it
  -- fails the constraint rather than getting the right answer. A BEFORE
  -- trigger runs before that check, so filling it here is enough.
  --
  -- FILL A NULL ONLY, never overwrite. The shipped iOS build computes this
  -- with its own ProductNameNormalizer and matches on the result; if the two
  -- implementations ever disagree, forcing the SQL answer would silently
  -- change which rows that build can find. A caller that sends the column is
  -- taken at its word, exactly as it is today.
  IF (NEW.name_normalized IS NULL OR btrim(NEW.name_normalized) = '')
     AND NEW.name IS NOT NULL THEN
    NEW.name_normalized := public.normalize_product_name(NEW.name);
  END IF;

  IF NEW.serving_size_text IS NULL OR btrim(NEW.serving_size_text) = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.serving_size_g IS NULL THEN
    NEW.serving_size_g := public.parse_serving_grams(NEW.serving_size_text);
    RETURN NEW;
  END IF;

  -- The text moved and the mass did not: the mass describes the old text.
  IF TG_OP = 'UPDATE'
     AND NEW.serving_size_text IS DISTINCT FROM OLD.serving_size_text
     AND NEW.serving_size_g IS NOT DISTINCT FROM OLD.serving_size_g THEN
    NEW.serving_size_g := public.parse_serving_grams(NEW.serving_size_text);
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.gpc_fill_derived() IS
  'US-799: fills grocery_product_catalog.name_normalized from name, and serving_size_g from serving_size_text via parse_serving_grams. Fills a NULL, and refreshes a serving mass whose text changed underneath it. Never overrides a value the caller supplied.';

DROP TRIGGER IF EXISTS gpc_fill_serving_grams ON public.grocery_product_catalog;
DROP TRIGGER IF EXISTS gpc_fill_derived ON public.grocery_product_catalog;
CREATE TRIGGER gpc_fill_derived
  BEFORE INSERT OR UPDATE OF name, name_normalized, serving_size_text, serving_size_g
  ON public.grocery_product_catalog
  FOR EACH ROW EXECUTE FUNCTION public.gpc_fill_derived();

-- US-804: name the roles rather than revoking PUBLIC. A trigger function is
-- not called over RPC, so nobody needs EXECUTE.
REVOKE ALL ON FUNCTION public.gpc_fill_derived() FROM PUBLIC, anon, authenticated;
