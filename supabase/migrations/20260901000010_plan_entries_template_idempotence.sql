-- US-716: make applying a meal-plan template idempotent.
--
-- plan_entries has never had a uniqueness rule, so applying the same template
-- to the same week twice produced a second full set of rows. There is nothing
-- to upsert onto without one.
--
-- The key is (household_id, kid_id, date, meal_slot, food_id): one food, in one
-- slot, on one day, for one child, in one household. household_id is nullable,
-- so the index is declared NULLS NOT DISTINCT (Postgres 15+): two legacy rows
-- with a null household still collide instead of both sitting outside the
-- constraint. It has to be a plain column list rather than a COALESCE
-- expression because PostgREST's on_conflict, which is what the upsert uses,
-- can only name columns. food_id and kid_id are already NOT NULL.
--
-- BACKWARD COMPATIBILITY. This is the one kind of change CLAUDE.md calls out as
-- needing care: a shipped iOS build that inserts a row matching an existing one
-- will now get a 23505 instead of a second row. That is judged safe here
-- because the duplicate was never meaningful -- two identical rows render as
-- two identical cards in the same slot -- and because a second serving is
-- expressed by editing the entry, not by inserting the same food twice. It is
-- NOT safe to extend this pattern to a table where duplicates carry meaning.
--
-- Existing duplicates are collapsed first, keeping the oldest row of each
-- group, or the index cannot be built at all.

-- 1. Collapse existing duplicates, oldest wins.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        COALESCE(household_id, '00000000-0000-0000-0000-000000000000'::uuid),
        kid_id,
        date,
        meal_slot,
        food_id
      ORDER BY created_at NULLS LAST, id
    ) AS rn
  FROM public.plan_entries
)
DELETE FROM public.plan_entries pe
USING ranked
WHERE pe.id = ranked.id
  AND ranked.rn > 1;

-- 2. The uniqueness the upsert targets.
CREATE UNIQUE INDEX IF NOT EXISTS plan_entries_household_slot_food_key
  ON public.plan_entries (household_id, kid_id, date, meal_slot, food_id)
  NULLS NOT DISTINCT;

COMMENT ON INDEX public.plan_entries_household_slot_food_key IS
  'US-716: one food per (household, kid, date, meal_slot). Backs the ON CONFLICT used when applying a meal-plan template, so re-applying the same template to the same week updates instead of duplicating.';
