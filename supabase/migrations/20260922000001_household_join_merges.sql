-- Joining a co-parent's household moves you into it, and brings your data.
--
-- Every signup gets a household of its own (handle_new_user ->
-- ensure_user_household). accept_household_invite then added a SECOND
-- membership and never retired the first, and get_user_household_id resolved
-- "your household" with LIMIT 1 and no ORDER BY. Measured against a database
-- built from this migration history: after accepting, the joiner resolved to
-- their OWN old, empty household. Every RLS policy goes through that function,
-- so the joining parent saw none of their partner's kids, foods, plan or list,
-- and whatever they added landed where the partner could not see it.
--
-- Three changes, all additive for shipped clients (no column, table or RPC
-- signature changes):
--   1. get_user_household_id picks the most recently joined household.
--   2. merge_sole_member_households_into moves a user's content out of any
--      other household they are the ONLY member of, into the target, and
--      deletes the emptied household. A household someone else also belongs
--      to is left alone: that data is shared, so it is not ours to move.
--   3. accept_household_invite calls it after the membership insert, and a
--      one-time backfill runs it for users already split across two
--      households.

-- 1 --------------------------------------------------------------------------
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
  ORDER BY joined_at DESC NULLS LAST, household_id
  LIMIT 1
$$;

-- 2 --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_sole_member_households_into(
  p_user uuid,
  p_target uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_hh uuid;
  tbl text;
  merged integer := 0;
BEGIN
  FOR old_hh IN
    SELECT hm.household_id
      FROM public.household_members hm
     WHERE hm.user_id = p_user
       AND hm.household_id <> p_target
       AND NOT EXISTS (
         SELECT 1 FROM public.household_members other
          WHERE other.household_id = hm.household_id
            AND other.user_id <> p_user
       )
  LOOP
    -- Rows whose natural key the target already holds: the target's copy
    -- wins, so the move below cannot hit a unique index.
    DELETE FROM public.user_product_preferences s
     WHERE s.household_id = old_hh
       AND (
         EXISTS (SELECT 1 FROM public.user_product_preferences t
                  WHERE t.household_id = p_target
                    AND t.name_normalized = s.name_normalized)
         OR (s.barcode IS NOT NULL AND EXISTS (
               SELECT 1 FROM public.user_product_preferences t
                WHERE t.household_id = p_target
                  AND t.barcode = s.barcode))
       );

    DELETE FROM public.auto_restock_blocklist s
     WHERE s.household_id = old_hh
       AND EXISTS (SELECT 1 FROM public.auto_restock_blocklist t
                    WHERE t.household_id = p_target
                      AND t.name_normalized = s.name_normalized);

    -- One default list per household in practice; keep the target's.
    UPDATE public.grocery_lists
       SET is_default = false
     WHERE household_id = old_hh
       AND is_default
       AND EXISTS (SELECT 1 FROM public.grocery_lists t
                    WHERE t.household_id = p_target AND t.is_default);

    -- What the user made. Derived and per-household bookkeeping (reports,
    -- suggestions, analytics snapshots, notification queues, preferences)
    -- is regenerated and goes with the old household below.
    FOREACH tbl IN ARRAY ARRAY[
      'kids', 'foods', 'recipes', 'recipe_collections', 'plan_entries',
      'grocery_lists', 'grocery_items', 'grocery_purchase_history',
      'store_layouts', 'meal_plan_templates', 'inventory_movements',
      'item_stock', 'user_product_preferences', 'auto_restock_blocklist'
    ] LOOP
      EXECUTE format(
        'UPDATE public.%I SET household_id = $1 WHERE household_id = $2', tbl
      ) USING p_target, old_hh;
    END LOOP;

    -- Every FK to households cascades, so this also removes the membership.
    DELETE FROM public.households WHERE id = old_hh;
    merged := merged + 1;
  END LOOP;

  RETURN merged;
END;
$$;

COMMENT ON FUNCTION public.merge_sole_member_households_into(uuid, uuid) IS
  'Moves a user''s content out of every other household they are the only member of into p_target, then deletes those households. Shared households are untouched. Called by accept_household_invite; not callable by clients.';

REVOKE ALL ON FUNCTION public.merge_sole_member_households_into(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- 3 --------------------------------------------------------------------------
-- Replaced verbatim from 20260909000000 with three changes: the merge call
-- after the membership insert, the same call on the already-a-member path so
-- that re-using a code heals an account split before this migration, and an
-- explicit joined_at on the insert.
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

-- 4 --------------------------------------------------------------------------
-- One-time repair for accounts already split across two households: merge
-- into the household they joined most recently, which is the one step 1 now
-- resolves to.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (user_id) user_id, household_id
      FROM public.household_members
     WHERE user_id IN (
       SELECT user_id FROM public.household_members
        GROUP BY user_id HAVING count(*) > 1
     )
     ORDER BY user_id, joined_at DESC NULLS LAST, household_id
  LOOP
    PERFORM public.merge_sole_member_households_into(r.user_id, r.household_id);
  END LOOP;
END $$;
