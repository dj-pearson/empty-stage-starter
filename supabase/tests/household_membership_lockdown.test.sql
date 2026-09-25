-- Household membership lockdown (20260928000007).
--
-- A member used to be able to INSERT other users into their household, rewrite
-- roles, and delete the owner. Every case runs as the role a client request
-- runs as (SET ROLE authenticated / anon plus a JWT sub), because the policies
-- and the delete trigger only mean something from there; as postgres they are
-- bypassed and a green run would say nothing.
--
-- HOW TO RUN: `bash scripts/dev/local-sql-suite.sh`. Never against production.
-- Everything happens inside one transaction that is rolled back.
--
-- Every check prints EXPECTED alongside the value.

\set ON_ERROR_STOP on
BEGIN;

-- ------------------------------------------------------------------ fixture --
-- O owns a Family Plus household; A and B joined it by invite. X is an
-- outsider. J joins later. F owns a Free (one-seat) household and FJ tries to
-- join it. Ids travel between blocks as custom settings, which every role can
-- read, unlike a temp table.
DO $setup$
DECLARE
  o  UUID := gen_random_uuid();
  a  UUID := gen_random_uuid();
  b  UUID := gen_random_uuid();
  x  UUID := gen_random_uuid();
  j  UUID := gen_random_uuid();
  f  UUID := gen_random_uuid();
  fj UUID := gen_random_uuid();
  hh UUID;
  code TEXT;
BEGIN
  -- Each insert fires handle_new_user -> ensure_user_household.
  INSERT INTO auth.users (id, email) VALUES
    (o,  'hml-owner@example.test'),
    (a,  'hml-a@example.test'),
    (b,  'hml-b@example.test'),
    (x,  'hml-outsider@example.test'),
    (j,  'hml-joiner@example.test'),
    (f,  'hml-free-owner@example.test'),
    (fj, 'hml-free-joiner@example.test');

  SELECT household_id INTO hh FROM public.household_members WHERE user_id = o;
  -- The owner is the earliest member; make that unambiguous.
  UPDATE public.household_members SET joined_at = now() - INTERVAL '30 days'
   WHERE user_id = o;

  INSERT INTO public.user_subscriptions (user_id, plan_id, status)
    SELECT o, id, 'active' FROM public.subscription_plans WHERE name = 'Family Plus';

  PERFORM set_config('request.jwt.claim.sub', o::text, true);
  code := public.create_household_invite('parent');
  PERFORM set_config('request.jwt.claim.sub', a::text, true);
  PERFORM public.accept_household_invite(code);
  PERFORM set_config('request.jwt.claim.sub', o::text, true);
  code := public.create_household_invite('guardian');
  PERFORM set_config('request.jwt.claim.sub', b::text, true);
  PERFORM public.accept_household_invite(code);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  ASSERT public.household_owner_id(hh) = o, 'fixture: O should own the household';
  ASSERT (SELECT count(*) FROM public.household_members WHERE household_id = hh) = 3,
    'fixture: O, A and B should share the household';

  PERFORM set_config('hml.o', o::text, true);
  PERFORM set_config('hml.a', a::text, true);
  PERFORM set_config('hml.b', b::text, true);
  PERFORM set_config('hml.x', x::text, true);
  PERFORM set_config('hml.j', j::text, true);
  PERFORM set_config('hml.f', f::text, true);
  PERFORM set_config('hml.fj', fj::text, true);
  PERFORM set_config('hml.hh', hh::text, true);
END $setup$;

-- ------------------------------------------------------------------ INSERT --
DO $c1$
DECLARE
  hh UUID := current_setting('hml.hh')::uuid;
  x  UUID := current_setting('hml.x')::uuid;
  blocked BOOLEAN := false;
  n INTEGER;
BEGIN
  RAISE NOTICE '1. a member cannot insert another user into the household';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', current_setting('hml.a'), true);
  BEGIN
    INSERT INTO public.household_members (household_id, user_id, role)
      VALUES (hh, x, 'parent');
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.household_members WHERE household_id = hh AND user_id = x;
  RAISE NOTICE '   blocked = %, outsider rows = %  EXPECTED true, 0', blocked, n;
  ASSERT blocked AND n = 0, 'a member inserted an outsider into the household';
