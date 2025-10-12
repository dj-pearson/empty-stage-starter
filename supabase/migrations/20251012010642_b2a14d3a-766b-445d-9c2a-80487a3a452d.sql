-- Ensure required columns exist on recipes table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'prep_time'
  ) THEN
    ALTER TABLE public.recipes ADD COLUMN prep_time text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'cook_time'
  ) THEN
    ALTER TABLE public.recipes ADD COLUMN cook_time text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'instructions'
  ) THEN
    ALTER TABLE public.recipes ADD COLUMN instructions text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'servings'
  ) THEN
    ALTER TABLE public.recipes ADD COLUMN servings integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'additional_ingredients'
  ) THEN
    ALTER TABLE public.recipes ADD COLUMN additional_ingredients text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recipes' AND column_name = 'tips'
  ) THEN
    ALTER TABLE public.recipes ADD COLUMN tips text;
  END IF;
END $$;

-- Harden and authorize scheduling while bypassing RLS during inserts
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
  v_food_id UUID;
  v_food_ids UUID[];
  v_user_id UUID;
  v_count INTEGER := 0;
  v_is_primary BOOLEAN := true;
BEGIN
  -- Determine owner of the kid
  SELECT user_id INTO v_user_id FROM kids WHERE id = p_kid_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Kid not found';
  END IF;

  -- Authorization guard: only the kid's owner can schedule
  IF v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to schedule for this kid';
  END IF;

  -- Get recipe foods
  SELECT food_ids INTO v_food_ids FROM recipes WHERE id = p_recipe_id;
  IF v_food_ids IS NULL OR array_length(v_food_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Recipe has no foods';
  END IF;

  -- Remove existing entries for this kid/date/slot/recipe
  DELETE FROM plan_entries
  WHERE kid_id = p_kid_id
    AND date = p_date
    AND meal_slot = p_meal_slot
    AND recipe_id = p_recipe_id;

  -- Insert plan entries for each food in the recipe
  FOREACH v_food_id IN ARRAY v_food_ids LOOP
    INSERT INTO plan_entries (
      user_id,
      kid_id,
      date,
      meal_slot,
      food_id,
      recipe_id,
      is_primary_dish
    ) VALUES (
      v_user_id,
      p_kid_id,
      p_date,
      p_meal_slot,
      v_food_id,
      p_recipe_id,
      v_is_primary
    );

    v_count := v_count + 1;
    v_is_primary := false; -- first item is primary
  END LOOP;

  RETURN v_count;
END;
$function$;