-- US-801: a new account can actually be created.
-- Run: psql -f supabase/tests/us801_signup_chain.test.sql
--
-- The whole chain, end to end, because every link in it was load-bearing and
-- one of them was written against a table shape that has never existed:
--
--   INSERT auth.users
--     -> on_auth_user_created
--       -> handle_new_user()
--         -> INSERT public.profiles
--           -> create_notification_preferences_on_profile
--             -> create_default_notification_preferences()
--         -> INSERT public.households + public.household_members
--           -> scope_notification_preferences_on_membership
--
-- Before the fix, the fourth arrow aborted the first statement with SQLSTATE
-- 42703, record "new" has no field "user_id", and no account could be created
-- at all on a database built from migrations. So assertion 2 below is the
-- regression: it is a bare INSERT, and its failing IS the bug.
--
-- Everything rolls back at the end, and the fixture ids are fixed rather than
-- random so a half-finished run leaves nothing behind to collide with.
\set ON_ERROR_STOP on
BEGIN;

\set signup_user '''80100000-0000-0000-0000-000000000001'''
\set other_user  '''80100000-0000-0000-0000-000000000002'''

-- 1. The shape create_default_notification_preferences() has to read.
--    public.profiles is keyed by the auth user id and knows nothing about
--    households; the broken version selected NEW.user_id and NEW.household_id.
DO $a1$
DECLARE has_id BOOL; has_user_id BOOL; has_household_id BOOL;
BEGIN
  SELECT
    bool_or(column_name = 'id'),
    bool_or(column_name = 'user_id'),
    bool_or(column_name = 'household_id')
  INTO has_id, has_user_id, has_household_id
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles';

  IF NOT has_id THEN
    RAISE EXCEPTION 'assertion 1: public.profiles has no id column';
  END IF;
  IF has_user_id THEN
    RAISE EXCEPTION 'assertion 1: public.profiles grew a user_id column; the '
      'signup trigger reads NEW.id and this test encodes that choice';
  END IF;
  IF has_household_id THEN
    RAISE EXCEPTION 'assertion 1: public.profiles grew a household_id column; '
      'the preferences row is scoped from household_members instead';
  END IF;
  RAISE NOTICE 'assertion 1 ok (profiles keyed by id, no user_id, no household_id)';
END $a1$;

-- 2. THE REGRESSION. This statement is the test.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (:signup_user, 'us801-signup@example.test', '{"full_name":"US801 Test"}'::jsonb);
DO $a2$ BEGIN RAISE NOTICE 'assertion 2 ok (INSERT INTO auth.users succeeded)'; END $a2$;

-- 3. A profile was created for them.
DO $a3$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM public.profiles
   WHERE id = '80100000-0000-0000-0000-000000000001';
  IF n <> 1 THEN
    RAISE EXCEPTION 'assertion 3: expected 1 profile, got %', n;
  END IF;
  RAISE NOTICE 'assertion 3 ok (profile created)';
END $a3$;

-- 4. A household and a parent membership were created.
DO $a4$
DECLARE r RECORD;
BEGIN
  SELECT count(*) AS n, min(role) AS role INTO r
  FROM public.household_members
  WHERE user_id = '80100000-0000-0000-0000-000000000001';
  IF r.n <> 1 THEN
    RAISE EXCEPTION 'assertion 4: expected 1 household membership, got %', r.n;
  END IF;
  IF r.role IS DISTINCT FROM 'parent' THEN
    RAISE EXCEPTION 'assertion 4: expected role parent, got %', r.role;
  END IF;
  RAISE NOTICE 'assertion 4 ok (one parent membership)';
END $a4$;

-- 5. Notification preferences exist for the new user.
DO $a5$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM public.notification_preferences
   WHERE user_id = '80100000-0000-0000-0000-000000000001';
  IF n <> 1 THEN
    RAISE EXCEPTION 'assertion 5: expected 1 notification_preferences row, got %', n;
  END IF;
  RAISE NOTICE 'assertion 5 ok (preferences row created)';
