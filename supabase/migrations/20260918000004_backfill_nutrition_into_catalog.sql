-- US-799 AC1: carry the nutrition table into the canonical catalog.
--
-- ADDITIVE AND REPEATABLE. This inserts rows that are not there yet and
-- touches nothing else: nutrition keeps every row, every edge function that
-- reads it keeps working, and nothing writes less than it did yesterday.
-- Retiring nutrition is a LATER migration in a LATER release, per the
-- deprecation flow in CLAUDE.md and AC3 -- it is explicitly not this one.
--
-- THE CONVERSION IS THE RISKY PART AND IT REFUSES TO GUESS. nutrition's
-- figures are PER SERVING and the catalog's are PER 100g, so every value needs
-- the serving mass. parse_serving_grams reads it where the free text allows
-- and returns NULL otherwise -- a volume, a count of biscuits, a blank. Those
-- rows are still carried across, with their NAME, barcode, allergens and
-- serving text, and with NO nutrition numbers at all.
--
-- That asymmetry is deliberate. A row with missing nutrition is visibly
-- incomplete and someone can fill it in. A row with GUESSED nutrition is
-- indistinguishable from a correct one, sits in a catalog shared between
-- families, and is read by parents deciding what to feed a child. Missing
-- beats wrong every time here.
--
-- Rows land `verification = 'unverified'`: nutrition was a lookup cache, not a
-- checked source, and promoting its contents to verified would launder a
-- provider's claim into the app's own.

INSERT INTO public.grocery_product_catalog (
  name, name_normalized, barcode, kind, source, source_ref, verification,
  allergens, serving_size_g,
  calories_kcal_100, protein_g_100, carbs_g_100, fat_g_100
)
SELECT
  n.name,
  public.normalize_product_name(n.name),
  nullif(btrim(coalesce(n.barcode, '')), ''),
  -- A barcode means a specific manufactured product; without one it is a
  -- generic name somebody typed.
  CASE WHEN nullif(btrim(coalesce(n.barcode, '')), '') IS NULL THEN 'generic' ELSE 'branded' END,
  'user',
  nullif(btrim(coalesce(n.barcode, '')), ''),
  'unverified',
  n.allergens,
  g.serving_grams,
  -- Per serving -> per 100g, and only when the serving mass is known. The
  -- sanity CHECKs on this table (gpc_nutrition_sane) still apply, so a row
  -- whose arithmetic lands somewhere absurd is rejected rather than stored.
  CASE WHEN g.serving_grams IS NOT NULL AND n.calories  IS NOT NULL THEN round(n.calories  * 100.0 / g.serving_grams, 2) END,
  CASE WHEN g.serving_grams IS NOT NULL AND n.protein_g IS NOT NULL THEN round(n.protein_g * 100.0 / g.serving_grams, 2) END,
  CASE WHEN g.serving_grams IS NOT NULL AND n.carbs_g   IS NOT NULL THEN round(n.carbs_g   * 100.0 / g.serving_grams, 2) END,
  CASE WHEN g.serving_grams IS NOT NULL AND n.fat_g     IS NOT NULL THEN round(n.fat_g     * 100.0 / g.serving_grams, 2) END
FROM public.nutrition n
CROSS JOIN LATERAL (SELECT public.parse_serving_grams(n.serving_size) AS serving_grams) g
WHERE btrim(coalesce(n.name, '')) <> ''
  -- Already in the catalog under this name: the catalog wins. It is the
  -- canonical table, and a barcode promotion (US-797) has already been through
  -- a provider that reports per-100g directly with no conversion to get wrong.
  AND NOT EXISTS (
    SELECT 1 FROM public.grocery_product_catalog c
     WHERE c.name_normalized = public.normalize_product_name(n.name)
  )
-- nutrition has no uniqueness on name, so collapse duplicates here rather than
-- letting the catalog's unique index abort the whole backfill. Prefer the row
-- that carries a readable serving, then the most recently updated.
ORDER BY
  public.normalize_product_name(n.name),
  (public.parse_serving_grams(n.serving_size) IS NULL),
  n.updated_at DESC NULLS LAST
ON CONFLICT DO NOTHING;

-- What landed, for the operator running this by hand.
DO $backfill_report$
DECLARE total INT; converted INT; flagged INT;
BEGIN
  SELECT count(*) INTO total FROM public.grocery_product_catalog WHERE source = 'user';
  SELECT count(*) INTO converted FROM public.grocery_product_catalog
   WHERE source = 'user' AND serving_size_g IS NOT NULL AND calories_kcal_100 IS NOT NULL;
  SELECT count(*) INTO flagged FROM public.grocery_product_catalog
   WHERE source = 'user' AND serving_size_g IS NULL;

  RAISE NOTICE 'US-799 backfill: % user-sourced catalog rows, % with converted nutrition, % carried over without a readable serving (nutrition left unconverted, not guessed).',
    total, converted, flagged;
END $backfill_report$;
