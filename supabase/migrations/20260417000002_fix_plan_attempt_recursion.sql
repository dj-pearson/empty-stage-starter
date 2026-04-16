-- Break the recursive loop between plan_entries and food_attempts triggers.
--
-- Previous behavior:
--   1) UPDATE plan_entries.result
--   2) BEFORE trigger inserts into food_attempts
--   3) AFTER INSERT OR UPDATE on food_attempts -> syncs plan_entries
--   4) Step 3 re-fires step 2 -> stack depth exceeded.
--
-- Fix: sync trigger runs ONLY on UPDATE of food_attempts (not INSERT),
-- and only when outcome or parent_notes actually changed. The INSERT
-- path is already fully handled by create_attempt_from_plan_result.

DROP TRIGGER IF EXISTS attempt_syncs_plan_result ON public.food_attempts;

CREATE OR REPLACE FUNCTION public.sync_plan_result_from_attempt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result TEXT;
BEGIN
  IF NEW.plan_entry_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.outcome IS NOT DISTINCT FROM OLD.outcome
     AND NEW.parent_notes IS NOT DISTINCT FROM OLD.parent_notes THEN
    RETURN NEW;
  END IF;

  CASE NEW.outcome
    WHEN 'success' THEN v_result := 'ate';
    WHEN 'partial' THEN v_result := 'tasted';
    WHEN 'refused', 'tantrum' THEN v_result := 'refused';
    ELSE v_result := NULL;
  END CASE;

  UPDATE public.plan_entries
  SET result = v_result,
      notes = COALESCE(NEW.parent_notes, notes),
      updated_at = NOW()
  WHERE id = NEW.plan_entry_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER attempt_syncs_plan_result
  AFTER UPDATE ON public.food_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_plan_result_from_attempt();
