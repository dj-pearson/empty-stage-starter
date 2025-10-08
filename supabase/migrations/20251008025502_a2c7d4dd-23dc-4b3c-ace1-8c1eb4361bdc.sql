-- Add date_of_birth and favorite_foods columns to kids table
ALTER TABLE public.kids
ADD COLUMN date_of_birth date,
ADD COLUMN favorite_foods text[] DEFAULT '{}';

-- Create index for date_of_birth for performance
CREATE INDEX idx_kids_date_of_birth ON public.kids(date_of_birth);