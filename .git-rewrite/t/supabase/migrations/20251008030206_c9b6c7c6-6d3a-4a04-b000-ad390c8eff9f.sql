-- Add servings_per_container to foods table
ALTER TABLE public.foods
ADD COLUMN servings_per_container numeric,
ADD COLUMN package_quantity text;

-- Add serving information to nutrition table
ALTER TABLE public.nutrition
ADD COLUMN servings_per_container numeric,
ADD COLUMN package_quantity text;