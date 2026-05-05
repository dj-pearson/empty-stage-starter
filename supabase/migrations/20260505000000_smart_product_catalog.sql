-- US-272: Smart Product Catalog + per-user preferences for the grocery
-- quick-add flow.
--
-- Two tables back the tiered lookup (user → centralized → create):
--
--   1. grocery_product_catalog (centralized): a community catalog of
--      products keyed by barcode and a normalized name. The first user
--      to add or scan a product creates the catalog row; subsequent
--      users get the defaults pre-filled (aisle, category, unit, brand,
--      package size). Times_added drives suggestion ranking.
--
--   2. user_product_preferences (per-user override): the user's own
--      memory layer. When they change the aisle on chicken breast from
--      meat_deli to refrigerated, that preference lives here so the
--      next time they add chicken breast, their override wins over the
--      catalog default. Looked up first by (user_id, barcode), then by
--      (user_id, name_normalized).
--
-- Both tables are write-light (one row per distinct product per user,
-- one row per distinct product globally) and read-heavy on add. The
-- indexes target exact-match lookups at sub-millisecond latency.

-- =====================================================================
-- 1. grocery_product_catalog
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.grocery_product_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Display name as the contributor entered it (e.g. "Chicken Breast").
  name TEXT NOT NULL,
  -- Lowercased + trimmed + collapsed-whitespace for exact-match lookup.
  name_normalized TEXT NOT NULL,
  -- Optional, but the strongest match key when present.
  barcode TEXT,
  -- 32-value GroceryAisle.rawValue (see ios/.../GroceryAisle.swift).
  default_aisle_section TEXT,
  -- Legacy 6-value FoodCategory.rawValue (protein/carb/dairy/...).
  default_category TEXT,
  default_unit TEXT,
  default_quantity NUMERIC,
  brand TEXT,
  package_size NUMERIC,
  package_unit TEXT,
  -- Free-form metadata: openfoodfacts tags, allergens, source url, etc.
  metadata JSONB,
  -- Provenance + popularity for suggestion ranking.
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  times_added INTEGER NOT NULL DEFAULT 1,
  last_added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exact-match lookup keys. Barcode is unique when set (one global row
-- per scanned product). name_normalized is unique to dedupe text-only
-- entries; if two contributors land on the same normalized name the
-- INSERT ... ON CONFLICT (name_normalized) path bumps times_added on
-- the existing row instead of creating a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS grocery_product_catalog_barcode_uq
  ON public.grocery_product_catalog(barcode)
  WHERE barcode IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS grocery_product_catalog_name_uq
  ON public.grocery_product_catalog(name_normalized);

-- Popularity-ordered "find similar" lookups for autocomplete.
CREATE INDEX IF NOT EXISTS grocery_product_catalog_times_added_idx
  ON public.grocery_product_catalog(times_added DESC);

ALTER TABLE public.grocery_product_catalog ENABLE ROW LEVEL SECURITY;

-- The catalog is intentionally world-readable for signed-in users so
-- everyone benefits from prior contributions. Writes are limited to
-- authenticated users; the upsert path on the client is responsible
-- for not overwriting other users' values (it bumps times_added and
-- only fills NULL columns).
CREATE POLICY "Catalog readable by authenticated users"
  ON public.grocery_product_catalog
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Catalog insertable by authenticated users"
  ON public.grocery_product_catalog
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Updates allowed for any authenticated user so the popularity counter
-- and missing fields can be filled in incrementally. The client uses
-- COALESCE-style upserts that never null out a value another user set.
CREATE POLICY "Catalog updatable by authenticated users"
  ON public.grocery_product_catalog
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

COMMENT ON TABLE public.grocery_product_catalog IS
  'US-272: Centralized product catalog. First user to add a product creates the row; subsequent adds bump times_added and fill in any NULL defaults. Looked up by barcode then by name_normalized.';

-- =====================================================================
-- 2. user_product_preferences
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.user_product_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Optional FK to the catalog row that seeded this preference. Lets
  -- the client display "Defaults from community catalog" when the user
  -- hasn't customized anything yet.
  catalog_id UUID REFERENCES public.grocery_product_catalog(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  barcode TEXT,
  -- The user's preferred aisle for *this* product, even if it disagrees
  -- with the catalog default. This is the whole point of the table.
  preferred_aisle_section TEXT,
  preferred_category TEXT,
  preferred_unit TEXT,
  preferred_quantity NUMERIC,
  preferred_brand TEXT,
  notes TEXT,
  times_added INTEGER NOT NULL DEFAULT 1,
  last_added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One pref row per (user, normalized name) and at most one per (user,
-- barcode). The lookup path tries barcode first then name; both must
-- be unique within a user so the INSERT ... ON CONFLICT upsert is well-
-- defined.
CREATE UNIQUE INDEX IF NOT EXISTS user_product_preferences_user_name_uq
  ON public.user_product_preferences(user_id, name_normalized);

CREATE UNIQUE INDEX IF NOT EXISTS user_product_preferences_user_barcode_uq
  ON public.user_product_preferences(user_id, barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_product_preferences_user_last_added_idx
  ON public.user_product_preferences(user_id, last_added_at DESC);

ALTER TABLE public.user_product_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own preferences"
  ON public.user_product_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own preferences"
  ON public.user_product_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own preferences"
  ON public.user_product_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own preferences"
  ON public.user_product_preferences
  FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_product_preferences IS
  'US-272: Per-user product memory. Overrides the centralized catalog defaults so each user’s preferred aisle/brand/unit/quantity sticks across adds.';