END $c1$;

-- ------------------------------------------------------------------ UPDATE --
DO $c2$
DECLARE
  hh UUID := current_setting('hml.hh')::uuid;
  b  UUID := current_setting('hml.b')::uuid;
  a  UUID := current_setting('hml.a')::uuid;
  touched INTEGER;
  b_role TEXT;
  a_hh UUID;
BEGIN
  RAISE NOTICE '2. a member cannot change a role or move a membership';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', a::text, true);
  UPDATE public.household_members SET role = 'parent' WHERE user_id = b AND household_id = hh;
  GET DIAGNOSTICS touched = ROW_COUNT;
  UPDATE public.household_members SET household_id = gen_random_uuid() WHERE user_id = a;
  RESET ROLE;
  SELECT role INTO b_role FROM public.household_members WHERE user_id = b AND household_id = hh;
  SELECT household_id INTO a_hh FROM public.household_members WHERE user_id = a;
  RAISE NOTICE '   rows updated = %, B role = %, A household unchanged = %  EXPECTED 0, guardian, true',
    touched, b_role, a_hh = hh;
  ASSERT touched = 0 AND b_role = 'guardian' AND a_hh = hh, 'a member rewrote a membership row';
END $c2$;

-- ------------------------------------------------------ non-owner removal --
DO $c3$
DECLARE
  hh UUID := current_setting('hml.hh')::uuid;
  o  UUID := current_setting('hml.o')::uuid;
  b  UUID := current_setting('hml.b')::uuid;
  owner_blocked BOOLEAN := false;
  peer_blocked  BOOLEAN := false;
  msg TEXT;
  n INTEGER;
BEGIN
  RAISE NOTICE '3. a non-owner cannot remove the owner or another member';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', current_setting('hml.a'), true);
  BEGIN
    DELETE FROM public.household_members WHERE household_id = hh AND user_id = o;
  EXCEPTION WHEN insufficient_privilege THEN
    owner_blocked := true;
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
  END;
  BEGIN
    DELETE FROM public.household_members WHERE household_id = hh AND user_id = b;
  EXCEPTION WHEN insufficient_privilege THEN
    peer_blocked := true;
  END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.household_members WHERE household_id = hh;
  RAISE NOTICE '   owner removal blocked = %, peer removal blocked = %, members = %  EXPECTED true, true, 3',
    owner_blocked, peer_blocked, n;
  RAISE NOTICE '   message: %', msg;
  ASSERT owner_blocked AND peer_blocked AND n = 3, 'a non-owner removed someone';
END $c3$;

-- -------------------------------------------------------- owner cannot leave --
DO $c4$
DECLARE
  hh UUID := current_setting('hml.hh')::uuid;
  o  UUID := current_setting('hml.o')::uuid;
  blocked BOOLEAN := false;
  n INTEGER;
BEGIN
  RAISE NOTICE '4. the owner cannot leave while others remain';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', o::text, true);
  BEGIN
    DELETE FROM public.household_members WHERE household_id = hh AND user_id = o;
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.household_members WHERE household_id = hh AND user_id = o;
  RAISE NOTICE '   blocked = %, owner rows = %  EXPECTED true, 1', blocked, n;
  ASSERT blocked AND n = 1, 'the owner left a household that still had members';
END $c4$;

-- ------------------------------------------------------- owner removes B --
DO $c5$
DECLARE
  hh UUID := current_setting('hml.hh')::uuid;
  b  UUID := current_setting('hml.b')::uuid;
  removed INTEGER;
BEGIN
  RAISE NOTICE '5. the owner can remove a member';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', current_setting('hml.o'), true);
  DELETE FROM public.household_members WHERE household_id = hh AND user_id = b;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RESET ROLE;
  RAISE NOTICE '   rows removed = %  EXPECTED 1', removed;
  ASSERT removed = 1, 'the owner could not remove a member';
END $c5$;

