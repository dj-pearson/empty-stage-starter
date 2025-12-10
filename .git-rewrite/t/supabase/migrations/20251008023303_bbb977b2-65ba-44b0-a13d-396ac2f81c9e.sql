-- Add quantity and unit columns to foods table
ALTER TABLE public.foods 
ADD COLUMN quantity integer DEFAULT 0,
ADD COLUMN unit text DEFAULT 'servings';

-- Add helpful comment
COMMENT ON COLUMN public.foods.quantity IS 'Current inventory quantity in pantry';
COMMENT ON COLUMN public.foods.unit IS 'Unit of measurement (servings, count, oz, lbs, etc.)';

-- Create function to deduct food quantity
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
  UPDATE public.foods
  SET quantity = GREATEST(0, quantity - _amount)
  WHERE id = _food_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.deduct_food_quantity TO authenticated;