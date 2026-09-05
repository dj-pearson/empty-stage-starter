-- US-784: catch a direct item_stock write the night it happens.
--
-- item_stock.on_hand_canonical is maintained by a trigger that folds each
-- appended inventory_movements row (migration 20260901000002). The invariant is
--
--   item_stock.on_hand_canonical == sum(inventory_movements.delta)  -- per item
--
-- and it holds only for as long as nothing writes item_stock directly. Client
-- roles have INSERT/UPDATE/DELETE revoked and no policy to satisfy, so the
-- realistic breakers are a service-role script, a psql session, a future
-- migration, or the trigger being dropped. All four are silent: the pantry
-- simply starts showing a number nobody can explain, and the ledger's whole
-- promise ("why does it say I have 3?") is gone with no error anywhere.
--
-- rpc_reconcile_item_stock(uuid) already answers this FOR ONE HOUSEHOLD and is
-- granted to authenticated. A nightly sweep cannot take a household argument,
-- and must not be reachable by a client -- it would report on every household
-- in the system. Hence a separate, unexported function here rather than a
-- change to that one.
--
-- The design doc requiring this: docs/superpowers/specs/2026-08-31-unified-
-- kitchen-loop-design.md, Failure section.
--
-- NOTE ON THE STORY. Its AC says "compares item_stock.quantity". There is no
-- such column; the balance is on_hand_canonical, and quantity lives on foods.
-- Written against the schema, not the AC.

-- ---------------------------------------------------------------------------
-- admin_alerts must accept the new alert type
-- ---------------------------------------------------------------------------
--
-- admin_alerts is declared TWICE: 20251013120000_admin_live_activity.sql with a
-- CHECK pinning alert_type to eight values, and 20251220000000_admin_tables.sql
-- with alert_type as free text. Both are CREATE TABLE IF NOT EXISTS, so the
-- EARLIER one wins and the constrained shape is what is live -- verified by
-- applying both in order and watching an INSERT of 'ledger_drift' fail with
-- admin_alerts_alert_type_check.
--
-- Without this the nightly job would raise every night and the drift it exists
-- to report would go unreported, which is the exact failure mode being guarded
-- against. Widening a CHECK is safe; it is tightening one that breaks old
-- clients.
--
-- Written to tolerate either shape: if the constraint is absent (the free-text
-- table won) this is a no-op.
DO $widen$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT con.conname INTO v_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'admin_alerts'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%alert_type%';

  IF v_constraint IS NULL THEN
    RAISE NOTICE 'admin_alerts has no alert_type CHECK; nothing to widen';
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.admin_alerts DROP CONSTRAINT %I', v_constraint);
  ALTER TABLE public.admin_alerts
    ADD CONSTRAINT admin_alerts_alert_type_check
    CHECK (alert_type IN (
      'error_spike', 'signup_drop', 'high_api_cost', 'payment_failure',
      'abuse_detection', 'server_downtime', 'low_activity', 'feature_adoption',
      'ledger_drift'
    ));
END
$widen$;

