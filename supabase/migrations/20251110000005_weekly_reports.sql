-- Automated Weekly Reports Feature
-- Generates comprehensive weekly summaries of meal planning activities
-- Provides insights on nutrition, engagement, and efficiency metrics

-- Weekly report records
CREATE TABLE IF NOT EXISTS weekly_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- Report period
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,

  -- Planning metrics
  meals_planned INTEGER DEFAULT 0,
  meals_completed INTEGER DEFAULT 0,
  planning_completion_rate DECIMAL(5,2), -- Percentage
  templates_used INTEGER DEFAULT 0,
  time_saved_minutes INTEGER DEFAULT 0, -- Estimated time saved using templates

  -- Nutrition metrics
  nutrition_goals_met INTEGER DEFAULT 0,
  nutrition_goals_total INTEGER DEFAULT 0,
  avg_calories_per_day DECIMAL(8,2),
  avg_protein_per_day DECIMAL(6,2),
  avg_carbs_per_day DECIMAL(6,2),
  avg_fat_per_day DECIMAL(6,2),
  nutrition_score DECIMAL(5,2), -- 0-100 score based on goals

  -- Grocery metrics
  grocery_items_added INTEGER DEFAULT 0,
  grocery_items_purchased INTEGER DEFAULT 0,
  grocery_completion_rate DECIMAL(5,2),
  estimated_grocery_cost DECIMAL(10,2),

  -- Recipe metrics
  unique_recipes_used INTEGER DEFAULT 0,
  recipe_repeats INTEGER DEFAULT 0,
  new_recipes_tried INTEGER DEFAULT 0,
  recipe_diversity_score DECIMAL(5,2), -- Higher = more variety

  -- Kid engagement metrics
  kids_voted INTEGER DEFAULT 0,
  total_kids INTEGER DEFAULT 0,
  voting_participation_rate DECIMAL(5,2),
  total_votes_cast INTEGER DEFAULT 0,
  avg_meal_approval_score DECIMAL(5,2), -- 0-100
  achievements_unlocked INTEGER DEFAULT 0,

  -- Top performers
  most_loved_meals JSONB, -- Array of {meal_name, approval_score, votes}
  least_loved_meals JSONB,
  most_used_recipes JSONB, -- Array of {recipe_name, times_used}
  healthiest_meals JSONB, -- Array of {meal_name, nutrition_score}

  -- Insights and recommendations
  insights JSONB, -- Array of insight objects
  recommendations JSONB, -- Array of recommendation objects

  -- Status
  status TEXT DEFAULT 'generated' CHECK (status IN ('generating', 'generated', 'sent', 'viewed', 'archived')),
  generated_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,

  -- Report version (for future schema changes)
  report_version INTEGER DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Ensure one report per week per household
  UNIQUE (household_id, week_start_date)
);

-- Report insights (individual noteworthy findings)
CREATE TABLE IF NOT EXISTS report_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID REFERENCES weekly_reports(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- Insight details
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'achievement',         -- "You planned 7 days this week!"
    'improvement',         -- "20% more veggies than last week"
    'streak',             -- "3 weeks in a row planning!"
    'cost_savings',       -- "Saved $50 vs eating out"
    'nutrition_win',      -- "Hit protein goals 6/7 days"
    'engagement_win',     -- "100% kid voting participation"
    'variety_win',        -- "Tried 5 new recipes"
    'efficiency_win',     -- "Used templates saved 2 hours"
    'concern',            -- "Low approval on 3 meals"
    'suggestion'          -- "Try more breakfast variety"
  )),

  title TEXT NOT NULL,
  description TEXT,
  metric_value DECIMAL(10,2), -- The key number
  metric_label TEXT, -- e.g., "meals", "minutes", "dollars"

  -- Visual elements
  icon_name TEXT, -- Lucide icon name
  color_scheme TEXT, -- 'green', 'yellow', 'red', 'blue', 'purple'

  -- Priority for display
  priority INTEGER DEFAULT 0, -- Higher = show first

  created_at TIMESTAMPTZ DEFAULT now()
);

