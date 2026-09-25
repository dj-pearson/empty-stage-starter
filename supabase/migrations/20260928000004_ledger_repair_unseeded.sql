-- 5a: seed the foods that were inserted with a quantity and never reached the
-- ledger.
--
-- 20260928000003 stops new ones. This finds the ones already there: every food
-- added with a quantity since the US-669 backfill ran on 2026-09-01 whose
-- quantity nobody has changed since (a change goes through US-668, which
-- creates the balance). Each has foods.quantity and no item_stock row.
--
-- WHY NOT RE-RUN backfill_initial_movements. Its idempotence guard is "no
-- movement with reason = 'initial'". An item that was seeded by the backfill
-- is skipped correctly, but an item whose only history is a US-668
-- `correction` (an iOS build set its quantity from NULL) has no `initial`, so
-- the backfill would append its whole quantity again on top of a balance that
-- already equals it, and the pantry would show double. This repair keys on the
-- thing that is actually missing: the item_stock row.
--
-- WHAT IS SEEDED. Only foods with no item_stock row, with quantity not null
-- and not zero, a household, and not merged away. For each, one `initial`
-- movement for foods.quantity - current balance, which with no stock row is
-- foods.quantity itself. The work is seed_food_ledger_balance (defined in
-- 20260928000003), the same function the insert trigger calls, so the repair
-- and the fix cannot disagree about units or guards.
--
-- WHICH QUANTITY IS THE TRUTH.
--
--   Unseeded rows (no item_stock): foods.quantity. It is the only record that
--   exists, it is what every shipped iOS build and the web have been showing
--   the parent, and no movement contradicts it. The ledger's balance of zero
--   is not a competing claim; it is the absence of one.
--
--   Collapsed rows (a web delta already landed on an unseeded food, so the
--   balance became the delta and the US-667 mirror wrote that over
--   foods.quantity): NOT TOUCHED. By construction foods.quantity and the
--   balance now agree on the collapsed number, so "foods.quantity minus
--   balance" is zero and there is nothing to seed. The quantity the food had
--   before the collapse is recorded nowhere in the database -- not on foods,
--   not in a movement -- so any number this migration put back would be a
--   guess presented as a fact. And after the collapse the parent may already
--   have corrected the count by hand, which is a real observation that a
--   "restore" would silently overwrite. The collapsed rows are counted below
--   and reported in the migration's NOTICE output; the fix for any one of them
--   is a parent recounting it, which lands as an ordinary correction.
--
--   Rows whose stock row exists but whose foods.quantity differs from it: NOT
--   TOUCHED either. That is the mirror declining to convert
--   (item_stock.mirror_unconvertible, already surfaced by
--   rpc_stock_mirror_divergence) or a direct write to item_stock, not a
--   missing seed. detect_foods_quantity_drift (20260928000005) reports both.
--
-- IDEMPOTENT. A seeded row has a stock row afterwards and is no longer a
-- candidate; a row that could not be converted appends nothing and is simply
-- examined again. Running the migration or the function twice changes nothing
-- the second time.
--
-- ONE PASS, NOT BATCHED. The candidates are the foods inserted with a quantity
-- in the weeks since the backfill and never edited since, which is small next
-- to the pantry the backfill had to seed. Rows are still taken FOR UPDATE SKIP
-- LOCKED, so the pass never waits on a row a household is editing; a row it
-- skips is picked up by calling the function again:
--
--   select * from public.repair_unseeded_ledger_items();
--
-- Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md

CREATE OR REPLACE FUNCTION public.repair_unseeded_ledger_items()
RETURNS TABLE (seeded INT, unconvertible INT, remaining BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $repair_unseeded_ledger_items$
DECLARE
  row_rec RECORD;
  outcome TEXT;
  n_seeded INT := 0;
  n_unconvertible INT := 0;
BEGIN
  FOR row_rec IN
    SELECT f.id
      FROM public.foods f
     WHERE f.quantity IS NOT NULL
       AND f.quantity <> 0
       AND f.household_id IS NOT NULL
       AND f.merged_into_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.item_stock s WHERE s.item_id = f.id)
     ORDER BY f.id
     FOR UPDATE OF f SKIP LOCKED
  LOOP
    outcome := public.seed_food_ledger_balance(row_rec.id);
    IF outcome = 'seeded' THEN
      n_seeded := n_seeded + 1;
    ELSIF outcome = 'unconvertible' THEN
      n_unconvertible := n_unconvertible + 1;
    END IF;
  END LOOP;

  RETURN QUERY
    SELECT n_seeded, n_unconvertible, (
      SELECT count(*) FROM public.foods f
       WHERE f.quantity IS NOT NULL AND f.quantity <> 0
         AND f.household_id IS NOT NULL AND f.merged_into_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM public.item_stock s WHERE s.item_id = f.id)
    );
END;
$repair_unseeded_ledger_items$;

COMMENT ON FUNCTION public.repair_unseeded_ledger_items() IS
  '5a: seeds an `initial` movement for every food that has a quantity and no item_stock row (inserted with a quantity after the US-669 backfill and never edited). Keys on the missing stock row, not on the absence of an `initial` movement, so an item whose history is a US-668 correction is not doubled. Returns seeded, unconvertible (left alone) and remaining; idempotent. Private.';

REVOKE ALL ON FUNCTION public.repair_unseeded_ledger_items() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Run it, then report what it could not fix.
-- ---------------------------------------------------------------------------

DO $repair$
DECLARE
  result RECORD;
  collapsed BIGINT;
BEGIN
  SELECT * INTO result FROM public.repair_unseeded_ledger_items();
  RAISE NOTICE '5a repair: % item(s) seeded from foods.quantity, % left unseeded (unit cannot be expressed in its canonical unit), % still without a stock row',
    result.seeded, result.unconvertible, result.remaining;

  -- Collapse candidates: items with no `initial` movement whose FIRST movement
  -- is one only a delta-appending client writes. US-668 writes nothing but
  -- `correction`, and its display_quantity is the absolute quantity the client
  -- set, so a first movement that is a purchase/cook/waste/expire, or a
  -- correction with a negative display_quantity, is a web delta that landed on
  -- a food the ledger had never seeded. A positive first web correction looks
  -- exactly like a US-668 write and cannot be told apart, so this count is a
  -- floor, not a census.
  SELECT count(*) INTO collapsed
    FROM (
      SELECT DISTINCT ON (m.item_id) m.item_id, m.reason, m.display_quantity
        FROM public.inventory_movements m
       WHERE NOT EXISTS (
               SELECT 1 FROM public.inventory_movements i
                WHERE i.item_id = m.item_id AND i.reason = 'initial')
       ORDER BY m.item_id, m.occurred_at, m.created_at, m.id
    ) first_movement
   WHERE first_movement.reason IN ('purchase', 'cook', 'waste', 'expire')
      OR (first_movement.reason = 'correction' AND first_movement.display_quantity < 0);

  IF collapsed > 0 THEN
    RAISE NOTICE '5a repair: at least % item(s) look collapsed (a web delta landed before any seed). Not changed: their pre-collapse quantity is recorded nowhere, so a parent recount is the only honest fix.',
      collapsed;
  ELSE
    RAISE NOTICE '5a repair: no collapsed items found';
  END IF;
END
$repair$;
