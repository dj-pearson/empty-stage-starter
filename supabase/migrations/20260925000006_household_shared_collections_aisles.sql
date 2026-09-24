-- Recipe collections, store aisles and aisle mappings belong to the household.
--
-- Items 7 and 14. The parents of these tables are already household-scoped:
-- recipe_collections since 20260601000000, store_layouts since 20260601000000
-- and 20260925000003. Their children were not. Every policy on
-- recipe_collection_items, store_aisles and food_aisle_mappings tests
-- `user_id = auth.uid()` on the row or on its parent, so a co-parent could
-- open a collection their partner made and find it empty, could not add a
-- recipe to it, and could not see or edit the aisles of a store their
-- household set up. The web client (useRecipeCollections, useStoreLayouts,
-- ManageStoreAislesDialog) already reads and writes these as household data;
-- the database was the only thing saying no. iOS and the edge functions do not
-- touch any of the four tables.
--
-- All additive. No policy is dropped except to re-create it under the same
-- name, so the owner-only policies stay and keep working; the new permissive
-- policies OR in household access on top of them. Membership is
-- public.get_user_household_id(auth.uid()), the helper every other household
-- policy uses. A row whose parent has household_id NULL (a user with no
-- household, or a catalog store) gets nothing from the new policies, so this
-- never reaches another household or the shared chain catalog.
--
-- Two restrictive policies close the write side, because broadening reads
-- makes a planted row visible to the household it was planted in:
--
--   * recipe_collections: the legacy "Users can manage their recipe
--     collections" (ALL, user_id = auth.uid()) let the creator write any
--     household_id, including someone else's. Same shape as the store_layouts
--     fix in 20260925000003.
--   * food_aisle_mappings: "Users can manage food aisle mappings" (ALL,
--     user_id = auth.uid()) let anyone attach a mapping to any store or aisle
--     id. A mapping must now point at a store and aisles the caller can see.
--
-- Both are TO authenticated; service_role bypasses RLS.

-- recipe_collection_items ----------------------------------------------------
-- Through the owning collection's household.
DROP POLICY IF EXISTS "Household members can view collection items" ON public.recipe_collection_items;
CREATE POLICY "Household members can view collection items"
  ON public.recipe_collection_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.recipe_collections rc
       WHERE rc.id = recipe_collection_items.collection_id
         AND rc.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Household members can insert collection items" ON public.recipe_collection_items;
CREATE POLICY "Household members can insert collection items"
  ON public.recipe_collection_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipe_collections rc
       WHERE rc.id = recipe_collection_items.collection_id
         AND rc.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Household members can update collection items" ON public.recipe_collection_items;
CREATE POLICY "Household members can update collection items"
  ON public.recipe_collection_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.recipe_collections rc
       WHERE rc.id = recipe_collection_items.collection_id
         AND rc.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipe_collections rc
       WHERE rc.id = recipe_collection_items.collection_id
         AND rc.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Household members can delete collection items" ON public.recipe_collection_items;
CREATE POLICY "Household members can delete collection items"
  ON public.recipe_collection_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.recipe_collections rc
       WHERE rc.id = recipe_collection_items.collection_id
         AND rc.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  );

-- recipe_collections: write only into your own household ---------------------
DROP POLICY IF EXISTS "Recipe collections insert into own household only" ON public.recipe_collections;
CREATE POLICY "Recipe collections insert into own household only"
  ON public.recipe_collections
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id IS NULL
    OR household_id = (SELECT public.get_user_household_id(auth.uid()))
  );

DROP POLICY IF EXISTS "Recipe collections update within own household only" ON public.recipe_collections;
CREATE POLICY "Recipe collections update within own household only"
  ON public.recipe_collections
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    household_id IS NULL
    OR household_id = (SELECT public.get_user_household_id(auth.uid()))
  );

-- store_aisles ---------------------------------------------------------------
-- Through the store's household. Catalog stores (household_id NULL) match
-- nothing here, so their aisles stay unwritable by users.
DROP POLICY IF EXISTS "Household members can view store aisles" ON public.store_aisles;
CREATE POLICY "Household members can view store aisles"
  ON public.store_aisles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.store_layouts sl
       WHERE sl.id = store_aisles.store_layout_id
         AND sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Household members can insert store aisles" ON public.store_aisles;
CREATE POLICY "Household members can insert store aisles"
  ON public.store_aisles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.store_layouts sl
       WHERE sl.id = store_aisles.store_layout_id
         AND sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Household members can update store aisles" ON public.store_aisles;
CREATE POLICY "Household members can update store aisles"
  ON public.store_aisles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.store_layouts sl
       WHERE sl.id = store_aisles.store_layout_id
         AND sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.store_layouts sl
       WHERE sl.id = store_aisles.store_layout_id
         AND sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Household members can delete store aisles" ON public.store_aisles;
