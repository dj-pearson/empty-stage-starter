-- US-301: Kid grew-up auto-adapter — forward-compat scaffolding.
--
-- Client today persists per-kid birthday-nudge prefs + dismiss state in
-- localStorage (see src/components/KidBirthdayCard.tsx). This table is
-- the server home for cross-device sync; the card swaps source to the
-- typed client once types regen.
--
-- A companion `kid_allergen_change_log` table audits any future allergen
-- mutations — even though the current shipping UI never mutates
-- kid.allergens automatically. The audit row is required *before* a
-- mutation by the safety contract documented in kidGrowthRules.ts.
--
-- Per CLAUDE.md backward-compat rules:
--   * Additive only.
--   * RLS household-scoped through kids.
--   * No DROP / RENAME on existing tables.

CREATE TABLE IF NOT EXISTS public.kid_growth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id UUID NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  occurred_on DATE NOT NULL,
  age_milestone INT NOT NULL,
  suggested_changes JSONB NOT NULL,
  applied_changes JSONB,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kid_growth_events_unique
  ON public.kid_growth_events(kid_id, occurred_on);

CREATE INDEX IF NOT EXISTS kid_growth_events_kid_idx
  ON public.kid_growth_events(kid_id, occurred_on DESC);

ALTER TABLE public.kid_growth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view kid growth events"
  ON public.kid_growth_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.kids k
      LEFT JOIN public.household_members hm ON hm.household_id = k.household_id
      WHERE k.id = kid_growth_events.kid_id
        AND (k.user_id = auth.uid() OR hm.user_id = auth.uid())
    )
  );

CREATE POLICY "Members upsert kid growth events"
  ON public.kid_growth_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.kids k
      LEFT JOIN public.household_members hm ON hm.household_id = k.household_id
      WHERE k.id = kid_growth_events.kid_id
        AND (k.user_id = auth.uid() OR hm.user_id = auth.uid())
    )
  );

CREATE POLICY "Members update kid growth events"
  ON public.kid_growth_events
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.kids k
      LEFT JOIN public.household_members hm ON hm.household_id = k.household_id
      WHERE k.id = kid_growth_events.kid_id
        AND (k.user_id = auth.uid() OR hm.user_id = auth.uid())
    )
  );

COMMENT ON TABLE public.kid_growth_events IS
  'US-301: birthday-driven re-evaluation events per kid. suggested_changes encodes the dashboard card payload; applied_changes is the audit trail of what the parent actually accepted. Allergen reintro never auto-removes — that flow writes to kid_allergen_change_log first.';

-- =====================================================================
-- kid_allergen_change_log (audit log for any allergen mutation)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.kid_allergen_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id UUID NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  changed_by_user_id UUID REFERENCES auth.users(id),
  removed_allergens TEXT[] NOT NULL DEFAULT '{}',
  added_allergens TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL,
  pediatrician_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kid_allergen_change_log_kid_idx
  ON public.kid_allergen_change_log(kid_id, created_at DESC);

ALTER TABLE public.kid_allergen_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view allergen change log"
  ON public.kid_allergen_change_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.kids k
      LEFT JOIN public.household_members hm ON hm.household_id = k.household_id
      WHERE k.id = kid_allergen_change_log.kid_id
        AND (k.user_id = auth.uid() OR hm.user_id = auth.uid())
    )
  );

CREATE POLICY "Members insert allergen change log"
  ON public.kid_allergen_change_log
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.kids k
      LEFT JOIN public.household_members hm ON hm.household_id = k.household_id
      WHERE k.id = kid_allergen_change_log.kid_id
        AND (k.user_id = auth.uid() OR hm.user_id = auth.uid())
    )
  );

-- Intentionally no UPDATE or DELETE policy — audit log is append-only.

COMMENT ON TABLE public.kid_allergen_change_log IS
  'US-301: append-only audit log for any allergen list change. Pediatrician confirmation is recorded explicitly. Mutation paths must INSERT here BEFORE updating kids.allergens; assertNoAllergenAutoRemoval() enforces the no-silent-drop rule in src/lib/kidGrowthRules.ts.';
