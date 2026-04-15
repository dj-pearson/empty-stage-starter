# Quick Start Guide: Grocery & Recipe Enhancements
## Get Started Implementing Best-in-Class Features

---

## 🚀 Quick Wins (Start Here!)

These features can be implemented quickly and provide immediate value:

### 1. Smart Restock UI (2-3 hours)
**Backend:** ✅ Already exists (`detect_restock_needs` function)  
**Frontend:** ❌ Need to add UI

**Create: `src/components/SmartRestockSuggestions.tsx`**
```typescript
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RestockSuggestion {
  food_id: string;
  food_name: string;
  current_quantity: number;
  recommended_quantity: number;
  reason: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
  aisle?: string;
}

export function SmartRestockSuggestions({ 
  userId, 
  kidId,
  onAddItems 
}: { 
  userId: string; 
  kidId?: string;
  onAddItems: (items: any[]) => void;
}) {
  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSuggestions();
  }, [userId, kidId]);

  const loadSuggestions = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('detect_restock_needs', {
      p_user_id: userId,
      p_kid_id: kidId || null
    });

    if (!error && data) {
      setSuggestions(data);
    }
    setLoading(false);
  };

  const addAllToList = () => {
    const items = suggestions.map(s => ({
      name: s.food_name,
      quantity: s.recommended_quantity,
      unit: 'servings',
      category: s.category,
      aisle: s.aisle,
      auto_generated: true,
      restock_reason: s.reason,
      priority: s.priority
    }));

    onAddItems(items);
    toast.success(`Added ${items.length} items to your grocery list!`);
  };

  if (loading) return <div>Loading suggestions...</div>;
  if (suggestions.length === 0) return null;

  const highPriority = suggestions.filter(s => s.priority === 'high').length;

  return (
    <Card className="p-6 bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-5 w-5 text-accent" />
            <h3 className="text-lg font-semibold">Smart Restock Suggestions</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {suggestions.length} items need restocking
            {highPriority > 0 && ` (${highPriority} urgent)`}
          </p>
        </div>
        <Button onClick={addAllToList} size="sm">
          <ShoppingCart className="h-4 w-4 mr-2" />
          Add All
        </Button>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.food_id}
            className="flex items-center justify-between p-3 bg-background rounded-lg"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{suggestion.food_name}</p>
                {suggestion.priority === 'high' && (
                  <Badge variant="destructive" className="text-xs">Urgent</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {suggestion.reason}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">
                Need: {suggestion.recommended_quantity}
              </p>
              <p className="text-xs text-muted-foreground">
                Have: {suggestion.current_quantity}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

**Add to: `src/pages/Grocery.tsx`** (right after the stats section):
```typescript
{userId && (
  <SmartRestockSuggestions
    userId={userId}
    kidId={activeKidId}
    onAddItems={(items) => {
      items.forEach(item => addGroceryItem(item));
    }}
  />
)}
```

---

### 2. Recipe → Grocery List (One-Tap) (3-4 hours)

**Update: `src/types/index.ts`**
```typescript
export interface Recipe {
  id: string;
  name: string;
  description?: string;
  food_ids: string[];
  // NEW: Structured ingredients
  ingredients?: RecipeIngredient[];
  category?: FoodCategory;
  instructions?: string;
  prepTime?: string;
  cookTime?: string;
  servings?: number;
  additionalIngredients?: string;
  tips?: string;
  assigned_kid_ids?: string[];
}

export interface RecipeIngredient {
  food_id?: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  preparation_notes?: string;
  is_optional?: boolean;
}
```

**Add to: `src/pages/Recipes.tsx`**
```typescript
const addRecipeToGroceryList = async (recipe: Recipe, servingsMultiplier = 1) => {
  if (!recipe.food_ids || recipe.food_ids.length === 0) {
    toast.error("This recipe has no ingredients");
    return;
  }

  // Get recipe foods
  const recipeIngredients = recipe.food_ids
    .map(id => foods.find(f => f.id === id))
    .filter(Boolean) as Food[];

  // Add each ingredient to grocery list
  for (const ingredient of recipeIngredients) {
    await addGroceryItem({
      name: ingredient.name,
      quantity: servingsMultiplier,
      unit: ingredient.unit || 'servings',
      category: ingredient.category,
      aisle: ingredient.aisle,
    });
  }

  toast.success(
    `Added ${recipeIngredients.length} ingredients to grocery list!`,
    { description: `For: ${recipe.name}` }
  );
};

