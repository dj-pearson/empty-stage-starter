-- Reconcile household-aware RLS across all tables whose policies used the dead
-- `... IN (SELECT household_id FROM profiles WHERE user_id = auth.uid())` pattern.
-- The `profiles` table has no `household_id` column, so those subqueries never
-- matched -> data created on one device was invisible to other members of the
-- same household (and some INSERT WITH CHECKs were dead, blocking writes too).
--
-- Standardizes on the canonical resolution used by recipes/foods/grocery_items:
--   household_id = public.get_user_household_id(auth.uid())
-- Drops the exact broken/legacy policy names observed in production. Idempotent.
-- Backward-compatible: only broadens read/write to the correct household scope.

-- =========================================================================
-- meal_plan_templates  (all 4 policies were broken; also missing the trigger)
-- =========================================================================
DROP POLICY IF EXISTS "Users can view own and admin templates" ON public.meal_plan_templates;
CREATE POLICY "Users can view own and admin templates" ON public.meal_plan_templates
  FOR SELECT USING (
    is_admin_template = true
    OR user_id = auth.uid()
    OR household_id = public.get_user_household_id(auth.uid())
  );
DROP POLICY IF EXISTS "Users can create templates" ON public.meal_plan_templates;
CREATE POLICY "Users can create templates" ON public.meal_plan_templates
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (household_id IS NULL OR household_id = public.get_user_household_id(auth.uid()))
  );
DROP POLICY IF EXISTS "Users can update own templates" ON public.meal_plan_templates;
CREATE POLICY "Users can update own templates" ON public.meal_plan_templates
  FOR UPDATE USING (user_id = auth.uid() OR household_id = public.get_user_household_id(auth.uid()));
DROP POLICY IF EXISTS "Users can delete own templates" ON public.meal_plan_templates;
CREATE POLICY "Users can delete own templates" ON public.meal_plan_templates
  FOR DELETE USING (user_id = auth.uid() OR household_id = public.get_user_household_id(auth.uid()));
-- "Admins can manage all templates" (ALL) left as-is.

