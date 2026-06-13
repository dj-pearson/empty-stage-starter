-- US-338: guarantee one effective meal vote per (kid, meal_date, meal_slot).
--
-- The web upsert had NO onConflict target, so PostgREST fell back to the PK
-- (a fresh uuid each call) and every re-vote INSERTED a duplicate row. The
-- table's existing UNIQUE(kid_id, plan_entry_id) / UNIQUE(kid_id, recipe_id,
-- meal_date, meal_slot) don't help here because plan_entry_id / recipe_id are
-- nullable (recipe-only or unplanned votes) and NULLs don't dedupe.
--
-- Fix: a stable natural key on the always-present columns (meal_date /
-- meal_slot are NOT NULL; the app always sends kid_id). The web client upserts
-- with onConflict='kid_id,meal_date,meal_slot' against this index.
--
-- Additive + backward-compatible: new index only. NULL kid_id rows (if any)
-- stay distinct under the index (Postgres treats NULLs as not-equal), so no
-- legacy write is rejected by them.

-- 1) Collapse any pre-existing duplicates the old no-onConflict path created,
--    keeping the most recent vote per key.
DELETE FROM public.meal_votes mv
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY kid_id, meal_date, meal_slot
           ORDER BY voted_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM public.meal_votes
  WHERE kid_id IS NOT NULL
) dups
WHERE mv.id = dups.id
  AND dups.rn > 1;

-- 2) Stable dedupe key used as the upsert conflict target.
CREATE UNIQUE INDEX IF NOT EXISTS meal_votes_kid_meal_slot_key
  ON public.meal_votes (kid_id, meal_date, meal_slot);
