-- Household membership: who can add, change and remove members.
--
-- migration-safety: allow drop-policy (household_members INSERT/UPDATE and household_invite_codes INSERT have no client writer in ios/, app/ or src/; joins and invites go through SECURITY DEFINER RPCs)
--
-- WHAT WAS OPEN (20251124000000, 20260426000001)
--   1. "Members can insert household members" let a member INSERT a row for
--      a different user straight into their household: no invite, and no US-840
--      seat check, which lives only in accept_household_invite.
--   2. "Members can update household members" let a member rewrite a row's
--      role, user_id or household_id.
--   3. "Members can delete household members" let a member delete a different
--      member's row, the owner's included, and nothing stopped the owner
--      walking out and leaving the rest without one.
--   4. "Members create household invites" let a member insert an invite code
--      of their own choosing with an arbitrary expiry, around
--      create_household_invite.
--   5. accept_household_invite read the invite without a lock, so two
--      sessions could redeem one code, and two joiners on different codes
--      could both pass a one-seat check.
--   6. user_belongs_to_household and get_user_household_id answered anon
--      about arbitrary user ids over PostgREST RPC.
--
-- WHAT SHIPPED CLIENTS DO (checked 2026-09-24)
--   iOS HouseholdService.swift: reads households/household_members/codes,
--     deletes household_members by id (removeMember, :57), deletes invite codes
--     by id (revokeInvite, :109), and goes through create_household_invite /
--     accept_household_invite for everything else. renameHousehold (:36)
--     exists but has no caller. OfflineStore refuses to replay a
--     household_members update (OfflineStoreReplayRoutingTests).
--   Web useHousehold.ts: SELECTs, the two RPCs, invite-code DELETE, member
--     DELETE (remove, and leave on the caller's own row) and a households
--     UPDATE of name that the page offers to every member.
--   Nothing INSERTs or UPDATEs household_members or INSERTs an invite code
--   directly, so dropping those three policies removes no path a client uses.
--
-- WHY DELETE KEEPS ITS POLICY AND GAINS A TRIGGER
--   iOS deletes member rows directly, both to remove someone and to remove
--   itself. A narrower policy could express "your own row" but not "unless
--   you are the owner and others remain", so the policy stays as it is and a
--   BEFORE DELETE trigger carries the rules:
--     - you may delete your own row (leave), unless you own the household and
--       other members remain;
--     - only the owner may delete another member's row.
--   The owner is household_owner_id (earliest joined_at, then id). Since the
--   owner can only leave last, a household with members always has one.
--   An older iOS build that removes someone it may not now gets a 42501 with a
--   sentence written for a person, which its toast shows.
--
-- WHY ANON KEEPS EXECUTE ON THE TWO HELPERS
--   82 policies on 27 tables (foods, recipes, kids, plan_entries,
--   grocery_items, household_members, ...) call these helpers and are
--   declared for every role, anon included. Postgres checks EXECUTE when the
--   query starts, whether or not the policy would ever be evaluated, so
--   revoking anon turns every signed-out read of those tables (a Realtime
--   channel opened before sign-in, a page that reads before its session
--   resolves) from zero rows into "permission denied for function
--   get_user_household_id". Measured against a database built from this
--   tree. Instead, both helpers now return the anon answer (false / NULL)
--   whatever arguments they are given when the request role is anon, which is
--   what every policy already got, since auth.uid() is NULL for anon.
--
-- Backward compatible: no column, table or RPC signature changes.

-- 1 --- the two helpers stop answering anon ----------------------------------
--
-- current_setting('role') is what PostgREST and Realtime SET LOCAL for the
-- request. SECURITY DEFINER changes current_user, not that setting, so it
-- still reads 'anon' in here.
CREATE OR REPLACE FUNCTION public.user_belongs_to_household(_user_id uuid, _household_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT current_setting('role', true) IS DISTINCT FROM 'anon'
     AND EXISTS (
       SELECT 1
       FROM public.household_members
       WHERE user_id = _user_id
       AND household_id = _household_id
     )
$$;

-- Body from 20260922000001 with the anon guard added.
CREATE OR REPLACE FUNCTION public.get_user_household_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id
  FROM public.household_members
  WHERE user_id = _user_id
    AND current_setting('role', true) IS DISTINCT FROM 'anon'
  ORDER BY joined_at DESC NULLS LAST, household_id
  LIMIT 1
$$;

COMMENT ON FUNCTION public.user_belongs_to_household(uuid, uuid) IS
  'RLS helper. anon EXECUTE is deliberate: policies declared for every role '
  'call it, and a revoke makes signed-out reads error instead of returning no '
  'rows. It answers false for the anon role whatever it is asked.';

COMMENT ON FUNCTION public.get_user_household_id(uuid) IS
  'RLS helper: the household the user joined most recently. anon EXECUTE is '
  'deliberate (see user_belongs_to_household); it returns NULL for the anon role.';

-- 2 --- household_members: no direct INSERT or UPDATE ------------------------
--
-- Membership rows are written by handle_new_user / ensure_user_household and
-- accept_household_invite, all SECURITY DEFINER, which RLS does not apply to.
DROP POLICY IF EXISTS "Members can insert household members" ON public.household_members;
DROP POLICY IF EXISTS "Members can update household members" ON public.household_members;

-- 3 --- household_members: DELETE rules --------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_household_member_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_owner  uuid;
  v_others integer;
BEGIN
  -- Only a signed-in client request is policed. Migrations, cron, the service
  -- role and the auth admin API (account deletion) have no role GUC of
  -- 'authenticated' or no user, and are trusted.
  IF v_actor IS NULL
     OR current_setting('role', true) IS DISTINCT FROM 'authenticated' THEN
    RETURN OLD;
  END IF;

  -- A cascade, not a choice: the household itself is being deleted
  -- (merge_sole_member_households_into does this on join), or the member's
  -- account is.
  IF NOT EXISTS (SELECT 1 FROM public.households WHERE id = OLD.household_id)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN
    RETURN OLD;
  END IF;

  -- Serialise with accept_household_invite and with a concurrent removal, so
  -- the count below is the count that commits.
  PERFORM 1 FROM public.households WHERE id = OLD.household_id FOR NO KEY UPDATE;

  v_owner := public.household_owner_id(OLD.household_id);

  IF OLD.user_id = v_actor THEN
    IF OLD.user_id = v_owner THEN
      SELECT count(*) INTO v_others
      FROM public.household_members
      WHERE household_id = OLD.household_id AND id <> OLD.id;

      IF v_others > 0 THEN
        RAISE EXCEPTION
          'You set up this household, so you can''t leave while others are in it. Remove the other members first.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF v_actor IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION
      'Only the person who set up this household can remove other members.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_household_member_delete() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.enforce_household_member_delete() IS
  'BEFORE DELETE on household_members: a member may leave (not the owner while '
  'others remain); only the owner may remove someone else. Cascades and '
  'non-client roles pass.';

DROP TRIGGER IF EXISTS enforce_household_member_delete ON public.household_members;
CREATE TRIGGER enforce_household_member_delete
  BEFORE DELETE ON public.household_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_household_member_delete();

-- 4 --- households UPDATE: the row has to stay yours -------------------------
--
-- Name stays writable by every member: the web Household page offers rename
-- to co-parents (HouseholdHeader), and no shipped iOS build writes households.
-- The policy had no WITH CHECK, so an UPDATE could also move the row's id.
ALTER POLICY "Members can update their households" ON public.households
  WITH CHECK (public.user_belongs_to_household(auth.uid(), id));

-- 5 --- invite codes are minted by create_household_invite only --------------
DROP POLICY IF EXISTS "Members create household invites" ON public.household_invite_codes;

-- 6 --- accept_household_invite: lock the code and the household -------------
--
-- Replaced verbatim from 20260922000001 with two changes: FOR UPDATE on the
-- invite read, so a second redemption waits and then finds used_at set, and
-- a FOR NO KEY UPDATE on the household row, so two joiners are counted
-- against the seat limit one after the other. Signature unchanged.
CREATE OR REPLACE FUNCTION public.accept_household_invite(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    invite RECORD;
    v_limit INTEGER;
    v_seats INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in required';
    END IF;

    SELECT * INTO invite
    FROM public.household_invite_codes
    WHERE code = upper(trim(p_code))
      AND used_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
    FOR UPDATE;

    IF invite.id IS NULL THEN
        RAISE EXCEPTION 'Invite code is invalid or expired';
    END IF;

    PERFORM 1 FROM public.households WHERE id = invite.household_id FOR NO KEY UPDATE;

    -- Idempotent: if the user is already in the household, just mark the
    -- code used and return; no double-membership rows.
    --
    -- Deliberately BEFORE the seat check. Re-running a code you have already
    -- redeemed consumes no seat, so a full household must not turn a no-op
    -- into an error.
    IF EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_id = invite.household_id AND user_id = auth.uid()
    ) THEN
        UPDATE public.household_invite_codes
        SET used_by = auth.uid(), used_at = NOW()
        WHERE id = invite.id;
        PERFORM public.merge_sole_member_households_into(auth.uid(), invite.household_id);
        RETURN invite.household_id;
    END IF;

    -- US-840: the seat gate.
    v_limit := public.household_seat_limit(invite.household_id);
    IF v_limit IS NOT NULL THEN
        SELECT COUNT(*) INTO v_seats
        FROM public.household_members
        WHERE household_id = invite.household_id;

        IF v_seats >= v_limit THEN
            RAISE EXCEPTION
              'This household is on a plan with % seat(s) and is full. Upgrade to Family Plus to add more caregivers.',
              v_limit
              USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- clock_timestamp(), not the column default now(): now() is the
    -- transaction start, so a signup and a join in one transaction tie, and
    -- get_user_household_id orders by joined_at to pick the newest.
    INSERT INTO public.household_members (household_id, user_id, role, invited_by, joined_at)
    VALUES (invite.household_id, auth.uid(), invite.role, invite.created_by, clock_timestamp());

    PERFORM public.merge_sole_member_households_into(auth.uid(), invite.household_id);

    UPDATE public.household_invite_codes
    SET used_by = auth.uid(), used_at = NOW()
    WHERE id = invite.id;

    RETURN invite.household_id;
END;
$$;
