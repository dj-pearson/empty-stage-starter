-- US-800: an account with no email address must still be creatable.
--
-- THE CHAIN. handle_new_user() inserts a profiles row; profiles carries
-- AFTER INSERT trigger on_profile_created_send_welcome; that calls
-- trigger_welcome_email(), which reads auth.users.email into a local and hands
-- it to queue_email(); queue_email writes it to automation_email_queue.to_email,
-- which is NOT NULL. auth.users.email is nullable. So when it is null the
-- queue insert raises 23502, trigger_welcome_email has no handler,
-- handle_new_user re-raises with its own message, and THE AUTH USER CANNOT BE
-- CREATED AT ALL.
--
-- This is the same shape as US-801's 42703, one link further down the same
-- signup chain, and US-801's fix is what exposed it: before that, signup died
-- earlier and this never ran.
--
-- WHO THIS HITS IN PRODUCTION. Any signup where GoTrue holds no address:
-- phone/SMS, and an OAuth provider that withholds one. Not a hypothetical
-- shape -- auth.users.email is nullable precisely because those exist. It also
-- fails four SQL test suites (us780, us784, us840 and, through the same path,
-- anything else that inserts an auth user without an email), which is how it
-- was found.
--
-- THE DECISION US-800 ASKED FOR, made: a welcome email that cannot be
-- addressed is skipped, and the account is created. The inverse -- refusing an
-- account because a marketing email has nowhere to go -- is not a trade anyone
-- would make deliberately, and it is what ships today.
--
-- Scope is deliberately narrow. Only the missing-address case is swallowed; any
-- other failure from queue_email still propagates, because those mean something
-- is actually wrong with the queue and hiding them would be the next version of
-- this bug. The subscription row is still created either way: it is keyed by
-- user_id and needs no address, and an emailless account that later adds one
-- should find its preferences already there.

CREATE OR REPLACE FUNCTION trigger_welcome_email()
RETURNS TRIGGER AS $$
DECLARE
  v_user_email TEXT;
BEGIN
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = NEW.id;

  -- Works without an address, so it happens regardless.
  INSERT INTO automation_email_subscriptions (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  IF v_user_email IS NULL OR btrim(v_user_email) = '' THEN
    RAISE LOG 'trigger_welcome_email: user % has no email address; welcome email skipped', NEW.id;
    RETURN NEW;
  END IF;

  IF check_email_subscription(NEW.id, 'welcome') THEN
    PERFORM queue_email(
      NEW.id,
      'welcome',
      v_user_email,
      jsonb_build_object(
        'user_name', COALESCE(NEW.full_name, 'there'),
        'app_url', 'https://eatpal.com'
      ),
      10 -- High priority
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trigger_welcome_email() IS
  'Queues the welcome email on profile creation. US-800: skips when auth.users.email is null or blank rather than failing the signup -- automation_email_queue.to_email is NOT NULL and this trigger runs inside handle_new_user''s transaction.';
