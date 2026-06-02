-- US-319: make handle_new_user() idempotent on the household/membership
-- inserts, hardening the signup path against duplicate-household errors on
-- retried or re-fired signups.
--
-- BACKGROUND
-- 20260512000000_restore_handle_new_user.sql restored the meal-planning
-- version of handle_new_user() (writes profiles + households +
-- household_members; re-raises on error so a future hijack surfaces loudly).
-- 20260513000000_drop_user_profiles_scaffold.sql then dropped the orphan
-- user_profiles scaffold.
--
-- VERIFICATION (AC item 1) — confirmed by inspection of the restored
-- function body: handle_new_user() references ONLY public.profiles,
-- public.households, and public.household_members. It does NOT reference
-- public.user_profiles, so dropping that scaffold cannot break the trigger.
-- This migration re-asserts that correct body, so the function is
-- self-consistently free of any user_profiles dependency going forward.
--
-- WHAT CHANGES (AC items 2 & 3)
--   * Idempotency guard: a household + parent membership are created ONLY
--     when the user doesn't already have a household_members row. This is
--     the concrete fix for "duplicate-household errors on retried signups" —
--     the previous body created a brand-new household every time it ran
--     (households has a uuid PK, so the INSERT never conflicted, and the
--     household_members UNIQUE(household_id,user_id) never tripped because
--     each duplicate household had a fresh id). The guard makes a second
--     run a no-op instead.
--   * household_members INSERT also carries ON CONFLICT DO NOTHING as a
--     belt-and-suspenders against the unique constraint.
--   * profiles INSERT keeps ON CONFLICT (id) DO NOTHING (already idempotent).
--
-- WHY WE KEEP THE RE-RAISE (deliberate, AC item 3 considered)
-- The catch-all EXCEPTION-swallow in the *hijacked* function is exactly what
-- hid a 3-month outage where no households were being created. Softening to a
-- swallow here would reintroduce that silent-failure class. With the
-- idempotency guard above, the realistic failure mode (retried signup ->
-- duplicate) is gone, so the only thing left for the handler to catch is a
-- genuinely unexpected error (schema drift, another hijack) — which we WANT
-- to surface. A user who somehow ends up with a profile but no household is
-- still recoverable via the backfill block in 20260512000000. Net: keep the
-- loud re-raise, but make the common path incapable of producing the error.
--
-- Per CLAUDE.md backward-compat rules: CREATE OR REPLACE FUNCTION is
-- additive (no signature/return change), the trigger binding is unchanged,
-- and the new body is a strict superset (same writes, now guarded), so older
-- clients and in-flight signups are unaffected.

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

  -- Idempotency guard: only bootstrap a household + parent membership when
  -- this user isn't already in one. Makes the trigger safe to run more than
  -- once for the same auth user (retried signup, manual re-run, overlap with
  -- the backfill) without creating duplicate households.
  IF NOT EXISTS (
    SELECT 1 FROM public.household_members hm WHERE hm.user_id = NEW.id
  ) THEN
    INSERT INTO public.households (name)
    VALUES (full_name || '''s Family')
    RETURNING id INTO new_household_id;

    INSERT INTO public.household_members (household_id, user_id, role)
    VALUES (new_household_id, NEW.id, 'parent')
    ON CONFLICT (household_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise with full diagnostics (kept intentionally — see header).
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
