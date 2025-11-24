-- Fix infinite recursion in household_members RLS policies
-- The previous policies query household_members within its own policies, causing recursion.
-- Solution: Use SECURITY DEFINER functions that bypass RLS.

-- First, create a helper function to check if a user belongs to a household
-- This function uses SECURITY DEFINER to bypass RLS and prevent recursion
CREATE OR REPLACE FUNCTION public.user_belongs_to_household(_user_id uuid, _household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members
    WHERE user_id = _user_id
    AND household_id = _household_id
  )
$$;

-- Drop the existing recursive policies
DROP POLICY IF EXISTS "Members can view household members" ON public.household_members;
DROP POLICY IF EXISTS "Members can insert household members" ON public.household_members;
DROP POLICY IF EXISTS "Members can delete household members" ON public.household_members;

-- Create new non-recursive policies using the SECURITY DEFINER function
CREATE POLICY "Members can view household members"
  ON public.household_members FOR SELECT
  USING (
    public.user_belongs_to_household(auth.uid(), household_id)
  );

CREATE POLICY "Members can insert household members"
  ON public.household_members FOR INSERT
  WITH CHECK (
    public.user_belongs_to_household(auth.uid(), household_id)
  );

CREATE POLICY "Members can update household members"
  ON public.household_members FOR UPDATE
  USING (
    public.user_belongs_to_household(auth.uid(), household_id)
  );

CREATE POLICY "Members can delete household members"
  ON public.household_members FOR DELETE
  USING (
    public.user_belongs_to_household(auth.uid(), household_id)
  );

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.user_belongs_to_household(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_household(uuid, uuid) TO anon;

