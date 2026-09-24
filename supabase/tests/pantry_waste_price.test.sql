-- Item 22: what the pantry's waste report and price capture rely on, checked
-- against the schema rather than assumed. No migration came with item 22: the
-- columns it writes already exist (inventory_movements.unit_price/currency
-- from 20260901000006, foods.price_per_unit/currency from 20260426000000), so
-- this pins them and the policies the report reads through.
--
--   1. a household member appends a priced purchase and a waste, and reads
--      both back with the report's own filters
--   2. the partner in the same household sees them; another household does not
--   3. a price without a currency is refused (price_currency_together)
--   4. a recorded price cannot be rewritten (append-only)
--   5. foods.price_per_unit and currency are writable by the household
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pantry_waste_price.test.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  owner_a    uuid := '27270002-0000-0000-0000-000000000001';
  partner_a  uuid := '27270002-0000-0000-0000-000000000002';
  outsider_b uuid := '27270002-0000-0000-0000-000000000003';
  food       uuid := '27270002-0000-0000-0000-0000000000f1';
  buy        uuid := '27270002-0000-0000-0000-0000000000b1';
  waste      uuid := '27270002-0000-0000-0000-0000000000c1';
  bad        uuid := '27270002-0000-0000-0000-0000000000d1';
  hh_a       uuid;
  n          int;
  price      numeric;
  refused    boolean;
BEGIN
  DELETE FROM public.inventory_movements WHERE id IN (buy, waste, bad);
  DELETE FROM public.item_stock WHERE item_id = food;
  DELETE FROM public.foods WHERE id = food;
  DELETE FROM auth.users WHERE id IN (owner_a, partner_a, outsider_b);

  INSERT INTO auth.users (id, email) VALUES
    (owner_a,    'waste-owner@example.test'),
    (partner_a,  'waste-partner@example.test'),
    (outsider_b, 'waste-outsider@example.test');
  SELECT household_id INTO hh_a FROM public.household_members WHERE user_id = owner_a;
  ASSERT hh_a IS NOT NULL, 'the signup chain did not give the owner a household';
  UPDATE public.household_members SET household_id = hh_a WHERE user_id = partner_a;

  INSERT INTO public.foods (id, user_id, household_id, name, category, quantity, unit, canonical_unit)
    VALUES (food, owner_a, hh_a, 'Broccoli', 'vegetable', 0, 'count', 'count');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);

  RAISE NOTICE '1. the owner appends a priced purchase and a waste';
  INSERT INTO public.inventory_movements
    (id, household_id, item_id, delta, canonical_unit, display_quantity, display_unit,
     reason, created_by, unit_price, currency)
  VALUES
    (buy,   hh_a, food,  3, 'count',  3, 'count', 'purchase', owner_a, 1.60, 'USD'),
    (waste, hh_a, food, -2, 'count', -2, 'count', 'waste',    owner_a, NULL, NULL);

  SELECT count(*) INTO n FROM public.inventory_movements
   WHERE household_id = hh_a AND reason IN ('waste', 'expire')
     AND occurred_at >= date_trunc('month', now());
  RAISE NOTICE '   waste rows this month = %  EXPECTED 1', n;
  ASSERT n = 1, 'the report''s waste query does not find the waste';

  SELECT unit_price INTO price FROM public.inventory_movements
   WHERE household_id = hh_a AND reason = 'purchase' AND unit_price IS NOT NULL AND item_id = food;
  RAISE NOTICE '   purchase price = %  EXPECTED 1.60', price;
  ASSERT price = 1.60, 'the report''s price query does not find the priced purchase';

  RAISE NOTICE '2. the partner sees both; another household sees neither';
  PERFORM set_config('request.jwt.claim.sub', partner_a::text, true);
  SELECT count(*) INTO n FROM public.inventory_movements WHERE id IN (buy, waste);
  ASSERT n = 2, 'a household member cannot read the household''s waste and prices';
  PERFORM set_config('request.jwt.claim.sub', outsider_b::text, true);
  SELECT count(*) INTO n FROM public.inventory_movements WHERE id IN (buy, waste);
  RAISE NOTICE '   outsider visible rows = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household can read this household''s waste and prices';

  RAISE NOTICE '3. a price without a currency is refused';
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  refused := false;
  BEGIN
    INSERT INTO public.inventory_movements
      (id, household_id, item_id, delta, canonical_unit, reason, created_by, unit_price, currency)
    VALUES (bad, hh_a, food, 1, 'count', 'purchase', owner_a, 2.00, NULL);
  EXCEPTION WHEN check_violation THEN
    refused := true;
  END;
  ASSERT refused, 'a price with no currency was stored';

  RAISE NOTICE '4. a recorded price cannot be rewritten';
  -- Whether that is the revoked privilege refusing or the absent UPDATE policy
  -- matching no row, what matters is that the price reads back unchanged.
  RAISE NOTICE '   authenticated UPDATE privilege = %',
    has_table_privilege('authenticated', 'public.inventory_movements', 'UPDATE');
  BEGIN
    UPDATE public.inventory_movements SET unit_price = 0.01 WHERE id = buy;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  SELECT unit_price INTO price FROM public.inventory_movements WHERE id = buy;
  RAISE NOTICE '   price after the attempt = %  EXPECTED 1.60', price;
  ASSERT price = 1.60, 'authenticated rewrote a movement''s price';

  RAISE NOTICE '5. the household sets the food''s last known price';
  PERFORM set_config('request.jwt.claim.sub', partner_a::text, true);
  UPDATE public.foods SET price_per_unit = 1.60, currency = 'USD' WHERE id = food;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'a household member cannot set foods.price_per_unit';
  PERFORM set_config('request.jwt.claim.sub', outsider_b::text, true);
  UPDATE public.foods SET price_per_unit = 99 WHERE id = food;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'another household can set this food''s price';

  RESET ROLE;
  SELECT price_per_unit INTO price FROM public.foods WHERE id = food;
  ASSERT price = 1.60, 'the food''s price is not what the household set';

  -- Owner cleanup. inventory_movements is append-only for clients, not for
  -- the table owner running this test.
  DELETE FROM public.inventory_movements WHERE id IN (buy, waste, bad);
  DELETE FROM public.item_stock WHERE item_id = food;
  DELETE FROM public.foods WHERE id = food;
  DELETE FROM auth.users WHERE id IN (owner_a, partner_a, outsider_b);
END
$$;
