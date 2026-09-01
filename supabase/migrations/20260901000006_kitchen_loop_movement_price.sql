-- US-672: what a purchase actually cost, recorded on the movement.
--
-- The design says a checkout appends a `purchase` movement "with canonical
-- quantity, price when known, and a grocery_item ref", and that price on the
-- movement is what lets BudgetService report actual spend instead of an
-- estimate. US-665 created inventory_movements without anywhere to put it, so
-- the ledger could record that two litres of milk arrived but not that they
-- cost 3.40. This adds the two columns that close that gap.
--
-- WHY THE PRICE LIVES HERE AND NOT ON foods.
--
-- foods.price_per_unit stays exactly where it is, and stays what it already
-- was: the LAST KNOWN price, used to forecast a list before it is bought. That
-- is a different fact from what a specific trip actually cost, and the two
-- diverge the moment a price changes or a store differs. Keeping the estimate
-- on the item and the actual on the movement is what makes "you spent 12%
-- more than forecast" answerable at all.
--
-- BACKWARD COMPATIBILITY: purely additive. Two nullable columns on a table no
-- shipped iOS build reads, and no existing row, constraint or policy changes.
-- NULL is the honest value for a movement whose price nobody recorded, which
-- is most of them: a cook, a waste, a correction and a manual pantry edit have
-- no price, and neither does a purchase entered without one.
--
-- Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC,
  ADD COLUMN IF NOT EXISTS currency TEXT;

-- Per DISPLAY unit, matching grocery_items.price_per_unit, which is where the
-- number comes from. Deliberately NOT per canonical unit: a parent types "3.40
-- a bottle", and re-expressing that as a price per millilitre before storing it
-- would bake this release's conversion factor into a historical fact. Spend for
-- a movement is unit_price * display_quantity, both of which are recorded as
-- entered, so the arithmetic stays true even if a conversion is corrected later.
COMMENT ON COLUMN public.inventory_movements.unit_price IS
  'US-672: price per DISPLAY unit at the time of the movement, or NULL when unknown. Actual spend is unit_price * display_quantity. Distinct from foods.price_per_unit, which is the last-known price used to forecast.';

COMMENT ON COLUMN public.inventory_movements.currency IS
  'US-672: ISO 4217 code for unit_price, carried from grocery_items.currency. NULL when unit_price is NULL.';

-- A negative price is a data-entry error rather than a refund; a refund is a
-- reversal of the purchase movement, which is how every other correction works
-- in this table. Constraining only what it can express keeps the check honest:
-- NOT VALID is not needed because the table is new in this same release and
-- holds no rows that could violate it.
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_unit_price_nonneg;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_unit_price_nonneg
  CHECK (unit_price IS NULL OR unit_price >= 0);

-- A price with no currency cannot be added up across a household that has ever
-- shopped abroad, and a currency with no price is noise. Require them together
-- or not at all.
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_price_currency_together;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_price_currency_together
  CHECK ((unit_price IS NULL) = (currency IS NULL));

-- The actual-spend query US-681 will run: every priced purchase in a window.
-- Partial, because the priced rows are a minority of the ledger and the index
-- has no reason to carry a cook or a correction.
CREATE INDEX IF NOT EXISTS inventory_movements_spend_idx
  ON public.inventory_movements(household_id, occurred_at)
  WHERE reason = 'purchase' AND unit_price IS NOT NULL;
