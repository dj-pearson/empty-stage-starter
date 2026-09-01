-- US-711: household-scope RLS on recipe_ingredients and recipe_components.
--
-- `recipes` has been household-scoped since 20251008035900:
--   household_id = public.get_user_household_id(auth.uid())
--
-- Its two child tables were not. Both were written to "scope through recipe
-- ownership" (US-265, US-612) on the assumption that going through `recipes`
-- inherited the sharing -- but the predicate they used was
-- `r.user_id = auth.uid()`, which is ownership, not household. The result is a
-- recipe a partner can open and cannot read the ingredients of: the parent row
-- passes RLS, every child row fails it. Same for components, so a shared
-- recipe also loses its plating structure.
--
-- This replaces the predicate on all eight policies with the same household
-- expression `recipes` itself uses. It is a BROADENING change: every row
-- visible before is still visible (an owner is a member of their own
-- household), plus the rows their household members can already see the parent
-- of. Nothing narrows, so no shipped iOS build loses access.
--
-- Per CLAUDE.md migration rules this is additive-only: no column, table or
-- policy NAME changes -- the eight policy names are recreated exactly as they
-- were, so anything that inspects them by name still finds them. Only the
-- predicate moves. Every statement is DROP IF EXISTS + CREATE so a replay
-- against a database that already recorded this version is a no-op.

-- --- recipe_ingredients (US-265) ---------------------------------------------

DROP POLICY IF EXISTS "Recipe ingredients viewable through recipe ownership" ON public.recipe_ingredients;
CREATE POLICY "Recipe ingredients viewable through recipe ownership"
  ON public.recipe_ingredients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND r.household_id = public.get_user_household_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Recipe ingredients insert through recipe ownership" ON public.recipe_ingredients;
CREATE POLICY "Recipe ingredients insert through recipe ownership"
  ON public.recipe_ingredients
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND r.household_id = public.get_user_household_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Recipe ingredients update through recipe ownership" ON public.recipe_ingredients;
CREATE POLICY "Recipe ingredients update through recipe ownership"
  ON public.recipe_ingredients
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND r.household_id = public.get_user_household_id(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND r.household_id = public.get_user_household_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Recipe ingredients delete through recipe ownership" ON public.recipe_ingredients;
CREATE POLICY "Recipe ingredients delete through recipe ownership"
  ON public.recipe_ingredients
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_ingredients.recipe_id
        AND r.household_id = public.get_user_household_id(auth.uid())
    )
  );

-- --- recipe_components (US-612) ----------------------------------------------

DROP POLICY IF EXISTS "Recipe components viewable through recipe ownership" ON public.recipe_components;
CREATE POLICY "Recipe components viewable through recipe ownership"
  ON public.recipe_components
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_components.recipe_id
        AND r.household_id = public.get_user_household_id(auth.uid())
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
        AND r.household_id = public.get_user_household_id(auth.uid())
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
        AND r.household_id = public.get_user_household_id(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_components.recipe_id
        AND r.household_id = public.get_user_household_id(auth.uid())
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
        AND r.household_id = public.get_user_household_id(auth.uid())
    )
  );