-- ------------------------------------------- A leaves, the way iOS does it --
-- HouseholdService.removeMember sends DELETE ... WHERE id = <membership id>
-- and nothing else.
DO $c6$
DECLARE
  hh UUID := current_setting('hml.hh')::uuid;
  a  UUID := current_setting('hml.a')::uuid;
  member_id UUID;
  removed INTEGER;
BEGIN
  RAISE NOTICE '6. a member can leave, by membership id alone (iOS removeMember)';
  SELECT id INTO member_id FROM public.household_members WHERE household_id = hh AND user_id = a;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', a::text, true);
  DELETE FROM public.household_members WHERE id = member_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RESET ROLE;
  RAISE NOTICE '   rows removed = %  EXPECTED 1', removed;
  ASSERT removed = 1, 'a member could not leave';
END $c6$;

-- ------------------------------------------ invite codes: RPC only, one use --
DO $c7$
DECLARE
  hh UUID := current_setting('hml.hh')::uuid;
  o  UUID := current_setting('hml.o')::uuid;
  j  UUID := current_setting('hml.j')::uuid;
  x  UUID := current_setting('hml.x')::uuid;
  j_old_hh UUID;
  direct_blocked BOOLEAN := false;
  reuse_blocked  BOOLEAN := false;
  v_code TEXT;
  got UUID;
  n INTEGER;
  used_by_j BOOLEAN;
BEGIN
  RAISE NOTICE '7. accept_household_invite still works end to end, from a client session';
  SELECT household_id INTO j_old_hh FROM public.household_members WHERE user_id = j;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', o::text, true);
  BEGIN
    INSERT INTO public.household_invite_codes (household_id, code, role, created_by)
      VALUES (hh, 'HMLXXX', 'parent', o);
  EXCEPTION WHEN insufficient_privilege THEN
    direct_blocked := true;
  END;
  v_code := public.create_household_invite('parent');

  PERFORM set_config('request.jwt.claim.sub', j::text, true);
  got := public.accept_household_invite(v_code);

  PERFORM set_config('request.jwt.claim.sub', x::text, true);
  BEGIN
    PERFORM public.accept_household_invite(v_code);
  EXCEPTION WHEN raise_exception THEN
    reuse_blocked := true;
  END;
  RESET ROLE;

  SELECT count(*) INTO n FROM public.household_members WHERE user_id = j;
  SELECT used_by = j INTO used_by_j FROM public.household_invite_codes c WHERE c.code = v_code;
  RAISE NOTICE '   direct insert blocked = %  EXPECTED true', direct_blocked;
  RAISE NOTICE '   joined household = target: %, J memberships = %, code used by J: %  EXPECTED true, 1, true',
    got = hh, n, used_by_j;
  RAISE NOTICE '   J''s own household merged away (cascade through the delete trigger): %  EXPECTED true',
    NOT EXISTS (SELECT 1 FROM public.households WHERE id = j_old_hh);
  RAISE NOTICE '   second redemption by X refused = %  EXPECTED true', reuse_blocked;
  ASSERT direct_blocked, 'a member inserted an invite code directly';
  ASSERT got = hh AND n = 1 AND used_by_j, 'accept_household_invite did not join J';
  ASSERT NOT EXISTS (SELECT 1 FROM public.households WHERE id = j_old_hh),
    'the merge could not delete J''s old household';
  ASSERT reuse_blocked
     AND NOT EXISTS (SELECT 1 FROM public.household_members WHERE household_id = hh AND user_id = x),
    'a used code was redeemed twice';
END $c7$;

DO $c8$
DECLARE
  f  UUID := current_setting('hml.f')::uuid;
  fj UUID := current_setting('hml.fj')::uuid;
  f_hh UUID;
  full_refused BOOLEAN := false;
  n INTEGER;
