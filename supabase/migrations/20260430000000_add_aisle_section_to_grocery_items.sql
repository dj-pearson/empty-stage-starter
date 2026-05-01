-- US-263: Add aisle_section column to grocery_items.
--
-- The legacy `category` column held a 6-value FoodCategory (protein, carb,
-- dairy, fruit, vegetable, snack), which collapsed real-world store
-- sections like frozen meals, ethnic aisles, household, and condiments
-- into a tiny set of buckets. `aisle_section` is the new 32-value
-- store-routing taxonomy. See ios/EatPal/EatPal/Models/GroceryAisle.swift
-- for the canonical list and store-walk order.
--
-- `category` is left in place to preserve the FoodCategory contract used
-- by nutrition coloring and older queries.

ALTER TABLE public.grocery_items
  ADD COLUMN IF NOT EXISTS aisle_section TEXT;

-- One-time backfill: map each row's existing FoodCategory to the closest
-- aisle. Re-runs are safe because we only update NULL aisle_sections.
UPDATE public.grocery_items
SET aisle_section = CASE category
  WHEN 'protein'   THEN 'meat_deli'
  WHEN 'carb'      THEN 'pasta'
  WHEN 'dairy'     THEN 'dairy'
  WHEN 'fruit'     THEN 'produce'
  WHEN 'vegetable' THEN 'produce'
  WHEN 'snack'     THEN 'snacks'
  ELSE 'other'
END
WHERE aisle_section IS NULL;

-- Index supports the new By Aisle grouping in GroceryView (filter by
-- user_id, group by aisle_section) and the per-user shopping-mode walk.
CREATE INDEX IF NOT EXISTS idx_grocery_items_user_aisle
  ON public.grocery_items(user_id, aisle_section)
  WHERE aisle_section IS NOT NULL;

COMMENT ON COLUMN public.grocery_items.aisle_section IS
  'US-263: Store-section taxonomy (32 values). Canonical list in ios/EatPal/EatPal/Models/GroceryAisle.swift. Independent of `category`, which still drives FoodCategory consumers.';