// Update recipe card render to include button:
<Button
  onClick={() => addRecipeToGroceryList(recipe)}
  variant="outline"
  size="sm"
  className="w-full"
>
  <ShoppingCart className="h-4 w-4 mr-2" />
  Add to Grocery List
</Button>
```

---

### 3. Real-Time Grocery List Sync (4-5 hours)

**Update: `src/contexts/AppContext.tsx`**

```typescript
// Add after other useEffects
useEffect(() => {
  if (!userId || !householdId) return;

  // Subscribe to grocery items changes
  const channel = supabase
    .channel('grocery_items_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'grocery_items',
        filter: `household_id=eq.${householdId}`
      },
      (payload) => {
        console.log('Grocery item changed:', payload);

        if (payload.eventType === 'INSERT') {
          setGroceryItemsState(prev => [...prev, payload.new as GroceryItem]);
        } else if (payload.eventType === 'UPDATE') {
          setGroceryItemsState(prev =>
            prev.map(item =>
              item.id === payload.new.id ? (payload.new as GroceryItem) : item
            )
          );
        } else if (payload.eventType === 'DELETE') {
          setGroceryItemsState(prev =>
            prev.filter(item => item.id !== payload.old.id)
          );
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [userId, householdId]);
```

**Add toast notifications for real-time changes:**
```typescript
.on('postgres_changes', ..., (payload) => {
  if (payload.eventType === 'INSERT' && payload.new.added_by_user_id !== userId) {
    toast.info(`${payload.new.name} added to list`, {
      description: 'By another household member'
    });
  }
  // ... rest of logic
})
```

---

### 4. Enhanced Recipe Card with Photos (2-3 hours)

**Update migration: `supabase/migrations/[timestamp]_enhance_recipes.sql`**
```sql
-- Add new columns to recipes table
ALTER TABLE recipes 
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rating DECIMAL(3,1) CHECK (rating >= 1 AND rating <= 5),
  ADD COLUMN IF NOT EXISTS times_made INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_made_date DATE,
  ADD COLUMN IF NOT EXISTS total_time_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS difficulty_level TEXT CHECK (difficulty_level IN ('easy', 'medium', 'hard'));
```

**Update: `src/components/RecipeBuilder.tsx`**

Add image URL field:
```typescript
const [imageUrl, setImageUrl] = useState(editRecipe?.image_url || "");

// In form JSX:
<div className="space-y-2">
  <Label htmlFor="imageUrl">Recipe Photo URL (optional)</Label>
  <Input
    id="imageUrl"
    value={imageUrl}
    onChange={(e) => setImageUrl(e.target.value)}
    placeholder="https://example.com/recipe-photo.jpg"
  />
</div>

// In handleSave:
onSave({
  ...formData,
  image_url: imageUrl || null
});
```

**Update: `src/pages/Recipes.tsx`** - Add image to recipe cards:
```typescript
<CardHeader>
  {recipe.image_url && (
    <img
      src={recipe.image_url}
      alt={recipe.name}
      className="w-full h-48 object-cover rounded-lg mb-4"
    />
  )}
  {/* ... rest of card header */}
</CardHeader>
```

---

### 5. Multiple Grocery Lists (3-4 hours)

**Create migration: `supabase/migrations/[timestamp]_multiple_grocery_lists.sql`**
```sql
-- Create grocery lists table
CREATE TABLE grocery_lists (
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

-- Add foreign key to grocery_items
ALTER TABLE grocery_items 
  ADD COLUMN IF NOT EXISTS grocery_list_id UUID REFERENCES grocery_lists(id) ON DELETE CASCADE;

-- Create default list for existing users
INSERT INTO grocery_lists (user_id, household_id, name, is_default)
SELECT DISTINCT user_id, household_id, 'Shopping List', true
FROM grocery_items
WHERE NOT EXISTS (
  SELECT 1 FROM grocery_lists WHERE grocery_lists.user_id = grocery_items.user_id
);

-- Update existing items to use default list
UPDATE grocery_items gi
SET grocery_list_id = (
  SELECT id FROM grocery_lists
  WHERE user_id = gi.user_id AND is_default = true
  LIMIT 1
)
WHERE grocery_list_id IS NULL;

-- Indexes
CREATE INDEX idx_grocery_lists_user ON grocery_lists(user_id);
CREATE INDEX idx_grocery_lists_household ON grocery_lists(household_id);
CREATE INDEX idx_grocery_items_list ON grocery_items(grocery_list_id);

-- RLS Policies
ALTER TABLE grocery_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own lists"
  ON grocery_lists FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Household members can view household lists"
  ON grocery_lists FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM user_profiles WHERE user_id = auth.uid()
    )
  );
```

**Create: `src/components/GroceryListSelector.tsx`**
```typescript
import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface GroceryList {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
}

export function GroceryListSelector({
  userId,
  householdId,
  selectedListId,
  onListChange,
  onNewList
}: {
  userId: string;
  householdId?: string;
  selectedListId?: string;
  onListChange: (listId: string) => void;
  onNewList: () => void;
}) {
  const [lists, setLists] = useState<GroceryList[]>([]);

  useEffect(() => {
    loadLists();
  }, [userId]);

  const loadLists = async () => {
    const { data, error } = await supabase
      .from('grocery_lists')
      .select('*')
      .or(`user_id.eq.${userId},household_id.eq.${householdId}`)
      .eq('is_archived', false)
      .order('is_default', { ascending: false })
      .order('name');

    if (!error && data) {
      setLists(data as GroceryList[]);
      
      // Auto-select default list if none selected
      if (!selectedListId && data.length > 0) {
        const defaultList = data.find(l => l.is_default) || data[0];
        onListChange(defaultList.id);
      }
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedListId} onValueChange={onListChange}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select a list" />
        </SelectTrigger>
        <SelectContent>
          {lists.map((list) => (
            <SelectItem key={list.id} value={list.id}>
              {list.icon && <span className="mr-2">{list.icon}</span>}
              {list.name}
              {list.is_default && <span className="text-xs ml-2">(Default)</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={onNewList} variant="outline" size="icon">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

---

## 📋 Phase 1 Complete Migration File

**Create: `supabase/migrations/20251014000000_grocery_recipe_phase1.sql`**

```sql
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
      SELECT household_id FROM user_profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Household members can manage shopping sessions"
  ON shopping_sessions FOR ALL
  USING (
    household_id IN (
      SELECT household_id FROM user_profiles WHERE user_id = auth.uid()
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
);

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
```

---

## 🎯 Next Immediate Actions

1. **Run the Phase 1 migration**
   ```bash
   supabase migration new grocery_recipe_phase1
   # Copy the migration SQL above into the new file
   supabase db push
   ```

2. **Implement Quick Wins** (in order):
   - ✅ Smart Restock UI (2-3 hours)
   - ✅ Recipe → Grocery List button (3-4 hours)
   - ✅ Real-time sync (4-5 hours)
   - ✅ Enhanced recipe cards with photos (2-3 hours)
   - ✅ Multiple grocery lists selector (3-4 hours)

3. **Test Each Feature**
   - Create test scenarios
   - Verify real-time sync works
   - Test with multiple household members
   - Ensure mobile responsive

4. **Move to Phase 2**
   - Store layouts system
   - Barcode scanning
   - Recipe import from URL
   - Meal planning calendar

---

**Total Time for Quick Wins:** ~15-20 hours  
**Impact:** Massive improvement in grocery/recipe experience  
**Risk:** Low (mostly frontend, existing backend support)

🚀 **Let's build this!**