-- User preferences for report generation and delivery
CREATE TABLE IF NOT EXISTS report_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Generation settings
  auto_generate BOOLEAN DEFAULT true,
  generation_day TEXT DEFAULT 'monday' CHECK (generation_day IN (
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
  )),
  generation_time TIME DEFAULT '09:00:00', -- What time to generate

  -- Delivery settings
  email_delivery BOOLEAN DEFAULT true,
  push_notification BOOLEAN DEFAULT true,
  in_app_only BOOLEAN DEFAULT false,

  -- Content preferences
  include_nutrition_details BOOLEAN DEFAULT true,
  include_cost_estimates BOOLEAN DEFAULT true,
  include_kid_voting BOOLEAN DEFAULT true,
  include_recommendations BOOLEAN DEFAULT true,
  include_comparisons BOOLEAN DEFAULT true, -- Compare to previous weeks

  -- Report format
  summary_level TEXT DEFAULT 'detailed' CHECK (summary_level IN ('brief', 'standard', 'detailed')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (household_id, user_id)
);

-- Historical comparison data (track trends over time)
CREATE TABLE IF NOT EXISTS report_trends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  metric_name TEXT NOT NULL,
  week_start_date DATE NOT NULL,
  metric_value DECIMAL(10,2) NOT NULL,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (household_id, metric_name, week_start_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_weekly_reports_household ON weekly_reports(household_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_dates ON weekly_reports(week_start_date, week_end_date);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_status ON weekly_reports(status);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_generated_at ON weekly_reports(generated_at);

CREATE INDEX IF NOT EXISTS idx_report_insights_report ON report_insights(report_id);
CREATE INDEX IF NOT EXISTS idx_report_insights_household ON report_insights(household_id);
CREATE INDEX IF NOT EXISTS idx_report_insights_type ON report_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_report_insights_priority ON report_insights(priority DESC);

CREATE INDEX IF NOT EXISTS idx_report_preferences_household ON report_preferences(household_id);
CREATE INDEX IF NOT EXISTS idx_report_preferences_user ON report_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_report_preferences_auto ON report_preferences(auto_generate) WHERE auto_generate = true;

CREATE INDEX IF NOT EXISTS idx_report_trends_household ON report_trends(household_id);
CREATE INDEX IF NOT EXISTS idx_report_trends_metric ON report_trends(metric_name, week_start_date);

-- Row Level Security
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_trends ENABLE ROW LEVEL SECURITY;

-- weekly_reports policies
CREATE POLICY "Users can view household reports"
  ON weekly_reports FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can create reports"
  ON weekly_reports FOR INSERT
  WITH CHECK (true); -- Edge function will have service role

CREATE POLICY "Users can update household reports"
  ON weekly_reports FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- report_insights policies
CREATE POLICY "Users can view household insights"
  ON report_insights FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- report_preferences policies
CREATE POLICY "Users can view their preferences"
  ON report_preferences FOR SELECT
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their preferences"
  ON report_preferences FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Users can update their preferences"
  ON report_preferences FOR UPDATE
  USING (
    user_id = auth.uid()
  );

-- report_trends policies
CREATE POLICY "Users can view household trends"
  ON report_trends FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- Admins have full access
CREATE POLICY "Admins can manage all reports"
  ON weekly_reports FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Triggers for updated_at
CREATE TRIGGER update_weekly_reports_updated_at
  BEFORE UPDATE ON weekly_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_report_preferences_updated_at
  BEFORE UPDATE ON report_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

-- Function to mark report as viewed
CREATE OR REPLACE FUNCTION mark_report_viewed(p_report_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE weekly_reports
  SET
    status = CASE
      WHEN status = 'generated' THEN 'viewed'
      WHEN status = 'sent' THEN 'viewed'
      ELSE status
    END,
    viewed_at = CASE
      WHEN viewed_at IS NULL THEN now()
      ELSE viewed_at
    END,
    updated_at = now()
  WHERE id = p_report_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get trend comparison
CREATE OR REPLACE FUNCTION get_metric_trend(
  p_household_id UUID,
  p_metric_name TEXT,
  p_current_week DATE,
  p_weeks_back INTEGER DEFAULT 4
)
RETURNS TABLE(
  week_start_date DATE,
  metric_value DECIMAL(10,2),
  week_label TEXT,
  is_current BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rt.week_start_date,
    rt.metric_value,
    CASE
      WHEN rt.week_start_date = p_current_week THEN 'Current'
      WHEN rt.week_start_date = p_current_week - INTERVAL '1 week' THEN 'Last Week'
      ELSE 'Week of ' || TO_CHAR(rt.week_start_date, 'Mon DD')
    END,
    rt.week_start_date = p_current_week
  FROM report_trends rt
  WHERE rt.household_id = p_household_id
    AND rt.metric_name = p_metric_name
    AND rt.week_start_date >= p_current_week - (p_weeks_back || ' weeks')::INTERVAL
    AND rt.week_start_date <= p_current_week
  ORDER BY rt.week_start_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to save trend data
CREATE OR REPLACE FUNCTION save_report_trend(
  p_household_id UUID,
  p_metric_name TEXT,
  p_week_start DATE,
  p_value DECIMAL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO report_trends (household_id, metric_name, week_start_date, metric_value)
  VALUES (p_household_id, p_metric_name, p_week_start, p_value)
  ON CONFLICT (household_id, metric_name, week_start_date)
  DO UPDATE SET metric_value = p_value;
END;
$$ LANGUAGE plpgsql;

-- View for recent reports summary
CREATE OR REPLACE VIEW recent_reports_summary AS
SELECT
  wr.id,
  wr.household_id,
  wr.week_start_date,
  wr.week_end_date,
  wr.status,
  wr.meals_planned,
  wr.planning_completion_rate,
  wr.nutrition_score,
  wr.voting_participation_rate,
  wr.avg_meal_approval_score,
  wr.generated_at,
  wr.viewed_at,
  COUNT(ri.id) as insight_count
FROM weekly_reports wr
LEFT JOIN report_insights ri ON ri.report_id = wr.id
WHERE wr.generated_at >= now() - INTERVAL '3 months'
GROUP BY wr.id
ORDER BY wr.week_start_date DESC;

-- Comments for documentation
COMMENT ON TABLE weekly_reports IS 'Comprehensive weekly summaries of household meal planning activities';
COMMENT ON TABLE report_insights IS 'Individual noteworthy findings and achievements from weekly reports';
COMMENT ON TABLE report_preferences IS 'User preferences for report generation and delivery';
COMMENT ON TABLE report_trends IS 'Historical metric data for trend analysis over time';

COMMENT ON COLUMN weekly_reports.planning_completion_rate IS 'Percentage of planned meals that were actually logged';
COMMENT ON COLUMN weekly_reports.time_saved_minutes IS 'Estimated time saved by using templates and automation';
COMMENT ON COLUMN weekly_reports.nutrition_score IS 'Overall nutrition quality score based on goals (0-100)';
COMMENT ON COLUMN weekly_reports.recipe_diversity_score IS 'Score indicating meal variety (higher = more diverse)';
COMMENT ON COLUMN weekly_reports.most_loved_meals IS 'JSON array of top-rated meals by kid votes';
COMMENT ON COLUMN weekly_reports.insights IS 'JSON array of key insights and achievements';

COMMENT ON FUNCTION mark_report_viewed IS 'Marks a report as viewed and updates viewed_at timestamp';
COMMENT ON FUNCTION get_metric_trend IS 'Retrieves historical trend data for a specific metric';
COMMENT ON FUNCTION save_report_trend IS 'Saves a metric value for trend tracking';
