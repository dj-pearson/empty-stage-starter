-- US-793: the catalog can describe a generic food and a branded product.
-- Run: psql -f supabase/tests/us793_canonical_catalog.test.sql
\set ON_ERROR_STOP on
BEGIN;

-- 1. The columns exist.
SELECT 'EXPECTED 17, GOT ' || count(*)::text AS columns_added
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'grocery_product_catalog'
  AND column_name IN (
    'kind','parent_food_id','calories_kcal_100','protein_g_100','carbs_g_100',
    'fat_g_100','fiber_g_100','sugar_g_100','sodium_mg_100','serving_size_g',
    'allergens','source','source_ref','verification','verified_at','verified_by',
    'name_normalized'
  );

-- 2. A generic row inserts and defaults to unverified.
INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, source, calories_kcal_100)
VALUES ('Cheddar Cheese', 'cheddar cheese', 'generic', 'usda', 416);
SELECT 'EXPECTED unverified, GOT ' || verification AS default_verification
FROM public.grocery_product_catalog WHERE name_normalized = 'cheddar cheese';

-- 3. A branded row may point at a generic parent.
INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, source, parent_food_id)
SELECT 'Cathedral City Mature 350g', 'cathedral city mature 350g', 'branded', 'openfoodfacts', id
FROM public.grocery_product_catalog WHERE name_normalized = 'cheddar cheese';
SELECT 'EXPECTED 1, GOT ' || count(*)::text AS branded_with_parent
FROM public.grocery_product_catalog WHERE kind = 'branded' AND parent_food_id IS NOT NULL;

-- 4. A generic row may NOT have a parent.
DO $$
BEGIN
  INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, parent_food_id)
  VALUES ('Bad Generic', 'bad generic', 'generic',
          (SELECT id FROM public.grocery_product_catalog WHERE name_normalized = 'cheddar cheese'));
  RAISE EXCEPTION 'EXPECTED reject, GOT insert accepted for generic with parent';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'EXPECTED reject, GOT check_violation -- ok';
END $$;

-- 5. Impossible calories are rejected. 900 kcal/100g is pure fat.
DO $$
BEGIN
  INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, calories_kcal_100)
  VALUES ('Impossible', 'impossible', 'generic', 4000);
  RAISE EXCEPTION 'EXPECTED reject, GOT insert accepted at 4000 kcal/100g';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'EXPECTED reject, GOT check_violation -- ok';
END $$;

-- 6. BACKWARD COMPATIBILITY: the shape the shipped iOS app selects still works.
SELECT 'EXPECTED ok, GOT ' || count(*)::text AS ios_shape_still_selectable
FROM (
  SELECT id, name, name_normalized, barcode, default_aisle_section,
         default_category, default_unit, brand, package_size, times_added
  FROM public.grocery_product_catalog
) AS ios_shape;

-- 7. The name_normalized unique index is UNCHANGED (iOS upserts on it).
SELECT 'EXPECTED 1, GOT ' || count(*)::text AS name_uq_intact
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'grocery_product_catalog_name_uq'
  AND indexdef LIKE '%UNIQUE%(name_normalized)%';

-- 8. A non-admin cannot set verification='verified'.
--    RLS is deliberately NOT tightened -- iOS creates catalog rows -- so the
--    trust boundary is this column, not write access.
--    NOTE: auth.uid() reads request.jwt.claim.sub (see us711/us780 tests); a
--    bare SET LOCAL ROLE authenticated leaves it NULL, which the catalog's
--    existing "auth.uid() IS NOT NULL" RLS policies then reject outright, so
--    the non-admin identity is impersonated the same way those tests do.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '93930000-0000-0000-0000-000000000001', true);
DO $$
BEGIN
  UPDATE public.grocery_product_catalog
     SET verification = 'verified'
   WHERE name_normalized = 'cheddar cheese';
  RAISE EXCEPTION 'EXPECTED reject, GOT a non-admin promoted a row to verified';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'EXPECTED reject, GOT insufficient_privilege -- ok';
END $$;
RESET ROLE;

-- 9. A non-admin may still INSERT, because the iOS flow depends on it.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '93930000-0000-0000-0000-000000000001', true);
INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, source)
VALUES ('User Typed Thing', 'user typed thing', 'generic', 'user');
RESET ROLE;
SELECT 'EXPECTED unverified, GOT ' || verification AS non_admin_insert_lands_unverified
FROM public.grocery_product_catalog WHERE name_normalized = 'user typed thing';

-- 10. foods.canonical_id exists, is NULLABLE, and points at the catalog.
--     Nullable is load-bearing: an unmatched household row must keep working
--     exactly as it does today.
SELECT 'EXPECTED YES, GOT ' || is_nullable AS canonical_id_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'foods' AND column_name = 'canonical_id';

SELECT 'EXPECTED 1, GOT ' || count(*)::text AS canonical_id_fk
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'foods' AND tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'grocery_product_catalog';

ROLLBACK;
