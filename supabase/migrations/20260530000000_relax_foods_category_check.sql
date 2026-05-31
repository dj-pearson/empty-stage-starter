-- Drop the legacy 6-value CHECK on foods.category.
--
-- The original 2025-10 schema constrained foods.category to the FoodCategory
-- enum ('protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack'). But
-- grocery_items.category was relaxed to free-text in
-- 20260501000000_relax_grocery_items_category_check.sql (US-263), so a
-- grocery item can legitimately carry a category like 'other' or an
-- aisle-derived label.
--
-- When the user moves checked grocery items to the pantry
-- (AppState.moveCheckedToPantry copies `category: item.category` into a new
-- foods row), any value outside the original six fails
-- foods_category_check with:
--   "new row for relation \"foods\" violates check constraint
--    \"foods_category_check\""
-- which surfaces in the iOS app as "Couldn't save pantry".
--
-- This mirrors the grocery_items decision: drop the constraint rather than
-- enumerate every legitimate value. The iOS UI already tolerates free-text
-- categories (FoodCategory(rawValue:) falls back gracefully), and category
-- is now a free-text label; nutrition coloring degrades to a default for
-- unknown values.
--
-- Backward-compatible: this only LOOSENS the constraint, so every value old
-- shipped clients write (the original six) still passes. column stays
-- NOT NULL.

ALTER TABLE public.foods
  DROP CONSTRAINT IF EXISTS foods_category_check;
