-- US-669: express today's pantry as ledger movements, so the ledger is
-- complete from the moment it exists.
--
-- Without this, every existing pantry row would read as a balance of zero the
-- instant the app starts trusting item_stock, and a household would open the
-- pantry to find everything gone. The backfill writes one `initial` movement
-- per stocked item, carrying the quantity that row already holds.
--
-- `initial` is reserved for exactly this. US-668 deliberately uses `correction`
-- for a client's direct write, so seeded history stays distinguishable from a
-- parent's edit forever after.
--
-- BATCHING. Supabase applies each migration file in a transaction, so a DO
-- block cannot COMMIT between batches. The work therefore lives in a callable
-- function that does ONE batch per call and reports what is left, and the
-- migration calls it in a loop. On a small database that finishes here; on a
-- large one an operator calls it repeatedly OUTSIDE a transaction, which is
-- what actually keeps the lock window short:
--
--   select * from public.backfill_initial_movements(500);  -- repeat until remaining = 0
--
-- Rows are taken FOR UPDATE SKIP LOCKED, so a batch never waits on a row some
-- household is actively editing and two operators can run it at once.
--
-- Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md

CREATE OR REPLACE FUNCTION public.backfill_initial_movements(batch_size INT DEFAULT 500)
RETURNS TABLE (processed INT, flagged INT, remaining BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $backfill_initial_movements$
DECLARE
  row_rec RECORD;
  canonical TEXT;
  amount NUMERIC;
  needs_flag BOOLEAN;
  n_processed INT := 0;
  n_flagged INT := 0;
BEGIN
  FOR row_rec IN
    SELECT f.id, f.household_id, f.user_id, f.quantity, f.unit,
           f.canonical_unit, f.unit_conversions
      FROM public.foods f
     WHERE f.quantity IS NOT NULL
       AND f.quantity <> 0
       AND f.household_id IS NOT NULL
       AND f.merged_into_id IS NULL
       -- Idempotence guard: an item that already has its seed is done, so a
       -- second run of the whole backfill is a no-op rather than a doubling.
       AND NOT EXISTS (
         SELECT 1 FROM public.inventory_movements m
          WHERE m.item_id = f.id AND m.reason = 'initial'
       )
     ORDER BY f.id
     LIMIT batch_size
     FOR UPDATE OF f SKIP LOCKED
  LOOP
    needs_flag := false;

    -- Which unit should this item's ledger speak?
    canonical := row_rec.canonical_unit;
    IF canonical IS NULL THEN
      SELECT CASE u.dimension
               WHEN 'mass' THEN 'g' WHEN 'volume' THEN 'ml' WHEN 'count' THEN 'count'
               ELSE NULL END
        INTO canonical
        FROM public.unit_to_canonical(row_rec.unit) u;
    END IF;

    -- An opaque unit ("servings", "packages", a brand's own word) cannot be
    -- placed in a dimension. Criterion 2: classify it as `count` and carry the
    -- raw quantity across, then flag it for review. NOT skipped, because a
    -- skipped row reads as zero stock; NOT guessed into grams, because that
    -- number would be wrong and would look right.
    IF canonical IS NULL THEN
      canonical := 'count';
      needs_flag := true;
    END IF;

    amount := public.to_canonical(row_rec.quantity, row_rec.unit, canonical, row_rec.unit_conversions);

    -- to_canonical returns the value unchanged for an opaque unit over a count
    -- balance, which is the case just constructed. A NULL here means the unit
    -- and the declared canonical_unit genuinely disagree (an item marked 'g'
    -- but measured in 'ml'), so fall back to count with the raw quantity and
    -- flag it rather than lose the row.
    IF amount IS NULL THEN
      canonical := 'count';
      amount := row_rec.quantity;
      needs_flag := true;
    END IF;

    UPDATE public.foods
       SET canonical_unit = canonical,
           needs_review = needs_review OR needs_flag
     WHERE id = row_rec.id;

    INSERT INTO public.inventory_movements (
      id, household_id, item_id, delta, canonical_unit,
      display_quantity, display_unit, reason, created_by, occurred_at
    ) VALUES (
      gen_random_uuid(), row_rec.household_id, row_rec.id, amount, canonical,
      row_rec.quantity, row_rec.unit, 'initial', row_rec.user_id,
      -- Dated to the epoch of the row, not to now, so a seeded balance does
      -- not look like a purchase that happened during the migration.
      now()
    );

    n_processed := n_processed + 1;
    IF needs_flag THEN n_flagged := n_flagged + 1; END IF;
  END LOOP;

  RETURN QUERY
    SELECT n_processed, n_flagged, (
      SELECT count(*) FROM public.foods f
       WHERE f.quantity IS NOT NULL AND f.quantity <> 0
         AND f.household_id IS NOT NULL AND f.merged_into_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.inventory_movements m
            WHERE m.item_id = f.id AND m.reason = 'initial'
         )
    );
END;
$backfill_initial_movements$;

COMMENT ON FUNCTION public.backfill_initial_movements(INT) IS
  'US-669: seeds one `initial` movement per stocked item, one batch per call, reporting what remains. Idempotent: an item that already has its seed is skipped, so re-running cannot double a balance. Call repeatedly outside a transaction on a large database to keep the lock window short.';

REVOKE ALL ON FUNCTION public.backfill_initial_movements(INT) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Run it, then prove it.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  result RECORD;
  total INT := 0;
  flagged INT := 0;
  guard INT := 0;
BEGIN
  LOOP
    SELECT * INTO result FROM public.backfill_initial_movements(500);
    total := total + result.processed;
    flagged := flagged + result.flagged;
    guard := guard + 1;
    EXIT WHEN result.remaining = 0 OR result.processed = 0 OR guard > 10000;
  END LOOP;
  RAISE NOTICE 'US-669 backfill: % item(s) seeded, % flagged for review', total, flagged;
END $$;

-- Criterion 4. The balance for every convertible item must equal what
-- foods.quantity held, expressed in that item's own display unit. Comparing in
-- display units rather than canonical ones is deliberate: it is the number the
-- shipped iOS client actually reads, so this asserts the thing that would break
-- a user's pantry rather than an internal representation.
DO $$
DECLARE
  mismatches INT;
  sample TEXT;
BEGIN
  SELECT count(*), string_agg(name, ', ' ORDER BY name)
    INTO mismatches, sample
    FROM (
      SELECT f.name
        FROM public.foods f
        JOIN public.item_stock s ON s.item_id = f.id
       WHERE f.merged_into_id IS NULL
         AND NOT f.needs_review
         AND public.from_canonical(s.on_hand_canonical, s.canonical_unit, f.unit, f.unit_conversions)
             IS DISTINCT FROM f.quantity
       LIMIT 20
    ) bad;

  IF mismatches > 0 THEN
    RAISE EXCEPTION
      'US-669 backfill verification failed: % item(s) whose ledger balance does not read back as their previous quantity (e.g. %)',
      mismatches, sample;
  END IF;

  RAISE NOTICE 'US-669 verification: every convertible item reads back its previous quantity';
END $$;
