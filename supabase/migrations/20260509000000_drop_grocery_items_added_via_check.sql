-- Align `grocery_items.added_via` with how the app actually uses it.
--
-- Four earlier phase-1 migrations defined the column with conflicting CHECK
-- constraints. The live deployment ended up with the narrow set
-- ('manual','recipe','smart_restock','meal_plan'), but both web and iOS
-- send ~16 distinct provenance tags for analytics — 'quick_add', 'voice',
-- 'siri', 'photo', 'barcode', 'ar_shelf_finder', 'starter_template',
-- 'bulk_recipe', 'cookable_match', 'expiring_restock', 'restock_suggestion',
-- 'drag', 'ai', 'recipe', 'restock', 'import' — none of which fit a fixed
-- enum. The result is that the plus-button + barcode + Add flow on iOS
-- (which sends 'quick_add' / 'barcode') fails with
-- `grocery_items_added_via_check`.
--
-- This is a provenance label for analytics, not a domain constraint, so the
-- right shape is plain TEXT with no CHECK.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'grocery_items'
      AND constraint_name = 'grocery_items_added_via_check'
  ) THEN
    ALTER TABLE public.grocery_items
      DROP CONSTRAINT grocery_items_added_via_check;
  END IF;
END $$;

COMMENT ON COLUMN public.grocery_items.added_via IS
  'Free-form provenance tag set by the client (e.g. manual, voice, barcode, '
  'quick_add, siri, photo, ar_shelf_finder, recipe, restock, '
  'starter_template, bulk_recipe). Used for analytics, not validation.';
