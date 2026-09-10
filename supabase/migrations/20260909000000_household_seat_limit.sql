-- US-840: household seats are a paid feature and nothing charged for them.
--
-- docs/entitlements.md carries the limit table Dj signed off on 2026-09-03:
--
--     Household members | Free 1 | Pro 1 | Family Plus unlimited | Professional unlimited
--
-- and records the gap beside it: "no gate exists at the invite path". There is
-- no gate anywhere. accept_household_invite (20260426000001) inserts into
-- household_members with no plan lookup at all, so a Free account can mint
-- invite links and add caregivers without limit -- which is the whole of what
-- Family Plus sells over Pro.
--
-- WHOSE PLAN COUNTS. The household's, not the joiner's, and the household has
-- no owner column: public.households is (id, name, created_at, updated_at).
-- The earliest household_members row is the person who created it -- see
-- ensure_user_household, which inserts the creator as the first member -- so
-- household_owner_id resolves that, tie-broken by id for a same-instant pair.
-- Anything else lets a Free household fill up by having a Family Plus friend
-- accept first.
--
-- NOBODY IS EVICTED. The check runs on the accept path only. A household that
-- already exceeds its new limit keeps every member it has; it simply cannot add
-- another until it upgrades. Enforcing against existing rows would remove a
-- caregiver's access to a child's food history without warning, which is not a
-- billing correction, it is data loss.
--
-- BACKWARD COMPATIBILITY. Additive per CLAUDE.md: one nullable column, two new
-- functions, and CREATE OR REPLACE on two existing ones. No column is dropped,
-- renamed or retyped, and no policy is narrowed. Shipped iOS builds already
-- call accept_household_invite and will surface the RAISE message, so the
-- message is written to be read by a person rather than parsed.

-- --- the limit column --------------------------------------------------------
--
-- NULL means unlimited, matching max_children and max_pantry_foods. The column
-- is added without a default so an unseeded plan reads NULL/unlimited rather
-- than silently capping a paying tier at whatever the default happened to be.
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS max_household_members INTEGER;

COMMENT ON COLUMN public.subscription_plans.max_household_members IS
  'Seats in one household, counting the owner. NULL is unlimited. Enforced by accept_household_invite; see docs/entitlements.md.';

-- Seeded by name because that is how the plans are identified everywhere else
-- (plan_name_for_apple_product, current_user_plan_name). 'Family%' covers both
-- the early 'Family' seed and the later 'Family Plus'.
UPDATE public.subscription_plans SET max_household_members = 1 WHERE name IN ('Free', 'Pro');
UPDATE public.subscription_plans SET max_household_members = NULL WHERE name LIKE 'Family%' OR name = 'Professional';

-- --- who owns a household ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.household_owner_id(p_household_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id
  FROM public.household_members
  WHERE household_id = p_household_id
  ORDER BY joined_at ASC NULLS LAST, id ASC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.household_owner_id(UUID) IS
  'The user who created a household: its earliest member. public.households has no owner column, and the creator is inserted first by ensure_user_household.';

-- --- how many seats that household is entitled to ----------------------------
--
-- Goes through effective_plan_id (US-780), so an App Store or comped
-- subscriber counts as paid here for the same reason they do everywhere else.
-- No entitlement falls back to the Free row, which is where the 1 lives -- not
-- to a literal, so changing the seed changes the limit.
CREATE OR REPLACE FUNCTION public.household_seat_limit(p_household_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner   UUID;
  v_plan_id UUID;
  v_limit   INTEGER;
BEGIN
  v_owner := public.household_owner_id(p_household_id);
  IF v_owner IS NULL THEN
    -- An empty household is about to get its first member. Never block that.
    RETURN NULL;
  END IF;

  v_plan_id := public.effective_plan_id(v_owner);

  IF v_plan_id IS NULL THEN
    SELECT max_household_members INTO v_limit
    FROM public.subscription_plans WHERE name = 'Free' LIMIT 1;
  ELSE
    SELECT max_household_members INTO v_limit
    FROM public.subscription_plans WHERE id = v_plan_id;
  END IF;

  RETURN v_limit;  -- NULL is unlimited
END;
$$;

COMMENT ON FUNCTION public.household_seat_limit(UUID) IS
  'Seats the household owner''s plan allows, NULL for unlimited. Resolves entitlement through effective_plan_id so Stripe, comp and App Store subscribers are all counted as paid.';

REVOKE ALL ON FUNCTION public.household_owner_id(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.household_seat_limit(UUID) FROM PUBLIC;

-- --- the gate ----------------------------------------------------------------
--
-- Replaced verbatim from 20260426000001 with the seat check inserted; the diff
-- is a pure insertion. US-780 learned this the hard way -- rewriting a function
-- to change its lookup silently dropped two live usage branches.
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
    LIMIT 1;

    IF invite.id IS NULL THEN
        RAISE EXCEPTION 'Invite code is invalid or expired';
    END IF;

    -- Idempotent: if the user is already in the household, just mark the
    -- code used and return — no double-membership rows.
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

    INSERT INTO public.household_members (household_id, user_id, role, invited_by)
    VALUES (invite.household_id, auth.uid(), invite.role, invite.created_by);

    UPDATE public.household_invite_codes
    SET used_by = auth.uid(), used_at = NOW()
    WHERE id = invite.id;

    RETURN invite.household_id;
END;
$$;

-- --- fail early, not after the link has been shared --------------------------
--
-- The accept side above is authoritative. This one exists so the owner is told
-- while they are looking at the button, rather than after a caregiver has
-- already tried and failed to join.
CREATE OR REPLACE FUNCTION public.create_household_invite(p_role TEXT DEFAULT 'parent')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    hh_id UUID;
    new_code TEXT;
    v_limit INTEGER;
    v_seats INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in required';
    END IF;

    SELECT public.get_user_household_id(auth.uid()) INTO hh_id;
    IF hh_id IS NULL THEN
        -- Auto-provision so a brand-new user can invite without a prior
        -- household-creation step.
        SELECT public.ensure_user_household() INTO hh_id;
    END IF;

    -- Validate role against the same CHECK constraint used by household_members
    -- so we never issue a code that can't be redeemed.
    IF p_role NOT IN ('parent', 'guardian') THEN
        RAISE EXCEPTION 'Invalid role: %', p_role;
    END IF;

    -- US-840: don't mint a link that cannot be redeemed.
    v_limit := public.household_seat_limit(hh_id);
    IF v_limit IS NOT NULL THEN
        SELECT COUNT(*) INTO v_seats
        FROM public.household_members
        WHERE household_id = hh_id;

        IF v_seats >= v_limit THEN
            RAISE EXCEPTION
              'This household is on a plan with % seat(s) and is full. Upgrade to Family Plus to add more caregivers.',
              v_limit
              USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    new_code := public.generate_invite_code();

    INSERT INTO public.household_invite_codes (household_id, code, role, created_by)
    VALUES (hh_id, new_code, p_role, auth.uid());

    RETURN new_code;
END;
$$;