END $a5$;

-- 6. And they are scoped to the household signup just created, not to NULL.
--    handle_new_user() writes the profile BEFORE the household exists, so this
--    is the part that cannot come from the profiles trigger.
DO $a6$
DECLARE prefs_household UUID; member_household UUID;
BEGIN
  SELECT household_id INTO prefs_household FROM public.notification_preferences
   WHERE user_id = '80100000-0000-0000-0000-000000000001';
  SELECT household_id INTO member_household FROM public.household_members
   WHERE user_id = '80100000-0000-0000-0000-000000000001';

  IF prefs_household IS NULL THEN
    RAISE EXCEPTION 'assertion 6: preferences were left unscoped (household_id NULL)';
  END IF;
  IF prefs_household IS DISTINCT FROM member_household THEN
    RAISE EXCEPTION 'assertion 6: preferences scoped to % but the member is in %',
      prefs_household, member_household;
  END IF;
  RAISE NOTICE 'assertion 6 ok (scoped to the household signup created)';
END $a6$;

-- 7. The defaults are the ones the table declares, so a new account is not
--    silently opted out of everything.
DO $a7$
DECLARE r RECORD;
BEGIN
  SELECT push_enabled, email_enabled, meal_reminders INTO r
  FROM public.notification_preferences
  WHERE user_id = '80100000-0000-0000-0000-000000000001';
  IF NOT (r.push_enabled AND r.email_enabled AND r.meal_reminders) THEN
    RAISE EXCEPTION 'assertion 7: expected the declared defaults, got push=% email=% meals=%',
      r.push_enabled, r.email_enabled, r.meal_reminders;
  END IF;
  RAISE NOTICE 'assertion 7 ok (declared defaults applied)';
END $a7$;

-- 8. Joining a second household does not move an existing member's
--    preferences over to it. The upsert COALESCEs rather than overwriting.
DO $a8$
DECLARE original UUID; second UUID; after UUID;
BEGIN
  SELECT household_id INTO original FROM public.notification_preferences
   WHERE user_id = '80100000-0000-0000-0000-000000000001';

  INSERT INTO public.households (name) VALUES ('US801 Second Household')
  RETURNING id INTO second;
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (second, '80100000-0000-0000-0000-000000000001', 'parent');

  SELECT household_id INTO after FROM public.notification_preferences
   WHERE user_id = '80100000-0000-0000-0000-000000000001';

  IF after IS DISTINCT FROM original THEN
    RAISE EXCEPTION 'assertion 8: a second membership moved preferences from % to %',
      original, after;
  END IF;
  RAISE NOTICE 'assertion 8 ok (second household did not re-scope)';
END $a8$;

-- 9. The chain is idempotent. handle_new_user() re-raises on any error
--    (20260602000001, deliberately), so a trigger that is not safe to re-run
--    takes the whole signup down with it.
DO $a9$
DECLARE n INT;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('80100000-0000-0000-0000-000000000002', 'us801-second@example.test',
          '{"full_name":"US801 Second"}'::jsonb);

  SELECT count(*) INTO n FROM public.notification_preferences
   WHERE user_id = '80100000-0000-0000-0000-000000000002';
  IF n <> 1 THEN
    RAISE EXCEPTION 'assertion 9: expected 1 preferences row for the second signup, got %', n;
  END IF;
  RAISE NOTICE 'assertion 9 ok (a second signup works too)';
END $a9$;

-- 10. The trigger that does the scoping is actually attached. A migration
--     replacing the function without the trigger would pass everything above
--     on a database where the trigger already exists, and fail on a fresh one.
DO $a10$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname = 'household_members'
    AND t.tgname = 'scope_notification_preferences_on_membership'
    AND NOT t.tgisinternal;
  IF n <> 1 THEN
    RAISE EXCEPTION 'assertion 10: expected the scoping trigger on household_members, got %', n;
  END IF;
  RAISE NOTICE 'assertion 10 ok (scoping trigger attached)';
END $a10$;

ROLLBACK;