-- =========================================================================
-- shopping_sessions  (single ALL policy was broken -> sessions dead for all)
-- =========================================================================
DROP POLICY IF EXISTS "Household members can manage shopping sessions" ON public.shopping_sessions;
CREATE POLICY "Household members can view shopping sessions" ON public.shopping_sessions
  FOR SELECT USING (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Household members can insert shopping sessions" ON public.shopping_sessions
  FOR INSERT WITH CHECK (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Household members can update shopping sessions" ON public.shopping_sessions
  FOR UPDATE USING (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Household members can delete shopping sessions" ON public.shopping_sessions
  FOR DELETE USING (household_id = public.get_user_household_id(auth.uid()));

-- =========================================================================
-- recipe_collections  (SELECT broken; ALL was user_id-only)
-- =========================================================================
DROP POLICY IF EXISTS "Users can view their recipe collections" ON public.recipe_collections;
CREATE POLICY "Household members can view recipe collections" ON public.recipe_collections
  FOR SELECT USING (household_id = public.get_user_household_id(auth.uid()) OR user_id = auth.uid());
DROP POLICY IF EXISTS "Household members can insert recipe collections" ON public.recipe_collections;
CREATE POLICY "Household members can insert recipe collections" ON public.recipe_collections
  FOR INSERT WITH CHECK (user_id = auth.uid()
    AND (household_id IS NULL OR household_id = public.get_user_household_id(auth.uid())));
DROP POLICY IF EXISTS "Household members can update recipe collections" ON public.recipe_collections;
CREATE POLICY "Household members can update recipe collections" ON public.recipe_collections
  FOR UPDATE USING (household_id = public.get_user_household_id(auth.uid()) OR user_id = auth.uid());
DROP POLICY IF EXISTS "Household members can delete recipe collections" ON public.recipe_collections;
CREATE POLICY "Household members can delete recipe collections" ON public.recipe_collections
  FOR DELETE USING (household_id = public.get_user_household_id(auth.uid()) OR user_id = auth.uid());
-- "Users can manage their recipe collections" (ALL, user_id) left as-is (harmless).

-- =========================================================================
-- store_layouts  (SELECT broken) -- NOTE: also has an iOS schema mismatch
-- (prod has store_name, iOS expects name/slug) that this SQL does NOT fix.
-- =========================================================================
DROP POLICY IF EXISTS "Household members can view store layouts" ON public.store_layouts;
CREATE POLICY "Household members can view store layouts" ON public.store_layouts
  FOR SELECT USING (household_id = public.get_user_household_id(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Household members can insert store layouts" ON public.store_layouts
  FOR INSERT WITH CHECK (user_id = auth.uid()
    AND (household_id IS NULL OR household_id = public.get_user_household_id(auth.uid())));
CREATE POLICY "Household members can update store layouts" ON public.store_layouts
  FOR UPDATE USING (household_id = public.get_user_household_id(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Household members can delete store layouts" ON public.store_layouts
  FOR DELETE USING (household_id = public.get_user_household_id(auth.uid()) OR user_id = auth.uid());

-- =========================================================================
-- grocery_purchase_history  (ALL + SELECT broken)
-- =========================================================================
DROP POLICY IF EXISTS "Household members can manage purchase history" ON public.grocery_purchase_history;
DROP POLICY IF EXISTS "Household members can view purchase history"   ON public.grocery_purchase_history;
CREATE POLICY "Household members can view purchase history" ON public.grocery_purchase_history
  FOR SELECT USING (household_id = public.get_user_household_id(auth.uid()));
CREATE POLICY "Household members can manage purchase history" ON public.grocery_purchase_history
  FOR ALL USING (household_id = public.get_user_household_id(auth.uid()))
          WITH CHECK (household_id = public.get_user_household_id(auth.uid()));
-- "Users can manage their purchase history" (ALL, user_id) left as-is.

-- =========================================================================
-- grocery delivery family  (broken SELECT/INSERT/UPDATE)
-- =========================================================================
DROP POLICY IF EXISTS "Users can view their accounts" ON public.user_delivery_accounts;
CREATE POLICY "Users can view their accounts" ON public.user_delivery_accounts
  FOR SELECT USING (user_id = auth.uid() OR household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Users can view their preferences" ON public.delivery_preferences;
CREATE POLICY "Users can view their preferences" ON public.delivery_preferences
  FOR SELECT USING (user_id = auth.uid() OR household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Users can view household orders" ON public.grocery_delivery_orders;
CREATE POLICY "Users can view household orders" ON public.grocery_delivery_orders
  FOR SELECT USING (household_id = public.get_user_household_id(auth.uid()));
DROP POLICY IF EXISTS "Users can create orders" ON public.grocery_delivery_orders;
CREATE POLICY "Users can create orders" ON public.grocery_delivery_orders
  FOR INSERT WITH CHECK (user_id = auth.uid()
    AND (household_id IS NULL OR household_id = public.get_user_household_id(auth.uid())));
DROP POLICY IF EXISTS "Users can update their orders" ON public.grocery_delivery_orders;
CREATE POLICY "Users can update their orders" ON public.grocery_delivery_orders
  FOR UPDATE USING (user_id = auth.uid() OR household_id = public.get_user_household_id(auth.uid()));

-- =========================================================================
-- grocery_lists  (retire the leftover malformed read policy; correct one exists)
-- =========================================================================
DROP POLICY IF EXISTS "Household members can view household lists" ON public.grocery_lists;

-- =========================================================================
-- auto_fill_household_id trigger for household tables the clients INSERT into
-- but that weren't covered (so iOS/web inserts that omit household_id still get
-- one). Function defined in 20260415000000_fix_household_rls.sql.
-- =========================================================================
DO $do$
DECLARE tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
      'grocery_lists','recipe_collections','store_layouts',
      'shopping_sessions','meal_plan_templates','grocery_purchase_history'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS auto_fill_household_id ON public.%I; '
      'CREATE TRIGGER auto_fill_household_id BEFORE INSERT ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.auto_fill_household_id();', tbl, tbl);
  END LOOP;
END $do$;

-- =========================================================================
-- Backfill household_id on rows orphaned by the old NULL-household inserts
-- (e.g. iOS-created meal_plan_templates), so existing data becomes visible.
-- =========================================================================
UPDATE public.meal_plan_templates     SET household_id = public.get_user_household_id(user_id) WHERE household_id IS NULL AND user_id IS NOT NULL;
UPDATE public.recipe_collections       SET household_id = public.get_user_household_id(user_id) WHERE household_id IS NULL AND user_id IS NOT NULL;
UPDATE public.store_layouts            SET household_id = public.get_user_household_id(user_id) WHERE household_id IS NULL AND user_id IS NOT NULL;
UPDATE public.grocery_lists            SET household_id = public.get_user_household_id(user_id) WHERE household_id IS NULL AND user_id IS NOT NULL;
UPDATE public.grocery_purchase_history SET household_id = public.get_user_household_id(user_id) WHERE household_id IS NULL AND user_id IS NOT NULL;
