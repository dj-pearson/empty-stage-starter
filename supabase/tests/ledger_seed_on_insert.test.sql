-- 5a test suite: a food inserted with a quantity has a ledger balance, the
-- foods that missed one are repaired, the nightly check sees foods.quantity,
-- and kitchen_loop_ledger_writes is on.
--
-- Covers 20260928000003 (seed on insert, delete cascade), 20260928000004
-- (repair) and 20260928000005 (foods drift, nightly job, flag row).
--
-- Run: bash scripts/dev/local-sql-suite.sh, or against any database built
-- from supabase/migrations. Every check is an ASSERT, so under
-- ON_ERROR_STOP a wrong number fails the run rather than printing.
\set ON_ERROR_STOP on

\set HH '''5a5a0000-0000-0000-0000-000000000001'''
\set OWNER '''5a5a0000-0000-0000-0000-0000000000ff'''

-- Torn down first so a re-run behaves like a first run. The delete cascade
-- this suite tests is also what makes this line work at all.
DELETE FROM public.foods WHERE household_id = :HH;
DELETE FROM public.households WHERE id = :HH;

INSERT INTO public.households (id, name) VALUES (:HH, '5a ledger seed household');

-- ---------------------------------------------------------------------------
-- CASE 1: the reported repro. Yogurt 5 + purchase 2, Crackers 4 corrected to 3.
-- Before 20260928000003 these read back 2 and -1.
-- ---------------------------------------------------------------------------
INSERT INTO public.foods (id, household_id, user_id, name, category, unit, quantity) VALUES
  ('5a5a0000-0000-0000-0000-0000000000a1', :HH, :OWNER, 'Yogurt',   'dairy', 'servings', 5),
  ('5a5a0000-0000-0000-0000-0000000000a2', :HH, :OWNER, 'Crackers', 'snack', 'packages', 4);

-- Exactly the rows the web builds with ledger writes on (movementBuilders:
-- buildAdjustmentMovement for the purchase, buildCorrectionMovement for the
-- edit, whose delta is newQuantity - current).
INSERT INTO public.inventory_movements
  (id, household_id, item_id, delta, canonical_unit, display_quantity, display_unit, reason, created_by)
VALUES
  (gen_random_uuid(), :HH, '5a5a0000-0000-0000-0000-0000000000a1',  2, 'count',  2, 'servings', 'purchase',   :OWNER),
  (gen_random_uuid(), :HH, '5a5a0000-0000-0000-0000-0000000000a2', -1, 'count', -1, 'packages', 'correction', :OWNER);

DO $case1$
DECLARE
  hh       uuid := '5a5a0000-0000-0000-0000-000000000001';
  yogurt   uuid := '5a5a0000-0000-0000-0000-0000000000a1';
  crackers uuid := '5a5a0000-0000-0000-0000-0000000000a2';
  qty numeric; bal numeric; n int; cu text;
BEGIN
  SELECT quantity, canonical_unit INTO qty, cu FROM public.foods WHERE id = yogurt;
  SELECT on_hand_canonical INTO bal FROM public.item_stock WHERE item_id = yogurt;
  ASSERT qty = 7, format('Yogurt 5 + purchase 2 should read 7, got %s', qty);
  ASSERT bal = 7, format('Yogurt balance should be 7, got %s', bal);
  ASSERT cu = 'count', format('the seed should classify Yogurt as count, got %s', cu);

  SELECT quantity INTO qty FROM public.foods WHERE id = crackers;
  SELECT on_hand_canonical INTO bal FROM public.item_stock WHERE item_id = crackers;
  ASSERT qty = 3, format('Crackers 4 corrected to 3 should read 3, got %s', qty);
  ASSERT bal = 3, format('Crackers balance should be 3, got %s', bal);

  SELECT count(*) INTO n FROM public.inventory_movements
   WHERE household_id = hh AND reason = 'initial';
  ASSERT n = 2, format('expected one initial movement per inserted food, got %s', n);

  SELECT count(*) INTO n FROM public.rpc_reconcile_item_stock(hh);
  ASSERT n = 0, format('%s item(s) drifted between ledger and balance', n);

  RAISE NOTICE 'case 1 ok: Yogurt reads 7, Crackers reads 3';
