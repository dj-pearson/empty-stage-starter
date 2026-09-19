-- US-668 test suite: a shipped client's direct write to foods.quantity must
-- become a correction movement, and the two triggers involved must not loop.
--
-- This object is the highest-risk one in the kitchen-loop epic: during
-- Release N an old iOS build writes foods.quantity while new code appends
-- movements, to the same households at the same time.
--
-- HOW TO RUN. There is no SQL test runner in this repo (vitest only collects
-- src/**), so this is run by hand against a throwaway database, never against
-- production:
--
--   docker run -d --name pgtest -e POSTGRES_PASSWORD=scratch postgres:16-alpine
--   # apply the kitchen-loop migrations in filename order, then:
--   psql -f supabase/tests/us668_direct_write_translation.test.sql
--   docker rm -f pgtest
--
-- Every check prints EXPECTED alongside the value, so a wrong answer is
-- visible without knowing the intended numbers by heart.

\set HH '''bbbb0001-0000-0000-0000-000000000001'''
\set RICE '''f0000000-0000-0000-0000-00000000aa01'''
\set MILK '''f0000000-0000-0000-0000-00000000aa02'''
\set OPAQUE '''f0000000-0000-0000-0000-00000000aa03'''
\set HONEY '''f0000000-0000-0000-0000-00000000aa04'''

-- US-800: foods.user_id is NOT NULL. It carries no FK, so any uuid satisfies
-- it and no auth user is needed -- which matters because this suite is meant
-- to run against a database built only from migrations, where nothing can
-- write to the auth schema. The fixture predates the constraint and had never
-- been executed.
\set OWNER '''11110000-0000-0000-0000-0000000000aa'''

-- ...and the household the foods hang off, because foods.household_id has a
-- real FK. `households` lives in public, so this needs no privilege the SQL
-- test step does not have.
-- US-800: torn down first, so a re-run behaves like a first run and the
-- movement counts below mean what they say. Without this the suite passed only
-- because us784 happens to run later and does `DELETE FROM public.foods`,
-- which is not a dependency any test should have on another.
delete from public.inventory_movements where household_id = :HH;
delete from public.item_stock where item_id in (:RICE, :MILK, :OPAQUE, :HONEY);
delete from public.foods where id in (:RICE, :MILK, :OPAQUE, :HONEY);
delete from public.households where id = :HH;

insert into public.households (id, name) values (:HH, 'US-668 household')
  on conflict (id) do nothing;

insert into public.foods (id, household_id, user_id, name, category, unit, quantity, canonical_unit) values
  (:RICE,   :HH, :OWNER, 'Rice',   'carb',    'kg',       null, 'g'),
  (:MILK,   :HH, :OWNER, 'Milk',   'dairy',   'gal',      null, 'ml'),
  (:OPAQUE, :HH, :OWNER, 'Yogurt', 'dairy',   'servings', null, 'count'),
  (:HONEY,  :HH, :OWNER, 'Honey',  'snack',   'g',        null, 'ml');

\echo ''
\echo '=== CASE 1: an OLD CLIENT direct write becomes a correction movement ==='
update public.foods set quantity = 5 where id = :RICE;
select 'EXPECTED balance 5000 g, one correction movement' as check;
select s.on_hand_canonical, m.reason, m.delta, m.display_quantity, m.display_unit
  from public.item_stock s join public.inventory_movements m on m.item_id = s.item_id
 where s.item_id = :RICE;

\echo ''
\echo '--- CRITERION 3: the write was from NULL, and it is a `correction`, not an `initial` ---'
select 'EXPECTED reason=correction, count of initial = 0' as check;
select count(*) filter (where reason = 'correction') as corrections,
       count(*) filter (where reason = 'initial')    as initials
  from public.inventory_movements where item_id = :RICE;

\echo ''
\echo '--- and foods.quantity still reads 5 for the old client (the mirror agrees) ---'
select 'EXPECTED 5' as check;
select quantity from public.foods where id = :RICE;

\echo ''
\echo '=== CASE 2: a NEW CLIENT movement flows to foods.quantity, appending nothing extra ==='
insert into public.inventory_movements (id, household_id, item_id, delta, canonical_unit, reason, created_by)
values (gen_random_uuid(), :HH, :MILK, 3785.41, 'ml', 'purchase', gen_random_uuid());
select 'EXPECTED quantity 1 gal, exactly ONE movement (no correction echoed back)' as check;
select f.quantity, (select count(*) from public.inventory_movements where item_id = :MILK) as movements
  from public.foods f where f.id = :MILK;

\echo ''
\echo '=== CASE 3: the two INTERLEAVED on one item stay consistent ==='
\echo '--- old client sets 2 kg, new client cooks 500 g, old client sets 3 kg ---'
update public.foods set quantity = 2 where id = :RICE;
insert into public.inventory_movements (id, household_id, item_id, delta, canonical_unit, reason, created_by)
values (gen_random_uuid(), :HH, :RICE, -500, 'g', 'cook', gen_random_uuid());
update public.foods set quantity = 3 where id = :RICE;

select 'EXPECTED stored = folded = 3000 g, and foods.quantity = 3' as check;
select
  (select on_hand_canonical from public.item_stock where item_id = :RICE) as stored,
  (select sum(delta) from public.inventory_movements where item_id = :RICE) as folded,
  (select quantity from public.foods where id = :RICE) as old_client_reads,
  (select on_hand_canonical from public.item_stock where item_id = :RICE)
    = (select sum(delta) from public.inventory_movements where item_id = :RICE) as agree;

\echo ''
\echo '--- the intermediate cook is still in the history; nothing was overwritten ---'
select 'EXPECTED a cook of -500 present among the movements' as check;
select reason, delta from public.inventory_movements where item_id = :RICE order by occurred_at, delta;

\echo ''
\echo '=== CASE 4: a NO-OP update appends nothing ==='
select count(*) as before_noop from public.inventory_movements where item_id = :RICE \gset
update public.foods set quantity = 3 where id = :RICE;
update public.foods set name = 'Rice (long grain)' where id = :RICE;
select 'EXPECTED movement count unchanged at ' || :'before_noop' as check;
select count(*) as after_noop from public.inventory_movements where item_id = :RICE;

\echo ''
\echo '=== CRITERION 6: no runaway recursion in any of the four cases ==='
select 'EXPECTED a small, bounded number of movements (< 10), not thousands' as check;
select count(*) as total_movements from public.inventory_movements;
select 'EXPECTED the mirror guard flag left empty after every statement' as check;
select coalesce(current_setting('app.kitchen_loop_mirror', true), '(empty)') as flag;

\echo ''
\echo '=== an opaque display unit round-trips one-to-one ==='
update public.foods set quantity = 6 where id = :OPAQUE;
select 'EXPECTED balance 6 count, quantity 6 servings' as check;
select s.on_hand_canonical, f.quantity, f.unit
  from public.item_stock s join public.foods f on f.id = s.item_id where f.id = :OPAQUE;

\echo ''
\echo '=== an UNCONVERTIBLE write appends nothing rather than guessing ==='
\echo '--- Honey is stocked in ml, displayed in g, with no bridge ---'
update public.foods set quantity = 250 where id = :HONEY;
select 'EXPECTED 0 movements for honey, and quantity left at the written 250' as check;
select (select count(*) from public.inventory_movements where item_id = :HONEY) as movements,
       (select quantity from public.foods where id = :HONEY) as quantity;

\echo ''
\echo '=== the US-666 invariant holds across all of it ==='
select 'EXPECTED 0 drifting items' as check;
select count(*) as drifting from public.rpc_reconcile_item_stock(:HH);

-- ---------------------------------------------------------------------------
-- US-800: the assertions.
--
-- Everything above prints a value next to the word EXPECTED and leaves the
-- comparison to whoever is reading. That is fine for a suite run by hand and
-- useless as a gate: under `psql -v ON_ERROR_STOP=1` it can only fail by
-- erroring, so a wrong balance, a missing correction movement or a runaway
-- trigger would all report success. The CI step is blocking now, so the
-- numbers the prints above show are asserted here against the state those
-- cases left behind.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== ASSERTIONS ==='
DO $$
DECLARE
  hh       uuid := 'bbbb0001-0000-0000-0000-000000000001';
  rice     uuid := 'f0000000-0000-0000-0000-00000000aa01';
  milk     uuid := 'f0000000-0000-0000-0000-00000000aa02';
  opaque   uuid := 'f0000000-0000-0000-0000-00000000aa03';
  honey    uuid := 'f0000000-0000-0000-0000-00000000aa04';
  stored   numeric;
  folded   numeric;
  n        int;
  qty      numeric;
  flag     text;
BEGIN
  -- CASE 1 + CASE 3: the direct writes translated, and the ledger agrees with
  -- the balance after old client, new client and old client again.
  SELECT on_hand_canonical INTO stored FROM public.item_stock WHERE item_id = rice;
  SELECT sum(delta) INTO folded FROM public.inventory_movements WHERE item_id = rice;
  SELECT quantity INTO qty FROM public.foods WHERE id = rice;
  ASSERT stored = 3000, format('rice balance should be 3000 g, got %s', stored);
  ASSERT folded = stored, format('the ledger folds to %s but the balance is %s', folded, stored);
  ASSERT qty = 3, format('the old client should still read 3 kg, got %s', qty);

  -- CASE 1, criterion 3: a write from NULL is a correction, never an initial.
  SELECT count(*) INTO n FROM public.inventory_movements
   WHERE item_id = rice AND reason = 'initial';
  ASSERT n = 0, format('a direct write from NULL produced %s initial movement(s)', n);
  SELECT count(*) INTO n FROM public.inventory_movements
   WHERE item_id = rice AND reason = 'correction';
  ASSERT n > 0, 'the direct write did not become a correction movement';

  -- CASE 3: the intermediate cook survived; nothing was overwritten.
  SELECT count(*) INTO n FROM public.inventory_movements
   WHERE item_id = rice AND reason = 'cook' AND delta = -500;
  ASSERT n = 1, format('the -500 g cook should still be in the history, found %s', n);

  -- CASE 2: a movement flows to foods.quantity and echoes nothing back.
  SELECT count(*) INTO n FROM public.inventory_movements WHERE item_id = milk;
  ASSERT n = 1, format('the milk purchase echoed back as %s movements, expected 1', n);
  SELECT quantity INTO qty FROM public.foods WHERE id = milk;
  ASSERT round(qty) = 1, format('milk should read about 1 gal, got %s', qty);

  -- CASE 4 + criterion 6: no runaway recursion anywhere, and the mirror guard
  -- is left clean. A loop here is the failure this object exists to prevent.
  -- Scoped to this household. The print above counted the whole table, which
  -- as an assertion would depend on whatever other suites had left behind --
  -- it read 10 rather than 6 because us784's fixture was still there.
  SELECT count(*) INTO n FROM public.inventory_movements WHERE household_id = hh;
  ASSERT n = 6,
    format('expected 6 movements for this household (4 rice, 1 milk, 1 yogurt), got %s -- more than that is the recursion this object exists to prevent', n);
  flag := coalesce(current_setting('app.kitchen_loop_mirror', true), '');
  ASSERT flag = '', format('the mirror guard was left set to %s', flag);

  -- An opaque display unit round-trips one to one.
  SELECT on_hand_canonical INTO stored FROM public.item_stock WHERE item_id = opaque;
  SELECT quantity INTO qty FROM public.foods WHERE id = opaque;
  ASSERT stored = 6 AND qty = 6,
    format('the opaque unit did not round-trip: balance %s, quantity %s', stored, qty);

  -- An unconvertible write appends nothing rather than guessing.
  SELECT count(*) INTO n FROM public.inventory_movements WHERE item_id = honey;
  ASSERT n = 0, format('honey has no g-to-ml bridge, so it should append nothing; got %s', n);
  SELECT quantity INTO qty FROM public.foods WHERE id = honey;
  ASSERT qty = 250, format('the unconvertible write should be left at 250, got %s', qty);

  -- US-666: nothing drifted across any of it.
  SELECT count(*) INTO n FROM public.rpc_reconcile_item_stock(hh);
  ASSERT n = 0, format('%s item(s) drifted between the ledger and the balance', n);

  RAISE NOTICE 'us668: every case asserted and passed';
END $$;

-- ---------------------------------------------------------------------------
-- US-800: leave the database as we found it.
--
-- Every suite in this directory now runs against one database in CI, so a
-- fixture left behind is another suite's flake. us796 asserts that
-- match_foods_to_catalog() links exactly three rows, and it counts every food
-- in the database -- so these four would have joined its answer. It used to
-- pass only because us784's fixture happened to `DELETE FROM public.foods`
-- with no WHERE, which is a dependency no test should have on another.
-- ---------------------------------------------------------------------------
delete from public.inventory_movements where household_id = :HH;
delete from public.item_stock where item_id in (:RICE, :MILK, :OPAQUE, :HONEY);
delete from public.foods where id in (:RICE, :MILK, :OPAQUE, :HONEY);
delete from public.households where id = :HH;
