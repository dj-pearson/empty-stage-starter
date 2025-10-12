-- Add missing recipe columns for cooking details
ALTER TABLE recipes 
  ADD COLUMN IF NOT EXISTS instructions TEXT,
  ADD COLUMN IF NOT EXISTS prep_time TEXT,
  ADD COLUMN IF NOT EXISTS cook_time TEXT,
  ADD COLUMN IF NOT EXISTS servings TEXT,
  ADD COLUMN IF NOT EXISTS additional_ingredients TEXT,
  ADD COLUMN IF NOT EXISTS tips TEXT;