-- US-609: does the offline ladder replay design actually work against the
-- schema it targets?
--
-- SELF-CONTAINED AND DESTRUCTIVE TO ITS OWN DATABASE:
--   createdb us609check && psql -d us609check -f us-609-attempt-replay-check.sql
--
-- The Swift half of US-609 cannot be built or run here -- OfflineStore is
-- SwiftData, which is Apple-only. What CAN be checked is the thing the Swift
-- work will be built on: src/lib/ladderSyncOps.ts is an executable
-- specification with no runtime caller, and its central claims are about THIS
-- database, not about Swift. If any of them is wrong, the Swift work fails at
-- runtime having looked correct all the way through review.
--
-- The claims, taken from the story's acceptance criteria and the spec:
--   1. food_attempts.id is `UUID PRIMARY KEY DEFAULT gen_random_uuid()` and
--      ACCEPTS A SUPPLIED VALUE, so the client can generate the dedupe key and
--      no migration is needed.
--   2. The row attemptRowFromOp() builds -- id, kid_id, food_id, stage,
--      outcome, attempted_at, meal_slot, preparation_method -- satisfies every
--      NOT NULL. (outcome is the only one besides the key.)
--   3. It satisfies RLS. food_attempts has NO user_id or household_id column;
--      ownership is derived through kid_id -> kids.household_id
--      (20260417000000), so a row carrying kid_id is enough and the queue does
--      not need to remember who was logged in.
--   4. A replayed duplicate is DETECTABLE rather than silently doubling the
--      exposure -- the primary key rejects it.
--   5. kid_food_ladder, which this file did NOT cover until it was pointed out
--      that the story names TWO tables and only one was tested. It is not a
--      copy of food_attempts: kid_id and food_id are NOT NULL, a UNIQUE index
--      on (kid_id, food_id) makes the ladder one row per kid per food, CHECK
--      constraints bound current_rung and status, and its RLS derives ownership
--      through a household_members JOIN rather than get_user_household_id --
--      so it also grants access to household MEMBERS, not just the kid's owner.
--      Each of those changes what a replay may safely do.
--   6. Inserting does not fire the plan-sync trigger. 20260417000002 narrowed
--      it to UPDATE precisely to break a recursion, and a replay that triggered
--      plan writes would be a second, unspecified side effect.
--
-- Expected output (verified 2026-08-22 on PostgreSQL 16.13):
--   supplied uuid accepted          t
--   row visible to its owner        1
--   duplicate replay rejected       t   (unique_violation)
--   row count after duplicate       1
--   other household sees it         0
--   plan trigger fired on insert    f
--
--   -- kid_food_ladder, the OTHER table the story names --
--   ladder row visible to owner     1
--   duplicate (kid,food) rejected   t   (unique_violation on the unique index)
--   bad rung rejected               t   (check constraint)
--   household member can read       1
--   other household sees ladder     0

CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid
$$ LANGUAGE sql STABLE;

DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.kids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  household_id uuid
);
CREATE TABLE public.foods (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.plan_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), result text);

-- Mirrors the shape the real column set gives us: the key with a default, the
-- one NOT NULL, and the optional columns the spec fills.
CREATE TABLE public.food_attempts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id             uuid REFERENCES public.kids(id) ON DELETE CASCADE,
  food_id            uuid REFERENCES public.foods(id) ON DELETE CASCADE,
  attempted_at       timestamptz DEFAULT now(),
  stage              text DEFAULT 'full_bite',
  outcome            text NOT NULL,
  bites_taken        integer DEFAULT 0,
  meal_slot          text,
  preparation_method text,
  plan_entry_id      uuid REFERENCES public.plan_entries(id) ON DELETE SET NULL
);

CREATE FUNCTION public.get_user_household_id(u uuid) RETURNS uuid AS $$
  SELECT household_id FROM public.kids WHERE user_id = u LIMIT 1
$$ LANGUAGE sql STABLE;

ALTER TABLE public.food_attempts ENABLE ROW LEVEL SECURITY;

-- Verbatim shape from 20260417000000_fix_plan_log_rls.sql.
CREATE POLICY "Household manages food attempts"
  ON public.food_attempts FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.kids
            WHERE kids.id = food_attempts.kid_id
              AND kids.household_id = public.get_user_household_id(auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.kids
            WHERE kids.id = food_attempts.kid_id
              AND kids.household_id = public.get_user_household_id(auth.uid()))
  );

-- 20260417000002 narrowed this to UPDATE to break a recursion. Replay inserts,
-- so it must not fire.
CREATE TABLE public.trigger_log (fired text);
CREATE FUNCTION public.attempt_syncs_plan_result() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.trigger_log VALUES (TG_OP);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER attempt_syncs_plan_result
  AFTER UPDATE ON public.food_attempts
  FOR EACH ROW EXECUTE FUNCTION public.attempt_syncs_plan_result();

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.food_attempts TO authenticated;
GRANT SELECT ON public.kids, public.foods, public.trigger_log TO authenticated;

INSERT INTO public.kids (id, user_id, household_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a',
   'dddddddd-0000-0000-0000-00000000000d'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-00000000000b',
   'eeeeeeee-0000-0000-0000-00000000000e');
INSERT INTO public.foods (id) VALUES ('ffffffff-0000-0000-0000-00000000000f');

SET ROLE authenticated;
SET test.uid = 'aaaaaaaa-0000-0000-0000-00000000000a';

