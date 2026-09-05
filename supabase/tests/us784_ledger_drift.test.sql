-- US-784 test suite: a direct item_stock write is caught the night it happens.
--
-- item_stock.on_hand_canonical is trigger-maintained from inventory_movements,
-- so the invariant is, per item:
--
--   item_stock.on_hand_canonical == sum(inventory_movements.delta)
--
-- It holds only while nothing writes item_stock directly. Client roles have the
-- write verbs revoked and no policy to satisfy, so the realistic breakers are a
-- service-role script, a psql session, a future migration, or the trigger being
-- dropped -- all of them silent. This suite writes stock directly as the table
-- owner, which is exactly what those breakers do, and asserts the drift
-- surfaces in an alert an operator will actually see.
--
-- HOW TO RUN. There is no SQL test runner in this repo (vitest only collects
-- src/**), so this is run by hand against a throwaway database, never against
-- production. A local postgres 16 works as well as a container:
--
--   docker run -d --name pgtest -e POSTGRES_PASSWORD=scratch -p 55432:5432 postgres:16-alpine
--   export P="psql -h localhost -p 55432 -U postgres -v ON_ERROR_STOP=1 -q"
--   $P -f supabase/tests/us784_ledger_drift.bootstrap.sql
--   $P -f supabase/migrations/20260901000001_kitchen_loop_inventory_movements.sql
--   $P -f supabase/migrations/20260901000002_kitchen_loop_item_stock.sql
--   $P -f supabase/migrations/20260905000000_ledger_drift_nightly_check.sql
--   $P -f supabase/tests/us784_ledger_drift.test.sql
--   docker rm -f pgtest
--
-- RUN IT WITHOUT 20260905000000 TOO: the cases error on a missing function
-- there, and CASE 6 fails on the admin_alerts CHECK, which is the point.
--
-- Every check prints EXPECTED alongside the value.

\pset format unaligned
\pset tuples_only on

-- ---------------------------------------------------------------- fixtures --
TRUNCATE public.inventory_movements, public.item_stock, public.admin_alerts CASCADE;
DELETE FROM public.foods;
DELETE FROM auth.users;

INSERT INTO auth.users (id) VALUES ('aaaa0000-0000-0000-0000-000000000001');
INSERT INTO public.foods (id, household_id, name) VALUES
  ('f00d0000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'chicken breast'),
  ('f00d0000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'milk'),
  ('f00d0000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'rice');

-- Honest movements. The trigger folds these into item_stock, so the invariant
-- holds until something below breaks it deliberately.
INSERT INTO public.inventory_movements
  (id, household_id, item_id, delta, canonical_unit, reason, ref_type, occurred_at, created_by) VALUES
  ('40000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'f00d0000-0000-0000-0000-000000000001',  6, 'count', 'purchase', 'grocery_item', now() - interval '3 days', 'aaaa0000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'f00d0000-0000-0000-0000-000000000001', -2, 'count', 'cook',     'meal',         now() - interval '1 day',  'aaaa0000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'f00d0000-0000-0000-0000-000000000002', 2000, 'ml', 'purchase', 'receipt',      now() - interval '2 days', 'aaaa0000-0000-0000-0000-000000000001'),
  -- ref_type NULL on purpose: a movement with no recorded source is itself
  -- worth seeing in an alert, and it is the only way the 'unknown-source'
  -- branch of the summary gets exercised.
  ('40000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'f00d0000-0000-0000-0000-000000000003', 1000, 'g',  'purchase', NULL, now() - interval '5 days', 'aaaa0000-0000-0000-0000-000000000001');

SELECT '';
SELECT '=== CASE 0: the fixtures actually landed ===';
-- Not ceremony. An earlier run of this suite used 'house000-...' as a household
-- id; 'h', 's' and 'u' are not hex, every fixture INSERT failed, and CASE 1 and
-- CASE 2 then reported "0 EXPECTED 0" against three empty tables. A drift check
-- that passes because there is no data is the same lie as a gate that never
-- runs, so assert the setup before trusting anything below it.
SELECT '  foods / movements / stock rows = '
    || (SELECT count(*) FROM public.foods)::TEXT || ' / '
    || (SELECT count(*) FROM public.inventory_movements)::TEXT || ' / '
    || (SELECT count(*) FROM public.item_stock)::TEXT
    || '   EXPECTED 3 / 4 / 3';

SELECT '';
SELECT '=== CASE 1: with only honest movements, nothing drifts ===';
SELECT '  drifting items = ' || (SELECT count(*) FROM public.detect_item_stock_drift())::TEXT
    || '   EXPECTED 0';
SELECT '  chicken stock  = ' || (SELECT on_hand_canonical FROM public.item_stock WHERE item_id = 'f00d0000-0000-0000-0000-000000000001')::TEXT
    || '   EXPECTED 4 (6 bought, 2 cooked)';

SELECT '';
SELECT '=== CASE 2: a clean night resolves nothing and alerts nothing ===';
SELECT '  record_item_stock_drift() = ' || public.record_item_stock_drift()::TEXT || '   EXPECTED 0';
SELECT '  ledger_drift alerts       = ' || (SELECT count(*) FROM public.admin_alerts WHERE alert_type = 'ledger_drift')::TEXT
    || '   EXPECTED 0';

SELECT '';
SELECT '=== CASE 3: THE ACCEPTANCE CRITERION -- a direct item_stock write ===';
-- Exactly what a service-role script or a stray psql session does. No movement
-- is appended, so the ledger still says 4 while stock claims 99.
UPDATE public.item_stock
   SET on_hand_canonical = 99
 WHERE item_id = 'f00d0000-0000-0000-0000-000000000001';
SELECT '  drifting items = ' || (SELECT count(*) FROM public.detect_item_stock_drift())::TEXT || '   EXPECTED 1';
SELECT '  stored/ledger/drift = ' || stored || ' / ' || ledger || ' / ' || drift
    || '   EXPECTED 99 / 4 / 95'
FROM public.detect_item_stock_drift();
SELECT '  writing path named  = ' || COALESCE(last_movement_reason, 'NULL') || ' / ' || COALESCE(last_movement_ref_type, 'NULL')
    || '   EXPECTED cook / meal (the newest movement, not a mix of columns)'
FROM public.detect_item_stock_drift();

SELECT '';
SELECT '=== CASE 4: stock with no movements behind it at all ===';
INSERT INTO public.item_stock (item_id, household_id, on_hand_canonical, canonical_unit)
VALUES ('f00d0000-0000-0000-0000-000000000003'::UUID, 'b0000000-0000-0000-0000-000000000002', 7, 'g')
ON CONFLICT (item_id) DO UPDATE SET on_hand_canonical = 7;
SELECT '  rice stored/ledger = ' || stored || ' / ' || ledger || '   EXPECTED 7 / 1000'
FROM public.detect_item_stock_drift() WHERE item_id = 'f00d0000-0000-0000-0000-000000000003';

SELECT '';
SELECT '=== CASE 5: movements with NO stock row (the trigger dropped/bypassed) ===';
DELETE FROM public.item_stock WHERE item_id = 'f00d0000-0000-0000-0000-000000000002';
SELECT '  milk stored/ledger = ' || stored || ' / ' || ledger || '   EXPECTED 0 / 2000'
FROM public.detect_item_stock_drift() WHERE item_id = 'f00d0000-0000-0000-0000-000000000002';
SELECT '  households flagged = ' || (SELECT count(DISTINCT household_id) FROM public.detect_item_stock_drift())::TEXT
    || '   EXPECTED 2';

SELECT '';
SELECT '=== CASE 6: the nightly job writes an alert that SURVIVES THE CHECK ===';
-- admin_alerts is declared twice; the earlier declaration constrains alert_type
-- to eight values and wins, so an un-widened CHECK makes this raise every night
-- and the drift goes unreported. That is the failure this case exists to catch.
SELECT '  record_item_stock_drift() = ' || public.record_item_stock_drift()::TEXT || '   EXPECTED 3';
SELECT '  open ledger_drift alerts  = ' || (SELECT count(*) FROM public.admin_alerts WHERE alert_type = 'ledger_drift' AND is_resolved = FALSE)::TEXT
    || '   EXPECTED 1';
SELECT '  severity / item_count     = ' || severity || ' / ' || (alert_data->>'item_count')
    || '   EXPECTED high / 3'
FROM public.admin_alerts WHERE alert_type = 'ledger_drift';
SELECT '  households in alert       = ' || (alert_data->>'household_count') || '   EXPECTED 2'
FROM public.admin_alerts WHERE alert_type = 'ledger_drift';
SELECT '  sources named             = ' || (alert_data->>'last_movement_sources')
    || '   EXPECTED meal, receipt, unknown-source (alphabetical; rice has a NULL ref_type)'
FROM public.admin_alerts WHERE alert_type = 'ledger_drift';
SELECT '  sample rows attached      = ' || jsonb_array_length(alert_data->'sample')::TEXT || '   EXPECTED 3'
FROM public.admin_alerts WHERE alert_type = 'ledger_drift';

SELECT '';
SELECT '=== CASE 7: a second night UPDATES the alert, it does not stack ===';
SELECT '  run again -> ' || public.record_item_stock_drift()::TEXT || '   EXPECTED 3';
SELECT '  total ledger_drift rows = ' || (SELECT count(*) FROM public.admin_alerts WHERE alert_type = 'ledger_drift')::TEXT
    || '   EXPECTED 1 (30 nights of one unfixed drift is ONE dashboard item)';

SELECT '';
SELECT '=== CASE 8: fixing the drift resolves the alert ===';
-- Put every item back in agreement with its ledger, the way a correcting
-- movement or a repair script would.
UPDATE public.item_stock SET on_hand_canonical = 4 WHERE item_id = 'f00d0000-0000-0000-0000-000000000001';
UPDATE public.item_stock SET on_hand_canonical = 1000 WHERE item_id = 'f00d0000-0000-0000-0000-000000000003';
INSERT INTO public.item_stock (item_id, household_id, on_hand_canonical, canonical_unit)
VALUES ('f00d0000-0000-0000-0000-000000000002'::UUID, 'b0000000-0000-0000-0000-000000000001', 2000, 'ml');
SELECT '  drifting items = ' || (SELECT count(*) FROM public.detect_item_stock_drift())::TEXT || '   EXPECTED 0';
SELECT '  run -> ' || public.record_item_stock_drift()::TEXT || '   EXPECTED 0';
SELECT '  open ledger_drift alerts = ' || (SELECT count(*) FROM public.admin_alerts WHERE alert_type = 'ledger_drift' AND is_resolved = FALSE)::TEXT
    || '   EXPECTED 0 (a fixed problem should not sit unread forever)';
SELECT '  resolved_at set          = ' || (SELECT (resolved_at IS NOT NULL)::TEXT FROM public.admin_alerts WHERE alert_type = 'ledger_drift')
    || '   EXPECTED true';

SELECT '';
SELECT '=== CASE 9: the sweep is not reachable by a client ===';
-- It reports on every household in the system. rpc_reconcile_item_stock(uuid)
-- is the per-household one clients may call.
SELECT '  PUBLIC may call detect_item_stock_drift() = '
    || has_function_privilege('public', 'public.detect_item_stock_drift()', 'EXECUTE')::TEXT || '   EXPECTED false';
SELECT '  PUBLIC may call record_item_stock_drift() = '
    || has_function_privilege('public', 'public.record_item_stock_drift()', 'EXECUTE')::TEXT || '   EXPECTED false';
SELECT '  authenticated may call rpc_reconcile_item_stock(uuid) = '
    || has_function_privilege('authenticated', 'public.rpc_reconcile_item_stock(uuid)', 'EXECUTE')::TEXT
    || '   EXPECTED true (unchanged by this migration)';

SELECT '';
SELECT '=== CASE 10: the schedule is installed ===';
-- HONEST LIMIT: pg_cron is not in the stock postgres:16 image, so on a bare
-- container this case SKIPS and the scheduling branch of the migration is
-- unverified here -- only its ELSE branch (the NOTICE) is exercised. Run this
-- suite against a Supabase instance, where pg_cron is present, to actually
-- prove the job was created. The DO block's shape is copied from
-- 20260709000002_agent_dispatcher_cron.sql, which is scheduling in production.
DO $case10$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '  SKIPPED -- pg_cron not installed; scheduling branch unverified here';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ledger-drift-nightly') THEN
    RAISE NOTICE '  ledger-drift-nightly schedule = % (EXPECTED 15 3 * * *)',
      (SELECT schedule FROM cron.job WHERE jobname = 'ledger-drift-nightly');
  ELSE
    RAISE NOTICE '  FAILED -- pg_cron present but ledger-drift-nightly was not scheduled';
  END IF;
END
$case10$;
