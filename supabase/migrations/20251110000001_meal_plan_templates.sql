-- Meal Plan Templates Feature
-- Allows users to save and reuse successful meal plans

-- Main templates table
CREATE TABLE IF NOT EXISTS meal_plan_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Template metadata
  name TEXT NOT NULL,
  description TEXT,

  -- Categorization
  is_favorite BOOLEAN DEFAULT false,
  is_admin_template BOOLEAN DEFAULT false, -- Admin-curated starter templates
  is_starter_template BOOLEAN DEFAULT false, -- Shown to new users
  season TEXT, -- 'spring', 'summer', 'fall', 'winter', 'year_round'
  target_age_range TEXT, -- '2-4', '5-8', '9-12', 'all'
  dietary_restrictions TEXT[], -- Matches kid dietary restrictions

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2), -- Average success rate when this template is used
  created_from_week DATE, -- Original week this template was based on

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT name_not_empty CHECK (char_length(name) > 0)
);

-- Template entries (the actual meal plan data)
CREATE TABLE IF NOT EXISTS meal_plan_template_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES meal_plan_templates(id) ON DELETE CASCADE,

  -- Scheduling
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Monday, 6=Sunday
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack1', 'snack2', 'try_bite')),

  -- Meal content
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  food_ids UUID[], -- For simple meals without recipes

  -- Metadata
  notes TEXT,
  is_optional BOOLEAN DEFAULT false, -- For flexible templates

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_meal_plan_templates_household ON meal_plan_templates(household_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_templates_user ON meal_plan_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_templates_admin ON meal_plan_templates(is_admin_template) WHERE is_admin_template = true;
CREATE INDEX IF NOT EXISTS idx_meal_plan_templates_starter ON meal_plan_templates(is_starter_template) WHERE is_starter_template = true;
CREATE INDEX IF NOT EXISTS idx_meal_plan_template_entries_template ON meal_plan_template_entries(template_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_template_entries_schedule ON meal_plan_template_entries(template_id, day_of_week, meal_slot);

-- Row Level Security Policies
ALTER TABLE meal_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_template_entries ENABLE ROW LEVEL SECURITY;

-- Users can view their own templates and admin templates
CREATE POLICY "Users can view own and admin templates"
  ON meal_plan_templates
  FOR SELECT
  USING (
    is_admin_template = true
    OR user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Users can create templates in their household
CREATE POLICY "Users can create templates"
  ON meal_plan_templates
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Users can update their own templates
CREATE POLICY "Users can update own templates"
  ON meal_plan_templates
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Users can delete their own templates
CREATE POLICY "Users can delete own templates"
  ON meal_plan_templates
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Template entries inherit permissions from parent template
CREATE POLICY "Users can view template entries"
  ON meal_plan_template_entries
  FOR SELECT
  USING (
    template_id IN (
      SELECT id FROM meal_plan_templates
      WHERE is_admin_template = true
        OR user_id = auth.uid()
        OR household_id IN (
          SELECT household_id FROM profiles WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY "Users can create template entries"
  ON meal_plan_template_entries
  FOR INSERT
  WITH CHECK (
    template_id IN (
      SELECT id FROM meal_plan_templates
      WHERE user_id = auth.uid()
        OR household_id IN (
          SELECT household_id FROM profiles WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY "Users can update template entries"
  ON meal_plan_template_entries
  FOR UPDATE
  USING (
    template_id IN (
      SELECT id FROM meal_plan_templates
      WHERE user_id = auth.uid()
        OR household_id IN (
          SELECT household_id FROM profiles WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY "Users can delete template entries"
  ON meal_plan_template_entries
  FOR DELETE
  USING (
    template_id IN (
      SELECT id FROM meal_plan_templates
      WHERE user_id = auth.uid()
        OR household_id IN (
          SELECT household_id FROM profiles WHERE user_id = auth.uid()
        )
    )
  );

-- Admins have full access to templates
CREATE POLICY "Admins can manage all templates"
  ON meal_plan_templates
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all template entries"
  ON meal_plan_template_entries
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_meal_plan_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_meal_plan_template_updated_at_trigger
  BEFORE UPDATE ON meal_plan_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_meal_plan_template_updated_at();

-- Function to calculate template success rate from usage
CREATE OR REPLACE FUNCTION calculate_template_success_rate(template_id_input UUID)
RETURNS DECIMAL AS $$
DECLARE
  avg_success DECIMAL(5,2);
BEGIN
  -- Calculate average success rate from food attempts of meals created from this template
  -- This is a simplified calculation - can be enhanced based on actual usage patterns
  SELECT AVG(
    CASE
      WHEN result = 'ate' THEN 100.0
      WHEN result = 'tasted' THEN 50.0
      WHEN result = 'refused' THEN 0.0
      ELSE NULL
    END
  ) INTO avg_success
  FROM plan_entries
  WHERE date >= (
    SELECT MAX(date) FROM plan_entries
    WHERE notes LIKE '%template:' || template_id_input || '%'
  )
  AND notes LIKE '%template:' || template_id_input || '%';

  RETURN COALESCE(avg_success, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE meal_plan_templates IS 'Reusable meal plan templates for quick weekly planning';
COMMENT ON TABLE meal_plan_template_entries IS 'Individual meal entries within a template';
COMMENT ON FUNCTION calculate_template_success_rate IS 'Calculates average success rate for meals created from a template';
