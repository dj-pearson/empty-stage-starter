-- Fix the function to set search_path
CREATE OR REPLACE FUNCTION public.is_food_safe_for_kid(
  _food_allergens text[],
  _kid_allergens text[]
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $$
BEGIN
  -- If kid has no allergens, all foods are safe
  IF _kid_allergens IS NULL OR array_length(_kid_allergens, 1) IS NULL THEN
    RETURN true;
  END IF;
  
  -- If food has no allergens listed, consider it safe
  IF _food_allergens IS NULL OR array_length(_food_allergens, 1) IS NULL THEN
    RETURN true;
  END IF;
  
  -- Check if any food allergen matches kid's allergens
  RETURN NOT (_food_allergens && _kid_allergens);
END;
$$;