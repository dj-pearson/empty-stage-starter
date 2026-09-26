-- Care report share links.
--
-- A parent can hand a child's care report to a psychologist, feeding
-- therapist or dietitian as a link: /care/<token> shows the report read-only,
-- with no account needed. This is the "expiring read-only link" tier of the
-- care-team work. A clinician account that follows a child live is out of
-- scope on purpose (HIPAA business-associate exposure, state consumer-health
-- privacy law); a link to a snapshot the parent chose to send is not that.
--
-- Shape, modelled on recipe_shares (20260927000001):
--   * One row per link. The token is minted by the database (two v4 uuids,
--     244 random bits, hex); a client cannot pick one.
--   * The report is a SNAPSHOT (jsonb) built on the parent's device at share
--     time: exactly what they previewed, nothing live. It carries a first name
--     and food names, never an id, date of birth, allergy list or household
--     field (src/lib/careReport.ts is that boundary, and its schema is what
--     the page checks before rendering).
--   * Every link expires, at most 90 days after it was made, and can be
--     revoked sooner. Revoking is one-way. There is no DELETE: the row is the
--     record of what was shared, when, and how often it was opened.
--   * consent_version records which wording of the consent step the parent
--     accepted before the link was made. The row existing is the consent.
--   * anon has no privilege on the table. The only way in without a session is
--     get_shared_care_report(token), SECURITY DEFINER, which returns the
--     snapshot and its dates, counts the view, and returns nothing at all for
--     an unknown, revoked or expired token.
--
-- Additive only: a new table and new functions. No shipped iOS build reads
-- either.

CREATE TABLE IF NOT EXISTS public.care_report_shares (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  kid_id          uuid NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  token           text NOT NULL DEFAULT (
                    replace(gen_random_uuid()::text, '-', '') ||
                    replace(gen_random_uuid()::text, '-', '')
                  ),
  -- The parent's own reminder of who has it ("Dr. Lee"). Never returned by
  -- the public read.
  label           text,
  report          jsonb NOT NULL,
  consent_version text NOT NULL,
  expires_at      timestamptz NOT NULL,
  created_by      uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz,
  view_count      integer NOT NULL DEFAULT 0,
  last_viewed_at  timestamptz,
  CONSTRAINT care_report_shares_token_key UNIQUE (token),
  CONSTRAINT care_report_shares_token_length CHECK (char_length(token) >= 32),
  CONSTRAINT care_report_shares_label_length CHECK (label IS NULL OR char_length(label) <= 60),
  CONSTRAINT care_report_shares_report_object CHECK (jsonb_typeof(report) = 'object'),
  -- A year of daily notes is well under this; the cap is there so the table
  -- cannot be used as free storage.
  CONSTRAINT care_report_shares_report_size CHECK (octet_length(report::text) <= 262144),
  CONSTRAINT care_report_shares_consent_version CHECK (char_length(consent_version) BETWEEN 1 AND 32),
  CONSTRAINT care_report_shares_expiry_window CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '90 days'
  )
);