END $case1$;

-- ---------------------------------------------------------------------------
-- CASE 2: the shipped iOS shape. Insert with a quantity (household_id left to
-- auto_fill_household_id would need a session; set explicitly here), then a
-- direct UPDATE of foods.quantity, which US-668 turns into a correction
-- against the seeded balance.
-- ---------------------------------------------------------------------------
INSERT INTO public.foods (id, household_id, user_id, name, category, unit, quantity) VALUES
  ('5a5a0000-0000-0000-0000-0000000000b1', :HH, :OWNER, 'Rice', 'carb', 'kg', 2);
UPDATE public.foods SET quantity = 1 WHERE id = '5a5a0000-0000-0000-0000-0000000000b1';

-- Rows the seed must leave alone.
INSERT INTO public.foods (id, household_id, user_id, name, category, unit, quantity, canonical_unit) VALUES
  ('5a5a0000-0000-0000-0000-0000000000b2', :HH, :OWNER, 'Salt',  'other', 'g',  NULL, NULL),
  ('5a5a0000-0000-0000-0000-0000000000b3', :HH, :OWNER, 'Pepper','other', 'g',  0,    NULL),
  -- Declared ml, measured in g, no bridge: unconvertible, so not seeded.
  ('5a5a0000-0000-0000-0000-0000000000b4', :HH, :OWNER, 'Honey', 'snack', 'g',  250,  'ml');

DO $case2$
DECLARE
  rice   uuid := '5a5a0000-0000-0000-0000-0000000000b1';
  honey  uuid := '5a5a0000-0000-0000-0000-0000000000b4';
  qty numeric; bal numeric; n int; cu text;
BEGIN
  SELECT quantity, canonical_unit INTO qty, cu FROM public.foods WHERE id = rice;
  SELECT on_hand_canonical INTO bal FROM public.item_stock WHERE item_id = rice;
  ASSERT qty = 1, format('iOS set Rice to 1 kg and should read it back, got %s', qty);
  ASSERT bal = 1000, format('Rice balance should be 1000 g, got %s', bal);
  ASSERT cu = 'g', format('the seed should classify kg as g, got %s', cu);

  SELECT count(*) INTO n FROM public.inventory_movements WHERE item_id = rice AND reason = 'initial' AND delta = 2000;
  ASSERT n = 1, format('Rice should have one 2000 g initial movement, got %s', n);
  SELECT count(*) INTO n FROM public.inventory_movements WHERE item_id = rice AND reason = 'correction' AND delta = -1000;
  ASSERT n = 1, format('the iOS edit should be one -1000 g correction, got %s', n);

  SELECT count(*) INTO n FROM public.inventory_movements
   WHERE item_id IN ('5a5a0000-0000-0000-0000-0000000000b2', '5a5a0000-0000-0000-0000-0000000000b3', honey);
  ASSERT n = 0, format('NULL, zero and unconvertible quantities must append nothing, got %s', n);
  SELECT quantity INTO qty FROM public.foods WHERE id = honey;
  ASSERT qty = 250, format('an unconvertible row keeps its quantity, got %s', qty);

  ASSERT coalesce(current_setting('app.kitchen_loop_mirror', true), '') = '',
    'the mirror guard was left set';

  RAISE NOTICE 'case 2 ok: iOS insert 2 kg then direct update to 1 kg lands on 1000 g';
END $case2$;

-- ---------------------------------------------------------------------------
-- CASE 3: no double seed. Seeding an already-seeded food appends nothing.
-- (Re-running the US-669 backfill over these rows is CASE 9, at the end,
-- because the backfill also classifies unconvertible rows its own way.)
-- ---------------------------------------------------------------------------
DO $case3$
DECLARE
  yogurt uuid := '5a5a0000-0000-0000-0000-0000000000a1';
  hh     uuid := '5a5a0000-0000-0000-0000-000000000001';
  before_n int; after_n int; outcome text; qty numeric;
