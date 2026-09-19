-- US-801: signup is impossible on a database built from these migrations.
--
-- WHAT BREAKS
-- On a fresh `supabase db reset`, this aborts with SQLSTATE 42703:
--
--   INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'a@b.test');
--   ERROR: handle_new_user failed ...: msg=record "new" has no field "user_id"
--
-- The chain is on_auth_user_created -> handle_new_user() -> INSERT
-- public.profiles -> create_notification_preferences_on_profile ->
-- create_default_notification_preferences(), and that last function selects
-- NEW.user_id and NEW.household_id off a profiles row. public.profiles has
-- neither: its columns are id, full_name, created_at, updated_at,
-- onboarding_completed, subscription_tier, is_locked, locked_at, lock_reason,
-- failed_login_attempts, last_failed_login_at. The profile id IS the auth user
-- id, and households are reached through public.household_members.
--
-- Introduced in 20251110000002_push_notifications.sql:298-316, written against
-- a profiles shape that has never existed in this repo. handle_new_user()
-- re-raises via WHEN OTHERS (deliberately -- see 20260602000001), so the
-- auth.users insert fails outright rather than degrading.
--
-- WHY THE HOUSEHOLD CANNOT COME FROM THE PROFILES TRIGGER
-- handle_new_user() inserts the profile FIRST and creates the household and
-- the household_members row afterwards. So at the moment the profiles trigger
-- fires, the user has no household to be scoped to -- reading one there would
-- always find NULL. The scoping is therefore split across the two moments that
-- actually carry the facts:
--
--   profiles INSERT          -> the row exists, keyed by user
--   household_members INSERT -> the row learns its household
--
-- Both are upserts on the user_id unique constraint, so either order works and
-- re-running either one is a no-op.
--
-- BACKWARD COMPATIBILITY (CLAUDE.md migration rules)
-- Additive only: CREATE OR REPLACE on an existing function with an unchanged
-- signature, one new trigger, and a backfill INSERT. No column or table is
-- dropped, renamed or retyped, and no constraint is tightened. Old iOS builds
-- neither call these functions nor read a column that changes.

-- The profiles half: a preferences row for the new user, household unknown.
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- NEW.id, not NEW.user_id: on public.profiles the primary key IS the
  -- auth.users id. The household is filled in by the trigger below, once
  -- handle_new_user() has created one.
  INSERT INTO notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- The household half.
CREATE OR REPLACE FUNCTION scope_notification_preferences_to_household()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notification_preferences (user_id, household_id)
  VALUES (NEW.user_id, NEW.household_id)
  ON CONFLICT (user_id) DO UPDATE
    -- COALESCE, not EXCLUDED: joining a second household must not move a
    -- member's existing preferences over to it.
    SET household_id = COALESCE(notification_preferences.household_id, EXCLUDED.household_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scope_notification_preferences_on_membership ON household_members;
CREATE TRIGGER scope_notification_preferences_on_membership
  AFTER INSERT ON household_members
  FOR EACH ROW
  EXECUTE FUNCTION scope_notification_preferences_to_household();

-- Backfill. Anyone who signed up while the function was broken has no
-- preferences row at all; on a database where the trigger was never installed
-- (production may be behind these migrations) the same is true for everyone.
INSERT INTO notification_preferences (user_id, household_id)
SELECT p.id, (
  SELECT hm.household_id
  FROM household_members hm
  WHERE hm.user_id = p.id
  ORDER BY hm.joined_at
  LIMIT 1
)
FROM profiles p
ON CONFLICT (user_id) DO UPDATE
  SET household_id = COALESCE(notification_preferences.household_id, EXCLUDED.household_id);
