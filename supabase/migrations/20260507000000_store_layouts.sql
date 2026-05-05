-- US-275: Store-specific aisle maps.
--
-- Two new tables and one new column:
--
--   1. `store_layouts` (centralized, world-readable): one row per
--      common chain. `aisle_overrides` is a JSON map from
--      GroceryAisle.rawValue → desired walk-order int. Falling back to
--      GroceryAisle.storeWalkOrder for any aisle not in the map keeps
--      the seed light — only override what differs from the universal.
--
--   2. `user_store_layout_overrides` (per-user): when a user reorders
--      aisles for their local store, their delta lands here keyed by
--      (user_id, store_layout_id, aisle). Wins over the chain-wide
--      override during sort.
--
--   3. `grocery_lists.store_layout_id` (FK, nullable): per-list pick.
--      NULL means "use the universal walk order" (current behavior).
--
-- The aisle-walk function is computed entirely on the client — no
-- server-side ordering — so the store_layouts table is just a typed
-- defaults document that everyone can read.

-- =====================================================================
-- 1. store_layouts (chain-wide defaults)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.store_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Display name (e.g. "Trader Joe's").
  name TEXT NOT NULL,
  -- URL-safe slug (e.g. "trader_joes"). Used as the analytics property
  -- and for stable lookups across migrations.
  slug TEXT NOT NULL,
  banner_image_url TEXT,
  -- JSONB map: { "produce": 50, "meat_deli": 10, ... }. Aisles missing
  -- from the map use GroceryAisle.storeWalkOrder.
  aisle_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS store_layouts_slug_uq
  ON public.store_layouts(slug);

ALTER TABLE public.store_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store layouts readable by all authenticated users"
  ON public.store_layouts
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Inserts/updates restricted to the service role; the seed below ships
-- the initial 5 chains and a future curator job tops up the catalog.
-- No INSERT/UPDATE policy = effectively service-role-only since RLS is
-- enabled.

-- Seed the 5 most common US chains. Aisle overrides reflect store-walk
-- patterns documented in store maps + customer reviews; tweak via a
-- follow-up migration as we learn more.
INSERT INTO public.store_layouts (slug, name, aisle_overrides)
VALUES
  (
    'walmart', 'Walmart',
    '{}'::jsonb
  ),
  (
    'target', 'Target',
    -- Target puts grocery in the back; non-food up front.
    '{"household": 5, "paper_goods": 7, "personal_care": 9, "produce": 50, "meat_deli": 60, "dairy": 70, "frozen_meals": 80}'::jsonb
  ),
  (
    'trader_joes', 'Trader Joe''s',
    -- Produce is at the back wall; bakery and frozen are big at TJ's.
    '{"frozen_meals": 30, "frozen_veg": 35, "frozen_treats": 40, "produce": 200, "meat_deli": 220}'::jsonb
  ),
  (
    'whole_foods', 'Whole Foods',
    -- Produce front-and-center, prepared foods early, supplements last.
    '{"produce": 5, "bakery": 15, "meat_deli": 25, "personal_care": 990}'::jsonb
  ),
  (
    'costco', 'Costco',
    -- Bulk warehouse layout: appliances first, then food, frozen at end.
    '{"household": 5, "paper_goods": 8, "produce": 100, "meat_deli": 110, "dairy": 120, "frozen_meals": 800, "frozen_veg": 805}'::jsonb
  )
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE public.store_layouts IS
  'US-275: Per-chain aisle walk-order overrides. JSONB map keyed by GroceryAisle.rawValue → walk-order int. Aisles absent from the map fall back to GroceryAisle.storeWalkOrder.';

-- =====================================================================
-- 2. user_store_layout_overrides (per-user deltas)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.user_store_layout_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_layout_id UUID NOT NULL REFERENCES public.store_layouts(id) ON DELETE CASCADE,
  -- GroceryAisle.rawValue, e.g. "meat_deli".
  aisle TEXT NOT NULL,
  walk_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_store_layout_overrides_uq
  ON public.user_store_layout_overrides(user_id, store_layout_id, aisle);

ALTER TABLE public.user_store_layout_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own store overrides"
  ON public.user_store_layout_overrides
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own store overrides"
  ON public.user_store_layout_overrides
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own store overrides"
  ON public.user_store_layout_overrides
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own store overrides"
  ON public.user_store_layout_overrides
  FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_store_layout_overrides IS
  'US-275: Per-user reorderings inside a chain. (user_id, store_layout_id, aisle) is unique. Wins over store_layouts.aisle_overrides for that aisle.';

-- =====================================================================
-- 3. grocery_lists.store_layout_id
-- =====================================================================

ALTER TABLE public.grocery_lists
  ADD COLUMN IF NOT EXISTS store_layout_id UUID
    REFERENCES public.store_layouts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.grocery_lists.store_layout_id IS
  'US-275: Optional FK. When set, ShoppingModeView and the grocery list view sort by this store''s aisle_overrides instead of GroceryAisle.storeWalkOrder.';
