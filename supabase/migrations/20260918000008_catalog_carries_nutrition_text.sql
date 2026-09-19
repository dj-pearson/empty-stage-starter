-- US-799 AC2 prerequisite: give the catalog somewhere to put the four fields
-- nutrition holds and it does not.
--
-- AC2 says "the edge functions reading nutrition are migrated across". They
-- cannot be, faithfully, until this exists. lookup-barcode/index.ts:583 already
-- says so in a comment -- "nutrition rows hold serving_size/ingredients/
-- servings_per_container that the catalog schema does not carry" -- and that
-- is why it prefers the nutrition row when both tables have one.
--
-- Measured rather than read, against a database built from the whole migration
-- history: of the ten columns nutrition has and grocery_product_catalog does
-- not, six are the same thing under another name or another unit (category ->
-- default_category, created_by -> created_by_user_id, and the four per-serving
-- figures, which 20260918000004 converts to the per-100g columns). Four are
-- not there at all:
--
--   ingredients             no equivalent. Allergen-adjacent free text that a
--                           parent reads before deciding what to feed a child.
--   serving_size            free text. serving_size_g holds the PARSED mass,
--                           and parse_serving_grams deliberately returns NULL
--                           for "2 cookies" or "240 ml" -- so for those rows
--                           the only serving information there is is the text.
--   servings_per_container  no equivalent.
--   package_quantity        free text. package_size/package_unit are numeric
--                           and cannot hold "family pack" or "6 x 250ml".
--
-- Dropping them at the migration would be the guess this epic has refused
-- twice already, so they get columns instead.
--
-- ADDITIVE. Four nullable columns and one UPDATE. Every shipped client ignores
-- columns it does not know about (CLAUDE.md's migration rules), nutrition is
-- untouched, and nothing writes less than it did yesterday.

ALTER TABLE public.grocery_product_catalog
  ADD COLUMN IF NOT EXISTS ingredients TEXT,
  ADD COLUMN IF NOT EXISTS serving_size_text TEXT,
  ADD COLUMN IF NOT EXISTS servings_per_container NUMERIC,
  ADD COLUMN IF NOT EXISTS package_quantity_text TEXT;

COMMENT ON COLUMN public.grocery_product_catalog.ingredients IS
  'Free-text ingredient list as the provider stated it. Allergen-adjacent: never derive allergens[] from this silently.';
COMMENT ON COLUMN public.grocery_product_catalog.serving_size_text IS
  'The serving as stated ("2 cookies (25g)", "240 ml"). serving_size_g is the parsed mass and is NULL when it could not be read without guessing.';
COMMENT ON COLUMN public.grocery_product_catalog.servings_per_container IS
  'Servings per package, as stated by the provider.';
COMMENT ON COLUMN public.grocery_product_catalog.package_quantity_text IS
  'Package size as stated ("6 x 250ml", "family pack"). package_size/package_unit are the numeric form and cannot hold either.';

-- Carry the four fields onto the rows 20260918000004 already created from
-- nutrition. Matched the same way that migration matched: by normalized name,
-- which is what it inserted on.
--
-- Repeatable: only fills a column that is still NULL, so running this twice
-- changes nothing and a later hand-correction in the catalog is not overwritten
-- by the cache it came from.
UPDATE public.grocery_product_catalog c
   SET ingredients            = COALESCE(c.ingredients, n.ingredients),
       serving_size_text      = COALESCE(c.serving_size_text, n.serving_size),
       servings_per_container = COALESCE(c.servings_per_container, n.servings_per_container),
       package_quantity_text  = COALESCE(c.package_quantity_text, n.package_quantity)
  FROM (
    -- nutrition has no uniqueness on name; collapse to one row per name the
    -- same way the insert did, preferring a readable serving then recency.
    SELECT DISTINCT ON (public.normalize_product_name(name))
           public.normalize_product_name(name) AS name_normalized,
           ingredients, serving_size, servings_per_container, package_quantity
      FROM public.nutrition
     WHERE btrim(COALESCE(name, '')) <> ''
     ORDER BY public.normalize_product_name(name),
              (public.parse_serving_grams(serving_size) IS NULL),
              updated_at DESC NULLS LAST
  ) n
 WHERE c.name_normalized = n.name_normalized
   AND c.source = 'user'
   AND (c.ingredients IS NULL OR c.serving_size_text IS NULL
        OR c.servings_per_container IS NULL OR c.package_quantity_text IS NULL);

DO $carry_report$
DECLARE with_text INT; with_ingredients INT;
BEGIN
  SELECT count(*) INTO with_text FROM public.grocery_product_catalog
   WHERE source = 'user' AND serving_size_text IS NOT NULL;
  SELECT count(*) INTO with_ingredients FROM public.grocery_product_catalog
   WHERE source = 'user' AND ingredients IS NOT NULL;

  RAISE NOTICE 'US-799: % user-sourced catalog rows now carry the serving text, % carry ingredients. The catalog can now hold what nutrition holds, so a reader can move across without losing a field.',
    with_text, with_ingredients;
END $carry_report$;
