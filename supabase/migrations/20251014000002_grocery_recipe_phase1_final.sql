-- Phase 1: Grocery & Recipe Enhancements
-- This migration safely adds new features with DROP IF EXISTS

-- ============================================================================
-- PART 1: RECIPE ENHANCEMENTS
-- ============================================================================

-- Drop existing policies first (if they exist)
DROP POLICY IF EXISTS "Users can manage their recipe ingredients" ON recipe_ingredients;
DROP POLICY IF EXISTS "Users can view their recipe collections" ON recipe_collections;
DROP POLICY IF EXISTS "Users can manage their recipe collections" ON recipe_collections;
DROP POLICY IF EXISTS "Users can manage collection items" ON recipe_collection_items;
DROP POLICY IF EXISTS "Users can view recipe photos" ON recipe_photos;
DROP POLICY IF EXISTS "Users can manage recipe photos" ON recipe_photos;
DROP POLICY IF EXISTS "Users can view recipe attempts" ON recipe_attempts;
DROP POLICY IF EXISTS "Users can manage their recipe attempts" ON recipe_attempts;

-- Add new columns to recipes table (use ALTER TABLE ADD COLUMN IF NOT EXISTS for safety)
DO $$ 
BEGIN
  -- Image and source
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='image_url') THEN
    ALTER TABLE recipes ADD COLUMN image_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='source_url') THEN
    ALTER TABLE recipes ADD COLUMN source_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='source_type') THEN
    ALTER TABLE recipes ADD COLUMN source_type TEXT CHECK (source_type IN ('manual', 'imported', 'ai_generated', 'url'));
  END IF;
  
  -- Organization
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='tags') THEN
    ALTER TABLE recipes ADD COLUMN tags TEXT[];
  END IF;
  
  -- Rating and usage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='rating') THEN
    ALTER TABLE recipes ADD COLUMN rating DECIMAL(2,1) CHECK (rating >= 0 AND rating <= 5);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='times_made') THEN
    ALTER TABLE recipes ADD COLUMN times_made INTEGER DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='last_made_date') THEN
    ALTER TABLE recipes ADD COLUMN last_made_date DATE;
  END IF;
  
  -- Time and difficulty
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='total_time_minutes') THEN
    ALTER TABLE recipes ADD COLUMN total_time_minutes INTEGER;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='difficulty_level') THEN
    ALTER TABLE recipes ADD COLUMN difficulty_level TEXT CHECK (difficulty_level IN ('easy', 'medium', 'hard'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='kid_friendly_score') THEN
    ALTER TABLE recipes ADD COLUMN kid_friendly_score INTEGER CHECK (kid_friendly_score >= 0 AND kid_friendly_score <= 100);
  END IF;
  
  -- Nutrition
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='recipes' AND column_name='nutrition_info') THEN
    ALTER TABLE recipes ADD COLUMN nutrition_info JSONB;
  END IF;
END $$;

-- Recipe Ingredients Table (structured ingredient storage)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  quantity TEXT,
  unit TEXT,
  name TEXT NOT NULL,
  preparation TEXT,
  optional BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);

-- Recipe Collections (folders for organizing recipes)
CREATE TABLE IF NOT EXISTS recipe_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_collections_user_id ON recipe_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_collections_household_id ON recipe_collections(household_id);

