-- US-249: durable per-kid badge persistence.
--
-- Badges were UserDefaults-only (BadgeService), so they didn't sync across a
-- household's devices and were lost on reinstall. This adds a household-scoped
-- `kid_badges` table (additive, backward-compatible) that UserDefaults becomes
-- a write-through cache for. Mirrors the household RLS + auto_fill_household_id
-- pattern used by plan_entries / foods / meal_plan_templates.

CREATE TABLE IF NOT EXISTS public.kid_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id UUID NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  household_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Re-evaluation must never double-insert the same badge for a kid.
  CONSTRAINT kid_badges_kid_badge_key UNIQUE (kid_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_kid_badges_kid ON public.kid_badges(kid_id);
CREATE INDEX IF NOT EXISTS idx_kid_badges_household ON public.kid_badges(household_id);

ALTER TABLE public.kid_badges ENABLE ROW LEVEL SECURITY;

-- Household-scoped RLS (mirror of plan_entries / templates). household_id is
-- filled by the auto_fill_household_id BEFORE-INSERT trigger, so clients omit
-- it and the WITH CHECK still passes.
DROP POLICY IF EXISTS "Household members can view kid badges" ON public.kid_badges;
CREATE POLICY "Household members can view kid badges" ON public.kid_badges
  FOR SELECT USING (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Household members can insert kid badges" ON public.kid_badges;
CREATE POLICY "Household members can insert kid badges" ON public.kid_badges
  FOR INSERT WITH CHECK (
    household_id IS NULL OR household_id = public.get_user_household_id(auth.uid())
  );

DROP POLICY IF EXISTS "Household members can update kid badges" ON public.kid_badges;
CREATE POLICY "Household members can update kid badges" ON public.kid_badges
  FOR UPDATE USING (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Household members can delete kid badges" ON public.kid_badges;
CREATE POLICY "Household members can delete kid badges" ON public.kid_badges
  FOR DELETE USING (household_id = public.get_user_household_id(auth.uid()));

-- Auto-fill household_id on insert when the client omits it.
DROP TRIGGER IF EXISTS auto_fill_household_id ON public.kid_badges;
CREATE TRIGGER auto_fill_household_id
  BEFORE INSERT ON public.kid_badges
  FOR EACH ROW EXECUTE FUNCTION public.auto_fill_household_id();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kid_badges TO authenticated;

COMMENT ON TABLE public.kid_badges IS
  'US-249: durable per-kid earned-badge records, household-scoped. UserDefaults in BadgeService is a write-through cache of this table.';
