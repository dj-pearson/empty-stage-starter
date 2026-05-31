-- Reconcile store_layouts so BOTH clients work on the live (web-schema) table
-- without an app rebuild.
--
-- Conflict: the native iOS app (US-275) expects store_layouts to be a global,
-- world-readable CHAIN CATALOG with columns name/slug/banner_image_url/
-- aisle_overrides (JSONB) + a per-user user_store_layout_overrides table. Prod
-- instead has the older WEB schema: per-household custom stores
-- (store_name/store_location/user_id/household_id) + a store_aisles child table.
-- iOS decode failed because name/slug didn't exist.
--
-- Strategy (additive, deploy-only):
--   1. Make store_layouts a SUPERSET (add the iOS columns; keep the web ones).
--   2. Keep name <-> store_name in sync and auto-generate slug via a trigger,
--      so rows created by EITHER client are readable by the other.
--   3. Backfill household_id on existing custom rows (so they stay scoped),
--      then widen the SELECT policy to also expose the global catalog rows
--      (household_id IS NULL) — without leaking one household's stores to
--      another.
--   4. Seed the 5 chains the iOS catalog expects (global rows, household_id NULL).
--   5. Ensure the companion user_store_layout_overrides table and the
--      grocery_lists.store_layout_id column exist.
--
-- Known limitation (NOT fixable in SQL): web stores aisle order in the
-- store_aisles child table; iOS stores it in aisle_overrides JSONB. Each
-- client's own aisle data works; the two aisle representations are not merged.

-- 1) iOS columns (nullable / defaulted so existing web inserts still succeed) --
ALTER TABLE public.store_layouts ADD COLUMN IF NOT EXISTS name             TEXT;
ALTER TABLE public.store_layouts ADD COLUMN IF NOT EXISTS slug             TEXT;
ALTER TABLE public.store_layouts ADD COLUMN IF NOT EXISTS banner_image_url TEXT;
ALTER TABLE public.store_layouts ADD COLUMN IF NOT EXISTS aisle_overrides  JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2) Backfill household_id on custom rows so only intentional catalog rows are
--    null-household (and thus globally readable per the policy below).
UPDATE public.store_layouts
  SET household_id = public.get_user_household_id(user_id)
  WHERE household_id IS NULL AND user_id IS NOT NULL;

-- 3) Backfill display name both ways + a unique slug for existing rows.
UPDATE public.store_layouts SET name       = store_name WHERE name IS NULL AND store_name IS NOT NULL;
UPDATE public.store_layouts SET store_name = name       WHERE store_name IS NULL AND name IS NOT NULL;
UPDATE public.store_layouts
  SET slug = regexp_replace(lower(coalesce(name, store_name, 'store')), '[^a-z0-9]+', '_', 'g')
             || '_' || replace(id::text, '-', '')
  WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS store_layouts_slug_uq ON public.store_layouts(slug);

-- 4) Keep the two schemas in sync on every write (either client) -------------
CREATE OR REPLACE FUNCTION public.sync_store_layout_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $sync_store_layout_fields$
BEGIN
  IF NEW.name IS NULL AND NEW.store_name IS NOT NULL THEN NEW.name := NEW.store_name; END IF;
  IF NEW.store_name IS NULL AND NEW.name IS NOT NULL THEN NEW.store_name := NEW.name; END IF;
  IF NEW.slug IS NULL THEN
    NEW.slug := regexp_replace(lower(coalesce(NEW.name, NEW.store_name, 'store')), '[^a-z0-9]+', '_', 'g')
                || '_' || replace(NEW.id::text, '-', '');
  END IF;
  IF NEW.aisle_overrides IS NULL THEN NEW.aisle_overrides := '{}'::jsonb; END IF;
  RETURN NEW;
END;
$sync_store_layout_fields$;

DROP TRIGGER IF EXISTS sync_store_layout_fields ON public.store_layouts;
CREATE TRIGGER sync_store_layout_fields
  BEFORE INSERT OR UPDATE ON public.store_layouts
  FOR EACH ROW EXECUTE FUNCTION public.sync_store_layout_fields();

-- 5) Widen SELECT to expose global catalog rows (household_id IS NULL) while
--    still scoping custom rows to their household. No cross-household leak.
DROP POLICY IF EXISTS "Household members can view store layouts" ON public.store_layouts;
DROP POLICY IF EXISTS "Store layouts readable by all authenticated users" ON public.store_layouts;
DROP POLICY IF EXISTS "Users can view own store layouts" ON public.store_layouts;
CREATE POLICY "View global catalog and own household store layouts"
  ON public.store_layouts
  FOR SELECT
  USING (
    household_id IS NULL
    OR household_id = public.get_user_household_id(auth.uid())
    OR user_id = auth.uid()
  );

-- 6) Seed the iOS chain catalog (global rows; trigger fills store_name/slug). --
INSERT INTO public.store_layouts (slug, name, aisle_overrides)
VALUES
  ('walmart',     'Walmart',       '{}'::jsonb),
  ('target',      'Target',        '{"household": 5, "paper_goods": 7, "personal_care": 9, "produce": 50, "meat_deli": 60, "dairy": 70, "frozen_meals": 80}'::jsonb),
  ('trader_joes', 'Trader Joe''s', '{"frozen_meals": 30, "frozen_veg": 35, "frozen_treats": 40, "produce": 200, "meat_deli": 220}'::jsonb),
  ('whole_foods', 'Whole Foods',   '{"produce": 5, "bakery": 15, "meat_deli": 25, "personal_care": 990}'::jsonb),
  ('costco',      'Costco',        '{"household": 5, "paper_goods": 8, "produce": 100, "meat_deli": 110, "dairy": 120, "frozen_meals": 800, "frozen_veg": 805}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- 7) Companion table for per-user aisle reordering (iOS US-275). -------------
CREATE TABLE IF NOT EXISTS public.user_store_layout_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_layout_id UUID NOT NULL REFERENCES public.store_layouts(id) ON DELETE CASCADE,
  aisle TEXT NOT NULL,
  walk_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_store_layout_overrides_uq
  ON public.user_store_layout_overrides(user_id, store_layout_id, aisle);
ALTER TABLE public.user_store_layout_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own store overrides" ON public.user_store_layout_overrides;
CREATE POLICY "Users view own store overrides" ON public.user_store_layout_overrides
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own store overrides" ON public.user_store_layout_overrides;
CREATE POLICY "Users insert own store overrides" ON public.user_store_layout_overrides
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own store overrides" ON public.user_store_layout_overrides;
CREATE POLICY "Users update own store overrides" ON public.user_store_layout_overrides
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users delete own store overrides" ON public.user_store_layout_overrides;
CREATE POLICY "Users delete own store overrides" ON public.user_store_layout_overrides
  FOR DELETE USING (auth.uid() = user_id);

-- 8) Optional per-list store pick used by iOS (and harmless for web). --------
ALTER TABLE public.grocery_lists
  ADD COLUMN IF NOT EXISTS store_layout_id UUID
    REFERENCES public.store_layouts(id) ON DELETE SET NULL;
