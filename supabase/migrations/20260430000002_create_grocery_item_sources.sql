-- US-264: grocery_item_sources — preserves the recipe -> grocery item
-- linkage that the v1 generator threw away during name-dedupe.
--
-- One grocery_item can be sourced from many recipes (e.g. chicken
-- contributes to Mon dinner + Wed lunch). We need this many-to-many
-- shape to render the new "By Recipe" view: each recipe section lists
-- the items it pulled from, plus a "Shared" bucket for items linked to
-- two or more recipes and a "Manual additions" bucket for items with
-- no source rows.

CREATE TABLE IF NOT EXISTS public.grocery_item_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_item_id UUID NOT NULL REFERENCES public.grocery_items(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
  plan_entry_id UUID REFERENCES public.plan_entries(id) ON DELETE SET NULL,
  meal_date DATE,
  meal_slot TEXT,
  contributed_quantity NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Forward lookup: "what recipes does this grocery item come from?"
CREATE INDEX IF NOT EXISTS idx_grocery_item_sources_grocery_item
  ON public.grocery_item_sources(grocery_item_id);

-- Reverse lookup: "what grocery items does this recipe contribute?"
-- Powers the per-recipe sections in the By Recipe view.
CREATE INDEX IF NOT EXISTS idx_grocery_item_sources_recipe
  ON public.grocery_item_sources(recipe_id)
  WHERE recipe_id IS NOT NULL;

-- US-262 will read this to mark recipe-sourced items checked when the
-- meal is logged as made.
CREATE INDEX IF NOT EXISTS idx_grocery_item_sources_plan_entry
  ON public.grocery_item_sources(plan_entry_id)
  WHERE plan_entry_id IS NOT NULL;

ALTER TABLE public.grocery_item_sources ENABLE ROW LEVEL SECURITY;

-- All policies scope through grocery_item ownership: a row is visible /
-- mutable iff the user owns the parent grocery_item. This piggy-backs
-- on grocery_items' existing household-aware policies.
CREATE POLICY "Grocery sources viewable through grocery item ownership"
  ON public.grocery_item_sources
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.grocery_items gi
      WHERE gi.id = grocery_item_sources.grocery_item_id
        AND gi.user_id = auth.uid()
    )
  );

CREATE POLICY "Grocery sources insert through grocery item ownership"
  ON public.grocery_item_sources
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.grocery_items gi
      WHERE gi.id = grocery_item_sources.grocery_item_id
        AND gi.user_id = auth.uid()
    )
  );

CREATE POLICY "Grocery sources update through grocery item ownership"
  ON public.grocery_item_sources
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.grocery_items gi
      WHERE gi.id = grocery_item_sources.grocery_item_id
        AND gi.user_id = auth.uid()
    )
  );

CREATE POLICY "Grocery sources delete through grocery item ownership"
  ON public.grocery_item_sources
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.grocery_items gi
      WHERE gi.id = grocery_item_sources.grocery_item_id
        AND gi.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.grocery_item_sources IS
  'US-264: many-to-many link from grocery items to the recipes/plan entries that contributed to them. Populated by GroceryGeneratorService; powers the "By Recipe" view in the iOS GroceryView.';
