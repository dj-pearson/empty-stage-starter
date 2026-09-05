-- US-784: read the pantry ledger drift check.
--
-- item_stock.on_hand_canonical is trigger-maintained by folding each appended
-- inventory_movements row, so the invariant is, per item:
--
--   item_stock.on_hand_canonical == sum(inventory_movements.delta)
--
-- It holds only while nothing writes item_stock directly. When it breaks, the
-- pantry starts showing a number nobody can explain and the ledger's whole
-- promise goes with it -- silently, because a direct write raises nothing.
--
-- Read-only. Run against production with a read-only role.
--
-- The nightly job (cron entry 'ledger-drift-nightly', 03:15 UTC) calls
-- record_item_stock_drift(), which folds the same data into one unresolved
-- admin_alerts row of type 'ledger_drift'. These queries are for looking at it
-- by hand, before the alert or after it.

-- 1. Is the invariant holding right now? Empty result = yes.
SELECT * FROM public.detect_item_stock_drift()
ORDER BY abs(drift) DESC;

-- 2. Just the headline, the same numbers the nightly alert carries.
SELECT
  count(*)                    AS drifting_items,
  count(DISTINCT household_id) AS households,
  max(abs(drift))             AS max_abs_drift,
  string_agg(DISTINCT COALESCE(last_movement_ref_type, 'unknown-source'), ', ') AS last_movement_sources
FROM public.detect_item_stock_drift();

-- 3. One household, for a support ticket. This is the client-callable one and
--    is subject to the caller's own access; detect_item_stock_drift() spans
--    every household and is deliberately not granted to anybody.
-- SELECT * FROM public.rpc_reconcile_item_stock('<household-uuid>');

-- 4. The full movement history behind one drifting item -- what the ledger
--    thinks happened, so the missing or extra write can be identified.
-- SELECT occurred_at, delta, reason, ref_type, ref_id, created_by
--   FROM public.inventory_movements
--  WHERE item_id = '<item-uuid>'
--  ORDER BY occurred_at, id;

-- 5. What the nightly job has been saying.
SELECT created_at, updated_at, severity, is_resolved, resolved_at, message,
       alert_data->>'item_count'      AS item_count,
       alert_data->>'household_count' AS household_count,
       alert_data->>'max_abs_drift'   AS max_abs_drift,
       alert_data->'sample'           AS sample
FROM public.admin_alerts
WHERE alert_type = 'ledger_drift'
ORDER BY created_at DESC
LIMIT 10;

-- 6. Is the schedule actually installed? An absent row means the sweep is not
--    running and its silence means nothing.
SELECT jobname, schedule, active, command
FROM cron.job
WHERE jobname = 'ledger-drift-nightly';