BEGIN
  SELECT count(*) INTO before_n FROM public.inventory_movements WHERE household_id = hh;
  outcome := public.seed_food_ledger_balance(yogurt);
  ASSERT outcome = 'balanced', format('re-seeding Yogurt should find it balanced, got %s', outcome);
  SELECT count(*) INTO after_n FROM public.inventory_movements WHERE household_id = hh;
  ASSERT after_n = before_n, format('re-seeding appended %s movement(s)', after_n - before_n);
  SELECT quantity INTO qty FROM public.foods WHERE id = yogurt;
  ASSERT qty = 7, format('Yogurt should still read 7, got %s', qty);
  RAISE NOTICE 'case 3 ok: nothing seeded twice';
END $case3$;

-- ---------------------------------------------------------------------------
-- CASE 4: the repair. Two foods built the way production has them:
--   Milk   inserted with a quantity before the seed trigger existed (trigger
--          disabled to reproduce that), so it has no stock row.
--   Beans  whose only history is a US-668 correction from NULL. It has no
--          `initial`, which is why backfill_initial_movements would double it;
--          the repair must leave it alone.
-- ---------------------------------------------------------------------------
ALTER TABLE public.foods DISABLE TRIGGER foods_seed_ledger_on_insert;
INSERT INTO public.foods (id, household_id, user_id, name, category, unit, quantity) VALUES
  ('5a5a0000-0000-0000-0000-0000000000c1', :HH, :OWNER, 'Milk', 'dairy', 'l', 2);
ALTER TABLE public.foods ENABLE TRIGGER foods_seed_ledger_on_insert;

INSERT INTO public.foods (id, household_id, user_id, name, category, unit, quantity) VALUES
  ('5a5a0000-0000-0000-0000-0000000000c2', :HH, :OWNER, 'Beans', 'protein', 'cans', NULL);
UPDATE public.foods SET quantity = 4 WHERE id = '5a5a0000-0000-0000-0000-0000000000c2';

DO $case4$
DECLARE
  milk  uuid := '5a5a0000-0000-0000-0000-0000000000c1';
  beans uuid := '5a5a0000-0000-0000-0000-0000000000c2';
  honey uuid := '5a5a0000-0000-0000-0000-0000000000b4';
  hh    uuid := '5a5a0000-0000-0000-0000-000000000001';
  r record; n int; n2 int; qty numeric; bal numeric;
BEGIN
  -- The planted state really is the bug.
  ASSERT NOT EXISTS (SELECT 1 FROM public.item_stock WHERE item_id = milk),
    'fixture: Milk should start with no stock row';
  ASSERT EXISTS (SELECT 1 FROM public.detect_foods_quantity_drift()
                  WHERE item_id = milk AND kind = 'missing_stock_row'),
    'the foods drift check should report unseeded Milk';

  SELECT * INTO r FROM public.repair_unseeded_ledger_items();
  ASSERT r.seeded >= 1, format('the repair seeded %s items, expected at least Milk', r.seeded);

  SELECT quantity INTO qty FROM public.foods WHERE id = milk;
  SELECT on_hand_canonical INTO bal FROM public.item_stock WHERE item_id = milk;
  ASSERT qty = 2, format('foods.quantity is the truth for an unseeded row; Milk should read 2 l, got %s', qty);
  ASSERT bal = 2000, format('Milk balance should be 2000 ml, got %s', bal);

  SELECT count(*) INTO n FROM public.inventory_movements WHERE item_id = beans;
  ASSERT n = 1, format('Beans has a correction already; the repair must not add to it (got %s movements)', n);
  SELECT on_hand_canonical INTO bal FROM public.item_stock WHERE item_id = beans;
  ASSERT bal = 4, format('Beans should still be 4, got %s', bal);

  -- Honey is unconvertible: left alone, still reported.
  ASSERT NOT EXISTS (SELECT 1 FROM public.inventory_movements WHERE item_id = honey),
    'the repair must not guess a unit for Honey';
  ASSERT EXISTS (SELECT 1 FROM public.detect_foods_quantity_drift()
                  WHERE item_id = honey AND kind = 'missing_stock_row'),
    'an unconvertible row should stay visible to the drift check';

  -- Idempotent: a second run changes nothing for this household.
  SELECT count(*) INTO n FROM public.inventory_movements WHERE household_id = hh;
  PERFORM public.repair_unseeded_ledger_items();
  SELECT count(*) INTO n2 FROM public.inventory_movements WHERE household_id = hh;
  ASSERT n2 = n, format('a second repair appended %s movement(s)', n2 - n);

  RAISE NOTICE 'case 4 ok: Milk repaired to 2 l, Beans untouched, second run a no-op';
