-- US-265: Structured recipe ingredients.
--
-- Replaces the current `recipes.additional_ingredients TEXT` (a comma-
-- separated free-text field) with a real one-to-many table so we can
-- carry per-ingredient quantity, unit, optional foodId link, and a
-- group label (e.g. "For the sauce"). Unblocks:
--   * US-264 — per-recipe grocery view (need stable rows per ingredient)
--   * US-262 — pantry debit on "Mark meal made" (need quantities)
--   * RecipeScaling.swift — live serving slider scaling actual quantities
--
-- Strategy: keep `recipes.additional_ingredients` in place. New rows get
-- structured ingredients via this table; legacy rows lazy-migrate the
-- first time they're opened in EditRecipeView (see Swift side).

CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  food_id UUID REFERENCES public.foods(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  group_label TEXT,
  optional_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sort by (recipe, sort_order) for stable rendering order.
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_sort_order
  ON public.recipe_ingredients(recipe_id, sort_order);

-- Reverse lookup so US-270 ("What can I make?") can ask "which recipes
-- use this food?" without scanning the table.
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_food
  ON public.recipe_ingredients(food_id)
  WHERE food_id IS NOT NULL;

ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- All policies scope through recipe ownership: a row in recipe_ingredients
-- is visible/mutable iff the user owns the parent recipe. This handles
-- household sharing automatically since `recipes` already has its own
-- household-aware policies.
CREATE POLICY "Recipe ingredients viewable through recipe ownership"
  ON public.recipe_ingredients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Recipe ingredients insert through recipe ownership"
  ON public.recipe_ingredients
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Recipe ingredients update through recipe ownership"
  ON public.recipe_ingredients
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Recipe ingredients delete through recipe ownership"
  ON public.recipe_ingredients
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND r.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.recipe_ingredients IS
  'US-265: Structured ingredients for a recipe (name, quantity, unit, optional food_id link, group label). Replaces recipes.additional_ingredients string. Lazy-migration on first edit in EditRecipeView.';
