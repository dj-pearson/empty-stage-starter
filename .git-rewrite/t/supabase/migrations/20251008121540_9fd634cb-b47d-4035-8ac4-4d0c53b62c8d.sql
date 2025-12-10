-- Enable automatic household/profile creation on signup and backfill existing users

-- 1) Create trigger to run the existing function on new auth users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'on_auth_user_created'
      AND n.nspname = 'auth'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE PROCEDURE public.handle_new_user();
  END IF;
END $$;

-- 2) Backfill: create missing profiles, households, and memberships for existing users
DO $$
DECLARE
  rec RECORD;
  new_household_id uuid;
  full_name text;
BEGIN
  FOR rec IN (
    SELECT u.id,
           COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)) AS fn
    FROM auth.users u
    LEFT JOIN public.household_members hm ON hm.user_id = u.id
    WHERE hm.user_id IS NULL
  ) LOOP
    full_name := COALESCE(rec.fn, 'User');

    -- Create profile if missing
    INSERT INTO public.profiles (id, full_name)
    VALUES (rec.id, full_name)
    ON CONFLICT (id) DO NOTHING;

    -- Create household
    INSERT INTO public.households (name)
    VALUES (full_name || '''s Family')
    RETURNING id INTO new_household_id;

    -- Add user as household member
    INSERT INTO public.household_members (household_id, user_id, role)
    VALUES (new_household_id, rec.id, 'parent');
  END LOOP;
END $$;