-- deduct_food_quantity: only the caller's own household's foods.
--
-- The function is SECURITY DEFINER, so it bypasses RLS on foods, and its body
-- updated any row by id with no ownership test. It was granted to
-- authenticated, and under Supabase's default ACL anon holds EXECUTE too
-- (see US-804 in CLAUDE.md), so any caller who had a food's uuid could zero it.
--
-- Same name, same signature, same return type: web Planner.tsx and the shipped
-- iOS builds (DataService.swift) call it by name and keep working unchanged.
-- A call on a food outside the caller's households now updates nothing, which
-- is what RLS would have done for a direct UPDATE.
--
-- Membership is checked against household_members rather than
-- get_user_household_id(), which picks one household with LIMIT 1 and no order
-- when a user belongs to two.

CREATE OR REPLACE FUNCTION public.deduct_food_quantity(
  _food_id uuid,
  _amount integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  UPDATE public.foods f
     SET quantity = GREATEST(0, f.quantity - _amount)
   WHERE f.id = _food_id
     AND auth.uid() IS NOT NULL
     AND (
       f.user_id = auth.uid()
       OR EXISTS (
         SELECT 1
           FROM public.household_members hm
          WHERE hm.household_id = f.household_id
            AND hm.user_id = auth.uid()
       )
     );
END;
$$;

-- A signed-in user calls it; nobody else does.
REVOKE ALL ON FUNCTION public.deduct_food_quantity(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_food_quantity(uuid, integer) TO authenticated;
