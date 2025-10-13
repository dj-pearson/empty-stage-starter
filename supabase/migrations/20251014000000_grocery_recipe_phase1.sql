-- ============================================================================
-- PHASE 1: GROCERY & RECIPE ENHANCEMENTS
-- ============================================================================

-- ============================================================================
-- RECIPES ENHANCEMENTS
-- ============================================================================

-- Add new columns to recipes table
ALTER TABLE recipes 
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_type TEXT CHECK (source_type IN ('website', 'photo', 'manual', 'imported')),
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rating DECIMAL(3,1) CHECK (rating >= 1 AND rating <= 5),
  ADD COLUMN IF NOT EXISTS times_made INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_made_date DATE,
  ADD COLUMN IF NOT EXISTS total_time_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS difficulty_level TEXT CHECK (difficulty_level IN ('easy', 'medium', 'hard')),
  ADD COLUMN IF NOT EXISTS kid_friendly_score INTEGER CHECK (kid_friendly_score >= 0 AND kid_friendly_score <= 100),
  ADD COLUMN IF NOT EXISTS nutrition_info JSONB;

-- Create recipe ingredients table (structured storage)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  food_id UUID REFERENCES foods(id) ON DELETE SET NULL,
  ingredient_name TEXT NOT NULL,
  quantity DECIMAL(10,2),
  unit TEXT,
  preparation_notes TEXT,
  is_optional BOOLEAN DEFAULT false,
  section TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create recipe collections
CREATE TABLE IF NOT EXISTS recipe_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'folder',
  color TEXT DEFAULT 'primary',
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recipe to collection mappings
CREATE TABLE IF NOT EXISTS recipe_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES recipe_collections(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, recipe_id)
);

-- Recipe photos
CREATE TABLE IF NOT EXISTS recipe_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  is_primary BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recipe attempts/ratings
CREATE TABLE IF NOT EXISTS recipe_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  kid_rating INTEGER CHECK (kid_rating >= 1 AND kid_rating <= 5),
  amount_eaten TEXT CHECK (amount_eaten IN ('none', 'taste', 'some', 'most', 'all')),
  notes TEXT,
  would_make_again BOOLEAN,
  modifications TEXT,
  photo_urls TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GROCERY LIST ENHANCEMENTS
-- ============================================================================

-- Create grocery lists table (multiple lists support)
CREATE TABLE IF NOT EXISTS grocery_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'shopping-cart',
  color TEXT DEFAULT 'primary',
  is_default BOOLEAN DEFAULT false,
  store_name TEXT,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enhance grocery_items table
ALTER TABLE grocery_items 
  ADD COLUMN IF NOT EXISTS grocery_list_id UUID REFERENCES grocery_lists(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS brand_preference TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS source_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS added_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS added_via TEXT CHECK (added_via IN ('manual', 'voice', 'recipe', 'restock', 'barcode', 'plan'));

-- Shopping sessions (collaborative mode)
CREATE TABLE IF NOT EXISTS shopping_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  grocery_list_id UUID REFERENCES grocery_lists(id) ON DELETE SET NULL,
  store_name TEXT,
  store_location TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  total_items INTEGER,
  checked_items INTEGER,
  estimated_total DECIMAL(10,2),
  actual_total DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store layouts
CREATE TABLE IF NOT EXISTS store_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  store_chain TEXT,
  store_location TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store aisles
CREATE TABLE IF NOT EXISTS store_aisles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_layout_id UUID REFERENCES store_layouts(id) ON DELETE CASCADE,
  aisle_name TEXT NOT NULL,
  aisle_number TEXT,
  sort_order INTEGER NOT NULL,
  color TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Food-to-aisle mappings
CREATE TABLE IF NOT EXISTS food_aisle_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_layout_id UUID REFERENCES store_layouts(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  aisle_id UUID REFERENCES store_aisles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_layout_id, food_name)
);