CREATE INDEX IF NOT EXISTS care_report_shares_household_idx
  ON public.care_report_shares (household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS care_report_shares_kid_idx
  ON public.care_report_shares (kid_id);

ALTER TABLE public.care_report_shares ENABLE ROW LEVEL SECURITY;

-- Table privileges: nothing for anon, and only the columns a member may set.
REVOKE ALL ON TABLE public.care_report_shares FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.care_report_shares TO authenticated;
GRANT INSERT (household_id, kid_id, label, report, consent_version, expires_at)
  ON TABLE public.care_report_shares TO authenticated;
GRANT UPDATE (revoked_at) ON TABLE public.care_report_shares TO authenticated;
GRANT ALL ON TABLE public.care_report_shares TO service_role;

-- The grants are the first line; the triggers hold where a blanket GRANT ALL
-- sits on top (the local SQL harness does that). The token, dates and view
-- counters are always the database's.
CREATE OR REPLACE FUNCTION public.care_report_shares_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  NEW.created_at := now();
  NEW.revoked_at := NULL;
  NEW.view_count := 0;
  NEW.last_viewed_at := NULL;
  RETURN NEW;
END;
$$;

-- A member may only revoke. The view counters move only inside
-- get_shared_care_report, which runs as the function owner, so the check is
-- on the caller's role: a signed-in client cannot inflate or reset them.
CREATE OR REPLACE FUNCTION public.care_report_shares_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.household_id IS DISTINCT FROM OLD.household_id
     OR NEW.kid_id IS DISTINCT FROM OLD.kid_id
     OR NEW.token IS DISTINCT FROM OLD.token
     OR NEW.label IS DISTINCT FROM OLD.label
     OR NEW.report IS DISTINCT FROM OLD.report
     OR NEW.consent_version IS DISTINCT FROM OLD.consent_version
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR (NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM OLD.created_by)
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'care_report_shares: only revoked_at can change'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF current_user IN ('anon', 'authenticated')
     AND (NEW.view_count IS DISTINCT FROM OLD.view_count
          OR NEW.last_viewed_at IS DISTINCT FROM OLD.last_viewed_at) THEN
    RAISE EXCEPTION 'care_report_shares: view counters are not client-writable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.care_report_shares_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.care_report_shares_before_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS care_report_shares_before_insert ON public.care_report_shares;
CREATE TRIGGER care_report_shares_before_insert
  BEFORE INSERT ON public.care_report_shares
  FOR EACH ROW EXECUTE FUNCTION public.care_report_shares_before_insert();

DROP TRIGGER IF EXISTS care_report_shares_before_update ON public.care_report_shares;
CREATE TRIGGER care_report_shares_before_update
  BEFORE UPDATE ON public.care_report_shares
  FOR EACH ROW EXECUTE FUNCTION public.care_report_shares_before_update();

DROP POLICY IF EXISTS "Household members view care report shares" ON public.care_report_shares;
CREATE POLICY "Household members view care report shares"
  ON public.care_report_shares
  FOR SELECT
  TO authenticated
  USING (household_id = (SELECT public.get_user_household_id(auth.uid())));

-- The child has to belong to the same household: a member cannot share a
-- report under another household's child by guessing its id.
DROP POLICY IF EXISTS "Household members create care report shares" ON public.care_report_shares;
CREATE POLICY "Household members create care report shares"
  ON public.care_report_shares
  FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id = (SELECT public.get_user_household_id(auth.uid()))
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.kids k
       WHERE k.id = care_report_shares.kid_id
         AND k.household_id = care_report_shares.household_id
    )
  );

DROP POLICY IF EXISTS "Household members revoke care report shares" ON public.care_report_shares;
CREATE POLICY "Household members revoke care report shares"
  ON public.care_report_shares
  FOR UPDATE
  TO authenticated
  USING (
    household_id = (SELECT public.get_user_household_id(auth.uid()))
    AND revoked_at IS NULL
  )
  WITH CHECK (
    household_id = (SELECT public.get_user_household_id(auth.uid()))
    AND revoked_at IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- get_shared_care_report(token): the public read.
--
-- Zero rows for an unknown, malformed, revoked or expired token, so a caller
-- cannot tell which. A successful read counts one view, which is how the
-- parent's list shows "opened 3 times, last on ...". Only the snapshot and
-- its two dates come back: no household, kid, label or author column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shared_care_report(p_token text)
RETURNS TABLE (
  report     jsonb,
  shared_at  timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR char_length(p_token) < 32 OR char_length(p_token) > 128 THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.care_report_shares s
     SET view_count = s.view_count + 1,
         last_viewed_at = now()
   WHERE s.token = p_token
     AND s.revoked_at IS NULL
     AND s.expires_at > now()
  RETURNING s.report, s.created_at, s.expires_at;
END;
$$;

-- US-804: name the roles. A signed-out clinician opens the link, so anon
-- keeps EXECUTE on purpose.
REVOKE ALL ON FUNCTION public.get_shared_care_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_care_report(text) TO anon, authenticated;

COMMENT ON TABLE public.care_report_shares IS
  'Expiring, revocable links to a snapshot of one child''s care report. Read publicly only through get_shared_care_report(token).';
COMMENT ON FUNCTION public.get_shared_care_report(text) IS
  'Public read of a shared care report snapshot. Counts the view. Nothing for a revoked or expired token.';
