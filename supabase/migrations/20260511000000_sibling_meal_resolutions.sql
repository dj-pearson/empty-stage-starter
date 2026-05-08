-- US-295: Sibling Constraint Solver
-- Logs sibling meal-finder runs that the user accepted, with per-kid
-- satisfaction breakdown so fairness ("whose preferences won") and
-- repeat-success can be queried later.

CREATE TABLE IF NOT EXISTS sibling_meal_resolutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  kid_ids UUID[] NOT NULL,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,

  -- 'full_match'  = recipe satisfied every kid as written
  -- 'with_swaps'  = recipe + per-kid food swaps satisfies everyone
  -- 'split_plate' = base recipe with per-kid plate modifications
  resolution_type TEXT NOT NULL CHECK (resolution_type IN ('full_match', 'with_swaps', 'split_plate')),

  -- Aggregate satisfaction across kids, 0..100 (higher is better)
  satisfaction_score NUMERIC(5, 2) NOT NULL,

  -- Per-kid satisfaction snapshot at solve time
  -- [{ kid_id, score, soft_violations: string[], hard_violations: string[] }]
  per_kid_satisfaction JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Swap suggestions surfaced to / accepted by the user
  -- [{ kid_id, swap_out_food_id?, swap_in_food_id?, swap_out_food_name?, swap_in_food_name?, reason }]
  swaps JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Per-kid plate modifications when split-plate is chosen
  -- [{ kid_id, plate_description, modifications: string[] }]
  split_plates JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Optional link to the plan entry the user added
  plan_entry_id UUID REFERENCES plan_entries(id) ON DELETE SET NULL,

  -- Outcome captured later (post-meal); informs future fairness weighting
  served_at TIMESTAMPTZ,
  outcome TEXT CHECK (outcome IN ('worked', 'partial', 'failed')),
  outcome_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sibling_meal_resolutions_household
  ON sibling_meal_resolutions(household_id);
CREATE INDEX IF NOT EXISTS idx_sibling_meal_resolutions_user
  ON sibling_meal_resolutions(user_id);
CREATE INDEX IF NOT EXISTS idx_sibling_meal_resolutions_recipe
  ON sibling_meal_resolutions(recipe_id);
CREATE INDEX IF NOT EXISTS idx_sibling_meal_resolutions_created
  ON sibling_meal_resolutions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sibling_meal_resolutions_kid_ids
  ON sibling_meal_resolutions USING GIN (kid_ids);

ALTER TABLE sibling_meal_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view household sibling resolutions"
  ON sibling_meal_resolutions FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert sibling resolutions for own household"
  ON sibling_meal_resolutions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users update household sibling resolutions"
  ON sibling_meal_resolutions FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete household sibling resolutions"
  ON sibling_meal_resolutions FOR DELETE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage all sibling resolutions"
  ON sibling_meal_resolutions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_sibling_meal_resolutions_updated_at
  BEFORE UPDATE ON sibling_meal_resolutions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE sibling_meal_resolutions IS
  'US-295: solver runs accepted by the user, with per-kid satisfaction for fairness tracking';
COMMENT ON COLUMN sibling_meal_resolutions.resolution_type IS
  'full_match | with_swaps | split_plate';
COMMENT ON COLUMN sibling_meal_resolutions.per_kid_satisfaction IS
  'JSON array of { kid_id, score, soft_violations[], hard_violations[] }';
