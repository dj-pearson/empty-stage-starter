-- A store a family made is theirs; only the seeded chains are shared.
--
-- 20260601000001 widened the store_layouts SELECT policy with
-- `household_id IS NULL` so every signed-in user could read the iOS chain
-- catalog (Walmart, Target, ...). But a household_id of NULL is also what a
-- user-created store got whenever the household could not be resolved at
-- write time: auto_fill_household_id only looks at auth.uid(), so a row
-- written without a JWT (service role, a script) or by an account whose
-- household had not resolved yet kept NULL, and sync_store_layout_fields
-- never filled it. The legacy "Users can manage their store layouts" (ALL,
-- user_id = auth.uid()) also let the creator set household_id back to NULL.
-- Any such row -- name and street address included -- was readable by every
-- account in the database.
--
-- A catalog row is one nobody created: user_id AND household_id both NULL.
-- That is what the seeds write and what src/lib/storeLayouts.ts
-- isCatalogStore() already tests for. Changes, all additive (no column,
-- table or RPC signature changes; iOS only reads this table):
--
--   1. The SELECT policy's public branch requires user_id IS NULL as well.
--      A user-created row is visible to its household, or to its creator.
--   2. sync_store_layout_fields fills household_id from the creator
--      (user_id), falling back to the caller, on insert and on update.
--   3. Backfill household_id on existing user-created rows from the
--      creator's household.
--   4. Restrictive INSERT/UPDATE policies for `authenticated`: a signed-in
--      user can only write a store into their own household. Before this the
--      legacy "Users can insert own store layouts" (WITH CHECK
--      auth.uid() = user_id) let anyone place a store into another
--      household's list. The web client already sends its own household_id;
--      iOS does not write store_layouts. service_role bypasses RLS.

-- 1 --------------------------------------------------------------------------
DROP POLICY IF EXISTS "View global catalog and own household store layouts" ON public.store_layouts;
CREATE POLICY "View global catalog and own household store layouts"
  ON public.store_layouts
  FOR SELECT
  USING (
    (household_id IS NULL AND user_id IS NULL)
    OR household_id = public.get_user_household_id(auth.uid())
    OR user_id = auth.uid()
  );

-- 2 --------------------------------------------------------------------------
-- Replaced from 20260601000001 with one addition: the household_id fill.
CREATE OR REPLACE FUNCTION public.sync_store_layout_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $sync_store_layout_fields$
BEGIN
  IF NEW.name IS NULL AND NEW.store_name IS NOT NULL THEN NEW.name := NEW.store_name; END IF;
  IF NEW.store_name IS NULL AND NEW.name IS NOT NULL THEN NEW.store_name := NEW.name; END IF;
  IF NEW.slug IS NULL THEN
    NEW.slug := regexp_replace(lower(coalesce(NEW.name, NEW.store_name, 'store')), '[^a-z0-9]+', '_', 'g')
                || '_' || replace(NEW.id::text, '-', '');
  END IF;
  IF NEW.aisle_overrides IS NULL THEN NEW.aisle_overrides := '{}'::jsonb; END IF;
  -- A store somebody made belongs to a household. Catalog rows (no user_id)
  -- are left alone, so a seed stays shared.
  IF NEW.household_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.household_id := coalesce(
      public.get_user_household_id(NEW.user_id),
      public.get_user_household_id(auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$sync_store_layout_fields$;

-- The trigger itself is unchanged (BEFORE INSERT OR UPDATE, from
-- 20260601000001); CREATE OR REPLACE above is all it needs.

-- 3 --------------------------------------------------------------------------
UPDATE public.store_layouts
   SET household_id = public.get_user_household_id(user_id)
 WHERE household_id IS NULL
   AND user_id IS NOT NULL
   AND public.get_user_household_id(user_id) IS NOT NULL;

-- 4 --------------------------------------------------------------------------
-- RESTRICTIVE: ANDed with whichever permissive policy lets the write through.
-- Evaluated after the BEFORE triggers, so a NULL the client left is already
-- filled with the caller's household by the time this runs.
DROP POLICY IF EXISTS "Store layouts insert into own household only" ON public.store_layouts;
CREATE POLICY "Store layouts insert into own household only"
  ON public.store_layouts
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id IS NULL
    OR household_id = public.get_user_household_id(auth.uid())
  );

DROP POLICY IF EXISTS "Store layouts update within own household only" ON public.store_layouts;
CREATE POLICY "Store layouts update within own household only"
  ON public.store_layouts
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    household_id IS NULL
    OR household_id = public.get_user_household_id(auth.uid())
  );
