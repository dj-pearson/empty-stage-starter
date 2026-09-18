-- US-799, step 1 of the retirement: read a serving size, or admit you cannot.
--
-- nutrition.calories and friends are PER SERVING. The catalog's columns are
-- PER 100g. Converting between them needs the serving mass, and
-- nutrition.serving_size is free text written by three different providers:
--
--   Open Food Facts  product.serving_size, or failing that product.quantity
--   USDA             `${servingSize}${servingSizeUnit}` concatenated
--   FoodRepo         `${portion_quantity}${portion_unit}` concatenated
--
-- so the column holds '30 g', '30g', '1 cup (240 ml)', '2 cookies (25g)',
-- '250ml', and plenty that means nothing numeric at all.
--
-- THE RULE IS THAT AN UNPARSEABLE SERVING IS NOT CONVERTED. A guess here does
-- not produce a missing number, it produces a WRONG number sitting in a shared
-- catalog looking exactly like a right one, and the nutrition figures families
-- read are the last place to be approximately correct. So this returns NULL
-- rather than a best effort, and the backfill that follows carries such rows
-- over unconverted and flagged.
--
-- MASS ONLY. A volume in ml is not a mass without the product's density, and
-- 240 ml of oil is not 240 g. Anything whose unit is a volume returns NULL for
-- the same reason as an unparseable one: the caller needs a mass or nothing.

CREATE OR REPLACE FUNCTION public.parse_serving_grams(p_serving TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $parse_serving_grams$
DECLARE
  s TEXT;
  m TEXT[];
  qty NUMERIC;
  unit TEXT;
BEGIN
  IF p_serving IS NULL THEN RETURN NULL; END IF;

  s := lower(btrim(p_serving));
  IF s = '' THEN RETURN NULL; END IF;

  -- A parenthesised mass is the most reliable thing in the string: on
  -- "2 cookies (25g)" or "1 cup (240 ml)" the label itself is telling you what
  -- the serving weighs, and the leading count is about pieces, not grams.
  -- Checked FIRST, so "2 cookies (25g)" is 25 and never 2.
  -- \y, not \b: in Postgres regex \b is a BACKSPACE, and a word boundary is
  -- \y. The first version of this used \b, matched nothing at all, and every
  -- serving came back unparseable -- which is the safe direction to fail, and
  -- is exactly why the test below asserts the values it CAN read rather than
  -- only the ones it refuses.
  m := regexp_match(s, '\(\s*([0-9]+(?:[.,][0-9]+)?)\s*(g|gram|grams|kg|mg|oz|ounce|ounces)\y');
  IF m IS NULL THEN
    -- Otherwise a leading quantity and unit: "30 g", "30g", "1.5 oz".
    m := regexp_match(s, '^([0-9]+(?:[.,][0-9]+)?)\s*(g|gram|grams|kg|mg|oz|ounce|ounces)\y');
  END IF;

  IF m IS NULL THEN RETURN NULL; END IF;

  -- A decimal comma is how most of Europe writes it, and OFF is a European
  -- database. '12,5 g' is twelve and a half grams, not a list.
  qty := replace(m[1], ',', '.')::NUMERIC;
  unit := m[2];

  IF qty <= 0 THEN RETURN NULL; END IF;

  RETURN CASE unit
    WHEN 'kg' THEN qty * 1000
    WHEN 'mg' THEN qty / 1000
    WHEN 'oz' THEN qty * 28.349523125
    WHEN 'ounce' THEN qty * 28.349523125
    WHEN 'ounces' THEN qty * 28.349523125
    ELSE qty
  END;
END;
$parse_serving_grams$;

COMMENT ON FUNCTION public.parse_serving_grams(TEXT) IS
  'US-799: the serving mass in grams from nutrition.serving_size free text, or NULL when it cannot be read. Prefers a parenthesised mass ("2 cookies (25g)" is 25, not 2). Returns NULL for volumes -- ml is not grams without a density -- and never guesses, because a wrong number in a shared catalog looks exactly like a right one.';

-- US-804: name the roles. A pure text function is harmless, but the default
-- ACL grants anon EXECUTE at creation and the habit is the point.
REVOKE ALL ON FUNCTION public.parse_serving_grams(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parse_serving_grams(TEXT) TO authenticated, service_role;
