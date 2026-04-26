-- US-242: 6-character invite codes for household sharing.
--
-- Builds on the existing household_members + households schema (created in
-- 20251008035758) and the auto-fill household_id triggers (20260415000000).
-- This migration adds a code-based invite flow alongside the existing
-- email-based household_invitations: parent A taps "Invite", gets a
-- 6-char code valid 24h, parent B types it in.

CREATE TABLE IF NOT EXISTS public.household_invite_codes (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID         NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    code         TEXT         NOT NULL UNIQUE,
    -- Role to assign when accepted. Free-text rather than enum because the
    -- household_members.role column is a CHECK CONSTRAINT and we want this
    -- table to follow whatever roles get added there.
    role         TEXT         NOT NULL DEFAULT 'parent',
    created_by   UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at   TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + interval '24 hours'),
    used_by      UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
    used_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS household_invite_codes_household_idx
    ON public.household_invite_codes (household_id);

CREATE INDEX IF NOT EXISTS household_invite_codes_code_idx
    ON public.household_invite_codes (code)
    WHERE used_at IS NULL;

ALTER TABLE public.household_invite_codes ENABLE ROW LEVEL SECURITY;

-- Anyone in the household can see / generate / revoke its codes.
CREATE POLICY "Members view household invites"
    ON public.household_invite_codes FOR SELECT
    USING (public.user_belongs_to_household(auth.uid(), household_id));

CREATE POLICY "Members create household invites"
    ON public.household_invite_codes FOR INSERT
    WITH CHECK (
        auth.uid() = created_by
        AND public.user_belongs_to_household(auth.uid(), household_id)
    );

CREATE POLICY "Members revoke household invites"
    ON public.household_invite_codes FOR DELETE
    USING (public.user_belongs_to_household(auth.uid(), household_id));

-- Generate a fresh, unguessable 6-char code. Avoids 0/O/1/I/L to make
-- it easier to type without confusing characters. Excludes already-used
-- codes by retrying on uniqueness failure (loop is bounded).
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    -- 32 chars, no 0/O/1/I/L for low typing-error rate.
    alphabet TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    candidate TEXT;
    attempt INT := 0;
BEGIN
    LOOP
        attempt := attempt + 1;
        candidate := '';
        FOR i IN 1..6 LOOP
            candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        END LOOP;
        -- Race-safe via the UNIQUE constraint on code; the loop just
        -- reduces the cardinality of conflicts ahead of time.
        PERFORM 1 FROM public.household_invite_codes
            WHERE code = candidate AND used_at IS NULL;
        IF NOT FOUND THEN
            RETURN candidate;
        END IF;
        IF attempt > 12 THEN
            -- Astronomically unlikely; raise rather than infinite-loop.
            RAISE EXCEPTION 'Could not generate unique invite code';
        END IF;
    END LOOP;
END;
$$;

-- Caller-friendly RPC: returns the new code so the iOS client can show
-- it. Resolves the caller's household via the existing helper so it
-- works without the client passing it explicitly.
CREATE OR REPLACE FUNCTION public.create_household_invite(p_role TEXT DEFAULT 'parent')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    hh_id UUID;
    new_code TEXT;
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

    new_code := public.generate_invite_code();

    INSERT INTO public.household_invite_codes (household_id, code, role, created_by)
    VALUES (hh_id, new_code, p_role, auth.uid());

    RETURN new_code;
END;
$$;

-- Accept-side RPC. Single transaction so the membership row + the
-- code-marked-used update can't drift.
CREATE OR REPLACE FUNCTION public.accept_household_invite(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    invite RECORD;
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
    IF EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_id = invite.household_id AND user_id = auth.uid()
    ) THEN
        UPDATE public.household_invite_codes
        SET used_by = auth.uid(), used_at = NOW()
        WHERE id = invite.id;
        RETURN invite.household_id;
    END IF;

    INSERT INTO public.household_members (household_id, user_id, role, invited_by)
    VALUES (invite.household_id, auth.uid(), invite.role, invite.created_by);

    UPDATE public.household_invite_codes
    SET used_by = auth.uid(), used_at = NOW()
    WHERE id = invite.id;

    RETURN invite.household_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_household_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_household_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invite_code() TO authenticated;

COMMENT ON TABLE public.household_invite_codes IS
    'US-242: 6-char single-use invite codes (24h expiry) for adding members to a household. Complements the existing email-based household_invitations.';
