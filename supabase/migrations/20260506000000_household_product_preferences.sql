-- US-274: Household-shared product preferences.
--
-- Adds an optional `household_id` to `user_product_preferences` so a
-- household can opt into a single, merged preference layer instead of
-- per-user islands. When a user's grocery resolver fires, it now walks:
--
--   household preference (if shared) → user preference → catalog → ...
--
-- The schema invariant: a row has either a user-only key
-- `(user_id, name_normalized)` OR a household-shared key
-- `(household_id, name_normalized)`. We enforce both with two partial
-- unique indexes — never one row trying to be both.
--
-- The merge policy lives in iOS (`SmartProductService.recordAdd`):
-- last-write-wins on aisle/category/unit, audit-log on every change so
-- partners can see why their default flipped.

ALTER TABLE public.user_product_preferences
  ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES public.households(id) ON DELETE CASCADE;

-- Replace the existing user-only unique index with a partial one so
-- household-shared rows live in their own keyspace. The older index is
-- preserved as a partial WHERE household_id IS NULL.
DROP INDEX IF EXISTS user_product_preferences_user_name_uq;

CREATE UNIQUE INDEX IF NOT EXISTS user_product_preferences_user_only_name_uq
  ON public.user_product_preferences(user_id, name_normalized)
  WHERE household_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_product_preferences_household_name_uq
  ON public.user_product_preferences(household_id, name_normalized)
  WHERE household_id IS NOT NULL;

DROP INDEX IF EXISTS user_product_preferences_user_barcode_uq;

CREATE UNIQUE INDEX IF NOT EXISTS user_product_preferences_user_only_barcode_uq
  ON public.user_product_preferences(user_id, barcode)
  WHERE household_id IS NULL AND barcode IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_product_preferences_household_barcode_uq
  ON public.user_product_preferences(household_id, barcode)
  WHERE household_id IS NOT NULL AND barcode IS NOT NULL;

-- Update the RLS policies so household members can see/edit shared rows.
-- The user-only path stays exactly as before; we add a parallel rule
-- that grants access through household_members for shared rows.

DROP POLICY IF EXISTS "Users view own preferences" ON public.user_product_preferences;
CREATE POLICY "Users view own or household preferences"
  ON public.user_product_preferences
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      household_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.household_members hm
        WHERE hm.household_id = user_product_preferences.household_id
          AND hm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users insert own preferences" ON public.user_product_preferences;
CREATE POLICY "Users insert own or household preferences"
  ON public.user_product_preferences
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      household_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.household_members hm
        WHERE hm.household_id = user_product_preferences.household_id
          AND hm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users update own preferences" ON public.user_product_preferences;
CREATE POLICY "Users update own or household preferences"
  ON public.user_product_preferences
  FOR UPDATE
  USING (
    auth.uid() = user_id
    OR (
      household_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.household_members hm
        WHERE hm.household_id = user_product_preferences.household_id
          AND hm.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users delete own preferences" ON public.user_product_preferences;
CREATE POLICY "Users delete own or household preferences"
  ON public.user_product_preferences
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR (
      household_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.household_members hm
        WHERE hm.household_id = user_product_preferences.household_id
          AND hm.user_id = auth.uid()
      )
    )
  );

COMMENT ON COLUMN public.user_product_preferences.household_id IS
  'US-274: When set, this preference row is shared with all household members; resolver checks household tier before user-only tier. Mutually exclusive with the user-only key (enforced by partial unique indexes).';
