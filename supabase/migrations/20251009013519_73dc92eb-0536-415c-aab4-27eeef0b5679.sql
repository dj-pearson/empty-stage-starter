-- Add barcode column to foods table for user pantry items
ALTER TABLE public.foods 
ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Add index for fast barcode lookups in user pantry
CREATE INDEX IF NOT EXISTS idx_foods_barcode ON public.foods(barcode) WHERE barcode IS NOT NULL;

-- Add barcode column to nutrition table for community reference
ALTER TABLE public.nutrition 
ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Add index for fast barcode lookups in nutrition database
CREATE INDEX IF NOT EXISTS idx_nutrition_barcode ON public.nutrition(barcode) WHERE barcode IS NOT NULL;

-- Add comments
COMMENT ON COLUMN public.foods.barcode IS 'UPC/EAN barcode for product identification and quick lookups';
COMMENT ON COLUMN public.nutrition.barcode IS 'UPC/EAN barcode for product identification and quick lookups';