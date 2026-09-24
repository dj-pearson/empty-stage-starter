-- schedule_recipe_to_plan: signed-in household members only.
--
-- The function is SECURITY DEFINER, so RLS on kids, recipes and plan_entries
-- does not apply inside it. Its only guard was `IF kid.user_id <> auth.uid()`,
-- which has three holes:
--   * With no session auth.uid() is NULL, the comparison is NULL, the IF does
--     not fire, and the call writes plan rows. anon holds EXECUTE through the
--     schema default ACL (US-804), so this was reachable signed out.
--   * The recipe was never checked: any recipe uuid, from any household, had
--     its food_ids copied into the caller's plan.
--   * A co-parent (a second member of the kid's household) was rejected,
--     because the kid's user_id is whoever created the kid.
--
-- Same name, same signature, same return type: web PlanContext.tsx,
-- SiblingMealFinder.tsx and the manage-meal-plan-templates edge function (which
-- forwards the user's JWT, so auth.uid() is the caller) call it by name.
--
-- Membership is read from household_members directly rather than through
-- get_user_household_id(), so a user in two households is not refused for a
-- kid in the one that function does not pick. Rows with a NULL household_id
-- (pre-household data) stay reachable by their own user_id, as before.
--
-- The plan rows keep the kid owner's user_id and the kid's household_id, which
-- is what the previous body wrote.

CREATE OR REPLACE FUNCTION public.schedule_recipe_to_plan(
  p_kid_id uuid,
  p_recipe_id uuid,
  p_date date,
  p_meal_slot text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller UUID := auth.uid();
  v_food_id UUID;
  v_food_ids UUID[];
  v_user_id UUID;
  v_household_id UUID;
  v_recipe_user UUID;
  v_recipe_household UUID;
  v_count INTEGER := 0;
  v_is_primary BOOLEAN := true;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT k.user_id, k.household_id
    INTO v_user_id, v_household_id
    FROM kids k
   WHERE k.id = p_kid_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kid not found';
  END IF;

  -- The kid must be in a household the caller belongs to (or, for a kid with
  -- no household, be the caller's own).
  IF NOT (
    (v_household_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM household_members hm
        WHERE hm.household_id = v_household_id
          AND hm.user_id = v_caller))
    OR (v_household_id IS NULL AND v_user_id = v_caller)
  ) THEN
    RAISE EXCEPTION 'Not authorized to schedule for this kid' USING ERRCODE = '42501';
  END IF;

  SELECT r.user_id, r.household_id, r.food_ids
    INTO v_recipe_user, v_recipe_household, v_food_ids
    FROM recipes r
   WHERE r.id = p_recipe_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipe not found';
  END IF;

  -- Same rule for the recipe, and when both carry a household it must be the
  -- kid's: a recipe from another household the caller also belongs to would
  -- otherwise copy that household's food ids into this one's plan.
  IF NOT (
    (v_recipe_household IS NOT NULL AND EXISTS (
       SELECT 1 FROM household_members hm
        WHERE hm.household_id = v_recipe_household
          AND hm.user_id = v_caller))
    OR (v_recipe_household IS NULL AND v_recipe_user = v_caller)
  ) OR (
    v_recipe_household IS NOT NULL
    AND v_household_id IS NOT NULL
    AND v_recipe_household <> v_household_id
  ) THEN
    RAISE EXCEPTION 'Not authorized to schedule this recipe' USING ERRCODE = '42501';
  END IF;

  IF v_food_ids IS NULL OR array_length(v_food_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Recipe has no foods';
  END IF;

  -- Remove existing entries for this kid/date/slot/recipe
  DELETE FROM plan_entries
   WHERE kid_id = p_kid_id
     AND date = p_date
     AND meal_slot = p_meal_slot
     AND recipe_id = p_recipe_id;

  FOREACH v_food_id IN ARRAY v_food_ids LOOP
    INSERT INTO plan_entries (
      user_id,
      household_id,
      kid_id,
      date,
      meal_slot,
      food_id,
      recipe_id,
      is_primary_dish
    ) VALUES (
      v_user_id,
      v_household_id,
      p_kid_id,
      p_date,
      p_meal_slot,
      v_food_id,
      p_recipe_id,
      v_is_primary
    );

    v_count := v_count + 1;
    v_is_primary := false; -- only the first item is primary
  END LOOP;

  RETURN v_count;
END;
$function$;

-- A signed-in user calls it (web, and the edge function with the user's JWT).
-- service_role keeps EXECUTE; with no auth.uid() the body refuses anyway.
REVOKE ALL ON FUNCTION public.schedule_recipe_to_plan(uuid, uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_recipe_to_plan(uuid, uuid, date, text) TO authenticated, service_role;
