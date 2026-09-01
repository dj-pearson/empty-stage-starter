-- US-711 test suite: a household member must be able to read (and edit) the
-- ingredients and components of a recipe their partner saved.
--
-- The bug: `recipes` has been household-scoped since 20251008035900, but
-- recipe_ingredients (US-265) and recipe_components (US-612) scoped through
-- `r.user_id = auth.uid()`. A partner could open the recipe and find it empty.
--
-- HOW TO RUN. There is no SQL test runner in this repo (vitest only collects
-- src/**), so this is run by hand against a throwaway database, never against
-- production. A local postgres 16 works as well as a container:
--
--   docker run -d --name pgtest -e POSTGRES_PASSWORD=scratch postgres:16-alpine
--   psql -f supabase/tests/us711_recipe_children_household_rls.bootstrap.sql
--   psql -f supabase/migrations/20260430000001_create_recipe_ingredients.sql
--   psql -f supabase/migrations/20260806000000_recipe_components.sql
--   psql -f supabase/migrations/20260901000009_household_scope_recipe_children.sql
--   psql -f supabase/tests/us711_recipe_children_household_rls.test.sql
--   docker rm -f pgtest
--
-- The bootstrap stands up only the parents the policies read (auth.uid()
-- reading request.jwt.claim.sub, households, household_members, foods,
-- recipes, get_user_household_id and the recipes household policy), so this
-- runs against an empty postgres in seconds instead of replaying 300
-- migrations.
--
-- Run it BEFORE 20260901000009 as well: CASE 2 fails there, which is the whole
-- point of the migration.
--
-- Every check prints EXPECTED alongside the value.

\set HA '''aaaa0001-0000-0000-0000-000000000001'''
\set HB '''aaaa0002-0000-0000-0000-000000000002'''
\set A1 '''11110000-0000-0000-0000-000000000001'''
\set A2 '''11110000-0000-0000-0000-000000000002'''
\set B1 '''22220000-0000-0000-0000-000000000001'''
\set REC '''cccc0000-0000-0000-0000-0000000000c1'''

-- Seeded as the table owner, which bypasses RLS on purpose: the fixture is
-- state, not a thing under test.
insert into public.households (id, name) values (:HA, 'Household A'), (:HB, 'Household B');
insert into public.household_members (household_id, user_id) values
  (:HA, :A1), (:HA, :A2), (:HB, :B1);
insert into public.recipes (id, user_id, household_id, name) values
  (:REC, :A1, :HA, 'Partner''s pasta');
insert into public.recipe_ingredients (recipe_id, name, sort_order) values
  (:REC, 'Spaghetti', 0);
insert into public.recipe_components (recipe_id, name, sort_order) values
  (:REC, 'The sauce', 0);

grant usage on schema public to app_user;
grant select, insert, update, delete on public.recipes, public.recipe_ingredients,
  public.recipe_components to app_user;

\echo ''
\echo '=== CASE 1: the OWNER still reads their own recipe children ==='
set role app_user;
select set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-000000000001', false);
select 'EXPECTED ingredients 1, components 1' as check;
select (select count(*) from public.recipe_ingredients) as ingredients,
       (select count(*) from public.recipe_components)  as components;
reset role;

\echo ''
\echo '=== CASE 2: the PARTNER in the same household reads them too (US-711) ==='
set role app_user;
select set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-000000000002', false);
select 'EXPECTED ingredients 1, components 1 -- 0 before the migration' as check;
select (select count(*) from public.recipe_ingredients) as ingredients,
       (select count(*) from public.recipe_components)  as components;
reset role;

\echo ''
\echo '=== CASE 3: a user in ANOTHER household reads nothing ==='
set role app_user;
select set_config('request.jwt.claim.sub', '22220000-0000-0000-0000-000000000001', false);
select 'EXPECTED ingredients 0, components 0' as check;
select (select count(*) from public.recipe_ingredients) as ingredients,
       (select count(*) from public.recipe_components)  as components;
reset role;

\echo ''
\echo '=== CASE 4: the partner can INSERT, UPDATE and DELETE, not just read ==='
set role app_user;
select set_config('request.jwt.claim.sub', '11110000-0000-0000-0000-000000000002', false);
insert into public.recipe_ingredients (recipe_id, name, sort_order) values (:REC, 'Basil', 1);
update public.recipe_ingredients set name = 'Fresh basil' where name = 'Basil';
select 'EXPECTED one row named "Fresh basil"' as check;
select count(*) as renamed from public.recipe_ingredients where name = 'Fresh basil';
delete from public.recipe_ingredients where name = 'Fresh basil';
select 'EXPECTED ingredients back to 1' as check;
select count(*) as ingredients from public.recipe_ingredients;
reset role;

\echo ''
\echo '=== CASE 5: the outsider cannot INSERT into the other household''s recipe ==='
set role app_user;
select set_config('request.jwt.claim.sub', '22220000-0000-0000-0000-000000000001', false);
select 'EXPECTED: the next statement raises "new row violates row-level security policy"' as check;
insert into public.recipe_ingredients (recipe_id, name, sort_order) values (:REC, 'Sabotage', 9);
reset role;
