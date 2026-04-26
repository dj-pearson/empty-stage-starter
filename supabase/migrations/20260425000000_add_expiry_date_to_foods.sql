-- US-230: Optional expiry tracking on pantry foods.
--
-- Nullable so existing rows stay untouched and most foods (non-perishables)
-- never need a value. The DATE type matches yyyy-MM-dd serialization on the
-- iOS / web clients.

ALTER TABLE public.foods
    ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Partial index — most foods will have NULL expiry_date and only the
-- "expiring soon" dashboard query cares about non-null rows. A predicate
-- index keeps the index small and the lookup cheap.
CREATE INDEX IF NOT EXISTS foods_expiry_date_partial_idx
    ON public.foods (expiry_date)
    WHERE expiry_date IS NOT NULL;

COMMENT ON COLUMN public.foods.expiry_date IS
    'Optional yyyy-MM-dd expiry. NULL means no tracking. Powers the iOS Pantry expiring-soon badge + dashboard "Expiring this week" card (US-230).';