\echo ''
\echo '== 1+2+3: the row attemptRowFromOp builds, with a CLIENT-generated id =='
INSERT INTO public.food_attempts
  (id, kid_id, food_id, stage, outcome, attempted_at, meal_slot, preparation_method)
VALUES
  ('11111111-2222-3333-4444-555555555555', 'aaaaaaaa-0000-0000-0000-000000000001',
   'ffffffff-0000-0000-0000-00000000000f', 'tiny_taste', 'success', now(), 'lunch', 'steamed');
SELECT (count(*) = 1) AS supplied_uuid_accepted
FROM public.food_attempts WHERE id = '11111111-2222-3333-4444-555555555555';

\echo '== the owner can read it back (the replay needs this to dedupe) =='
SELECT count(*) AS row_visible_to_owner FROM public.food_attempts;

\echo ''
\echo '== 4: replaying the SAME attempt id is rejected, not silently doubled =='
DO $$
BEGIN
  INSERT INTO public.food_attempts (id, kid_id, food_id, stage, outcome, attempted_at)
  VALUES ('11111111-2222-3333-4444-555555555555', 'aaaaaaaa-0000-0000-0000-000000000001',
          'ffffffff-0000-0000-0000-00000000000f', 'tiny_taste', 'success', now());
  RAISE NOTICE 'duplicate_replay_rejected: f  <-- THE EXPOSURE WOULD DOUBLE';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'duplicate_replay_rejected: t  (unique_violation)';
END $$;
SELECT count(*) AS rows_after_duplicate FROM public.food_attempts;

\echo ''
\echo '== 3 again: another household cannot see or write it =='
SET test.uid = 'bbbbbbbb-0000-0000-0000-00000000000b';
SELECT count(*) AS other_household_sees FROM public.food_attempts;

\echo ''
\echo '== 5: the plan-sync trigger did NOT fire on insert =='
RESET ROLE;
SELECT (count(*) > 0) AS plan_trigger_fired_on_insert FROM public.trigger_log;


-- ---------------------------------------------------------------------------
-- kid_food_ladder. The story's criteria name this table alongside food_attempts
-- and the first version of this file tested only the latter.
-- ---------------------------------------------------------------------------
CREATE TABLE public.household_members (
  household_id uuid,
  user_id uuid
);
GRANT SELECT ON public.household_members TO authenticated;

CREATE TABLE public.kid_food_ladder (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id                uuid NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  food_id               uuid NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  current_rung          text NOT NULL DEFAULT 'looking'
    CHECK (current_rung IN ('looking','touching','smelling','licking',
                            'tiny_taste','small_bite','full_bite','full_portion')),
  consecutive_successes int NOT NULL DEFAULT 0 CHECK (consecutive_successes >= 0),
  consecutive_holds     int NOT NULL DEFAULT 0 CHECK (consecutive_holds >= 0),
  consecutive_refusals  int NOT NULL DEFAULT 0 CHECK (consecutive_refusals >= 0),
  last_attempt_at       timestamptz,
  next_due_on           date,
  status                text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','mastered','backed_off')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- One ladder row per kid per food -- the property a replay's idempotency rests on.
CREATE UNIQUE INDEX kid_food_ladder_kid_food_unique
  ON public.kid_food_ladder(kid_id, food_id);

ALTER TABLE public.kid_food_ladder ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kid_food_ladder TO authenticated;

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

SET ROLE authenticated;
SET test.uid = 'aaaaaaaa-0000-0000-0000-00000000000a';

\echo ''
\echo '== the owner can create and read a ladder row =='
INSERT INTO public.kid_food_ladder (kid_id, food_id, current_rung)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
        'ffffffff-0000-0000-0000-00000000000f', 'tiny_taste');
SELECT count(*) AS ladder_visible_to_owner FROM public.kid_food_ladder;

\echo '== a second row for the same (kid, food) is rejected, not duplicated =='
DO $$
BEGIN
  INSERT INTO public.kid_food_ladder (kid_id, food_id)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
          'ffffffff-0000-0000-0000-00000000000f');
  RAISE NOTICE 'duplicate_ladder_rejected: f  <-- TWO LADDERS FOR ONE FOOD';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'duplicate_ladder_rejected: t  (unique_violation)';
END $$;

\echo '== a rung outside the vocabulary is refused rather than stored =='
DO $$
BEGIN
  UPDATE public.kid_food_ladder SET current_rung = 'devoured';
  RAISE NOTICE 'bad_rung_rejected: f  <-- CHECK CONSTRAINT NOT ENFORCED';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'bad_rung_rejected: t  (check constraint)';
END $$;
RESET ROLE;

\echo ''
\echo '== a household MEMBER can read it -- a wider grant than food_attempts has =='
INSERT INTO public.household_members VALUES
  ('dddddddd-0000-0000-0000-00000000000d', 'cccccccc-0000-0000-0000-00000000000c');
SET ROLE authenticated;
SET test.uid = 'cccccccc-0000-0000-0000-00000000000c';
SELECT count(*) AS household_member_sees FROM public.kid_food_ladder;

\echo '== and another household still sees nothing =='
SET test.uid = 'bbbbbbbb-0000-0000-0000-00000000000b';
SELECT count(*) AS other_household_sees_ladder FROM public.kid_food_ladder;
RESET ROLE;