END $case4$;

-- ---------------------------------------------------------------------------
-- CASE 5: the drift check sees a planted foods.quantity mismatch, and the
-- nightly job alerts on it. Planted the way only a bug could: a write to
-- foods.quantity with the mirror flag set, so US-668 stands down and no
-- movement explains the new number.
-- ---------------------------------------------------------------------------
DELETE FROM public.admin_alerts WHERE alert_type = 'ledger_drift';

DO $plant$
BEGIN
  PERFORM set_config('app.kitchen_loop_mirror', '1', true);
  UPDATE public.foods SET quantity = 9 WHERE id = '5a5a0000-0000-0000-0000-0000000000a2';
  PERFORM set_config('app.kitchen_loop_mirror', '', true);
END $plant$;

DO $case5$
DECLARE
  crackers uuid := '5a5a0000-0000-0000-0000-0000000000a2';
  r record; n int; foods_n int;
BEGIN
  SELECT * INTO r FROM public.detect_foods_quantity_drift() WHERE item_id = crackers;
  ASSERT r.kind = 'value_mismatch', format('expected value_mismatch for Crackers, got %s', r.kind);
  ASSERT r.foods_quantity = 9 AND r.ledger_quantity = 3,
    format('expected foods 9 against ledger 3, got %s / %s', r.foods_quantity, r.ledger_quantity);

  -- detect_item_stock_drift cannot see it: ledger and balance still agree.
  ASSERT NOT EXISTS (SELECT 1 FROM public.detect_item_stock_drift() WHERE item_id = crackers),
    'item_stock still equals the ledger for Crackers; the old check should be silent';

  n := public.record_item_stock_drift();
  ASSERT n >= 1, format('the nightly job should count Crackers, returned %s', n);
  SELECT (alert_data->>'foods_quantity_count')::int INTO foods_n
    FROM public.admin_alerts WHERE alert_type = 'ledger_drift' AND NOT is_resolved;
  ASSERT foods_n >= 1, format('the alert should carry the foods count, got %s', foods_n);
  ASSERT EXISTS (
    SELECT 1 FROM public.admin_alerts a, jsonb_array_elements(a.alert_data->'foods_quantity_sample') e
     WHERE a.alert_type = 'ledger_drift' AND e->>'item_id' = crackers::text),
    'Crackers should be in the alert sample';

  RAISE NOTICE 'case 5 ok: planted mismatch reported and alerted';
END $case5$;

-- Put it back through the ordinary path (US-668 correction) and clear the alert.
UPDATE public.foods SET quantity = 3 WHERE id = '5a5a0000-0000-0000-0000-0000000000a2';
DO $case5b$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.detect_foods_quantity_drift()
                      WHERE item_id = '5a5a0000-0000-0000-0000-0000000000a2'),
    'writing 3 back should clear the Crackers mismatch';
END $case5b$;
DELETE FROM public.admin_alerts WHERE alert_type = 'ledger_drift';

-- ---------------------------------------------------------------------------
-- CASE 6: a food with movements can be deleted, and takes its ledger with it.
-- Shipped iOS and the web both delete foods with a plain DELETE.
-- ---------------------------------------------------------------------------
DELETE FROM public.foods WHERE id = '5a5a0000-0000-0000-0000-0000000000b1';
DO $case6$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.inventory_movements WHERE item_id = '5a5a0000-0000-0000-0000-0000000000b1'),
    'Rice movements should cascade with the food';
  ASSERT NOT EXISTS (SELECT 1 FROM public.item_stock WHERE item_id = '5a5a0000-0000-0000-0000-0000000000b1'),
    'Rice stock should cascade with the food';
  RAISE NOTICE 'case 6 ok: deleting a stocked food works';
END $case6$;

