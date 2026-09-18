-- US-799: the serving parser, and the backfill that depends on it.
-- Run: psql -f supabase/tests/us799_nutrition_backfill.test.sql
--
-- The conversion from nutrition's PER-SERVING figures to the catalog's
-- PER-100g ones is the risky part of retiring nutrition, because
-- nutrition.serving_size is free text from three providers. A guess here does
-- not produce a missing number, it produces a WRONG one that sits in a shared
-- catalog looking exactly like a right one, and is read by parents deciding
-- what to feed a child. So most of this file is about what the parser REFUSES.
\set ON_ERROR_STOP on
BEGIN;

-- 1. The shapes the three providers actually write.
DO $a1$
DECLARE bad TEXT[] := '{}';
BEGIN
  -- OFF writes '30 g' or '30g'; USDA concatenates value and unit; FoodRepo
  -- does the same with portion_quantity/portion_unit.
  IF public.parse_serving_grams('30 g') IS DISTINCT FROM 30 THEN bad := bad || '30 g'; END IF;
  IF public.parse_serving_grams('30g') IS DISTINCT FROM 30 THEN bad := bad || '30g'; END IF;
  IF public.parse_serving_grams('0.5 kg') IS DISTINCT FROM 500 THEN bad := bad || '0.5 kg'; END IF;
  IF public.parse_serving_grams('100 mg') IS DISTINCT FROM 0.1 THEN bad := bad || '100 mg'; END IF;
  IF round(public.parse_serving_grams('1.5 oz'), 3) IS DISTINCT FROM 42.524 THEN bad := bad || '1.5 oz'; END IF;
  -- A decimal COMMA. Open Food Facts is a European database and '12,5 g' is
  -- twelve and a half grams, not a list.
  IF public.parse_serving_grams('12,5 g') IS DISTINCT FROM 12.5 THEN bad := bad || '12,5 g'; END IF;

  IF array_length(bad, 1) > 0 THEN
    RAISE EXCEPTION 'assertion 1: these readable servings were misread: %', array_to_string(bad, ', ');
  END IF;
  RAISE NOTICE 'assertion 1 ok (g, kg, mg, oz and a decimal comma all read)';
END $a1$;

-- 2. THE ONE THAT MATTERS MOST: a parenthesised mass beats a leading count.
--    "2 cookies (25g)" is a 25 gram serving. Reading the 2 would divide every
--    nutrient by twelve and a half and store the result as fact.
DO $a2$
BEGIN
  IF public.parse_serving_grams('2 cookies (25g)') IS DISTINCT FROM 25 THEN
    RAISE EXCEPTION 'assertion 2: "2 cookies (25g)" read as %, expected 25. A leading count '
      'is pieces, not grams.', public.parse_serving_grams('2 cookies (25g)');
  END IF;
  IF public.parse_serving_grams('3 slices (90 g)') IS DISTINCT FROM 90 THEN
    RAISE EXCEPTION 'assertion 2: "3 slices (90 g)" misread';
  END IF;
  RAISE NOTICE 'assertion 2 ok (a parenthesised mass wins over a leading count)';
END $a2$;

-- 3. A VOLUME IS NOT A MASS. 240 ml of oil is not 240 g, and without the
--    product's density there is no conversion to make.
DO $a3$
DECLARE leaked TEXT[] := '{}'; v TEXT;
BEGIN
  FOREACH v IN ARRAY ARRAY['250ml', '250 ml', '1 cup (240 ml)', '1 l', '33 cl'] LOOP
    IF public.parse_serving_grams(v) IS NOT NULL THEN leaked := leaked || v; END IF;
  END LOOP;
  IF array_length(leaked, 1) > 0 THEN
    RAISE EXCEPTION 'assertion 3: a volume was converted to grams: %', array_to_string(leaked, ', ');
  END IF;
  RAISE NOTICE 'assertion 3 ok (volumes refused)';
END $a3$;

-- 4. Everything else unreadable is NULL rather than a best effort.
DO $a4$
DECLARE leaked TEXT[] := '{}'; v TEXT;
BEGIN
  FOREACH v IN ARRAY ARRAY['', '   ', 'a handful', '2 slices', '1 piece', 'per serving', '0 g', '-5 g'] LOOP
    IF public.parse_serving_grams(v) IS NOT NULL THEN leaked := leaked || v; END IF;
  END LOOP;
  IF public.parse_serving_grams(NULL) IS NOT NULL THEN leaked := leaked || 'NULL'; END IF;

  IF array_length(leaked, 1) > 0 THEN
    RAISE EXCEPTION 'assertion 4: these produced a number: %', array_to_string(leaked, ', ');
  END IF;
  RAISE NOTICE 'assertion 4 ok (unreadable servings return NULL, including a zero serving)';
END $a4$;

-- 5. The backfill converts per-serving to per-100 correctly.
INSERT INTO public.nutrition (name, category, serving_size, calories, protein_g, carbs_g, fat_g, barcode)
VALUES ('US799 Test Crackers', 'snack', '25 g', 130, 2.5, 20, 4.5, '0999799000001');

INSERT INTO public.grocery_product_catalog (
  name, name_normalized, barcode, kind, source, source_ref, verification,
  serving_size_g, calories_kcal_100, protein_g_100, carbs_g_100, fat_g_100)
