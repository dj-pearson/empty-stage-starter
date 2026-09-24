-- Items 40 and 41: the exposure ladder on for everyone, and a meal result
-- recorded at the rung the child is actually on.
--
-- 1. exposure_ladder flag row, enabled at 100%.
--
--    The web client now defaults the flag on, but evaluate_feature_flag
--    returns FALSE for a key with no row, so without a row the RPC path would
--    keep the ladder surfaces off for every signed-in user. The row is the
--    real default. It is also the kill switch: setting enabled = false turns
--    the ladder-dependent surfaces off again (Food Tracker itself no longer
--    asks; its legacy fallback is deleted).
--
--    ON CONFLICT DO UPDATE on purpose. The owner approved turning the ladder
--    on for everyone, and an existing row from the beta (enabled with a
--    targeted user list, or at a partial rollout) would otherwise keep it off
--    for most households. Only enabled and rollout_percentage are touched.
--
-- 2. create_attempt_from_plan_result writes the ladder rung as the stage.
--
--    Setting plan_entries.result (the web quick log, the journal editor, the
--    planner, and every shipped iOS build) fires this BEFORE UPDATE trigger,
--    which inserts one food_attempts row. It used to stamp a fixed stage per
--    result: ate = full_portion, tasted = small_bite, refused = looking. For a
--    food on an active ladder that is a false record -- a child on 'touching'
--    who touched the food is logged as having taken a small bite -- and
--    deriveLadderFromAttempts reads those stages back, so the lie compounds.
--    Now, when the kid has an active (or backed_off) ladder row for the food,
--    the attempt is recorded at that row's current_rung, which is exactly what
--    useFoodLadder.buildQuickLogWrites records for a ladder log (the rung the
--    child was asked for, not the one they end on). Foods with no active
--    ladder row keep the old fixed stages.
--
--    The outcome mapping is unchanged and matches useFoodLadder's quick log:
--    ate = success (accepted), tasted = partial (held), refused = refused.
--
--    The ladder MOVE is not done here. The progression rules live in
--    src/lib/exposureLadder.ts (mirrored in Swift); a third copy in plpgsql
--    would drift. The web client folds these plan-born attempts into the
--    ladder with that same policy (syncLadderFromPlanAttempts in
--    src/hooks/useFoodLadder.ts), right after a quick log and whenever a
--    ladder loads, so a result an older iOS build sets directly is applied
--    the next time the ladder is opened on the web. Exactly once: the fold
--    only takes attempts newer than the row's last_attempt_at and writes over
--    that value, so a second fold of the same attempt finds nothing to do.
--
--    No double attempt: the guard is unchanged. Only a NULL -> result update
--    with no food_attempt_id inserts, and the ladder's own log sets
--    food_attempt_id in the same update, so it never gets a second row.
--
-- Backward compatibility: no column, table or policy is added, dropped or
-- renamed. The trigger's inputs and outputs keep their shape; only the stage
-- value differs, and it is always one of the eight stages already written.

-- ---------------------------------------------------------------------------
-- 1. The flag
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'feature_flags'
  ) THEN
    INSERT INTO public.feature_flags (key, name, enabled, rollout_percentage, description)
    VALUES (
      'exposure_ladder',
      'Exposure ladder',
      TRUE,
      100,
      'Items 40/41: the exposure ladder is the Food Tracker for everyone. Setting enabled = false switches off the surfaces built around it (Safe Food Insurance, the Home insight slot, the Insights ladder sections, the Food Chaining link). Food Tracker itself no longer reads this flag.'
    )
    ON CONFLICT (key) DO UPDATE
      SET enabled = TRUE,
          rollout_percentage = 100,
          updated_at = now();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The trigger function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_attempt_from_plan_result()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_id UUID;
  v_stage TEXT;
  v_outcome TEXT;
  v_amount_consumed TEXT;
  v_rung TEXT;
BEGIN
  IF NEW.result IS NOT NULL AND OLD.result IS NULL AND NEW.food_attempt_id IS NULL THEN
    CASE NEW.result
      WHEN 'ate'     THEN v_outcome := 'success'; v_stage := 'full_portion'; v_amount_consumed := 'all';
      WHEN 'tasted'  THEN v_outcome := 'partial'; v_stage := 'small_bite';   v_amount_consumed := 'quarter';
      WHEN 'refused' THEN v_outcome := 'refused'; v_stage := 'looking';      v_amount_consumed := 'none';
      ELSE RETURN NEW;
    END CASE;

    -- The rung the child is on, when this food is being worked on.
    SELECT l.current_rung INTO v_rung
      FROM public.kid_food_ladder l
     WHERE l.kid_id = NEW.kid_id
       AND l.food_id = NEW.food_id
       AND l.status IN ('active', 'backed_off');
    IF v_rung IS NOT NULL THEN
      v_stage := v_rung;
    END IF;

    INSERT INTO public.food_attempts (
      kid_id, food_id, attempted_at, stage, outcome, bites_taken,
      amount_consumed, meal_slot, mood_before, parent_notes, plan_entry_id
    ) VALUES (
      NEW.kid_id, NEW.food_id, NOW(), v_stage, v_outcome,
      CASE NEW.result WHEN 'ate' THEN 5 WHEN 'tasted' THEN 1 ELSE 0 END,
      v_amount_consumed, NEW.meal_slot, 'neutral', NEW.notes, NEW.id
    )
    RETURNING id INTO v_attempt_id;

    NEW.food_attempt_id := v_attempt_id;
  END IF;
  RETURN NEW;
END;
$$;

-- US-804: name the roles. A trigger function cannot be called over RPC, but
-- nothing should hold EXECUTE on a SECURITY DEFINER function it has no use
-- for. Firing a trigger does not check EXECUTE, so the plan_entries update
-- path is unaffected (asserted in the suite).
REVOKE ALL ON FUNCTION public.create_attempt_from_plan_result() FROM PUBLIC, anon, authenticated;
