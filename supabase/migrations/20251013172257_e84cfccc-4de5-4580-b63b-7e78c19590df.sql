-- Create store_layouts table
CREATE TABLE IF NOT EXISTS public.store_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  household_id UUID,
  name TEXT NOT NULL,
  address TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create store_aisles table
CREATE TABLE IF NOT EXISTS public.store_aisles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_layout_id UUID NOT NULL REFERENCES public.store_layouts(id) ON DELETE CASCADE,
  aisle_number TEXT,
  aisle_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.store_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_aisles ENABLE ROW LEVEL SECURITY;

-- RLS policies for store_layouts
CREATE POLICY "Users can view own store layouts"
  ON public.store_layouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own store layouts"
  ON public.store_layouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own store layouts"
  ON public.store_layouts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own store layouts"
  ON public.store_layouts FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for store_aisles
CREATE POLICY "Users can view aisles from their stores"
  ON public.store_aisles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.store_layouts
      WHERE store_layouts.id = store_aisles.store_layout_id
      AND store_layouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert aisles to their stores"
  ON public.store_aisles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.store_layouts
      WHERE store_layouts.id = store_aisles.store_layout_id
      AND store_layouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update aisles in their stores"
  ON public.store_aisles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.store_layouts
      WHERE store_layouts.id = store_aisles.store_layout_id
      AND store_layouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete aisles from their stores"
  ON public.store_aisles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.store_layouts
      WHERE store_layouts.id = store_aisles.store_layout_id
      AND store_layouts.user_id = auth.uid()
    )
  );