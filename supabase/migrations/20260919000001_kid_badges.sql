-- US-871: kid_badges — where a child's earned badges actually live.
--
-- BadgeService has kept earned badge ids in UserDefaults under
-- `badges.<kidId>.earned` since US-241, with its own doc comment saying "when
-- the eventual kid_badges Supabase table lands, this class is the only place
-- that needs to learn about it". This is that table.
--
-- UserDefaults is device-local storage for something a parent will care about
-- a year from now. It does not survive a reinstall, does not move to a new
-- phone, and is invisible to the second parent in the household -- who sees an
-- empty badge grid for a child who has earned eight of them.
--
-- Per CLAUDE.md backward-compat rules:
--   * Additive only — new table, new index, new policies. No ALTER or DROP on
--     anything a shipped build reads.
--   * Every shipped iOS build keeps working unchanged: they read and write
--     UserDefaults and never query this table. Nothing is taken away from
--     them, and the new client keeps writing UserDefaults too, so a household
--     running one new phone and one old one degrades to today's behaviour on
--     the old one rather than breaking.
--
-- badge_id is TEXT and carries the Badge enum's own ids verbatim. Deliberately
-- NOT an enum type or a foreign key to a catalog table: the catalog is client
-- code, ships with the app, and a newer build earning a badge this database
-- has never heard of must store it rather than be rejected. An older build
-- reading back an id it does not recognise ignores it, which is why the ids
-- themselves must never be renamed.

CREATE TABLE IF NOT EXISTS public.kid_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id UUID NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,

  -- The Badge enum's id, e.g. 'first_bite'. Client vocabulary, stored as-is.
  badge_id TEXT NOT NULL CHECK (length(badge_id) BETWEEN 1 AND 64),

  -- When the child earned it, not when the row reached the server. A badge
  -- earned offline and synced three days later keeps its real date.
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A badge is earned once. This is also the idempotency key the offline queue
-- replays against: a queued earn that already landed from another device
-- upserts rather than duplicating, and a duplicate replay is a 23505 the
-- executor reads as "already there".
CREATE UNIQUE INDEX IF NOT EXISTS kid_badges_kid_badge_unique
  ON public.kid_badges(kid_id, badge_id);

-- The only query the app makes: every badge for one child, newest first.
CREATE INDEX IF NOT EXISTS kid_badges_kid_earned_idx
  ON public.kid_badges(kid_id, earned_at DESC);

ALTER TABLE public.kid_badges ENABLE ROW LEVEL SECURITY;

-- Ownership derives through kids, and through household_members as well as the
-- owning user -- the same derivation kid_food_ladder uses (20260801000000).
-- That is the point of AC1's "invisible to a second parent": both parents in a
-- household see the same badges, because both of them were at the table.
CREATE POLICY "Members view kid badges"
  ON public.kid_badges
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.kids k
      LEFT JOIN public.household_members hm ON hm.household_id = k.household_id
      WHERE k.id = kid_badges.kid_id
        AND (k.user_id = auth.uid() OR hm.user_id = auth.uid())
    )
  );

CREATE POLICY "Members insert kid badges"
  ON public.kid_badges
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.kids k
      LEFT JOIN public.household_members hm ON hm.household_id = k.household_id
      WHERE k.id = kid_badges.kid_id
        AND (k.user_id = auth.uid() OR hm.user_id = auth.uid())
    )
  );

-- No UPDATE policy, deliberately. An earn is append-only: there is nothing
-- about "this child earned this badge on this day" that a later write should
-- be able to revise, and leaving UPDATE unpolicied means RLS denies it.
--
-- DELETE exists because removing a child has to take their badges with it.
-- The cascade on kid_id handles the usual path; this covers a client deleting
-- a row directly.
CREATE POLICY "Members delete kid badges"
  ON public.kid_badges
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.kids k
      LEFT JOIN public.household_members hm ON hm.household_id = k.household_id
      WHERE k.id = kid_badges.kid_id
        AND (k.user_id = auth.uid() OR hm.user_id = auth.uid())
    )
  );
