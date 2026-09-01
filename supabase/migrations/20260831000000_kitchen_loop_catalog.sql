-- US-655: item_aliases and canonical_products -- the catalog's memory and its seed.
--
-- Every seam between the modules in this app is currently a lowercased string
-- compare. AppState.moveCheckedToPantry credits the pantry by matching
-- `$0.name.lowercased() == item.name.lowercased()`, GroceryGeneratorService
-- de-duplicates by a lowercased name key, ShortfallCalculator goes through
-- IngredientNameMatcher, and PantryDedup exists as a utility because none of
-- them agree. "chicken breast", "chicken breasts" and "boneless chicken
-- breasts" are three things to the app and one thing to the parent.
--
-- These two tables are where resolution stops being guesswork:
--
--   item_aliases       -- what THIS household has already confirmed. Written
--                         every time a receipt line, an ingredient or a
--                         grocery row is resolved to a real item, so the
--                         second occurrence never has to ask again.
--   canonical_products -- a shared, read-only seed keyed by barcode and
--                         normalized name, so a brand-new household is not
--                         resolving from zero. SmartProductService and
--                         BarcodeService already reach for something like this
--                         and do not have it.
--
-- Per CLAUDE.md backward-compat rules this migration is additive only: two new
-- tables, their indexes and their policies. Nothing existing is altered,
-- dropped or renamed, so every shipped iOS build keeps working against an
-- unchanged shape and never sees either table.
--
-- Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md

-- item_aliases ---------------------------------------------------------------
--
-- Household-scoped on purpose. "mac" means macaroni in one kitchen and
-- macadamia in another, and a global alias table would have to pick. The
-- confidence column records how the mapping was arrived at, so a fuzzy match
-- accepted at 0.82 is distinguishable later from a barcode scan at 1.0.

CREATE TABLE IF NOT EXISTS public.item_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,

  -- Output of normalizeItemText (US-657). Never the raw user string: the
  -- whole point is that lookups compare the same shape every time.
  normalized_text TEXT NOT NULL,

  source TEXT NOT NULL
    CHECK (source IN (
      'barcode', 'user_confirmed', 'receipt',
      'import', 'ai_suggested', 'legacy_migration'
    )),

  -- 1.0 for barcode and explicit parent confirmation; lower for fuzzy and
  -- AI-suggested mappings, which the resolver treats as weaker evidence.
  confidence NUMERIC NOT NULL DEFAULT 1.0
    CHECK (confidence > 0 AND confidence <= 1),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One meaning per phrase per household. This is both the correctness
-- constraint and the lookup index: the resolver's hot path is an exact match
-- on (household_id, normalized_text), which this serves directly, so a
-- separate non-unique index on the same pair would be dead weight.
CREATE UNIQUE INDEX IF NOT EXISTS item_aliases_household_text_unique
  ON public.item_aliases(household_id, normalized_text);

-- Supports the reverse question -- "what does this household call this item?"
-- -- which the merge review (US-664) needs to show its evidence, and which
-- rpc_merge_items needs in order to repoint aliases onto a survivor.
CREATE INDEX IF NOT EXISTS item_aliases_item_idx
  ON public.item_aliases(item_id);

ALTER TABLE public.item_aliases ENABLE ROW LEVEL SECURITY;

-- Household-scoped on every verb, matching the grocery_items policies in
-- 20260531000001_grocery_household_rls.sql. DROP ... IF EXISTS first so the
-- file is re-runnable against a database that already recorded this version.
DROP POLICY IF EXISTS "Household members can view item aliases" ON public.item_aliases;
CREATE POLICY "Household members can view item aliases" ON public.item_aliases
  FOR SELECT USING (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Household members can insert item aliases" ON public.item_aliases;
CREATE POLICY "Household members can insert item aliases" ON public.item_aliases
  FOR INSERT WITH CHECK (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Household members can update item aliases" ON public.item_aliases;
CREATE POLICY "Household members can update item aliases" ON public.item_aliases
  FOR UPDATE USING (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Household members can delete item aliases" ON public.item_aliases;
CREATE POLICY "Household members can delete item aliases" ON public.item_aliases
  FOR DELETE USING (household_id = public.get_user_household_id(auth.uid()));

COMMENT ON TABLE public.item_aliases IS
  'US-655: household-scoped memory of which raw phrase means which food. Written on every confirmed resolution so the resolver never asks twice.';
COMMENT ON COLUMN public.item_aliases.normalized_text IS
  'Output of normalizeItemText (US-657), never a raw user string.';
COMMENT ON COLUMN public.item_aliases.confidence IS
  'How the mapping was arrived at: 1.0 for barcode or explicit confirmation, lower for fuzzy and AI-suggested.';

-- canonical_products ---------------------------------------------------------
--
-- Deliberately NOT household-scoped. This is a shared seed so a new household
-- can resolve a scanned barcode before it has confirmed anything of its own.
-- It holds no user data: a barcode, a normalized name, and the defaults a
-- fresh item should start with.
--
-- Readable by every authenticated user, writable by none of them. There is no
-- INSERT, UPDATE or DELETE policy, so with RLS on, an ordinary client cannot
-- write here at all. Seeding and curation happen through the service role,
-- which bypasses RLS -- that is the only path in, and it is deliberate.

CREATE TABLE IF NOT EXISTS public.canonical_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL for products known by name but never scanned. Unique when present,
  -- because a barcode is the one identifier that is genuinely global.
  barcode TEXT UNIQUE,

  normalized_name TEXT NOT NULL,
  category TEXT,
  -- Seeds foods.canonical_unit for a new item: 'g', 'ml' or 'count'.
  default_unit TEXT,
  -- Seeds the aisle so a first-time item lands in roughly the right section
  -- of the store instead of "Other". Matches the GroceryAisle vocabulary.
  default_aisle TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The resolver's step-4 lookup: name-based fallback when no barcode and no
-- household alias matched.
CREATE INDEX IF NOT EXISTS canonical_products_normalized_name_idx
  ON public.canonical_products(normalized_name);

ALTER TABLE public.canonical_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read canonical products" ON public.canonical_products;
CREATE POLICY "Authenticated users can read canonical products" ON public.canonical_products
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.canonical_products IS
  'US-655: shared read-only product seed so a new household does not resolve from zero. No household scoping and no client write policy; curated through the service role.';
