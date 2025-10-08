-- Create tables for Kid Meal Planner

-- Kids table
CREATE TABLE IF NOT EXISTS public.kids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  age INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Foods table
CREATE TABLE IF NOT EXISTS public.foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack')),
  is_safe BOOLEAN NOT NULL DEFAULT false,
  is_try_bite BOOLEAN NOT NULL DEFAULT false,
  allergens TEXT[],
  aisle TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Plan entries table
CREATE TABLE IF NOT EXISTS public.plan_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kid_id UUID NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack1', 'snack2', 'try_bite')),
  food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  result TEXT CHECK (result IN ('ate', 'tasted', 'refused') OR result IS NULL),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Grocery items table
CREATE TABLE IF NOT EXISTS public.grocery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'servings',
  checked BOOLEAN NOT NULL DEFAULT false,
  category TEXT NOT NULL CHECK (category IN ('protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack')),
  source_plan_entry_id UUID REFERENCES public.plan_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Recipes table
CREATE TABLE IF NOT EXISTS public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  food_ids UUID[] NOT NULL DEFAULT '{}',
  category TEXT CHECK (category IN ('protein', 'carb', 'dairy', 'fruit', 'vegetable', 'snack')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.kids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for kids table
CREATE POLICY "Users can view their own kids"
  ON public.kids FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own kids"
  ON public.kids FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own kids"
  ON public.kids FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own kids"
  ON public.kids FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for foods table
CREATE POLICY "Users can view their own foods"
  ON public.foods FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own foods"
  ON public.foods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own foods"
  ON public.foods FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own foods"
  ON public.foods FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for plan_entries table
CREATE POLICY "Users can view their own plan entries"
  ON public.plan_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own plan entries"
  ON public.plan_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own plan entries"
  ON public.plan_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own plan entries"
  ON public.plan_entries FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for grocery_items table
CREATE POLICY "Users can view their own grocery items"
  ON public.grocery_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own grocery items"
  ON public.grocery_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own grocery items"
  ON public.grocery_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own grocery items"
  ON public.grocery_items FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for recipes table
CREATE POLICY "Users can view their own recipes"
  ON public.recipes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recipes"
  ON public.recipes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recipes"
  ON public.recipes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recipes"
  ON public.recipes FOR DELETE
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_kids_updated_at
  BEFORE UPDATE ON public.kids
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_foods_updated_at
  BEFORE UPDATE ON public.foods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_plan_entries_updated_at
  BEFORE UPDATE ON public.plan_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_grocery_items_updated_at
  BEFORE UPDATE ON public.grocery_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();