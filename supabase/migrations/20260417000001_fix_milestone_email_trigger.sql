-- Fix trigger_milestone_email bugs:
--   1) References NEW.title / NEW.description but kid_achievements uses
--      achievement_name / achievement_description
--   2) Queries auth.users without SECURITY DEFINER, producing
--      "permission denied for table users" when the trigger fires as
--      part of a user-initiated action (e.g., marking a plan entry).

CREATE OR REPLACE FUNCTION public.trigger_milestone_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_kid_name TEXT;
BEGIN
  SELECT k.user_id, k.name INTO v_user_id, v_kid_name
  FROM public.kids k
  WHERE k.id = NEW.kid_id;

  SELECT u.email INTO v_user_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF public.check_email_subscription(v_user_id, 'milestone') THEN
    PERFORM public.queue_email(
      v_user_id,
      'milestone_achieved',
      v_user_email,
      jsonb_build_object(
        'kid_name', v_kid_name,
        'achievement_title', NEW.achievement_name,
        'achievement_description', NEW.achievement_description,
        'app_url', 'https://eatpal.com'
      ),
      8
    );
  END IF;

  RETURN NEW;
END;
$$;
