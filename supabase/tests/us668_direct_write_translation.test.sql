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

insert into public.foods (id, household_id, name, unit, quantity, canonical_unit) values
  (:RICE,   :HH, 'Rice',   'kg',       null, 'g'),
  (:MILK,   :HH, 'Milk',   'gal',      null, 'ml'),
  (:OPAQUE, :HH, 'Yogurt', 'servings', null, 'count'),
  (:HONEY,  :HH, 'Honey',  'g',        null, 'ml');

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
