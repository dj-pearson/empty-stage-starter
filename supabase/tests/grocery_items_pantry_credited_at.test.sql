-- Item 16: grocery_items.pantry_credited_at exists, is a nullable timestamptz
-- with no default (an older iOS insert leaves it NULL), and a household member
-- can set and clear it under the existing grocery_items policies. Another
-- household can do neither.
--
-- Migration: supabase/migrations/20260926000004_grocery_items_pantry_credited_at.sql.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/grocery_items_pantry_credited_at.test.sql

\set ON_ERROR_STOP on

DO $$
DECLARE
  owner_a    uuid := '26260004-0000-0000-0000-000000000001';
  partner_a  uuid := '26260004-0000-0000-0000-000000000002';
  outsider_b uuid := '26260004-0000-0000-0000-000000000003';
  row_id     uuid := '26260004-0000-0000-0000-0000000000a1';
  hh_a       uuid;
  n          int;
  got        timestamptz;
  col_count  int;
  has_default boolean;
BEGIN
  DELETE FROM public.grocery_items WHERE id = row_id;
  DELETE FROM auth.users WHERE id IN (owner_a, partner_a, outsider_b);

  RAISE NOTICE '1. the column exists, is nullable timestamptz, and has no default';
  SELECT count(*), bool_or(column_default IS NOT NULL) INTO col_count, has_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'grocery_items'
     AND column_name = 'pantry_credited_at' AND is_nullable = 'YES'
     AND data_type = 'timestamp with time zone';
  RAISE NOTICE '   matching columns = %, has default = %  EXPECTED 1, false', col_count, has_default;
  ASSERT col_count = 1, 'grocery_items.pantry_credited_at is missing, NOT NULL, or the wrong type';
  ASSERT NOT has_default, 'pantry_credited_at must have no default: NULL means not credited';

  INSERT INTO auth.users (id, email) VALUES
    (owner_a,    'receipt-credit-owner@example.test'),
    (partner_a,  'receipt-credit-partner@example.test'),
    (outsider_b, 'receipt-credit-outsider@example.test');
  SELECT household_id INTO hh_a FROM public.household_members WHERE user_id = owner_a;
  ASSERT hh_a IS NOT NULL, 'the signup chain did not give the owner a household';
  UPDATE public.household_members SET household_id = hh_a WHERE user_id = partner_a;

  -- Seeded as table owner, leaving the new column out the way an older iOS
  -- build inserts.
  INSERT INTO public.grocery_items (id, user_id, household_id, name, category)
  VALUES (row_id, owner_a, hh_a, 'Milk', 'dairy');
  SELECT pantry_credited_at INTO got FROM public.grocery_items WHERE id = row_id;
  RAISE NOTICE '2. an insert that omits it leaves it NULL: %  EXPECTED NULL', got;
  ASSERT got IS NULL, 'an old-client insert must read as not credited';

  SET LOCAL ROLE authenticated;

  RAISE NOTICE '3. the PARTNER in the same household marks it credited with the check-off';
  PERFORM set_config('request.jwt.claim.sub', partner_a::text, true);
  UPDATE public.grocery_items
     SET checked = true, pantry_credited_at = '2026-09-26T10:00:00Z'
   WHERE id = row_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '   rows updated = %  EXPECTED 1', n;
  ASSERT n = 1, 'a household member cannot set pantry_credited_at';

  RAISE NOTICE '4. the OWNER reads it back and clears it (Undo)';
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  SELECT pantry_credited_at INTO got FROM public.grocery_items WHERE id = row_id;
  ASSERT got = '2026-09-26T10:00:00Z'::timestamptz, 'the owner does not read back the partner''s mark';
  UPDATE public.grocery_items SET checked = false, pantry_credited_at = NULL WHERE id = row_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'the owner cannot clear pantry_credited_at';

  RAISE NOTICE '5. a user in ANOTHER household can neither read nor write it';
  PERFORM set_config('request.jwt.claim.sub', outsider_b::text, true);
  SELECT count(*) INTO n FROM public.grocery_items WHERE id = row_id;
  RAISE NOTICE '   visible rows = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household can read this grocery row';
  UPDATE public.grocery_items SET pantry_credited_at = now() WHERE id = row_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '   rows updated = %  EXPECTED 0', n;
  ASSERT n = 0, 'another household can mark this row credited';

  RESET ROLE;
  SELECT pantry_credited_at INTO got FROM public.grocery_items WHERE id = row_id;
  ASSERT got IS NULL, 'the outsider''s update landed';

  DELETE FROM public.grocery_items WHERE id = row_id;
  DELETE FROM auth.users WHERE id IN (owner_a, partner_a, outsider_b);
END
$$;
