-- 5a: watch the number shipped iOS actually reads, then turn ledger writes on.
--
-- 1. detect_foods_quantity_drift(): foods.quantity against the ledger.
--
--    detect_item_stock_drift (US-784) proves item_stock equals the sum of the
--    movements. It could not see the insert bug fixed in 20260928000003,
--    because in that bug the ledger and the balance agree perfectly -- on the
--    wrong number -- and foods.quantity is not in its query at all. The thing
--    a parent on an older iOS build sees is foods.quantity, so that is the
--    thing to compare:
--
--      missing_stock_row  foods.quantity says there is stock and the ledger
--                         has no balance for the item at all (the unseeded
--                         shape, or a seed refused as unconvertible)
--      value_mismatch     a balance exists, converts to the display unit, and
--                         the converted number is not foods.quantity
--
--    The kinds are named as the client's US-671 comparison names them
--    (src/lib/stockComparison.ts), so the server and the web report one
--    vocabulary. A balance the mirror cannot convert (mirror_unconvertible)
--    is left out: rpc_stock_mirror_divergence already reports it, and it
--    needs a per-item conversion, not an alert every night.
--
--    A NEW FUNCTION, not a change to detect_item_stock_drift. That function's
--    columns are canonical stock-vs-ledger numbers (stored, ledger, drift) and
--    a foods comparison is in display units with no "ledger total" to put in
--    them; squeezing both into one shape would make every drift figure in the
--    alert ambiguous, and us784's assertions pin its exact rows. Its signature,
--    shape and grants are untouched.
--
-- 2. record_item_stock_drift() folds both into the one nightly alert. The
--    stock drift half is unchanged; foods rows are added to the item and
--    household counts (by distinct item) and get their own count and sample in
--    alert_data.
--
-- 3. kitchen_loop_ledger_writes on for everyone, now that a food inserted with
--    a quantity has a balance to add deltas to. Same shape as
--    20260926000002_ladder_default_and_plan_attempt_rung.sql: guarded on the
--    table existing, ON CONFLICT DO UPDATE touching enabled and
--    rollout_percentage only.
--
--    KILL SWITCH:
--      UPDATE public.feature_flags SET enabled = false, updated_at = now()
--       WHERE key = 'kitchen_loop_ledger_writes';
--    evaluate_feature_flag then answers false for every user, and the web
--    goes back to writing foods.quantity directly (which US-668 still turns
--    into a correction). It turns off the web's delta writes only; the
--    server-side triggers (US-667 mirror, US-668 translation and the insert
--    seed) keep running either way and are what keep the ledger whole for
--    iOS.
--
-- Additive: two functions changed or created, one flag row. No client reads
-- either function; both stay private (US-804: roles named).

-- ---------------------------------------------------------------------------
-- 1. The comparison
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.detect_foods_quantity_drift()
RETURNS TABLE (
  household_id UUID,
  item_id UUID,
  kind TEXT,
  foods_quantity NUMERIC,
  display_unit TEXT,
  ledger_quantity NUMERIC,
  on_hand_canonical NUMERIC,
  canonical_unit TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $detect_foods_quantity_drift$
  -- Stock the ledger has never heard of. Same candidate rule as the seed and
  -- the repair (quantity set and non-zero, a household, not merged away), so
  -- anything this reports is something seed_food_ledger_balance declined.
  SELECT f.household_id, f.id, 'missing_stock_row'::TEXT,
         f.quantity, f.unit, NULL::NUMERIC, NULL::NUMERIC, NULL::TEXT
    FROM public.foods f
   WHERE f.quantity IS NOT NULL
     AND f.quantity <> 0
     AND f.household_id IS NOT NULL
     AND f.merged_into_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.item_stock s WHERE s.item_id = f.id)

  UNION ALL

  -- A balance that reads back as a different number than the one the old
  -- client is shown. NULL foods.quantity against a zero balance is agreement
  -- (nothing on hand either way), hence the coalesce.
  --
  -- round(), because foods.quantity is an INTEGER column: when the mirror
  -- writes 1.5 kg there, Postgres stores 2, so the number an old client can
  -- ever be shown is the rounded one. Comparing against the unrounded value
  -- would report every fractional balance as drift every night. If the column
  -- is ever widened to NUMERIC, drop the round().
  SELECT s.household_id, s.item_id, 'value_mismatch'::TEXT,
         f.quantity, f.unit, c.display, s.on_hand_canonical, s.canonical_unit
    FROM public.item_stock s
    JOIN public.foods f ON f.id = s.item_id
   CROSS JOIN LATERAL (
     SELECT public.from_canonical(s.on_hand_canonical, s.canonical_unit, f.unit, f.unit_conversions) AS display
   ) c
   WHERE NOT s.mirror_unconvertible
     AND c.display IS NOT NULL
     AND coalesce(f.quantity, 0) <> round(c.display);
$detect_foods_quantity_drift$;

COMMENT ON FUNCTION public.detect_foods_quantity_drift() IS
  '5a: every item whose foods.quantity (what shipped iOS builds read) disagrees with its ledger balance, across all households. kind is missing_stock_row (quantity but no balance at all) or value_mismatch (balance converts to a different number). Mirror-unconvertible items are excluded; rpc_stock_mirror_divergence reports those. Private: it reports on every household.';

REVOKE ALL ON FUNCTION public.detect_foods_quantity_drift() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The nightly job, now covering both
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_item_stock_drift()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $record_item_stock_drift$
DECLARE
  v_items        INTEGER;
  v_house        INTEGER;
  v_worst        NUMERIC;
  v_paths        TEXT;
  v_sample       JSONB;
  v_foods        INTEGER;
  v_foods_sample JSONB;
  v_existing     UUID;
  v_message      TEXT;
