-- US-671 follow-up: let the ledger tables actually reach the client.
--
-- InventoryContext subscribes to postgres_changes on inventory_movements and
-- item_stock. A subscription to a table that is not in the supabase_realtime
-- publication is not an error: it succeeds, and then nothing ever arrives. The
-- pantry would simply never update from a second device, with no failure
-- anywhere to notice.
--
-- Only admin_alerts (20251220000000) has ever declared this in a migration, so
-- for every other table the publication has been managed out of band, in the
-- dashboard. That works right up until an environment is rebuilt from
-- migrations alone, which is exactly the position these tables are in: they
-- exist in no environment yet, so nobody has clicked anything for them.
--
-- Written to be safe under every shape the publication can already have,
-- because it is not this migration's business to know which:
--   - no publication at all      -> nothing to do, say so and move on
--   - FOR ALL TABLES             -> already covered, adding would error
--   - an explicit table list     -> add each table that is missing
--
-- A plain `ALTER PUBLICATION ... ADD TABLE` would fail the whole migration in
-- the first two cases, and re-running it would fail in the third.

DO $$
DECLARE
  all_tables BOOLEAN;
BEGIN
  SELECT puballtables INTO all_tables
    FROM pg_publication
   WHERE pubname = 'supabase_realtime';

  IF NOT FOUND THEN
    RAISE NOTICE 'US-671: no supabase_realtime publication in this database; skipping';
    RETURN;
  END IF;

  IF all_tables THEN
    RAISE NOTICE 'US-671: supabase_realtime is FOR ALL TABLES; the ledger tables are already published';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication p
      JOIN pg_publication_rel pr ON pr.prpubid = p.oid
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE p.pubname = 'supabase_realtime'
       AND n.nspname = 'public'
       AND c.relname = 'inventory_movements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_movements;
    RAISE NOTICE 'US-671: added public.inventory_movements to supabase_realtime';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication p
      JOIN pg_publication_rel pr ON pr.prpubid = p.oid
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE p.pubname = 'supabase_realtime'
       AND n.nspname = 'public'
       AND c.relname = 'item_stock'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.item_stock;
    RAISE NOTICE 'US-671: added public.item_stock to supabase_realtime';
  END IF;
END $$;

-- A NOTE ON DELETE EVENTS, deliberately left as it is.
--
-- Both client channels filter on `household_id=eq.<id>`. Under the default
-- replica identity a DELETE payload carries only the primary key, so it has no
-- household_id for that filter to match and the event is dropped server-side.
--
-- For inventory_movements this cannot arise: DELETE is revoked and no policy
-- grants it, so history is never deleted.
--
-- For item_stock it can, via ON DELETE CASCADE when a food is removed. The
-- consequence is bounded and cosmetic: the client keeps a stock row for an item
-- that is no longer in its foods slice until the next load, where the
-- server-authoritative fetch drops it. It renders nothing (the food is gone)
-- and shows up in the US-671 comparison as `orphan_stock`, which is the honest
-- description of what it is.
--
-- REPLICA IDENTITY FULL would fix it, and is not set here on purpose: it makes
-- every UPDATE log the entire old row, and item_stock is written by a trigger
-- on every single movement. That is a production WAL-volume decision, not a
-- side effect this migration should smuggle in.
