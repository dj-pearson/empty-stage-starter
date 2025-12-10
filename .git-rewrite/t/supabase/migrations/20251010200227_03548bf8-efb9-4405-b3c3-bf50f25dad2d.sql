-- Add comprehensive child preference fields to kids table
ALTER TABLE public.kids
ADD COLUMN IF NOT EXISTS gender text,
ADD COLUMN IF NOT EXISTS height_cm numeric,
ADD COLUMN IF NOT EXISTS weight_kg numeric,
ADD COLUMN IF NOT EXISTS dietary_restrictions text[],
ADD COLUMN IF NOT EXISTS health_goals text[],
ADD COLUMN IF NOT EXISTS nutrition_concerns text[],
ADD COLUMN IF NOT EXISTS eating_behavior text,
ADD COLUMN IF NOT EXISTS new_food_willingness text,
ADD COLUMN IF NOT EXISTS helpful_strategies text[],
ADD COLUMN IF NOT EXISTS texture_preferences text[],
ADD COLUMN IF NOT EXISTS texture_dislikes text[],
ADD COLUMN IF NOT EXISTS flavor_preferences text[],
ADD COLUMN IF NOT EXISTS always_eats_foods text[],
ADD COLUMN IF NOT EXISTS disliked_foods text[],
ADD COLUMN IF NOT EXISTS allergen_severity jsonb,
ADD COLUMN IF NOT EXISTS cross_contamination_sensitive boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS behavioral_notes text,
ADD COLUMN IF NOT EXISTS profile_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS profile_last_reviewed timestamp with time zone;

-- Add comment to explain the schema
COMMENT ON COLUMN public.kids.allergen_severity IS 'JSON object mapping allergen names to severity levels (mild, moderate, severe)';
COMMENT ON COLUMN public.kids.dietary_restrictions IS 'Array of dietary restrictions like vegetarian, vegan, halal, kosher';
COMMENT ON COLUMN public.kids.health_goals IS 'Array of parent-defined goals like maintain_balance, gain_weight, try_new_foods, reduce_sugar, improve_variety';
COMMENT ON COLUMN public.kids.nutrition_concerns IS 'Array of concerns like underweight, overweight, low_appetite, sugar_intake, protein_intake, constipation, iron_deficiency';
COMMENT ON COLUMN public.kids.eating_behavior IS 'very_picky, somewhat_selective, eats_most_foods';
COMMENT ON COLUMN public.kids.new_food_willingness IS 'rarely, only_when_forced, sometimes, willing_to_explore';
COMMENT ON COLUMN public.kids.helpful_strategies IS 'Array of strategies that help the child try new foods';
COMMENT ON COLUMN public.kids.texture_preferences IS 'Array of preferred textures like crunchy, soft, smooth, mixed, slippery, warm, cold';
COMMENT ON COLUMN public.kids.flavor_preferences IS 'Array of preferred flavors like sweet, salty, mild, savory, tangy, spicy';