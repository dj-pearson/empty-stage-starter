-- Fix "permission denied for table users" when marking a plan entry
-- as Ate/Tasted/Refused. The cause is trigger functions running without
-- SECURITY DEFINER, which makes them fail on RLS checks on cascaded tables.

-- 1) Make the plan-result trigger function SECURITY DEFINER so it can
-- insert into food_attempts on behalf of the user.
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
BEGIN
  IF NEW.result IS NOT NULL AND OLD.result IS NULL AND NEW.food_attempt_id IS NULL THEN
    CASE NEW.result
      WHEN 'ate'     THEN v_outcome := 'success'; v_stage := 'full_portion'; v_amount_consumed := 'all';
      WHEN 'tasted'  THEN v_outcome := 'partial'; v_stage := 'small_bite';   v_amount_consumed := 'quarter';
      WHEN 'refused' THEN v_outcome := 'refused'; v_stage := 'looking';      v_amount_consumed := 'none';
      ELSE RETURN NEW;
    END CASE;

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

-- 2) Same fix for the achievement check trigger function.
CREATE OR REPLACE FUNCTION public.trigger_achievement_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_and_unlock_achievements(NEW.kid_id, NEW.food_id, NEW.outcome);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_and_unlock_achievements(
  p_kid_id UUID,
  p_food_id UUID DEFAULT NULL,
  p_attempt_outcome TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_attempts INTEGER;
  successful_attempts INTEGER;
  new_foods_tried INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_attempts FROM public.food_attempts WHERE kid_id = p_kid_id;
  SELECT COUNT(*) INTO successful_attempts FROM public.food_attempts WHERE kid_id = p_kid_id AND outcome IN ('success', 'partial');
  SELECT COUNT(DISTINCT food_id) INTO new_foods_tried FROM public.food_attempts WHERE kid_id = p_kid_id AND outcome IN ('success', 'partial');

  IF total_attempts = 1 THEN
    INSERT INTO public.kid_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_value)
    VALUES (p_kid_id, 'first_attempt', 'Brave Beginner', 'Made your first food attempt!', 'star', 10)
    ON CONFLICT DO NOTHING;
  END IF;

  IF new_foods_tried = 10 THEN
    INSERT INTO public.kid_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_value)
    VALUES (p_kid_id, 'foods_milestone', 'Food Explorer', 'Tried 10 different foods!', 'trophy', 50)
    ON CONFLICT DO NOTHING;
  END IF;

  IF new_foods_tried = 50 THEN
    INSERT INTO public.kid_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_value)
    VALUES (p_kid_id, 'foods_milestone', 'Adventurous Eater', 'Tried 50 different foods!', 'medal', 100)
    ON CONFLICT DO NOTHING;
  END IF;

  IF total_attempts >= 20 AND successful_attempts::DECIMAL / total_attempts >= 0.75 THEN
    INSERT INTO public.kid_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_value)
    VALUES (p_kid_id, 'success_rate', 'Super Taster', '75% success rate!', 'crown', 75)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- 3) Align food_attempts and kid_achievements RLS with the household system.
-- The kids table RLS now uses household_id, so existing policies on these
-- tables work — but make them more permissive so household members can
-- see each other's kids' data.
DROP POLICY IF EXISTS "Users can manage their kids' food attempts" ON public.food_attempts;
CREATE POLICY "Household members can manage food attempts"
  ON public.food_attempts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.kids
      WHERE kids.id = food_attempts.kid_id
        AND kids.household_id = public.get_user_household_id(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.kids
      WHERE kids.id = food_attempts.kid_id
        AND kids.household_id = public.get_user_household_id(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage their kids' achievements" ON public.kid_achievements;
CREATE POLICY "Household members can manage kid achievements"
  ON public.kid_achievements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.kids
      WHERE kids.id = kid_achievements.kid_id
        AND kids.household_id = public.get_user_household_id(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.kids
      WHERE kids.id = kid_achievements.kid_id
        AND kids.household_id = public.get_user_household_id(auth.uid())
    )
  );
