-- US-799 AC2: one place that turns per-serving figures into a catalog row.
--
-- WHY THIS EXISTS. The remaining writers all hold PER SERVING figures: the CSV
-- import's columns, the barcode scanner's `scannedFood`, and lookup-barcode's
-- response -- and that response is a shipped contract, consumed by iOS builds
-- that cannot be changed, so it stays per-serving whatever happens here. The
-- catalog stores PER 100 G. Converting needs the serving mass, and
-- parse_serving_grams refuses to produce one for "2 cookies" or "1 cup
-- (240 ml)". Putting that arithmetic and that refusal in three TypeScript
-- clients means three chances to divide by a number the parser declined to
-- give, so it lives here instead, next to the parser, doing exactly what
-- 20260918000004 does inline for the backfill.
--
-- MISSING BEATS WRONG, same as the backfill. A row whose serving mass cannot
-- be read is still created -- with its name, barcode, allergens, ingredients
-- and serving text -- and with NO nutrition figures. A row with missing
-- nutrition is visibly incomplete and someone can fill it in; a row with
-- guessed nutrition is indistinguishable from a correct one, sits in a catalog
-- shared between families, and is read by parents deciding what to feed a
-- child.
--
-- IT DOES NOT VERIFY. A scan is one household's photo of one label and a CSV
-- is a file someone was handed; neither is a check. Rows land 'unverified',
-- US-797 keeps their figures out of totals and the ladder, and an admin
-- promotes them one at a time from NutritionManager, which is where looking at
-- a row happens. gpc_guard_verification would reject a non-admin trying
-- otherwise anyway.
--
-- SECURITY INVOKER, deliberately. Running as the caller keeps the catalog's
-- RLS and the verification trigger in force: this function is a conversion,
-- not a way around either. That is also why it is not SECURITY DEFINER despite
-- writing a shared table.

