-- US-799 AC4 + AC5: canonical_products and item_aliases are gone, and
-- rpc_merge_items still does its job without them.
--
-- The repo-side guard for this is src/lib/retiredCatalogTables.test.ts, which
-- reads source text. That cannot see the database, and the failure mode worth
-- catching is the one where a later migration re-creates a table or where
-- rpc_merge_items is restored from the 20260901 body -- either of which would
-- put the item_aliases repoint back and leave the function raising 42P01 the
-- first time someone merged two foods.
--
-- HOW TO RUN: `bash scripts/dev/local-sql-suite.sh` builds a throwaway Postgres
-- from the whole migration history and runs every supabase/tests/*.test.sql.
-- Never against production.
--
-- Every check prints EXPECTED alongside the value.

\set HH '''bbbb0799-0000-0000-0000-000000000001'''
\set OWNER '''11110799-0000-0000-0000-0000000000aa'''
\set KEEP '''f0000799-0000-0000-0000-00000000aa01'''
\set DUPE '''f0000799-0000-0000-0000-00000000aa02'''

-- Torn down first so a re-run behaves like a first run. Order matters: the
-- US-668 trigger turns the direct foods.quantity writes below into
-- inventory_movements rows, and both those and item_stock hold a foreign key
-- into foods.
delete from public.inventory_movements where household_id = :HH;
delete from public.item_stock where item_id in (:KEEP, :DUPE);
delete from public.foods where id in (:KEEP, :DUPE);
delete from public.households where id = :HH;

insert into public.households (id, name) values (:HH, 'US-799 household')
  on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Both tables are absent.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  still_here TEXT[];
BEGIN
  SELECT array_agg(c.relname::text ORDER BY c.relname)
    INTO still_here
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('canonical_products', 'item_aliases');

  IF still_here IS NOT NULL THEN
    RAISE EXCEPTION
      'assertion 1: these were retired by US-799 but still exist: %', still_here;
  END IF;
  RAISE NOTICE 'assertion 1 ok (canonical_products and item_aliases are gone; EXPECTED gone)';
END $$;

-- ---------------------------------------------------------------------------
-- 2. rpc_merge_items exists and its body no longer names item_aliases.
--
--    Reading prosrc rather than calling it, because a body that still had the
--    UPDATE would only fail on a merge where a duplicate had an alias row --
--    which, with the table gone, is every merge, but the point is to fail on
--    the definition rather than wait for a caller.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  body TEXT;
BEGIN
  SELECT prosrc INTO body
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_merge_items';

  IF body IS NULL THEN
    RAISE EXCEPTION 'assertion 2: rpc_merge_items does not exist';
  END IF;
  IF body LIKE '%item_aliases%' THEN
    RAISE EXCEPTION
      'assertion 2: rpc_merge_items still references item_aliases, which no longer exists';
  END IF;
  RAISE NOTICE 'assertion 2 ok (rpc_merge_items has no item_aliases reference; EXPECTED none)';
END $$;

-- ---------------------------------------------------------------------------
-- 3. A merge still works, and its response has lost only the one counter.
-- ---------------------------------------------------------------------------
insert into public.foods (id, household_id, user_id, name, category, unit, quantity) values
  (:KEEP, :HH, :OWNER, 'Cheddar',        'dairy', 'g', 200),
  (:DUPE, :HH, :OWNER, 'cheddar cheese', 'dairy', 'g', 50);

DO $$
DECLARE
  result JSONB;
  repointed JSONB;
  keep_id UUID := 'f0000799-0000-0000-0000-00000000aa01';
  dupe_id UUID := 'f0000799-0000-0000-0000-00000000aa02';
  merged_into UUID;
  survivor_qty NUMERIC;
BEGIN
  result := public.rpc_merge_items(keep_id, ARRAY[dupe_id]);
  repointed := result -> 'repointed';

  IF repointed ? 'item_aliases' THEN
    RAISE EXCEPTION
      'assertion 3: the response still carries repointed.item_aliases: %', repointed;
  END IF;

  -- The counters that remain, so "no item_aliases key" cannot pass by the
  -- whole object having gone missing.
  IF NOT (repointed ? 'recipe_ingredients'
      AND repointed ? 'plan_entries'
      AND repointed ? 'grocery_items'
      AND repointed ? 'kid_food_ladder'
      AND repointed ? 'kid_food_ladder_merged'
      AND repointed ? 'recipes_food_ids') THEN
    RAISE EXCEPTION 'assertion 3: the response lost more than item_aliases: %', repointed;
  END IF;

  IF (result ->> 'duplicates_merged')::INT <> 1 THEN
    RAISE EXCEPTION 'assertion 3: duplicates_merged is % (EXPECTED 1)',
      result ->> 'duplicates_merged';
  END IF;

  SELECT merged_into_id INTO merged_into FROM public.foods WHERE id = dupe_id;
  IF merged_into IS DISTINCT FROM keep_id THEN
    RAISE EXCEPTION 'assertion 3: the duplicate points at % (EXPECTED %)', merged_into, keep_id;
  END IF;

  SELECT quantity INTO survivor_qty FROM public.foods WHERE id = keep_id;
  IF survivor_qty <> 250 THEN
    RAISE EXCEPTION 'assertion 3: survivor quantity is % (EXPECTED 250)', survivor_qty;
  END IF;

  RAISE NOTICE 'assertion 3 ok (merge repointed, stock rolled up 200+50=250, no item_aliases key)';
END $$;

delete from public.inventory_movements where household_id = :HH;
delete from public.item_stock where item_id in (:KEEP, :DUPE);
delete from public.foods where id in (:KEEP, :DUPE);
delete from public.households where id = :HH;

SELECT 'us799_catalog_retirement: all assertions passed' AS result;
