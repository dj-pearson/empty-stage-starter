-- US-298: Variety Fatigue score & "switch it up" nudges
-- Per-household daily cached fatigue scores. Primary compute path is
-- client-side (pure module against plan_entries) so the UI works without
-- this table; the snapshots are persisted for analytics + audit.

CREATE TABLE IF NOT EXISTS variety_fatigue_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  computed_for DATE NOT NULL,                   -- date the snapshot represents
  /* Window used to compute the score, e.g. 28d */
  window_days INTEGER NOT NULL DEFAULT 28,

  /* Top fatigued recipes the day this was computed.
     [{ recipe_id, recipe_name, repeat_count, fatigue_score, tier }] */
  top_recipes JSONB NOT NULL DEFAULT '[]'::jsonb,
  /* Top fatigued ingredients/foods.
     [{ food_id, food_name, repeat_count, fatigue_score, tier }] */
  top_ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,

  /* Highest tier across recipes/ingredients: 'none' | 'mild' | 'high' */
  worst_tier TEXT NOT NULL DEFAULT 'none' CHECK (worst_tier IN ('none','mild','high')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (household_id, computed_for)
);

CREATE INDEX IF NOT EXISTS idx_variety_fatigue_household
  ON variety_fatigue_snapshots(household_id);
CREATE INDEX IF NOT EXISTS idx_variety_fatigue_date
  ON variety_fatigue_snapshots(computed_for DESC);
CREATE INDEX IF NOT EXISTS idx_variety_fatigue_tier
  ON variety_fatigue_snapshots(worst_tier) WHERE worst_tier <> 'none';

ALTER TABLE variety_fatigue_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view household fatigue snapshots"
  ON variety_fatigue_snapshots FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert fatigue snapshots for own household"
  ON variety_fatigue_snapshots FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users update household fatigue snapshots"
  ON variety_fatigue_snapshots FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage all fatigue snapshots"
  ON variety_fatigue_snapshots FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE variety_fatigue_snapshots IS
  'US-298: per-household daily cache of variety fatigue scoring; primary compute is client-side';
COMMENT ON COLUMN variety_fatigue_snapshots.worst_tier IS
  'none | mild (3+/7d OR 5+/28d for one item) | high (both windows triggered)';
