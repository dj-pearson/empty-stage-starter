-- Create helper function to get user's household
CREATE OR REPLACE FUNCTION public.get_user_household_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id
  FROM public.household_members
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Update RLS policies for kids table
DROP POLICY IF EXISTS "Users can view their own kids" ON public.kids;
DROP POLICY IF EXISTS "Users can insert their own kids" ON public.kids;
DROP POLICY IF EXISTS "Users can update their own kids" ON public.kids;
DROP POLICY IF EXISTS "Users can delete their own kids" ON public.kids;

CREATE POLICY "Household members can view kids"
  ON public.kids FOR SELECT
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can insert kids"
  ON public.kids FOR INSERT
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can update kids"
  ON public.kids FOR UPDATE
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can delete kids"
  ON public.kids FOR DELETE
  USING (household_id = public.get_user_household_id(auth.uid()));

-- Update RLS policies for foods table
DROP POLICY IF EXISTS "Users can view their own foods" ON public.foods;
DROP POLICY IF EXISTS "Users can insert their own foods" ON public.foods;
DROP POLICY IF EXISTS "Users can update their own foods" ON public.foods;
DROP POLICY IF EXISTS "Users can delete their own foods" ON public.foods;

CREATE POLICY "Household members can view foods"
  ON public.foods FOR SELECT
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can insert foods"
  ON public.foods FOR INSERT
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can update foods"
  ON public.foods FOR UPDATE
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can delete foods"
  ON public.foods FOR DELETE
  USING (household_id = public.get_user_household_id(auth.uid()));

-- Update RLS policies for recipes table
DROP POLICY IF EXISTS "Users can view their own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Users can insert their own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Users can update their own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Users can delete their own recipes" ON public.recipes;

CREATE POLICY "Household members can view recipes"
  ON public.recipes FOR SELECT
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can insert recipes"
  ON public.recipes FOR INSERT
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can update recipes"
  ON public.recipes FOR UPDATE
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can delete recipes"
  ON public.recipes FOR DELETE
  USING (household_id = public.get_user_household_id(auth.uid()));

-- Update RLS policies for plan_entries table
DROP POLICY IF EXISTS "Users can view their own plan entries" ON public.plan_entries;
DROP POLICY IF EXISTS "Users can insert their own plan entries" ON public.plan_entries;
DROP POLICY IF EXISTS "Users can update their own plan entries" ON public.plan_entries;
DROP POLICY IF EXISTS "Users can delete their own plan entries" ON public.plan_entries;

CREATE POLICY "Household members can view plan entries"
  ON public.plan_entries FOR SELECT
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can insert plan entries"
  ON public.plan_entries FOR INSERT
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can update plan entries"
  ON public.plan_entries FOR UPDATE
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can delete plan entries"
  ON public.plan_entries FOR DELETE
  USING (household_id = public.get_user_household_id(auth.uid()));

-- Update RLS policies for grocery_items table
DROP POLICY IF EXISTS "Users can view their own grocery items" ON public.grocery_items;
DROP POLICY IF EXISTS "Users can insert their own grocery items" ON public.grocery_items;
DROP POLICY IF EXISTS "Users can update their own grocery items" ON public.grocery_items;
DROP POLICY IF EXISTS "Users can delete their own grocery items" ON public.grocery_items;

CREATE POLICY "Household members can view grocery items"
  ON public.grocery_items FOR SELECT
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can insert grocery items"
  ON public.grocery_items FOR INSERT
  WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can update grocery items"
  ON public.grocery_items FOR UPDATE
  USING (household_id = public.get_user_household_id(auth.uid()));

CREATE POLICY "Household members can delete grocery items"
  ON public.grocery_items FOR DELETE
  USING (household_id = public.get_user_household_id(auth.uid()));