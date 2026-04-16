-- Fix RLS failures caused by missing household_id on data rows
-- and missing household_members rows for users.

-- 1) Backfill: ensure every auth user has a household + membership
DO $$
DECLARE
  rec RECORD;
  new_hh_id uuid;
  display_name text;
BEGIN
  FOR rec IN (
    SELECT u.id,
           COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)) AS fn
    FROM auth.users u
    LEFT JOIN public.household_members hm ON hm.user_id = u.id
    WHERE hm.user_id IS NULL
  ) LOOP
    display_name := COALESCE(rec.fn, 'User');

    INSERT INTO public.profiles (id, full_name)
    VALUES (rec.id, display_name)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.households (name)
    VALUES (display_name || '''s Family')
    RETURNING id INTO new_hh_id;

    INSERT INTO public.household_members (household_id, user_id, role)
    VALUES (new_hh_id, rec.id, 'parent');
  END LOOP;
END $$;

-- 2) Backfill household_id on existing data rows that have user_id but no household_id
UPDATE public.foods
SET household_id = public.get_user_household_id(user_id)
WHERE household_id IS NULL AND user_id IS NOT NULL;

UPDATE public.recipes
SET household_id = public.get_user_household_id(user_id)
WHERE household_id IS NULL AND user_id IS NOT NULL;

UPDATE public.plan_entries
SET household_id = public.get_user_household_id(user_id)
WHERE household_id IS NULL AND user_id IS NOT NULL;

UPDATE public.grocery_items
SET household_id = public.get_user_household_id(user_id)
WHERE household_id IS NULL AND user_id IS NOT NULL;

UPDATE public.kids
SET household_id = public.get_user_household_id(user_id)
WHERE household_id IS NULL AND user_id IS NOT NULL;

-- 3) RPC for the client to auto-provision a household when none exists
CREATE OR REPLACE FUNCTION public.ensure_user_household()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_hh uuid;
  new_hh_id uuid;
  display_name text;
BEGIN
  SELECT household_id INTO existing_hh
  FROM public.household_members
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF existing_hh IS NOT NULL THEN
    RETURN existing_hh;
  END IF;

  SELECT COALESCE(p.full_name, split_part(u.email, '@', 1), 'User')
  INTO display_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = auth.uid();

  INSERT INTO public.profiles (id, full_name)
  VALUES (auth.uid(), display_name)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.households (name)
  VALUES (display_name || '''s Family')
  RETURNING id INTO new_hh_id;

  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (new_hh_id, auth.uid(), 'parent');

  RETURN new_hh_id;
END;
$$;

-- 4) Auto-fill household_id on future inserts when client omits it
CREATE OR REPLACE FUNCTION public.auto_fill_household_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.household_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.household_id := public.get_user_household_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['foods','recipes','plan_entries','grocery_items','kids']) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS auto_fill_household_id ON public.%I; '
      'CREATE TRIGGER auto_fill_household_id '
      'BEFORE INSERT ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.auto_fill_household_id();',
      tbl, tbl
    );
  END LOOP;
END $$;
