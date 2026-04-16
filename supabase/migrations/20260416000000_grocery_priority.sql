-- Add priority field to grocery items for user-defined urgency
ALTER TABLE public.grocery_items
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high'));

CREATE INDEX IF NOT EXISTS idx_grocery_items_priority
ON public.grocery_items (priority);