-- ---------------------------------------------------------------------------
-- the sweep
-- ---------------------------------------------------------------------------
--
-- Same FULL OUTER JOIN as rpc_reconcile_item_stock, for the same three kinds of
-- disagreement: a stock row whose total is wrong, a stock row with no movements
-- behind it, and movements with no stock row (the trigger bypassed or dropped).
-- Across every household, plus the last movement's fingerprint so an alert can
-- name where the writing came from.
CREATE OR REPLACE FUNCTION public.detect_item_stock_drift()
RETURNS TABLE (
  household_id UUID,
  item_id UUID,
  stored NUMERIC,
  ledger NUMERIC,
  drift NUMERIC,
  last_movement_at TIMESTAMPTZ,
  last_movement_reason TEXT,
  last_movement_ref_type TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $detect_item_stock_drift$
  SELECT
    COALESCE(s.household_id, m.household_id) AS household_id,
    COALESCE(s.item_id, m.item_id)           AS item_id,
    COALESCE(s.on_hand_canonical, 0)         AS stored,
    COALESCE(m.total, 0)                     AS ledger,
    COALESCE(s.on_hand_canonical, 0) - COALESCE(m.total, 0) AS drift,
    m.last_at, m.last_reason, m.last_ref_type
  FROM (
    SELECT item_id, household_id, on_hand_canonical FROM public.item_stock
  ) s
  FULL OUTER JOIN (
    SELECT
      item_id,
      -- One item's movements are all one household's (item_id is the PK of
      -- item_stock and movements reference the same food), so this picks the
      -- single value present rather than collapsing a real group. array_agg
      -- rather than min() because Postgres has no min(uuid).
      (array_agg(household_id))[1] AS household_id,
      sum(delta)        AS total,
      max(occurred_at)  AS last_at,
      -- The reason/ref_type OF the newest movement, not the max of each column
      -- independently, which would invent a combination that never happened.
      (array_agg(reason    ORDER BY occurred_at DESC, id DESC))[1] AS last_reason,
      (array_agg(ref_type  ORDER BY occurred_at DESC, id DESC))[1] AS last_ref_type
    FROM public.inventory_movements
    GROUP BY item_id
  ) m ON m.item_id = s.item_id
  WHERE COALESCE(s.on_hand_canonical, 0) IS DISTINCT FROM COALESCE(m.total, 0);
$detect_item_stock_drift$;

COMMENT ON FUNCTION public.detect_item_stock_drift() IS
  'US-784: every item whose maintained balance disagrees with its ledger, across all households, with the last movement''s timestamp/reason/ref_type so an alert can name the writing path. An empty result is the invariant holding. Not granted to clients -- it reports on every household; the per-household equivalent is rpc_reconcile_item_stock(uuid).';

-- Reports on every household, so it is never a client's to call. The nightly
-- job reaches it as the cron owner.
REVOKE ALL ON FUNCTION public.detect_item_stock_drift() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- the nightly job
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_item_stock_drift()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $record_item_stock_drift$
DECLARE
  v_items    INTEGER;
  v_house    INTEGER;
  v_worst    NUMERIC;
  v_paths    TEXT;
  v_sample   JSONB;
  v_existing UUID;
BEGIN
  SELECT count(*), count(DISTINCT household_id), max(abs(drift))
    INTO v_items, v_house, v_worst
  FROM public.detect_item_stock_drift();

  IF v_items = 0 THEN
    -- The invariant holds. Close yesterday's alert rather than leaving a
    -- resolved problem sitting unread on the dashboard forever.
    UPDATE public.admin_alerts
       SET is_resolved = TRUE, resolved_at = now()
     WHERE alert_type = 'ledger_drift' AND is_resolved = FALSE;
    RETURN 0;
  END IF;

  -- Name the writing path where the ledger knows it. NULL ref_type is a
  -- movement with no recorded source, which is itself worth seeing.
  SELECT string_agg(DISTINCT COALESCE(last_movement_ref_type, 'unknown-source'), ', ')
    INTO v_paths
  FROM public.detect_item_stock_drift();

  -- A bounded sample: enough to start debugging from the alert itself, not so
  -- much that a systemic break writes a megabyte of JSON into the dashboard.
  SELECT jsonb_agg(to_jsonb(d)) INTO v_sample
  FROM (
    SELECT * FROM public.detect_item_stock_drift()
    ORDER BY abs(drift) DESC
    LIMIT 20
  ) d;

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
           message    = format(
             '%s item(s) across %s household(s) disagree with the ledger. Largest drift %s. Last movement source(s): %s.',
             v_items, v_house, v_worst, COALESCE(v_paths, 'none')),
           alert_data = jsonb_build_object(
             'item_count', v_items, 'household_count', v_house,
             'max_abs_drift', v_worst, 'last_movement_sources', v_paths,
             'sample', COALESCE(v_sample, '[]'::jsonb),
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
      format(
        '%s item(s) across %s household(s) disagree with the ledger. Largest drift %s. Last movement source(s): %s.',
        v_items, v_house, v_worst, COALESCE(v_paths, 'none')),
      jsonb_build_object(
        'item_count', v_items, 'household_count', v_house,
        'max_abs_drift', v_worst, 'last_movement_sources', v_paths,
        'sample', COALESCE(v_sample, '[]'::jsonb),
        'checked_at', now())
    );
  END IF;

  RETURN v_items;
END
$record_item_stock_drift$;

COMMENT ON FUNCTION public.record_item_stock_drift() IS
  'US-784: runs detect_item_stock_drift() and folds the result into ONE unresolved admin_alerts row of type ledger_drift (updated, not duplicated, night after night), resolving it when the drift clears. Returns the drifting item count.';

REVOKE ALL ON FUNCTION public.record_item_stock_drift() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- the schedule
-- ---------------------------------------------------------------------------
-- 03:15 UTC: after the nightly traffic trough, offset off the hour so it does
-- not contend with every other :00 job. Same guarded, re-runnable shape as
-- 20260709000002_agent_dispatcher_cron.sql.
DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('ledger-drift-nightly');
    EXCEPTION WHEN OTHERS THEN
      NULL; -- not previously scheduled
    END;

    PERFORM cron.schedule(
      'ledger-drift-nightly',
      '15 3 * * *',
      $cron$ SELECT public.record_item_stock_drift(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed; ledger-drift-nightly schedule not created. Run public.record_item_stock_drift() from a scheduler of your choice.';
  END IF;
END
$schedule$;
