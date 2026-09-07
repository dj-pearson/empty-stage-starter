-- US-793: make grocery_product_catalog the canonical food catalog.
--
-- WHY THIS TABLE AND NOT `nutrition`. `nutrition` looks like the live catalog
-- (12 web files, 18 edge functions, 25 migrations) but the shipped iOS app does
-- not read it -- its only hit in the Swift tree is a lowered.contains("nutrition")
-- string test at AICoachService.swift:188. iOS reads THIS table, through
-- SmartProductService, by barcode and by name_normalized. See
-- docs/superpowers/specs/2026-09-06-shared-food-catalog-design.md.
--
-- ADDITIVE ONLY. Every statement below adds; nothing is renamed, dropped or
-- retyped, because a shipped build reads this table and CLAUDE.md forbids it.

ALTER TABLE public.grocery_product_catalog
  -- generic ("cheddar cheese") vs branded ("Cathedral City Mature 350g").
  -- Default 'generic' so existing rows get a valid value without a backfill.
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS parent_food_id UUID
    REFERENCES public.grocery_product_catalog(id) ON DELETE SET NULL,
  -- Nutrition PER 100 G/ML. Not per serving: `nutrition` stores per-serving
  -- against a free-text serving_size, which is exactly why those numbers
  -- cannot be summed. USDA and Open Food Facts both publish per-100.
  ADD COLUMN IF NOT EXISTS calories_kcal_100 NUMERIC,
  ADD COLUMN IF NOT EXISTS protein_g_100 NUMERIC,
  ADD COLUMN IF NOT EXISTS carbs_g_100 NUMERIC,
  ADD COLUMN IF NOT EXISTS fat_g_100 NUMERIC,
  ADD COLUMN IF NOT EXISTS fiber_g_100 NUMERIC,
  ADD COLUMN IF NOT EXISTS sugar_g_100 NUMERIC,
  ADD COLUMN IF NOT EXISTS sodium_mg_100 NUMERIC,
  ADD COLUMN IF NOT EXISTS serving_size_g NUMERIC,
  ADD COLUMN IF NOT EXISTS allergens TEXT[],
  -- Provenance. source_ref is the FDC id or barcode, so a row can be
  -- re-checked against where it came from.
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_ref TEXT,
  ADD COLUMN IF NOT EXISTS verification TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Constraints as separate statements so a re-run is idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gpc_kind_check') THEN
    ALTER TABLE public.grocery_product_catalog
      ADD CONSTRAINT gpc_kind_check CHECK (kind IN ('generic','branded'));
  END IF;

  -- Only a branded row may have a generic parent.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gpc_parent_only_branded') THEN
    ALTER TABLE public.grocery_product_catalog
      ADD CONSTRAINT gpc_parent_only_branded
      CHECK (parent_food_id IS NULL OR kind = 'branded');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gpc_source_check') THEN
    ALTER TABLE public.grocery_product_catalog
      ADD CONSTRAINT gpc_source_check
      CHECK (source IS NULL OR source IN ('usda','openfoodfacts','foodrepo','user','admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gpc_verification_check') THEN
    ALTER TABLE public.grocery_product_catalog
      ADD CONSTRAINT gpc_verification_check
      CHECK (verification IN ('verified','unverified','rejected'));
  END IF;

  -- 900 kcal/100 g is pure fat and therefore the physical maximum. Anything
  -- above it is a unit error or a bad scrape, not a food.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gpc_nutrition_sane') THEN
    ALTER TABLE public.grocery_product_catalog
      ADD CONSTRAINT gpc_nutrition_sane CHECK (
        (calories_kcal_100 IS NULL OR calories_kcal_100 BETWEEN 0 AND 900)
        AND (protein_g_100 IS NULL OR protein_g_100 BETWEEN 0 AND 100)
        AND (carbs_g_100   IS NULL OR carbs_g_100   BETWEEN 0 AND 100)
        AND (fat_g_100     IS NULL OR fat_g_100     BETWEEN 0 AND 100)
        AND (fiber_g_100   IS NULL OR fiber_g_100   BETWEEN 0 AND 100)
        AND (sugar_g_100   IS NULL OR sugar_g_100   BETWEEN 0 AND 100)
        AND (sodium_mg_100 IS NULL OR sodium_mg_100 BETWEEN 0 AND 100000)
      );
  END IF;
END $$;

-- Search by type and search by brand both need this. pg_trgm may already be on.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS grocery_product_catalog_name_trgm
  ON public.grocery_product_catalog USING GIN (name_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS grocery_product_catalog_parent_idx
  ON public.grocery_product_catalog(parent_food_id) WHERE parent_food_id IS NOT NULL;

-- Was WHERE verification <> 'verified' -- that indexes the majority value and
-- cannot serve the only filter the spec names (excluding unverified rows from
-- ladder and nutrition totals, i.e. WHERE verification = 'verified'). Dropped
-- and recreated with the correct polarity; the name is unchanged.
DROP INDEX IF EXISTS grocery_product_catalog_verification_idx;
CREATE INDEX IF NOT EXISTS grocery_product_catalog_verification_idx
  ON public.grocery_product_catalog(verification) WHERE verification = 'verified';

COMMENT ON COLUMN public.grocery_product_catalog.calories_kcal_100 IS
  'Per 100 g or ml, never per serving. See serving_size_g for display.';
COMMENT ON COLUMN public.grocery_product_catalog.verification IS
  'Trust boundary. Anyone may create unverified; only an admin (or a trusted null-auth.uid() context -- see the guard trigger) may change this column at all, in either direction. Unverified rows are usable for shopping but excluded from ladder and nutrition totals.';
COMMENT ON COLUMN public.grocery_product_catalog.allergens IS
  'Authoritative allergen field. Any "allergens" key inside metadata (see 20260505000000_smart_product_catalog.sql) is legacy and not read.';


-- The trust boundary is this column, NOT the RLS write policies.
--
-- The catalog's policies let any authenticated user INSERT and UPDATE, because
-- the shipped iOS app creates catalog rows on first add. Tightening them to
-- admin-only is exactly the policy change CLAUDE.md warns breaks older clients.
-- So writes stay open and every change to `verification` is guarded here
-- instead -- not just the promotion to 'verified'. An earlier version of this
-- trigger only ever asked "is someone setting this to verified?", which left
-- two holes open to any authenticated user: demoting (or 'rejected'-ing) a
-- verified row back down, since the guard never fired for that direction; and
-- rewriting an already-verified row's verified_at/verified_by by touching
-- only those columns, since the guard only looked at the transition into
-- 'verified'. The right question is "is a non-admin changing this column at
-- all?", so the guard below rejects any change to `verification` from a
-- caller who isn't trusted, and the stamping logic separately refuses to
-- honour a caller-supplied verified_at/verified_by whenever the row was
-- already verified and stays verified -- closing the second hole even for a
-- trusted caller who has no legitimate reason to backdate someone else's
-- verification.
--
-- Trust is auth.uid() IS NULL (psql, a migration, or a service_role key that
-- bypasses RLS by design -- the catalog's own RLS makes this safe:
-- "Catalog insertable by authenticated users" is WITH CHECK (auth.uid() IS
-- NOT NULL) and the UPDATE policy is USING (auth.uid() IS NOT NULL), so anon
-- through PostgREST cannot reach this table at all -- a null auth.uid() never
-- happens for a public-API request. US-794 needs this to seed USDA rows as
-- already verified) OR an admin (has_role(auth.uid(), 'admin')). Everyone
-- else may INSERT only as 'unverified' (the shipped iOS INSERT never names
-- the column, so it is unaffected) and may never change `verification` on an
-- UPDATE, in either direction.
CREATE OR REPLACE FUNCTION public.gpc_guard_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trusted BOOLEAN;
BEGIN
  v_trusted := auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin');

  IF NOT v_trusted THEN
    IF (TG_OP = 'INSERT' AND NEW.verification <> 'unverified')
       OR (TG_OP = 'UPDATE' AND NEW.verification IS DISTINCT FROM OLD.verification) THEN
      RAISE EXCEPTION 'only an admin may change the verification state of a catalog row'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- verified_at/verified_by describe a verification that happened.
  IF NEW.verification = 'verified' THEN
    IF TG_OP = 'INSERT' OR OLD.verification IS DISTINCT FROM 'verified' THEN
      -- A fresh transition into 'verified': stamp from the actual actor,
      -- never from whatever the caller passed.
      NEW.verified_at := now();
      NEW.verified_by := auth.uid();
    ELSE
      -- Already verified and staying verified: the stamp describes who
      -- verified it and when, which does not change just because the row was
      -- touched again. Carry the original through untouched, ignoring
      -- whatever verified_at/verified_by the caller passed -- this is what
      -- stops anyone (admin included) from rewriting another verifier's
      -- credit or backdating the timestamp.
      NEW.verified_at := OLD.verified_at;
      NEW.verified_by := OLD.verified_by;
    END IF;
  ELSE
    NEW.verified_at := NULL;
    NEW.verified_by := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS gpc_guard_verification ON public.grocery_product_catalog;
CREATE TRIGGER gpc_guard_verification
  BEFORE INSERT OR UPDATE OF verification, verified_at, verified_by
  ON public.grocery_product_catalog
  FOR EACH ROW EXECUTE FUNCTION public.gpc_guard_verification();

-- US-793: the household row references the catalog.
--
-- NULLABLE ON PURPOSE. An unmatched row behaves exactly as it does today, which
-- is what lets US-796's matcher fill this in gradually instead of requiring a
-- big-bang rename of every household's food on day one. ON DELETE SET NULL for
-- the same reason: losing a catalog row must never take a household's food with
-- it.
ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS canonical_id UUID
    REFERENCES public.grocery_product_catalog(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS foods_canonical_id_idx
  ON public.foods(canonical_id) WHERE canonical_id IS NOT NULL;

COMMENT ON COLUMN public.foods.canonical_id IS
  'Optional link to the shared catalog (US-793). NULL means unmatched, which is a valid steady state. Household-specific fields (is_safe, is_try_bite, quantity, expiry_date) are never read from the catalog.';