-- Shopping history
CREATE TABLE IF NOT EXISTS grocery_purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity DECIMAL(10,2),
  unit TEXT,
  store_name TEXT,
  price DECIMAL(10,2),
  category TEXT,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Recipe indexes
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_food ON recipe_ingredients(food_id);
CREATE INDEX IF NOT EXISTS idx_recipe_collections_user ON recipe_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_collection_items_collection ON recipe_collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_recipe_collection_items_recipe ON recipe_collection_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_photos_recipe ON recipe_photos(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_attempts_recipe ON recipe_attempts(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_attempts_user ON recipe_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_attempts_kid ON recipe_attempts(kid_id);

-- Grocery indexes
CREATE INDEX IF NOT EXISTS idx_grocery_lists_user ON grocery_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_grocery_lists_household ON grocery_lists(household_id);
CREATE INDEX IF NOT EXISTS idx_grocery_items_list ON grocery_items(grocery_list_id);
CREATE INDEX IF NOT EXISTS idx_grocery_items_recipe_source ON grocery_items(source_recipe_id);
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_household ON shopping_sessions(household_id, is_active);
CREATE INDEX IF NOT EXISTS idx_shopping_sessions_user ON shopping_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_store_layouts_user ON store_layouts(user_id);
CREATE INDEX IF NOT EXISTS idx_store_aisles_layout ON store_aisles(store_layout_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_food_aisle_mappings_layout ON food_aisle_mappings(store_layout_id);
CREATE INDEX IF NOT EXISTS idx_purchase_history_user ON grocery_purchase_history(user_id, item_name);
CREATE INDEX IF NOT EXISTS idx_purchase_history_date ON grocery_purchase_history(purchased_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Recipe tables
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their recipe ingredients"
  ON recipe_ingredients FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_ingredients.recipe_id
      AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their recipe collections"
  ON recipe_collections FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their collection items"
  ON recipe_collection_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recipe_collections
      WHERE recipe_collections.id = recipe_collection_items.collection_id
      AND recipe_collections.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their recipe photos"
  ON recipe_photos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM recipes
      WHERE recipes.id = recipe_photos.recipe_id
      AND recipes.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their recipe attempts"
  ON recipe_attempts FOR ALL
  USING (user_id = auth.uid());

-- Grocery tables
ALTER TABLE grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_aisles ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_aisle_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_purchase_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own lists"
  ON grocery_lists FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Household members can view household lists"
  ON grocery_lists FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Household members can manage shopping sessions"
  ON shopping_sessions FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their store layouts"
  ON store_layouts FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their store aisles"
  ON store_aisles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM store_layouts
      WHERE store_layouts.id = store_aisles.store_layout_id
      AND store_layouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their aisle mappings"
  ON food_aisle_mappings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM store_layouts
      WHERE store_layouts.id = food_aisle_mappings.store_layout_id
      AND store_layouts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their purchase history"
  ON grocery_purchase_history FOR ALL
  USING (user_id = auth.uid());

-- ============================================================================
-- DATA MIGRATION
-- ============================================================================

-- Create default grocery lists for existing users
INSERT INTO grocery_lists (user_id, household_id, name, is_default)
SELECT DISTINCT 
  user_id, 
  household_id, 
  'Shopping List', 
  true
FROM grocery_items
WHERE NOT EXISTS (
  SELECT 1 FROM grocery_lists 
  WHERE grocery_lists.user_id = grocery_items.user_id
)
ON CONFLICT DO NOTHING;

-- Assign existing grocery items to default lists
UPDATE grocery_items gi
SET grocery_list_id = (
  SELECT id FROM grocery_lists
  WHERE user_id = gi.user_id 
  AND is_default = true
  LIMIT 1
)
WHERE grocery_list_id IS NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE recipe_ingredients IS 'Structured ingredient storage for recipes';
COMMENT ON TABLE recipe_collections IS 'User-created recipe folders/collections';
COMMENT ON TABLE grocery_lists IS 'Multiple grocery lists per user (Costco, Weekly, etc.)';
COMMENT ON TABLE shopping_sessions IS 'Active shopping sessions for collaborative mode';
COMMENT ON TABLE store_layouts IS 'Custom store aisle layouts per user';
COMMENT ON COLUMN grocery_items.source_recipe_id IS 'Recipe that generated this grocery item';
COMMENT ON COLUMN grocery_items.added_via IS 'How this item was added (manual, recipe, restock, etc.)';