BEGIN
  RAISE NOTICE '8. the seat limit still holds on accept';
  SELECT household_id INTO f_hh FROM public.household_members WHERE user_id = f;
  -- create_household_invite already refuses a full household, so the code is
  -- planted directly to reach the accept-side gate.
  INSERT INTO public.household_invite_codes (household_id, code, role, created_by)
    VALUES (f_hh, 'HMLFRE', 'parent', f);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', fj::text, true);
  BEGIN
    PERFORM public.accept_household_invite('HMLFRE');
  EXCEPTION WHEN check_violation THEN
    full_refused := true;
  END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.household_members WHERE household_id = f_hh;
  RAISE NOTICE '   refused = %, members = %  EXPECTED true, 1', full_refused, n;
  ASSERT full_refused AND n = 1, 'a Free household took a second member';
END $c8$;

-- ------------------------------------------------------------ households --
DO $c9$
DECLARE
  hh UUID := current_setting('hml.hh')::uuid;
  renamed INTEGER;
  moved_blocked BOOLEAN := false;
BEGIN
  RAISE NOTICE '9. a member can still rename (the web page offers it), but not move the row';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', current_setting('hml.j'), true);
  UPDATE public.households SET name = 'The Test Family' WHERE id = hh;
  GET DIAGNOSTICS renamed = ROW_COUNT;
  BEGIN
    UPDATE public.households SET id = gen_random_uuid() WHERE id = hh;
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN
    moved_blocked := true;
  END;
  RESET ROLE;
  RAISE NOTICE '   renamed rows = %, id change blocked = %  EXPECTED 1, true', renamed, moved_blocked;
  ASSERT renamed = 1 AND moved_blocked, 'households update policy is wrong';
END $c9$;

-- ------------------------------------------------------------------ anon --
DO $c10$
DECLARE
  hh UUID := current_setting('hml.hh')::uuid;
  o  UUID := current_setting('hml.o')::uuid;
  belongs BOOLEAN;
  resolved UUID;
  foods_seen INTEGER;
  members_seen INTEGER;
  as_member UUID;
BEGIN
  RAISE NOTICE '10. anon learns nothing from the two helpers, and signed-out reads still return rows, not errors';
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  belongs  := public.user_belongs_to_household(o, hh);
  resolved := public.get_user_household_id(o);
  SELECT count(*) INTO foods_seen FROM public.foods;
  SELECT count(*) INTO members_seen FROM public.household_members;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', o::text, true);
  as_member := public.get_user_household_id(o);
  RESET ROLE;

  RAISE NOTICE '   anon: belongs = %, household = %, foods = %, members = %  EXPECTED false, NULL, 0, 0',
    belongs, resolved, foods_seen, members_seen;
  RAISE NOTICE '   signed in as O: household = target: %  EXPECTED true', as_member = hh;
  ASSERT belongs = false AND resolved IS NULL, 'the helpers answered anon about a real member';
  ASSERT foods_seen = 0 AND members_seen = 0, 'anon read household rows';
  ASSERT as_member = hh, 'the guard broke the signed-in path';
END $c10$;

-- -------------------------------------------------------- trusted paths --
DO $c11$
DECLARE
  hh UUID := current_setting('hml.hh')::uuid;
  o  UUID := current_setting('hml.o')::uuid;
  left_rows INTEGER;
BEGIN
  RAISE NOTICE '11. account deletion (auth admin, no client role) still cascades past the trigger';
  -- O owns hh and J is still in it: a client-side leave would be refused.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.household_members SET invited_by = NULL WHERE invited_by = o;
  UPDATE public.household_invite_codes SET used_by = NULL WHERE used_by = o;
  DELETE FROM public.household_invite_codes WHERE created_by = o;
  DELETE FROM auth.users WHERE id = o;
  SELECT count(*) INTO left_rows FROM public.household_members WHERE user_id = o;
  RAISE NOTICE '   owner memberships after account deletion = %  EXPECTED 0', left_rows;
  ASSERT left_rows = 0, 'account deletion was blocked by the membership trigger';
END $c11$;

DO $c12$
BEGIN
  RAISE NOTICE '12. the trigger function is not callable by clients';
  ASSERT NOT has_function_privilege('anon', 'public.enforce_household_member_delete()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.enforce_household_member_delete()', 'EXECUTE'),
    'enforce_household_member_delete is executable by a client role';
  RAISE NOTICE '   ok';
END $c12$;

ROLLBACK;