-- ---------------------------------------------------------------------------
-- CASE 7: the flag row is on for everyone, and the kill switch turns it off.
-- ---------------------------------------------------------------------------
DO $case7$
DECLARE
  f record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'feature_flags') THEN
    RAISE NOTICE 'case 7 skipped: no feature_flags table';
    RETURN;
  END IF;
  SELECT enabled, rollout_percentage INTO f FROM public.feature_flags WHERE key = 'kitchen_loop_ledger_writes';
  ASSERT f.enabled IS TRUE AND f.rollout_percentage = 100,
    format('kitchen_loop_ledger_writes should be enabled at 100, got %s / %s', f.enabled, f.rollout_percentage);
  ASSERT public.evaluate_feature_flag('kitchen_loop_ledger_writes', gen_random_uuid()),
    'any user should evaluate the flag as on';
  RAISE NOTICE 'case 7 ok: flag on at 100%%';
END $case7$;

BEGIN;
UPDATE public.feature_flags SET enabled = false, updated_at = now() WHERE key = 'kitchen_loop_ledger_writes';
DO $case7b$
BEGIN
  ASSERT NOT public.evaluate_feature_flag('kitchen_loop_ledger_writes', gen_random_uuid()),
    'the kill switch should turn the flag off for everyone';
  RAISE NOTICE 'case 7b ok: kill switch honoured';
END $case7b$;
ROLLBACK;

-- ---------------------------------------------------------------------------
-- CASE 8: US-804. The new functions are private.
-- ---------------------------------------------------------------------------
DO $case8$
DECLARE fn text; leaked text[] := '{}';
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.seed_food_ledger_balance(uuid)',
    'public.seed_ledger_on_food_insert()',
    'public.repair_unseeded_ledger_items()',
    'public.detect_foods_quantity_drift()',
    'public.record_item_stock_drift()'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN leaked := leaked || (fn || ' [anon]'); END IF;
    IF has_function_privilege('authenticated', fn, 'EXECUTE') THEN leaked := leaked || (fn || ' [authenticated]'); END IF;
  END LOOP;
  ASSERT coalesce(array_length(leaked, 1), 0) = 0,
    format('client roles can execute: %s', array_to_string(leaked, ', '));
  RAISE NOTICE 'case 8 ok: new functions unreachable by anon and authenticated';
END $case8$;

-- ---------------------------------------------------------------------------
-- CASE 9: an operator re-running backfill_initial_movements does not double
-- anything the insert trigger or the repair seeded, because both use the
-- `initial` reason its idempotence guard looks for.
-- ---------------------------------------------------------------------------
DO $case9$
DECLARE
  seeded uuid[] := ARRAY[
    '5a5a0000-0000-0000-0000-0000000000a1',  -- Yogurt, trigger
    '5a5a0000-0000-0000-0000-0000000000a2',  -- Crackers, trigger
    '5a5a0000-0000-0000-0000-0000000000c1'   -- Milk, repair
  ]::uuid[];
  before_n int; after_n int;
BEGIN
  SELECT count(*) INTO before_n FROM public.inventory_movements WHERE item_id = ANY(seeded);
  PERFORM public.backfill_initial_movements(500);
  SELECT count(*) INTO after_n FROM public.inventory_movements WHERE item_id = ANY(seeded);
  ASSERT after_n = before_n,
    format('the backfill appended %s movement(s) to seeded items', after_n - before_n);

  -- And the reason the repair does not simply re-run the backfill: Beans'
  -- only history is a US-668 correction, so the backfill's guard (no
  -- `initial` yet) lets it through and it credits the 4 cans a second time.
  ASSERT (SELECT on_hand_canonical FROM public.item_stock
           WHERE item_id = '5a5a0000-0000-0000-0000-0000000000c2') = 8,
    'expected the backfill to double Beans from 4 to 8; if it no longer does, its guard changed and the 5a repair note is stale';
  RAISE NOTICE 'case 9 ok: backfill re-run leaves seeded items alone (and doubles correction-only Beans, as documented)';
END $case9$;

-- ---------------------------------------------------------------------------
-- Leave the database as we found it. The cascade takes movements and stock.
-- ---------------------------------------------------------------------------
DELETE FROM public.foods WHERE household_id = :HH;
DELETE FROM public.households WHERE id = :HH;