-- Recipe Collection Items (many-to-many relationship)
CREATE TABLE IF NOT EXISTS recipe_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES recipe_collections(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_collection_items_collection_id ON recipe_collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_recipe_collection_items_recipe_id ON recipe_collection_items(recipe_id);

-- Recipe Photos (multiple photos per recipe)
CREATE TABLE IF NOT EXISTS recipe_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  is_primary BOOLEAN DEFAULT false,
  uploaded_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_photos_recipe_id ON recipe_photos(recipe_id);

-- Recipe Attempts (tracking when recipes are made and rated)
CREATE TABLE IF NOT EXISTS recipe_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  made_date DATE NOT NULL,
  rating DECIMAL(2,1) CHECK (rating >= 0 AND rating <= 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_attempts_recipe_id ON recipe_attempts(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_attempts_user_id ON recipe_attempts(user_id);

-- ============================================================================
-- PART 2: GROCERY LIST ENHANCEMENTS
-- ============================================================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Household members can view household lists" ON grocery_lists;
DROP POLICY IF EXISTS "Users can manage their own lists" ON grocery_lists;
DROP POLICY IF EXISTS "Household members can manage shopping sessions" ON shopping_sessions;
DROP POLICY IF EXISTS "Household members can view store layouts" ON store_layouts;
DROP POLICY IF EXISTS "Users can manage their store layouts" ON store_layouts;
DROP POLICY IF EXISTS "Users can view store aisles" ON store_aisles;
DROP POLICY IF EXISTS "Users can manage store aisles" ON store_aisles;
DROP POLICY IF EXISTS "Household members can view purchase history" ON grocery_purchase_history;
DROP POLICY IF EXISTS "Household members can manage purchase history" ON grocery_purchase_history;

-- Grocery Lists (support for multiple lists)
CREATE TABLE IF NOT EXISTS grocery_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Grocery List',
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grocery_lists_user_id ON grocery_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_grocery_lists_household_id ON grocery_lists(household_id);

-- Add columns to grocery_items table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='grocery_list_id') THEN
    ALTER TABLE grocery_items ADD COLUMN grocery_list_id UUID REFERENCES grocery_lists(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='photo_url') THEN
    ALTER TABLE grocery_items ADD COLUMN photo_url TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='notes') THEN
    ALTER TABLE grocery_items ADD COLUMN notes TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='brand_preference') THEN
    ALTER TABLE grocery_items ADD COLUMN brand_preference TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='barcode') THEN
    ALTER TABLE grocery_items ADD COLUMN barcode TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='source_recipe_id') THEN
    ALTER TABLE grocery_items ADD COLUMN source_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='added_by_user_id') THEN
    ALTER TABLE grocery_items ADD COLUMN added_by_user_id UUID REFERENCES auth.users(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='grocery_items' AND column_name='added_via') THEN
    ALTER TABLE grocery_items ADD COLUMN added_via TEXT CHECK (added_via IN ('manual', 'recipe', 'smart_restock', 'meal_plan'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_grocery_items_list_id ON grocery_items(grocery_list_id);

-- Shopping Sessions (collaborative shopping tracking)
CREATE TABLE IF NOT EXISTS shopping_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_list_id UUID NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  started_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_shopping_sessions_list_id ON shopping_sessions(grocery_list_id);
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_household_id ON shopping_sessions(household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_active ON shopping_sessions(is_active) WHERE is_active = true;

-- Store Layouts (custom store configurations)
CREATE TABLE IF NOT EXISTS store_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_layouts_user_id ON store_layouts(user_id);
CREATE INDEX IF NOT EXISTS idx_store_layouts_household_id ON store_layouts(household_id);

-- Store Aisles (aisle definitions per store)
CREATE TABLE IF NOT EXISTS store_aisles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_layout_id UUID NOT NULL REFERENCES store_layouts(id) ON DELETE CASCADE,
  aisle_number TEXT,
  aisle_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_aisles_store_id ON store_aisles(store_layout_id);

-- Grocery Purchase History (track when items were bought)
CREATE TABLE IF NOT EXISTS grocery_purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grocery_item_id UUID REFERENCES grocery_items(id) ON DELETE SET NULL,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity DECIMAL NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  purchased_by_user_id UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_grocery_purchase_history_household_id ON grocery_purchase_history(household_id);
CREATE INDEX IF NOT EXISTS idx_grocery_purchase_history_purchased_at ON grocery_purchase_history(purchased_at);

-- ============================================================================
-- PART 3: ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_aisles ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_purchase_history ENABLE ROW LEVEL SECURITY;

-- Recipe Ingredients Policies
CREATE POLICY "Users can manage their recipe ingredients"
  ON recipe_ingredients FOR ALL
  USING (
    recipe_id IN (
      SELECT id FROM recipes WHERE user_id = auth.uid()
    )
  );

-- Recipe Collections Policies
CREATE POLICY "Users can view their recipe collections"
  ON recipe_collections FOR SELECT
  USING (
    user_id = auth.uid() OR
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their recipe collections"
  ON recipe_collections FOR ALL
  USING (user_id = auth.uid());

-- Recipe Collection Items Policies
CREATE POLICY "Users can manage collection items"
  ON recipe_collection_items FOR ALL
  USING (
    collection_id IN (
      SELECT id FROM recipe_collections WHERE user_id = auth.uid()
    )
  );

-- Recipe Photos Policies
CREATE POLICY "Users can view recipe photos"
  ON recipe_photos FOR SELECT
  USING (
    recipe_id IN (
      SELECT id FROM recipes WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage recipe photos"
  ON recipe_photos FOR ALL
  USING (uploaded_by_user_id = auth.uid());

-- Recipe Attempts Policies
CREATE POLICY "Users can view recipe attempts"
  ON recipe_attempts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their recipe attempts"
  ON recipe_attempts FOR ALL
  USING (user_id = auth.uid());

-- Grocery Lists Policies
CREATE POLICY "Household members can view household lists"
  ON grocery_lists FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their own lists"
  ON grocery_lists FOR ALL
  USING (user_id = auth.uid());

-- Shopping Sessions Policies
CREATE POLICY "Household members can manage shopping sessions"
  ON shopping_sessions FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Store Layouts Policies
CREATE POLICY "Household members can view store layouts"
  ON store_layouts FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their store layouts"
  ON store_layouts FOR ALL
  USING (user_id = auth.uid());

-- Store Aisles Policies
CREATE POLICY "Users can view store aisles"
  ON store_aisles FOR SELECT
  USING (
    store_layout_id IN (
      SELECT id FROM store_layouts 
      WHERE household_id IN (
        SELECT household_id FROM profiles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage store aisles"
  ON store_aisles FOR ALL
  USING (
    store_layout_id IN (
      SELECT id FROM store_layouts WHERE user_id = auth.uid()
    )
  );

-- Grocery Purchase History Policies
CREATE POLICY "Household members can view purchase history"
  ON grocery_purchase_history FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Household members can manage purchase history"
  ON grocery_purchase_history FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 4: DATA MIGRATION
-- ============================================================================

-- Create default grocery list for existing users who have grocery items
DO $$
DECLARE
  user_record RECORD;
  new_list_id UUID;
BEGIN
  FOR user_record IN 
    SELECT DISTINCT user_id, household_id 
    FROM grocery_items 
    WHERE grocery_list_id IS NULL
  LOOP
    -- Create default list for this user
    INSERT INTO grocery_lists (user_id, household_id, name, is_default)
    VALUES (user_record.user_id, user_record.household_id, 'My Grocery List', true)
    RETURNING id INTO new_list_id;
    
    -- Assign existing grocery items to this list
    UPDATE grocery_items
    SET grocery_list_id = new_list_id
    WHERE user_id = user_record.user_id 
    AND grocery_list_id IS NULL;
  END LOOP;
END $$;

