-- US-548: covering indexes on RLS-predicate / FK columns for high-write tables.
--
-- The web app loads plan_entries and grocery_items filtered by household_id
-- (see AppContext load), and RLS policies filter by the same columns, but there
-- was no index on household_id/user_id for these high-write tables — forcing a
-- sequential scan per load and per RLS check. These indexes are additive and
-- backward-compatible (old clients are unaffected by a new index).
--
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction, and Supabase
-- migrations execute in one, so we use plain CREATE INDEX IF NOT EXISTS. These
-- tables are not large enough for the brief write lock to matter; if that ever
-- changes, build the index CONCURRENTLY out-of-band and mark it IF NOT EXISTS.

-- plan_entries: loaded by household_id + a date window, and RLS-filtered by
-- household_id. A composite (household_id, date) covers both the equality and
-- the range in the load query; a plain user_id index covers the FK / owner
-- predicate.
CREATE INDEX IF NOT EXISTS idx_plan_entries_household_date
  ON public.plan_entries (household_id, date);
CREATE INDEX IF NOT EXISTS idx_plan_entries_user_id
  ON public.plan_entries (user_id);

-- grocery_items: loaded and RLS-filtered by household_id.
CREATE INDEX IF NOT EXISTS idx_grocery_items_household_id
  ON public.grocery_items (household_id);

-- food_attempts is already covered: it has no user_id/household_id column and
-- its kid_id FK (RLS scopes through kids) is already indexed
-- (idx_food_attempts_kid). No new index required.
