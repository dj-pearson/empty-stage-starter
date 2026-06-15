-- US-251: per-ingredient pricing so a recipe can contribute a real cost to the
-- weekly budget. Additive, backward-compatible: a nullable price column on
-- recipe_ingredients. Old clients ignore it; unpriced rows stay NULL.
--
-- price_per_unit is the price for this ingredient line as listed (e.g.
-- "pasta — $3.20 / 500g" → price_per_unit = 3.20, with the existing
-- quantity=500 + unit='g'). The recipe's cost is the sum of its priced rows.

ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS price_per_unit NUMERIC;

COMMENT ON COLUMN public.recipe_ingredients.price_per_unit IS
  'US-251: optional price for this ingredient line; summed into the recipe''s weekly-budget contribution. NULL = unpriced.';
