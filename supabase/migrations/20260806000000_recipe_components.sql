-- US-612: Deconstructed recipes — component model.
--
-- A family cooking one meal for a mixed table is already deconstructing it in
-- their head: the pasta goes on every plate, the sauce goes on two of them,
-- the peas go in a separate bowl for the child who cannot have food touching.
-- The app has never had anywhere to put that knowledge, so it cannot help with
-- the plating (US-613) and the parent re-derives it every single night.
--
-- This adds that structure as a GROUPING OVER the ingredients that already
-- exist. `recipe_ingredients` (US-265) keeps carrying what goes in; a
-- component says which of those parts can be plated independently, and how
-- each part behaves on a plate.
--
-- Per CLAUDE.md backward-compat rules, this is strictly additive:
--   * New table `recipe_components`.
--   * One NULLABLE column on `recipe_ingredients` pointing at it.
--   * Nothing dropped, nothing renamed, no type changed, no constraint
--     tightened, no RLS policy narrowed.
--
-- A recipe with no component rows is EXACTLY as valid as it is today, and
-- every shipped iOS build keeps working untouched: it never queries this
-- table, and the one new column on recipe_ingredients is nullable and
-- ignored by Swift's Codable decoding of the existing shape. Components are
-- optional metadata, not a new required layer.

CREATE TABLE IF NOT EXISTS public.recipe_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,

  -- What the parent calls this part: "pasta", "the sauce", "peas on the side".
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Sensory attributes, read by the plating logic in US-613.
  --
  -- can_touch_other_foods: FALSE means this part has to be plated with a gap
  -- around it (or in its own bowl) for a child who cannot tolerate contact.
  -- Defaults TRUE so an unfilled component never invents a restriction.
  can_touch_other_foods BOOLEAN NOT NULL DEFAULT true,

  -- is_mixed_in: a sauce, dressing or anything stirred through. Once it is on,
  -- it cannot be taken off, so plating has to decide BEFORE it is combined.
  -- This is the flag that makes "hold the sauce for one plate" possible.
  is_mixed_in BOOLEAN NOT NULL DEFAULT false,

  -- can_be_held_back: FALSE marks a part that is structurally the dish (the
  -- pasta in a pasta bake). Holding it back would not be a plating choice, it
  -- would be serving something else.
  can_be_held_back BOOLEAN NOT NULL DEFAULT true,

  -- Textures this part presents, using the SAME vocabulary the intake
  -- questionnaire writes to kids.texture_dislikes ('Soft/mushy', 'Slimy',
  -- 'Crunchy', 'Chewy', 'Lumpy', 'Wet'). Shared vocabulary is what lets
  -- plating match a component against a child's dislikes without a
  -- translation table that would drift.
  textures TEXT[] NOT NULL DEFAULT '{}',

  -- Optional link to the food this component IS, so a component can be
  -- recognised as a child's safe food or as a due ladder exposure (US-613).
  -- ON DELETE SET NULL: deleting a food must never destroy recipe structure.
  food_id UUID REFERENCES public.foods(id) ON DELETE SET NULL,

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Components render in order within a recipe; this serves that read directly.
CREATE INDEX IF NOT EXISTS idx_recipe_components_recipe_sort
  ON public.recipe_components(recipe_id, sort_order);

-- "Which recipes have a component that is this food" — the lookup US-613 needs
-- to spot a due exposure inside tonight's dinner.
CREATE INDEX IF NOT EXISTS idx_recipe_components_food
  ON public.recipe_components(food_id)
  WHERE food_id IS NOT NULL;

-- The grouping itself. NULL means "not assigned to a component", which is the
-- state every existing row is in and stays in until a parent says otherwise.
ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS component_id UUID
  REFERENCES public.recipe_components(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_component
  ON public.recipe_ingredients(component_id)
  WHERE component_id IS NOT NULL;

ALTER TABLE public.recipe_components ENABLE ROW LEVEL SECURITY;

-- Policies are dropped-if-exists before creation so the whole migration is
-- re-runnable (US-547): a half-applied migration re-run must converge, not
-- abort on "policy already exists".
--
-- Scoped through recipe ownership, matching recipe_ingredients (US-265)
-- exactly. `recipes` already carries the household-aware policies, so this
-- inherits sharing rather than restating it.
DROP POLICY IF EXISTS "Recipe components viewable through recipe ownership" ON public.recipe_components;
CREATE POLICY "Recipe components viewable through recipe ownership"
  ON public.recipe_components
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_components.recipe_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Recipe components insert through recipe ownership" ON public.recipe_components;
CREATE POLICY "Recipe components insert through recipe ownership"
  ON public.recipe_components
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_components.recipe_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Recipe components update through recipe ownership" ON public.recipe_components;
CREATE POLICY "Recipe components update through recipe ownership"
  ON public.recipe_components
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_components.recipe_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_components.recipe_id
        AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Recipe components delete through recipe ownership" ON public.recipe_components;
CREATE POLICY "Recipe components delete through recipe ownership"
  ON public.recipe_components
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_components.recipe_id
        AND r.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.touch_recipe_components_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipe_components_touch_updated_at ON public.recipe_components;
CREATE TRIGGER recipe_components_touch_updated_at
  BEFORE UPDATE ON public.recipe_components
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_recipe_components_updated_at();

COMMENT ON TABLE public.recipe_components IS
  'US-612: separable parts of a recipe, grouping over recipe_ingredients. Optional metadata — a recipe with no component rows behaves exactly as before on every client. Sensory flags feed the per-kid plating in US-613.';

COMMENT ON COLUMN public.recipe_components.is_mixed_in IS
  'Stirred through rather than plated beside. Once on, it cannot come off, so plating must decide before combining — this is what makes "hold the sauce for one plate" possible.';

COMMENT ON COLUMN public.recipe_components.textures IS
  'Same vocabulary as kids.texture_dislikes, so plating can match a component to a child''s dislikes without a translation table.';

COMMENT ON COLUMN public.recipe_ingredients.component_id IS
  'US-612: optional grouping into a recipe_components row. NULL means ungrouped, which is every pre-existing row.';
