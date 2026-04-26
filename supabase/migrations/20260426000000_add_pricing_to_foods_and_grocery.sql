-- US-243: Optional per-unit pricing on foods + grocery items.
--
-- Both columns are nullable so existing rows stay untouched. Currency stored
-- as ISO-4217 (e.g. 'USD', 'GBP') alongside the price so households that
-- travel or shop in mixed currencies don't see false totals — the iOS layer
-- treats unknown-currency rows as "skip" rather than auto-converting.

ALTER TABLE public.foods
    ADD COLUMN IF NOT EXISTS price_per_unit NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS currency       CHAR(3);

ALTER TABLE public.grocery_items
    ADD COLUMN IF NOT EXISTS price_per_unit NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS currency       CHAR(3);

-- Partial indexes for the dashboard's "what's my total" queries — most
-- foods + items will have NULL pricing so a full index would be wasteful.
CREATE INDEX IF NOT EXISTS foods_price_partial_idx
    ON public.foods (user_id)
    WHERE price_per_unit IS NOT NULL;

CREATE INDEX IF NOT EXISTS grocery_items_price_partial_idx
    ON public.grocery_items (user_id)
    WHERE price_per_unit IS NOT NULL;

COMMENT ON COLUMN public.foods.price_per_unit IS
    'Optional unit price. NULL means no pricing tracked. Powers the iOS Budget tab + AIMealService weekly-budget bias (US-243).';
COMMENT ON COLUMN public.foods.currency IS
    'ISO-4217 currency code (USD/GBP/EUR/etc). NULL when price is NULL. App falls back to Locale.current.currency.identifier when missing.';
COMMENT ON COLUMN public.grocery_items.price_per_unit IS
    'Per-unit price for grocery list items — multiplied by quantity for the dashboard total. NULL = unknown.';
COMMENT ON COLUMN public.grocery_items.currency IS
    'ISO-4217 currency code matching price_per_unit.';
