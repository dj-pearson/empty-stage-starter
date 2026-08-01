-- US-596: kid_food_ladder — per-kid, per-food exposure ladder state.
--
-- Today the exposure hierarchy exists only as a dropdown in the "log an
-- attempt" dialog (src/components/FoodSuccessTracker.tsx). Every attempt is
-- written to food_attempts.stage and then never read back, so the app knows
-- what happened but not where a child *is*. This table is that missing state:
-- one row per (kid, food) holding the current rung, the counters that drive
-- progression, and when the food is next due.
--
-- Per CLAUDE.md backward-compat rules:
--   * Additive only — new table, new indexes, new policies.
--   * No ALTER/DROP/RENAME on foods, food_attempts, plan_entries or kids, so
--     every shipped iOS build keeps working against an unchanged shape.
--   * RLS household-scoped through kids, matching kid_growth_events
--     (20260520000002) — USING on every verb, WITH CHECK on INSERT.
--
-- current_rung deliberately reuses the eight stage labels already written to
-- food_attempts.stage. No new taxonomy: the ladder and the log speak the same
-- vocabulary, which is what makes the US-598 backfill possible at all.

CREATE TABLE IF NOT EXISTS public.kid_food_ladder (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id UUID NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,

  -- Where the child currently is. Same vocabulary as food_attempts.stage.
  current_rung TEXT NOT NULL DEFAULT 'looking'
    CHECK (current_rung IN (
      'looking', 'touching', 'smelling', 'licking',
      'tiny_taste', 'small_bite', 'full_bite', 'full_portion'
    )),

  -- Progression counters. successes drive advancement; holds are tracked so
  -- a food that stalls for weeks can be surfaced to the parent rather than
  -- silently re-presented forever.
  consecutive_successes INT NOT NULL DEFAULT 0 CHECK (consecutive_successes >= 0),
  consecutive_holds INT NOT NULL DEFAULT 0 CHECK (consecutive_holds >= 0),
  consecutive_refusals INT NOT NULL DEFAULT 0 CHECK (consecutive_refusals >= 0),

  last_attempt_at TIMESTAMPTZ,
  -- NULL means "not scheduled" — mastered and paused rows carry NULL.
  next_due_on DATE,

  -- The trusted food this exposure is served beside. ON DELETE SET NULL: losing
  -- the anchor must never cascade-delete a child's ladder progress.
  paired_safe_food_id UUID REFERENCES public.foods(id) ON DELETE SET NULL,
  -- Prep/slot that historically worked for this child, learned from
  -- food_attempts.preparation_method and meal_slot.
  preferred_prep TEXT,
  preferred_meal_slot TEXT,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'mastered', 'backed_off')),
  -- Free text so the UI can say *why* something is resting ('two refusals in a
  -- row', 'paused by parent') instead of showing an unexplained stopped row.
  paused_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One ladder row per kid per food. This is also what makes the US-598 backfill
-- idempotent: re-deriving from history upserts rather than duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS kid_food_ladder_kid_food_unique
  ON public.kid_food_ladder(kid_id, food_id);

-- Serves the scheduler's only hot query: "what is due for this kid today".
CREATE INDEX IF NOT EXISTS kid_food_ladder_due_idx
  ON public.kid_food_ladder(kid_id, status, next_due_on);

-- Supports the mastery -> chaining handoff (US-603) and anchor lookups.
CREATE INDEX IF NOT EXISTS kid_food_ladder_food_idx
  ON public.kid_food_ladder(food_id);

ALTER TABLE public.kid_food_ladder ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view kid food ladder"
  ON public.kid_food_ladder
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.kids k
      LEFT JOIN public.household_members hm ON hm.household_id = k.household_id
      WHERE k.id = kid_food_ladder.kid_id
        AND (k.user_id = auth.uid() OR hm.user_id = auth.uid())
    )
  );

CREATE POLICY "Members insert kid food ladder"
  ON public.kid_food_ladder
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.kids k
      LEFT JOIN public.household_members hm ON hm.household_id = k.household_id
      WHERE k.id = kid_food_ladder.kid_id
        AND (k.user_id = auth.uid() OR hm.user_id = auth.uid())
    )
  );

CREATE POLICY "Members update kid food ladder"
  ON public.kid_food_ladder
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.kids k
      LEFT JOIN public.household_members hm ON hm.household_id = k.household_id
      WHERE k.id = kid_food_ladder.kid_id
        AND (k.user_id = auth.uid() OR hm.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.kids k
      LEFT JOIN public.household_members hm ON hm.household_id = k.household_id
      WHERE k.id = kid_food_ladder.kid_id
        AND (k.user_id = auth.uid() OR hm.user_id = auth.uid())
    )
  );

CREATE POLICY "Members delete kid food ladder"
  ON public.kid_food_ladder
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.kids k
      LEFT JOIN public.household_members hm ON hm.household_id = k.household_id
      WHERE k.id = kid_food_ladder.kid_id
        AND (k.user_id = auth.uid() OR hm.user_id = auth.uid())
    )
  );

-- US-602: the "no more than N active exposures per kid per day" cap is a
-- safety rule, not a UI preference, so it is enforced here as well as in the
-- scheduler. A parent can have any number of foods on the ladder; what is
-- capped is how many are *due at once*, which is what reaches the child's
-- plate. Counting only same-day active rows keeps the check cheap.
CREATE OR REPLACE FUNCTION public.enforce_ladder_active_exposure_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  due_count INT;
  max_due CONSTANT INT := 3;
BEGIN
  IF NEW.status <> 'active' OR NEW.next_due_on IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO due_count
  FROM public.kid_food_ladder
  WHERE kid_id = NEW.kid_id
    AND id <> NEW.id
    AND status = 'active'
    AND next_due_on = NEW.next_due_on;

  IF due_count >= max_due THEN
    RAISE EXCEPTION
      'ladder_exposure_cap: kid % already has % exposures due on %; max is %',
      NEW.kid_id, due_count, NEW.next_due_on, max_due
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER kid_food_ladder_exposure_cap
  BEFORE INSERT OR UPDATE ON public.kid_food_ladder
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ladder_active_exposure_cap();

CREATE OR REPLACE FUNCTION public.touch_kid_food_ladder_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER kid_food_ladder_touch_updated_at
  BEFORE UPDATE ON public.kid_food_ladder
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_kid_food_ladder_updated_at();

COMMENT ON TABLE public.kid_food_ladder IS
  'US-596: per-kid, per-food exposure ladder state. current_rung reuses the eight food_attempts.stage labels. Progression is applied by src/lib/exposureLadder.ts (and its Swift mirror); a refusal steps the rung DOWN by design — pressure reduction, not repetition.';

COMMENT ON COLUMN public.kid_food_ladder.next_due_on IS
  'Date this exposure is next eligible for scheduling. NULL for mastered/paused rows. The scheduler never presents a food before this date, which is how the post-refusal cooldown is enforced.';

COMMENT ON COLUMN public.kid_food_ladder.paired_safe_food_id IS
  'Trusted anchor food served alongside the exposure. ON DELETE SET NULL so removing the anchor food never destroys ladder progress.';