BEGIN
  -- An item in both lists is one item on the dashboard, not two.
  SELECT count(DISTINCT u.item_id), count(DISTINCT u.household_id)
    INTO v_items, v_house
    FROM (
      SELECT d.item_id, d.household_id FROM public.detect_item_stock_drift() d
      UNION
      SELECT d.item_id, d.household_id FROM public.detect_foods_quantity_drift() d
    ) u;

  SELECT count(*) INTO v_foods FROM public.detect_foods_quantity_drift();

  IF v_items = 0 THEN
    -- The invariant holds. Close yesterday's alert rather than leaving a
    -- resolved problem sitting unread on the dashboard forever.
    UPDATE public.admin_alerts
       SET is_resolved = TRUE, resolved_at = now()
     WHERE alert_type = 'ledger_drift' AND is_resolved = FALSE;
    RETURN 0;
  END IF;

  -- Stock-vs-ledger figures, exactly as US-784 reported them.
  SELECT max(abs(d.drift)) INTO v_worst FROM public.detect_item_stock_drift() d;

  -- Name the writing path where the ledger knows it. NULL ref_type is a
  -- movement with no recorded source, which is itself worth seeing.
  SELECT string_agg(DISTINCT COALESCE(d.last_movement_ref_type, 'unknown-source'), ', ')
    INTO v_paths
    FROM public.detect_item_stock_drift() d;

  -- Bounded samples: enough to start debugging from the alert itself, not so
  -- much that a systemic break writes a megabyte of JSON into the dashboard.
  SELECT jsonb_agg(to_jsonb(d)) INTO v_sample
    FROM (SELECT * FROM public.detect_item_stock_drift() ORDER BY abs(drift) DESC LIMIT 20) d;
  SELECT jsonb_agg(to_jsonb(d)) INTO v_foods_sample
    FROM (SELECT * FROM public.detect_foods_quantity_drift() ORDER BY kind, item_id LIMIT 20) d;

  v_message := format(
    '%s item(s) across %s household(s) disagree with the ledger. Largest drift %s. Last movement source(s): %s.',
    v_items, v_house, COALESCE(v_worst::TEXT, 'n/a'), COALESCE(v_paths, 'none'));
  IF v_foods > 0 THEN
    v_message := v_message || format(
      ' %s item(s) where foods.quantity, the number older iOS builds read, does not match the ledger balance.',
      v_foods);
  END IF;

  -- One open alert, updated, rather than a fresh row every night: 30 nights of
  -- the same unfixed drift should be one item on the dashboard, not 30.
  SELECT id INTO v_existing
    FROM public.admin_alerts
   WHERE alert_type = 'ledger_drift' AND is_resolved = FALSE
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.admin_alerts
       SET severity   = CASE WHEN v_items > 50 THEN 'critical' ELSE 'high' END,
           message    = v_message,
           alert_data = jsonb_build_object(
             'item_count', v_items, 'household_count', v_house,
             'max_abs_drift', v_worst, 'last_movement_sources', v_paths,
             'sample', COALESCE(v_sample, '[]'::jsonb),
             'foods_quantity_count', v_foods,
             'foods_quantity_sample', COALESCE(v_foods_sample, '[]'::jsonb),
             'checked_at', now()),
           is_read    = FALSE,
           updated_at = now()
     WHERE id = v_existing;
  ELSE
    INSERT INTO public.admin_alerts (alert_type, severity, title, message, alert_data)
    VALUES (
      'ledger_drift',
      CASE WHEN v_items > 50 THEN 'critical' ELSE 'high' END,
      'Pantry ledger drift detected',
      v_message,
      jsonb_build_object(
        'item_count', v_items, 'household_count', v_house,
        'max_abs_drift', v_worst, 'last_movement_sources', v_paths,
        'sample', COALESCE(v_sample, '[]'::jsonb),
        'foods_quantity_count', v_foods,
        'foods_quantity_sample', COALESCE(v_foods_sample, '[]'::jsonb),
        'checked_at', now())
    );
  END IF;

  RETURN v_items;
END
$record_item_stock_drift$;

COMMENT ON FUNCTION public.record_item_stock_drift() IS
  'US-784, extended in 5a: runs detect_item_stock_drift() and detect_foods_quantity_drift() and folds both into ONE unresolved admin_alerts row of type ledger_drift (updated, not duplicated, night after night), resolving it when both are clean. Returns the number of distinct drifting items.';

-- CREATE OR REPLACE keeps the existing ACL; restated so this file alone says
-- who may call it.
REVOKE ALL ON FUNCTION public.record_item_stock_drift() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The flag
-- ---------------------------------------------------------------------------

DO $flag$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'feature_flags'
  ) THEN
    INSERT INTO public.feature_flags (key, name, enabled, rollout_percentage, description)
    VALUES (
      'kitchen_loop_ledger_writes',
      'Kitchen loop: ledger writes',
      TRUE,
      100,
      'US-672 / 5a: web pantry edits, top-ups, waste and checkout append inventory_movements instead of writing foods.quantity. Kill switch: set enabled = false and the web returns to direct foods.quantity writes, which the US-668 trigger still records. The server triggers (mirror, direct-write translation, insert seed) run regardless.'
    )
    ON CONFLICT (key) DO UPDATE
      SET enabled = TRUE,
          rollout_percentage = 100,
          updated_at = now();
  ELSE
    RAISE NOTICE 'feature_flags does not exist; kitchen_loop_ledger_writes row not written';
  END IF;
END
$flag$;
