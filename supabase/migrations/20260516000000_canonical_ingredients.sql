-- US-302: Canonical ingredients catalog + aliases + nullable FKs
--
-- Foundation for shared ingredient identity across recipe_ingredients,
-- foods (pantry), grocery_items, and receipt-scan results.
--
-- Strictly additive per CLAUDE.md migration rules - older shipped iOS
-- builds ignore unknown columns and continue to work unchanged. The
-- new `ingredient_id` columns default to NULL on all existing rows;
-- US-305 will add population paths and US-306 backfills high-confidence
-- matches. The legacy lowercased-name match in src/lib/recipeShortfall.ts
-- (and iOS equivalent) stays in place as a fallback until
-- MIN_SUPPORTED_IOS_BUILD passes the dual-write release (US-303/US-304).
--
-- See PRD US-302 for the full acceptance criteria.

-- ============================================================================
-- 1) ingredients catalog (global, public-readable, admin-managed)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT,
  default_unit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingredients_category
  ON public.ingredients(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ingredients_name_lower
  ON public.ingredients(lower(name));

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read ingredients"
  ON public.ingredients FOR SELECT
  USING (true);

CREATE POLICY "Admins manage ingredients"
  ON public.ingredients FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_ingredients_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.ingredients IS
  'US-302: shared canonical catalog joining recipe_ingredients, foods (pantry), grocery_items, and receipt-scan results';
COMMENT ON COLUMN public.ingredients.slug IS
  'Stable identifier (kebab-case) - never changes once published; used by resolver as primary lookup key';
COMMENT ON COLUMN public.ingredients.category IS
  'High-level grouping for UI (produce | protein | dairy | grain | pantry | spice | baking | frozen | canned | beverage | snack)';
COMMENT ON COLUMN public.ingredients.default_unit IS
  'Suggested pantry unit when only a name is given (e.g. eggs -> dozen, milk -> gallon, oil -> bottle)';

-- ============================================================================
-- 2) ingredient_aliases (alias -> ingredient resolution + curation queue)
-- ============================================================================
-- NULL ingredient_id = pending admin review (the resolver enqueued an
-- unknown free-text term). Admin tooling (US-306) drains the queue by
-- assigning a real ingredient_id or marking it as garbage.
CREATE TABLE IF NOT EXISTS public.ingredient_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID REFERENCES public.ingredients(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('user','system','import')),
  confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.0 CHECK (confidence BETWEEN 0.0 AND 1.0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingredient_aliases_alias_lower
  ON public.ingredient_aliases(lower(alias));
CREATE INDEX IF NOT EXISTS idx_ingredient_aliases_ingredient
  ON public.ingredient_aliases(ingredient_id) WHERE ingredient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ingredient_aliases_pending
  ON public.ingredient_aliases(created_at DESC) WHERE ingredient_id IS NULL;

ALTER TABLE public.ingredient_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read ingredient aliases"
  ON public.ingredient_aliases FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users insert user-source aliases"
  ON public.ingredient_aliases FOR INSERT
  TO authenticated
  WITH CHECK (source = 'user');

CREATE POLICY "Admins manage all aliases"
  ON public.ingredient_aliases FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.ingredient_aliases IS
  'US-302: free-text -> canonical ingredient mapping with confidence + curation queue (NULL ingredient_id = pending admin review)';
COMMENT ON COLUMN public.ingredient_aliases.source IS
  'user (typed by app user) | system (auto-resolved by resolver) | import (bulk seed/initial load)';
COMMENT ON COLUMN public.ingredient_aliases.confidence IS
  '0.0..1.0 - resolver-assigned score. < 0.7 typically routes to admin queue.';

-- ============================================================================
-- 3) Nullable ingredient_id FK on foods, recipe_ingredients, grocery_items
-- ============================================================================
-- All three columns are NULLABLE. Existing rows stay untouched; old iOS
-- builds keep working because they ignore unknown columns. Dual-write
-- starts in US-303 (web) and US-304 (iOS).
ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS ingredient_id UUID
    REFERENCES public.ingredients(id) ON DELETE SET NULL;

ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS ingredient_id UUID
    REFERENCES public.ingredients(id) ON DELETE SET NULL;

ALTER TABLE public.grocery_items
  ADD COLUMN IF NOT EXISTS ingredient_id UUID
    REFERENCES public.ingredients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_foods_ingredient
  ON public.foods(ingredient_id) WHERE ingredient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient
  ON public.recipe_ingredients(ingredient_id) WHERE ingredient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grocery_items_ingredient
  ON public.grocery_items(ingredient_id) WHERE ingredient_id IS NOT NULL;

COMMENT ON COLUMN public.foods.ingredient_id IS
  'US-302: optional FK to canonical ingredient. Older shipped clients ignore this column.';
COMMENT ON COLUMN public.recipe_ingredients.ingredient_id IS
  'US-302: optional FK to canonical ingredient. Replaces fuzzy name matching once populated (see US-305).';
COMMENT ON COLUMN public.grocery_items.ingredient_id IS
  'US-302: optional FK to canonical ingredient. Used to link grocery purchases back to pantry rows.';
