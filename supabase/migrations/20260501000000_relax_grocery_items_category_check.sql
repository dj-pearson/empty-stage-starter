-- US-263 follow-up: drop the legacy 6-value CHECK on grocery_items.category.
--
-- The original 2025-10 schema constrained `category` to the FoodCategory
-- enum ('protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack'). Since
-- US-263 introduced `aisle_section` as the authoritative store-section
-- taxonomy (32 values), iOS now legitimately writes free-form values
-- like 'other' into `category` for ingredients without a linked pantry
-- food (see GroceryGeneratorService.addLegacyName + addStructuredIngredient).
--
-- Rather than enumerate every legitimate value, we drop the constraint:
-- `aisle_section` is the typed column that section-grouping reads from,
-- and `category` is now an unconstrained free-text label kept only for
-- legacy nutrition-coloring callers.

ALTER TABLE public.grocery_items
  DROP CONSTRAINT IF EXISTS grocery_items_category_check;