CREATE POLICY "Household members can delete store aisles"
  ON public.store_aisles
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.store_layouts sl
       WHERE sl.id = store_aisles.store_layout_id
         AND sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  );

-- food_aisle_mappings --------------------------------------------------------
-- Through the store's household, as for store_aisles. A mapping on a catalog
-- store stays with the user who made it (the existing user_id policies).
DROP POLICY IF EXISTS "Household members can view food aisle mappings" ON public.food_aisle_mappings;
CREATE POLICY "Household members can view food aisle mappings"
  ON public.food_aisle_mappings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.store_layouts sl
       WHERE sl.id = food_aisle_mappings.store_layout_id
         AND sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  );

-- A member inserts as themselves (or anonymously); they cannot write a row
-- attributed to their partner.
DROP POLICY IF EXISTS "Household members can insert food aisle mappings" ON public.food_aisle_mappings;
CREATE POLICY "Household members can insert food aisle mappings"
  ON public.food_aisle_mappings
  FOR INSERT
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.store_layouts sl
       WHERE sl.id = food_aisle_mappings.store_layout_id
         AND sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  );

-- The web upserts on (store_layout_id, food_name), so re-placing a food a
-- partner already placed is an UPDATE of the partner's row.
DROP POLICY IF EXISTS "Household members can update food aisle mappings" ON public.food_aisle_mappings;
CREATE POLICY "Household members can update food aisle mappings"
  ON public.food_aisle_mappings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.store_layouts sl
       WHERE sl.id = food_aisle_mappings.store_layout_id
         AND sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.store_layouts sl
       WHERE sl.id = food_aisle_mappings.store_layout_id
         AND sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Household members can delete food aisle mappings" ON public.food_aisle_mappings;
CREATE POLICY "Household members can delete food aisle mappings"
  ON public.food_aisle_mappings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.store_layouts sl
       WHERE sl.id = food_aisle_mappings.store_layout_id
         AND sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
    )
  );

-- A mapping points at a store and aisles the caller can see: a catalog store,
-- a store of their household, or one they made. Stated explicitly rather than
-- left to store_layouts' own RLS, so a later change there cannot widen it.
DROP POLICY IF EXISTS "Food aisle mappings target own stores only (insert)" ON public.food_aisle_mappings;
CREATE POLICY "Food aisle mappings target own stores only (insert)"
  ON public.food_aisle_mappings
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (store_layout_id IS NULL OR EXISTS (
      SELECT 1 FROM public.store_layouts sl
       WHERE sl.id = food_aisle_mappings.store_layout_id
         AND (   (sl.household_id IS NULL AND sl.user_id IS NULL)
              OR sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
              OR sl.user_id = auth.uid())
    ))
    AND (store_aisle_id IS NULL OR EXISTS (
      SELECT 1 FROM public.store_aisles sa
        JOIN public.store_layouts sl ON sl.id = sa.store_layout_id
       WHERE sa.id = food_aisle_mappings.store_aisle_id
         AND (   sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
              OR sl.user_id = auth.uid())
    ))
    AND (aisle_id IS NULL OR EXISTS (
      SELECT 1 FROM public.store_aisles sa
        JOIN public.store_layouts sl ON sl.id = sa.store_layout_id
       WHERE sa.id = food_aisle_mappings.aisle_id
         AND (   sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
              OR sl.user_id = auth.uid())
    ))
  );

DROP POLICY IF EXISTS "Food aisle mappings target own stores only (update)" ON public.food_aisle_mappings;
CREATE POLICY "Food aisle mappings target own stores only (update)"
  ON public.food_aisle_mappings
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    (store_layout_id IS NULL OR EXISTS (
      SELECT 1 FROM public.store_layouts sl
       WHERE sl.id = food_aisle_mappings.store_layout_id
         AND (   (sl.household_id IS NULL AND sl.user_id IS NULL)
              OR sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
              OR sl.user_id = auth.uid())
    ))
    AND (store_aisle_id IS NULL OR EXISTS (
      SELECT 1 FROM public.store_aisles sa
        JOIN public.store_layouts sl ON sl.id = sa.store_layout_id
       WHERE sa.id = food_aisle_mappings.store_aisle_id
         AND (   sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
              OR sl.user_id = auth.uid())
    ))
    AND (aisle_id IS NULL OR EXISTS (
      SELECT 1 FROM public.store_aisles sa
        JOIN public.store_layouts sl ON sl.id = sa.store_layout_id
       WHERE sa.id = food_aisle_mappings.aisle_id
         AND (   sl.household_id = (SELECT public.get_user_household_id(auth.uid()))
              OR sl.user_id = auth.uid())
    ))
  );
