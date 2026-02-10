-- Add is_favorite column to recipes table
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS is_favorite boolean DEFAULT false;
