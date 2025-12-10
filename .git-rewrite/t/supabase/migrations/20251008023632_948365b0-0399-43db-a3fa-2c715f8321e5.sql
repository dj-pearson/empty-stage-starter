-- Add allergens column to kids table
ALTER TABLE public.kids 
ADD COLUMN allergens text[] DEFAULT '{}';

-- Add helpful comment
COMMENT ON COLUMN public.kids.allergens IS 'List of allergens this child needs to avoid (e.g., peanuts, dairy, gluten)';

-- Create a function to check if a food is safe for a kid based on allergens
CREATE OR REPLACE FUNCTION public.is_food_safe_for_kid(
  _food_allergens text[],
  _kid_allergens text[]
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_food_safe_for_kid TO authenticated;