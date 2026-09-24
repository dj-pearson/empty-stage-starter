-- Food journal: how much a child ate, and notes the whole household can read.
--
-- A caregiver tracking a child with ARFID alongside the child's parent asked
-- for two things: to record whether the child ate a lot, some, or only
-- nibbled, and to be able to read back the notes they had been writing.
--
-- 1. plan_entries.amount_eaten. Nullable, so every shipped iOS build (which
--    neither sends nor reads it) is unaffected. NULL means "not recorded",
--    which is also what every existing row holds. The CHECK only constrains
--    the new column, so no existing row or in-flight write from an old client
--    can violate it.
--
-- 2. plan_entry_feedback was readable only by the user who wrote it
--    (20260425000001). That is where the iOS "How was it?" sheet saves its
--    note, so a note written by one caregiver was invisible to the other, on
--    every device. This adds a SELECT policy for members of the household that
--    owns the plan entry. It broadens access only; the owner policy stays, and
--    INSERT / UPDATE / DELETE remain owner-only.

ALTER TABLE public.plan_entries
  ADD COLUMN IF NOT EXISTS amount_eaten TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'plan_entries_amount_eaten_check'
       AND conrelid = 'public.plan_entries'::regclass
  ) THEN
    ALTER TABLE public.plan_entries
      ADD CONSTRAINT plan_entries_amount_eaten_check
      CHECK (amount_eaten IS NULL OR amount_eaten IN ('a_lot', 'some', 'nibbles'));
  END IF;
END $$;

COMMENT ON COLUMN public.plan_entries.amount_eaten IS
  'How much of the food the child ate: a_lot, some or nibbles. NULL when not recorded.';

DROP POLICY IF EXISTS "Household members view feedback" ON public.plan_entry_feedback;

CREATE POLICY "Household members view feedback"
  ON public.plan_entry_feedback
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.plan_entries pe
       WHERE pe.id = plan_entry_feedback.plan_entry_id
         AND pe.household_id = public.get_user_household_id(auth.uid())
    )
  );
