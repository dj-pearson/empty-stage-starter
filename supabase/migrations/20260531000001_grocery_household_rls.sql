-- Reconcile household-aware RLS on grocery_items and grocery_lists.
--
-- Symptom: grocery items/lists created on one device (iOS) did not appear on
-- another device in the same household (web), even though the rows existed with
-- the correct household_id. The REST API returned [] because RLS denied the
-- read:
--   * grocery_items: depending on environment the household SELECT policy was
--     missing/ineffective, leaving only an older `auth.uid() = user_id` policy
--     that fails when the reading account isn't the row's creator.
--   * grocery_lists: the only household read policy was malformed —
--       household_id IN (SELECT grocery_lists.household_id FROM profiles
--                        WHERE grocery_lists.user_id = uid())
--     which never matches, so lists always came back empty.
--
-- This standardizes both tables on the same household resolution used by
-- recipes/foods/plan_entries (get_user_household_id(auth.uid())). Idempotent.

-- grocery_items -------------------------------------------------------------
DROP POLICY IF EXISTS "Household members can view grocery items"   ON public.grocery_items;
CREATE POLICY "Household members can view grocery items"   ON public.grocery_items
  FOR SELECT USING (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Household members can insert grocery items" ON public.grocery_items;
CREATE POLICY "Household members can insert grocery items" ON public.grocery_items
  FOR INSERT WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Household members can update grocery items" ON public.grocery_items;
CREATE POLICY "Household members can update grocery items" ON public.grocery_items
  FOR UPDATE USING (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Household members can delete grocery items" ON public.grocery_items;
CREATE POLICY "Household members can delete grocery items" ON public.grocery_items
  FOR DELETE USING (household_id = public.get_user_household_id(auth.uid()));

-- grocery_lists -------------------------------------------------------------
-- Retire the malformed profiles-subquery read policy.
DROP POLICY IF EXISTS "Household members can view household lists" ON public.grocery_lists;

DROP POLICY IF EXISTS "Household members can view grocery lists"   ON public.grocery_lists;
CREATE POLICY "Household members can view grocery lists"   ON public.grocery_lists
  FOR SELECT USING (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Household members can insert grocery lists" ON public.grocery_lists;
CREATE POLICY "Household members can insert grocery lists" ON public.grocery_lists
  FOR INSERT WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Household members can update grocery lists" ON public.grocery_lists;
CREATE POLICY "Household members can update grocery lists" ON public.grocery_lists
  FOR UPDATE USING (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Household members can delete grocery lists" ON public.grocery_lists;
CREATE POLICY "Household members can delete grocery lists" ON public.grocery_lists
  FOR DELETE USING (household_id = public.get_user_household_id(auth.uid()));