SELECT n.name, public.normalize_product_name(n.name), n.barcode, 'branded', 'user', n.barcode, 'unverified',
  g.serving_grams,
  round(n.calories * 100.0 / g.serving_grams, 2),
  round(n.protein_g * 100.0 / g.serving_grams, 2),
  round(n.carbs_g * 100.0 / g.serving_grams, 2),
  round(n.fat_g * 100.0 / g.serving_grams, 2)
FROM public.nutrition n
CROSS JOIN LATERAL (SELECT public.parse_serving_grams(n.serving_size) AS serving_grams) g
WHERE n.name = 'US799 Test Crackers' AND g.serving_grams IS NOT NULL;

DO $a5$
DECLARE v RECORD;
BEGIN
  SELECT * INTO v FROM public.grocery_product_catalog
   WHERE name_normalized = 'us799 test crackers';

  IF v IS NULL THEN RAISE EXCEPTION 'assertion 5: the row was not carried across'; END IF;
  -- 130 kcal per 25 g is 520 per 100 g.
  IF v.calories_kcal_100 IS DISTINCT FROM 520 THEN
    RAISE EXCEPTION 'assertion 5: expected 520 kcal/100g, got %', v.calories_kcal_100;
  END IF;
  IF v.protein_g_100 IS DISTINCT FROM 10 THEN
    RAISE EXCEPTION 'assertion 5: expected 10 g protein/100g, got %', v.protein_g_100;
  END IF;
  IF v.serving_size_g IS DISTINCT FROM 25 THEN
    RAISE EXCEPTION 'assertion 5: the serving mass was not recorded, got %', v.serving_size_g;
  END IF;
  IF v.verification IS DISTINCT FROM 'unverified' THEN
    RAISE EXCEPTION 'assertion 5: nutrition was a lookup cache, not a checked source; '
      'a backfilled row must not land verified. Got %', v.verification;
  END IF;
  RAISE NOTICE 'assertion 5 ok (130 kcal/25 g -> 520 kcal/100 g, unverified)';
END $a5$;

-- 6. A row whose serving cannot be read is carried across WITHOUT nutrition,
--    not with guessed nutrition. This is the whole design decision.
INSERT INTO public.nutrition (name, category, serving_size, calories, protein_g, carbs_g, fat_g)
VALUES ('US799 Test Soup', 'protein', '1 cup (240 ml)', 180, 6, 22, 7);

INSERT INTO public.grocery_product_catalog (
  name, name_normalized, kind, source, verification,
  serving_size_g, calories_kcal_100, protein_g_100, carbs_g_100, fat_g_100)
SELECT n.name, public.normalize_product_name(n.name), 'generic', 'user', 'unverified',
  g.serving_grams,
  CASE WHEN g.serving_grams IS NOT NULL THEN round(n.calories * 100.0 / g.serving_grams, 2) END,
  CASE WHEN g.serving_grams IS NOT NULL THEN round(n.protein_g * 100.0 / g.serving_grams, 2) END,
  CASE WHEN g.serving_grams IS NOT NULL THEN round(n.carbs_g * 100.0 / g.serving_grams, 2) END,
  CASE WHEN g.serving_grams IS NOT NULL THEN round(n.fat_g * 100.0 / g.serving_grams, 2) END
FROM public.nutrition n
CROSS JOIN LATERAL (SELECT public.parse_serving_grams(n.serving_size) AS serving_grams) g
WHERE n.name = 'US799 Test Soup';

DO $a6$
DECLARE v RECORD;
BEGIN
  SELECT * INTO v FROM public.grocery_product_catalog WHERE name_normalized = 'us799 test soup';

  IF v IS NULL THEN
    RAISE EXCEPTION 'assertion 6: an unparseable serving dropped the row entirely. It should be '
      'carried across with its name and no nutrition.';
  END IF;
  IF v.calories_kcal_100 IS NOT NULL OR v.protein_g_100 IS NOT NULL
     OR v.carbs_g_100 IS NOT NULL OR v.fat_g_100 IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 6: nutrition was GUESSED for a serving nobody could read '
      '(kcal=%). A wrong number here is indistinguishable from a right one.', v.calories_kcal_100;
  END IF;
  IF v.serving_size_g IS NOT NULL THEN
    RAISE EXCEPTION 'assertion 6: a serving mass was invented for "1 cup (240 ml)"';
  END IF;
  RAISE NOTICE 'assertion 6 ok (unreadable serving -> row kept, nutrition left empty)';
END $a6$;

-- 7. nutrition is NOT dropped by this release. AC3 and CLAUDE.md both require
--    a release where both are populated first, and two edge functions still
--    read it.
DO $a7$
BEGIN
  IF to_regclass('public.nutrition') IS NULL THEN
    RAISE EXCEPTION 'assertion 7: nutrition has been dropped. Two edge functions still read it '
      '(lookup-barcode, generate-weekly-report), and the deprecation flow needs a shipped '
      'release with both tables populated first.';
  END IF;
  RAISE NOTICE 'assertion 7 ok (nutrition still present, as the deprecation flow requires)';
END $a7$;

ROLLBACK;