CREATE OR REPLACE FUNCTION public.catalog_upsert_from_serving(
  p_name                    TEXT,
  p_category                TEXT    DEFAULT NULL,
  p_barcode                 TEXT    DEFAULT NULL,
  p_serving_size_text       TEXT    DEFAULT NULL,
  p_ingredients             TEXT    DEFAULT NULL,
  p_servings_per_container  NUMERIC DEFAULT NULL,
  p_package_quantity_text   TEXT    DEFAULT NULL,
  p_allergens               TEXT[]  DEFAULT NULL,
  -- PER SERVING, the units every remaining caller holds.
  p_calories                NUMERIC DEFAULT NULL,
  p_protein_g               NUMERIC DEFAULT NULL,
  p_carbs_g                 NUMERIC DEFAULT NULL,
  p_fat_g                   NUMERIC DEFAULT NULL,
  p_source                  TEXT    DEFAULT 'user'
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $catalog_upsert_from_serving$
DECLARE
  v_name       TEXT := btrim(coalesce(p_name, ''));
  v_normalized TEXT;
  v_barcode    TEXT := nullif(btrim(coalesce(p_barcode, '')), '');
  v_grams      NUMERIC;
  v_id         UUID;
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'catalog_upsert_from_serving: a catalog row needs a name'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_normalized := public.normalize_product_name(v_name);
  v_grams := public.parse_serving_grams(p_serving_size_text);

  -- The catalog wins over an incoming copy. A row already here may have been
  -- corrected by hand or promoted from a provider that reports per-100g
  -- directly, and neither should lose to a scan of the same product. So an
  -- existing row only gains what it is MISSING; nothing it holds is replaced.
  SELECT id INTO v_id FROM public.grocery_product_catalog
   WHERE name_normalized = v_normalized;

  IF v_id IS NOT NULL THEN
    UPDATE public.grocery_product_catalog SET
      barcode                = COALESCE(barcode, v_barcode),
      default_category       = COALESCE(default_category, p_category),
      serving_size_text      = COALESCE(serving_size_text, p_serving_size_text),
      ingredients            = COALESCE(ingredients, p_ingredients),
      servings_per_container = COALESCE(servings_per_container, p_servings_per_container),
      package_quantity_text  = COALESCE(package_quantity_text, p_package_quantity_text),
      allergens              = COALESCE(allergens, p_allergens),
      -- Only when this row has no figures at all. Filling calories from a scan
      -- and leaving protein from somewhere else would build a row whose
      -- macros come from two different products.
      calories_kcal_100 = CASE
        WHEN calories_kcal_100 IS NULL AND protein_g_100 IS NULL
         AND carbs_g_100 IS NULL AND fat_g_100 IS NULL
         AND v_grams IS NOT NULL AND p_calories IS NOT NULL
        THEN round(p_calories * 100.0 / v_grams, 2) ELSE calories_kcal_100 END,
      protein_g_100 = CASE
        WHEN calories_kcal_100 IS NULL AND protein_g_100 IS NULL
         AND carbs_g_100 IS NULL AND fat_g_100 IS NULL
         AND v_grams IS NOT NULL AND p_protein_g IS NOT NULL
        THEN round(p_protein_g * 100.0 / v_grams, 2) ELSE protein_g_100 END,
      carbs_g_100 = CASE
        WHEN calories_kcal_100 IS NULL AND protein_g_100 IS NULL
         AND carbs_g_100 IS NULL AND fat_g_100 IS NULL
         AND v_grams IS NOT NULL AND p_carbs_g IS NOT NULL
        THEN round(p_carbs_g * 100.0 / v_grams, 2) ELSE carbs_g_100 END,
      fat_g_100 = CASE
        WHEN calories_kcal_100 IS NULL AND protein_g_100 IS NULL
         AND carbs_g_100 IS NULL AND fat_g_100 IS NULL
         AND v_grams IS NOT NULL AND p_fat_g IS NOT NULL
        THEN round(p_fat_g * 100.0 / v_grams, 2) ELSE fat_g_100 END
    WHERE id = v_id;

    RETURN v_id;
  END IF;

  INSERT INTO public.grocery_product_catalog (
    name, name_normalized, barcode,
    -- A barcode means a specific manufactured product; without one it is a
    -- generic name somebody typed. Same rule as the backfill.
    kind, source, source_ref, verification,
    default_category, serving_size_text, ingredients,
    servings_per_container, package_quantity_text, allergens,
    calories_kcal_100, protein_g_100, carbs_g_100, fat_g_100
  )
  VALUES (
    v_name, v_normalized, v_barcode,
    CASE WHEN v_barcode IS NULL THEN 'generic' ELSE 'branded' END,
    p_source, v_barcode, 'unverified',
    p_category, p_serving_size_text, p_ingredients,
    p_servings_per_container, p_package_quantity_text, p_allergens,
    CASE WHEN v_grams IS NOT NULL AND p_calories  IS NOT NULL THEN round(p_calories  * 100.0 / v_grams, 2) END,
    CASE WHEN v_grams IS NOT NULL AND p_protein_g IS NOT NULL THEN round(p_protein_g * 100.0 / v_grams, 2) END,
    CASE WHEN v_grams IS NOT NULL AND p_carbs_g   IS NOT NULL THEN round(p_carbs_g   * 100.0 / v_grams, 2) END,
    CASE WHEN v_grams IS NOT NULL AND p_fat_g     IS NOT NULL THEN round(p_fat_g     * 100.0 / v_grams, 2) END
  )
  -- Two callers racing the same product: the loser reads the winner's row
  -- rather than aborting the import it was in the middle of.
  ON CONFLICT (name_normalized) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.grocery_product_catalog
     WHERE name_normalized = v_normalized;
  END IF;

  RETURN v_id;
END;
$catalog_upsert_from_serving$;

COMMENT ON FUNCTION public.catalog_upsert_from_serving(TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,TEXT,TEXT[],NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT) IS
  'US-799: create or complete a grocery_product_catalog row from PER SERVING figures, converting to per 100g only when parse_serving_grams can read the serving mass. Never guesses, never verifies, and never overwrites what the catalog already holds.';

-- US-804: name the roles. A signed-in user scanning a barcode calls this; anon
-- has no business writing the shared catalog, and the catalog's own RLS says
-- the same thing.
REVOKE ALL ON FUNCTION public.catalog_upsert_from_serving(TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,TEXT,TEXT[],NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_upsert_from_serving(TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,TEXT,TEXT[],NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT) TO authenticated, service_role;
