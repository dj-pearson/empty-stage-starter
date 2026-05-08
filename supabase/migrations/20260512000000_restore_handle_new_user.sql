-- ============================================================================
-- URGENT: restore handle_new_user() and backfill missing households
-- ============================================================================
-- AUDIT FINDINGS (2026-05-07):
-- The on_auth_user_created trigger calls public.handle_new_user(). Its body
-- was hijacked at some point — it now writes to a vestigial public.user_profiles
-- table (a leftover construction-industry SaaS scaffold) instead of creating
-- the profiles/households/household_members rows the meal-planning app needs.
--
-- As a result, every auth user created since approximately 2026-02-10 has NO
-- row in public.profiles, public.households, or public.household_members.
-- A catch-all EXCEPTION handler in the hijacked function masked all errors,
-- which is why this went unnoticed for ~3 months.
--
-- This migration:
--   1. Restores handle_new_user() to the correct meal-planning version.
--   2. Backfills profiles/households/household_members for every auth.users
--      row that's currently missing them.
--   3. Demotes the bogus 'admin' rows in public.user_profiles to the lowest
--      privilege enum value (defense in depth — admin gating actually lives
--      in public.user_roles, not user_profiles, but we leave nothing to chance).
--
-- This migration intentionally does NOT drop the orphan scaffold (user_profiles,
-- companies, user_role enum, get_user_role/get_user_company, RLS policies).
-- That happens in a follow-up cleanup migration once this one is verified.
-- ============================================================================

-- 1. Restore handle_new_user(). Uses search_path = public to match the
--    originally-tracked function and to keep column DEFAULTs like
--    gen_random_uuid() resolvable. Errors are re-raised with full
--    diagnostics so a future hijack or schema drift surfaces a real
--    message instead of a generic "db error saving new user".
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_household_id uuid;
  full_name text;
  v_state   text;
  v_msg     text;
  v_detail  text;
  v_hint    text;
  v_context text;
BEGIN
  full_name := COALESCE(NEW.raw_user_meta_data ->> 'full_name', 'User');

  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, full_name)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.households (name)
  VALUES (full_name || '''s Family')
  RETURNING id INTO new_household_id;

  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (new_household_id, NEW.id, 'parent');

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state   = RETURNED_SQLSTATE,
      v_msg     = MESSAGE_TEXT,
      v_detail  = PG_EXCEPTION_DETAIL,
      v_hint    = PG_EXCEPTION_HINT,
      v_context = PG_EXCEPTION_CONTEXT;
    RAISE EXCEPTION
      'handle_new_user failed for auth user %: state=% msg=% detail=% hint=% context=%',
      NEW.id, v_state, v_msg, v_detail, v_hint, v_context;
END;
$function$;

-- 2. Backfill: for every auth user without a household_members row, create
--    a profile (if missing), a household, and the parent membership.
DO $$
DECLARE
  rec RECORD;
  new_household_id uuid;
  full_name text;
BEGIN
  FOR rec IN (
    SELECT u.id,
           COALESCE(u.raw_user_meta_data ->> 'full_name',
                    split_part(u.email, '@', 1)) AS fn
    FROM auth.users u
    LEFT JOIN public.household_members hm ON hm.user_id = u.id
    WHERE hm.user_id IS NULL
  ) LOOP
    full_name := COALESCE(rec.fn, 'User');

    INSERT INTO public.profiles (id, full_name)
    VALUES (rec.id, full_name)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.households (name)
    VALUES (full_name || '''s Family')
    RETURNING id INTO new_household_id;

    INSERT INTO public.household_members (household_id, user_id, role)
    VALUES (new_household_id, rec.id, 'parent');
  END LOOP;
END $$;

-- 3. Demote every bogus admin row in user_profiles to the lowest privilege.
--    Real admin gating lives in public.user_roles. This is defense in depth.
--    NOTE: user_profiles.role is stored as TEXT (it gets cast to public.user_role
--    only inside get_user_role() and the RLS policies), so compare as text.
UPDATE public.user_profiles
SET role = 'office_staff'
WHERE role = 'admin'
  AND id <> 'dc48c711-f059-443a-b4f2-585be6683c63';

-- 4. Fix the column default so anything that still inserts here doesn't
--    recreate the bug. (No app code does, but a future contractor or LLM
--    might. Cleanup migration drops the table entirely.)
ALTER TABLE public.user_profiles
  ALTER COLUMN role SET DEFAULT 'office_staff';
