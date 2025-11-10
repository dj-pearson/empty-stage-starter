-- Recipe Scaling Feature
-- Allows users to adjust recipe serving sizes with automatic ingredient quantity scaling

-- Add scaling fields to recipes table
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS servings_min INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS servings_max INTEGER DEFAULT 12,
  ADD COLUMN IF NOT EXISTS default_servings INTEGER;

-- Update default_servings to match existing servings where null
UPDATE recipes
SET default_servings = servings
WHERE default_servings IS NULL AND servings IS NOT NULL;

-- Add constraints
ALTER TABLE recipes
  ADD CONSTRAINT servings_min_positive CHECK (servings_min > 0),
  ADD CONSTRAINT servings_max_positive CHECK (servings_max > 0),
  ADD CONSTRAINT servings_min_less_than_max CHECK (servings_min <= servings_max),
  ADD CONSTRAINT default_servings_in_range CHECK (
    default_servings IS NULL OR (default_servings >= servings_min AND default_servings <= servings_max)
  );

-- Update existing recipes to have sensible defaults
UPDATE recipes
SET
  servings_min = GREATEST(1, FLOOR(servings * 0.5)),
  servings_max = LEAST(12, CEILING(servings * 2)),
  default_servings = servings
WHERE servings IS NOT NULL AND servings_min IS NULL;

-- Helper function to parse quantity strings (e.g., "1 1/2", "2.5", "1/4")
CREATE OR REPLACE FUNCTION parse_quantity(quantity_str TEXT)
RETURNS DECIMAL AS $$
DECLARE
  result DECIMAL;
  whole_part INTEGER;
  numerator INTEGER;
  denominator INTEGER;
  parts TEXT[];
  fraction_parts TEXT[];
BEGIN
  IF quantity_str IS NULL OR quantity_str = '' THEN
    RETURN 0;
  END IF;

  -- Remove extra whitespace
  quantity_str := TRIM(quantity_str);

  -- Try to parse as decimal first
  BEGIN
    result := quantity_str::DECIMAL;
    RETURN result;
  EXCEPTION WHEN OTHERS THEN
    -- Continue to fraction parsing
  END;

  -- Check for mixed fraction (e.g., "1 1/2")
  IF quantity_str ~ '^\d+\s+\d+/\d+$' THEN
    parts := regexp_split_to_array(quantity_str, '\s+');
    whole_part := parts[1]::INTEGER;
    fraction_parts := regexp_split_to_array(parts[2], '/');
    numerator := fraction_parts[1]::INTEGER;
    denominator := fraction_parts[2]::INTEGER;
    RETURN whole_part + (numerator::DECIMAL / denominator::DECIMAL);
  END IF;

  -- Check for simple fraction (e.g., "1/2")
  IF quantity_str ~ '^\d+/\d+$' THEN
    fraction_parts := regexp_split_to_array(quantity_str, '/');
    numerator := fraction_parts[1]::INTEGER;
    denominator := fraction_parts[2]::INTEGER;
    RETURN (numerator::DECIMAL / denominator::DECIMAL);
  END IF;

  -- If we can't parse it, return 0
  RETURN 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function to format quantity as fraction when appropriate
CREATE OR REPLACE FUNCTION format_quantity(quantity DECIMAL)
RETURNS TEXT AS $$
DECLARE
  whole_part INTEGER;
  decimal_part DECIMAL;
  fraction_text TEXT;
