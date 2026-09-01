-- US-656: give foods the metadata it needs to be a canonical item.
--
-- foods is currently three entities sharing a row: pantry stock (quantity,
-- unit, expiry_date, price_per_unit), a household catalog entry (name,
-- category, barcode, aisle, allergens) and an ARFID disposition (is_safe,
-- is_try_bite). This epic makes it the catalog entry -- the stable identity
-- everything else points at -- and moves stock into the ledger and disposition
-- into kid_food_ladder.
--
-- These four columns are what the catalog role needs and does not have.
--
-- Per CLAUDE.md backward-compat rules, additive only: four nullable-or-
-- defaulted columns and two partial indexes. Nothing is dropped, renamed or
-- retyped, and no existing column gains NOT NULL. Shipped iOS builds decode
-- foods rows into a struct that ignores unknown keys, so they never see these.
--
-- Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md

ALTER TABLE public.foods
  -- De-duplication redirects rather than deletes. An older client holding a
  -- stale food id must never hit a missing row, so a merged duplicate keeps
  -- existing and points at its survivor. rpc_merge_items (US-663) sets this.
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES public.foods(id),

  -- The unit this item's ledger movements are denominated in. NULL means the
  -- item has not been classified yet; the resolver and the US-669 backfill
  -- populate it. Constrained to the three families the ledger can actually do
  -- arithmetic in -- anything else would be a number nobody can add up.
  ADD COLUMN IF NOT EXISTS canonical_unit TEXT
    CHECK (canonical_unit IS NULL OR canonical_unit IN ('g', 'ml', 'count')),

  -- Per-item conversions into canonical_unit, e.g. {"can": 400, "bunch": 60}
  -- for an item measured in grams. This is the thing string matching could
  -- never do: "1 can of tomatoes" is only a mass for THIS product.
  -- NULL means no item-specific conversions; generic unit maths still applies.
  ADD COLUMN IF NOT EXISTS unit_conversions JSONB,

  -- Set on provisional items the resolver created below its confidence
  -- threshold, and on rows the US-669 backfill could not convert. Drives the
  -- single quiet "N items need confirming" affordance. NOT NULL with a
  -- default, which is safe for old clients: their INSERTs omit it and get
  -- false.
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;

-- Serves the confirm-items affordance: "what in this household still needs a
-- decision?". Partial, because in a healthy household almost nothing does, and
-- a full index on a mostly-false boolean earns nothing.
CREATE INDEX IF NOT EXISTS foods_needs_review_idx
  ON public.foods(household_id)
  WHERE needs_review;

-- Serves the merge redirect: "what collapsed into this item?", which the merge
-- review needs for its evidence and which resolution follows to find the
-- survivor. Partial, because merged rows are the rare case.
CREATE INDEX IF NOT EXISTS foods_merged_into_idx
  ON public.foods(merged_into_id)
  WHERE merged_into_id IS NOT NULL;

COMMENT ON COLUMN public.foods.merged_into_id IS
  'US-656: survivor this row was merged into. Redirect, not delete, so a stale id held by an older client still resolves. See docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md.';
COMMENT ON COLUMN public.foods.canonical_unit IS
  'US-656: unit this item''s inventory_movements are denominated in (g, ml or count). NULL until classified. See docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md.';
COMMENT ON COLUMN public.foods.unit_conversions IS
  'US-656: per-item conversions into canonical_unit, e.g. {"can": 400}. NULL means generic unit maths only. See docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md.';
COMMENT ON COLUMN public.foods.needs_review IS
  'US-656: provisional item awaiting parent confirmation, or a row the backfill could not convert. Drives the confirm-items affordance. See docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md.';