BEGIN
  IF quantity IS NULL OR quantity = 0 THEN
    RETURN '0';
  END IF;

  -- If it's a whole number, return it as is
  IF quantity = FLOOR(quantity) THEN
    RETURN quantity::TEXT;
  END IF;

  whole_part := FLOOR(quantity);
  decimal_part := quantity - whole_part;

  -- Common fraction conversions
  fraction_text := CASE
    WHEN ABS(decimal_part - 0.125) < 0.01 THEN '1/8'
    WHEN ABS(decimal_part - 0.25) < 0.01 THEN '1/4'
    WHEN ABS(decimal_part - 0.333) < 0.01 THEN '1/3'
    WHEN ABS(decimal_part - 0.375) < 0.01 THEN '3/8'
    WHEN ABS(decimal_part - 0.5) < 0.01 THEN '1/2'
    WHEN ABS(decimal_part - 0.625) < 0.01 THEN '5/8'
    WHEN ABS(decimal_part - 0.666) < 0.01 THEN '2/3'
    WHEN ABS(decimal_part - 0.75) < 0.01 THEN '3/4'
    WHEN ABS(decimal_part - 0.875) < 0.01 THEN '7/8'
    ELSE ROUND(decimal_part, 2)::TEXT
  END;

  -- Return with whole part if exists
  IF whole_part > 0 THEN
    RETURN whole_part::TEXT || ' ' || fraction_text;
  ELSE
    RETURN fraction_text;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to scale a recipe's ingredients
CREATE OR REPLACE FUNCTION scale_recipe_ingredients(
  recipe_id_input UUID,
  target_servings INTEGER
)
RETURNS TABLE(
  ingredient_id UUID,
  ingredient_name TEXT,
  original_quantity TEXT,
  scaled_quantity TEXT,
  unit TEXT,
  preparation_notes TEXT,
  is_optional BOOLEAN,
  section TEXT
) AS $$
DECLARE
  original_servings INTEGER;
  scale_factor DECIMAL;
  parsed_quantity DECIMAL;
  scaled_value DECIMAL;
BEGIN
  -- Get original servings
  SELECT COALESCE(default_servings, servings) INTO original_servings
  FROM recipes
  WHERE id = recipe_id_input;

  IF original_servings IS NULL OR original_servings = 0 THEN
    original_servings := 4; -- Default fallback
  END IF;

  -- Calculate scale factor
  scale_factor := target_servings::DECIMAL / original_servings::DECIMAL;

  RETURN QUERY
  SELECT
    ri.id,
    ri.ingredient_name,
    ri.quantity,
    CASE
      -- Don't scale if quantity is NULL or empty
      WHEN ri.quantity IS NULL OR ri.quantity = '' THEN ri.quantity
      -- Don't scale if quantity is a range (e.g., "2-3")
      WHEN ri.quantity ~ '-' THEN ri.quantity
      -- Don't scale if quantity is descriptive (e.g., "to taste", "pinch")
      WHEN ri.quantity ~* 'taste|pinch|dash|handful|sprinkle' THEN ri.quantity
      ELSE
        -- Parse, scale, and format
        format_quantity(parse_quantity(ri.quantity) * scale_factor)
    END,
    ri.unit,
    ri.preparation_notes,
    ri.is_optional,
    ri.section
  FROM recipe_ingredients ri
  WHERE ri.recipe_id = recipe_id_input
  ORDER BY ri.sort_order, ri.id;
END;
$$ LANGUAGE plpgsql;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_recipes_servings ON recipes(servings, servings_min, servings_max);

-- Comments for documentation
COMMENT ON COLUMN recipes.servings_min IS 'Minimum recommended servings for this recipe';
COMMENT ON COLUMN recipes.servings_max IS 'Maximum recommended servings for this recipe';
COMMENT ON COLUMN recipes.default_servings IS 'Default/original serving size (usually same as servings)';
COMMENT ON FUNCTION parse_quantity IS 'Parses quantity strings including fractions (1/2, 1 1/2, 2.5)';
COMMENT ON FUNCTION format_quantity IS 'Formats decimal quantities as fractions when appropriate';
COMMENT ON FUNCTION scale_recipe_ingredients IS 'Scales all ingredients in a recipe to target serving size';

-- Create a view for recipe scaling info
CREATE OR REPLACE VIEW recipe_scaling_info AS
SELECT
  id,
  name,
  servings,
  servings_min,
  servings_max,
  default_servings,
  CASE
    WHEN servings_min IS NOT NULL AND servings_max IS NOT NULL
      THEN servings_max - servings_min + 1
    ELSE 1
  END as scaling_options_count
FROM recipes;

COMMENT ON VIEW recipe_scaling_info IS 'Quick view of recipe scaling capabilities';
