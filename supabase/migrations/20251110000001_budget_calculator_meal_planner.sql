-- Grocery Budget Calculator & 5-Day Meal Plan Generator Tables
-- Lead magnet tools for TryEatPal.com

-- ============================================
-- GROCERY BUDGET CALCULATOR
-- ============================================

-- Table: budget_calculations
-- Stores all budget calculator submissions
CREATE TABLE IF NOT EXISTS budget_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Input data
  family_size INTEGER NOT NULL,
  adults INTEGER NOT NULL,
  children INTEGER NOT NULL,
  zip_code VARCHAR(10),
  state VARCHAR(2),
  dietary_restrictions JSONB DEFAULT '[]', -- ["vegetarian", "gluten_free", etc.]

  -- Calculated results
  recommended_monthly_budget DECIMAL(10, 2) NOT NULL,
  cost_per_meal DECIMAL(10, 2) NOT NULL,
  cost_per_person_per_day DECIMAL(10, 2) NOT NULL,
  usda_plan_level VARCHAR(20) NOT NULL, -- thrifty, low_cost, moderate, liberal

  -- Comparison data
  vs_meal_kits_savings DECIMAL(10, 2),
  vs_dining_out_savings DECIMAL(10, 2),
  annual_savings DECIMAL(10, 2),

  -- User information (captured after email)
  email VARCHAR(255),
  name VARCHAR(100),

  -- Tracking
  session_id VARCHAR(100) NOT NULL,
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),

  -- Engagement
  email_captured BOOLEAN DEFAULT false,
  meal_plan_downloaded BOOLEAN DEFAULT false,
  shared BOOLEAN DEFAULT false,
  trial_started BOOLEAN DEFAULT false,

  -- Analytics
  device_type VARCHAR(50),
  user_agent TEXT
);

-- Table: budget_leads
-- Email captures from budget calculator
CREATE TABLE IF NOT EXISTS budget_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Lead info
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100),

  -- Associated calculation
  budget_calculation_id UUID REFERENCES budget_calculations(id),
  family_size INTEGER,
  monthly_budget DECIMAL(10, 2),

  -- Email sequence tracking
  email_sequence_started BOOLEAN DEFAULT false,
  welcome_email_sent_at TIMESTAMP WITH TIME ZONE,
  day_3_email_sent_at TIMESTAMP WITH TIME ZONE,
  day_7_email_sent_at TIMESTAMP WITH TIME ZONE,

  -- Conversion tracking
  trial_started BOOLEAN DEFAULT false,
  trial_started_at TIMESTAMP WITH TIME ZONE,
  subscription_active BOOLEAN DEFAULT false,

  -- Referral
  referral_code VARCHAR(50) UNIQUE,
  referral_count INTEGER DEFAULT 0,

  -- Status
  unsubscribed BOOLEAN DEFAULT false,
  accepts_marketing BOOLEAN DEFAULT true
);

-- ============================================
-- 5-DAY MEAL PLAN GENERATOR
-- ============================================

-- Table: meal_plan_generations
-- Stores all meal plan generation requests
CREATE TABLE IF NOT EXISTS meal_plan_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Input data
  family_size INTEGER NOT NULL,
  adults INTEGER NOT NULL,
  children INTEGER NOT NULL,
  children_ages JSONB DEFAULT '[]', -- [3, 6, 9]
  dietary_restrictions JSONB DEFAULT '[]',
  allergies JSONB DEFAULT '[]',
  picky_eater_level VARCHAR(20), -- none, mild, moderate, severe
  cooking_time_available INTEGER, -- minutes per day
  cooking_skill_level VARCHAR(20), -- beginner, intermediate, advanced
  kitchen_equipment JSONB DEFAULT '[]', -- ["slow_cooker", "instant_pot", etc.]

  -- Generated meal plan (IDs reference to recipes or meal data)
  meal_plan JSONB NOT NULL, -- Array of 5 meals with recipes
  grocery_list JSONB NOT NULL, -- Organized by category
  total_estimated_cost DECIMAL(10, 2),
  total_prep_time INTEGER, -- minutes for all 5 meals

  -- User information
  email VARCHAR(255),
  name VARCHAR(100),

  -- Tracking
  session_id VARCHAR(100) NOT NULL,
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),

  -- Engagement
  email_captured BOOLEAN DEFAULT false,
  full_plan_downloaded BOOLEAN DEFAULT false,
  shared BOOLEAN DEFAULT false,
  trial_started BOOLEAN DEFAULT false,

  -- Satisfaction (if we add rating)
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,

  -- Analytics
  device_type VARCHAR(50),
  user_agent TEXT
);

-- Table: meal_plan_leads
-- Email captures from meal plan generator
CREATE TABLE IF NOT EXISTS meal_plan_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Lead info
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100),

  -- Associated meal plan
  meal_plan_generation_id UUID REFERENCES meal_plan_generations(id),
  family_size INTEGER,
  picky_eater_level VARCHAR(20),

  -- Email sequence tracking
  email_sequence_started BOOLEAN DEFAULT false,
  welcome_email_sent_at TIMESTAMP WITH TIME ZONE,
  day_2_email_sent_at TIMESTAMP WITH TIME ZONE,
  day_5_email_sent_at TIMESTAMP WITH TIME ZONE,
  day_7_email_sent_at TIMESTAMP WITH TIME ZONE,

  -- Conversion tracking
  trial_started BOOLEAN DEFAULT false,
  trial_started_at TIMESTAMP WITH TIME ZONE,
  subscription_active BOOLEAN DEFAULT false,

  -- Referral
  referral_code VARCHAR(50) UNIQUE,
  referral_count INTEGER DEFAULT 0,

  -- Status
  unsubscribed BOOLEAN DEFAULT false,
  accepts_marketing BOOLEAN DEFAULT true
);

-- ============================================
-- SHARED ANALYTICS
-- ============================================

-- Table: tool_analytics
-- General analytics for all lead magnet tools
CREATE TABLE IF NOT EXISTS tool_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Tool identification
  tool_name VARCHAR(50) NOT NULL, -- 'picky_eater_quiz', 'budget_calculator', 'meal_plan_generator'
  tool_version VARCHAR(20),

  -- Session tracking
  session_id VARCHAR(100) NOT NULL,
  user_id UUID, -- If authenticated

  -- Event data
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB,

  -- Page tracking
  page_url TEXT,
  referrer_url TEXT,

  -- Timing
  time_on_page_seconds INTEGER,

  -- Device/Browser
  device_type VARCHAR(50),
  browser VARCHAR(100),
  user_agent TEXT,

  -- Marketing
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),

  -- A/B Testing
  ab_test_variant VARCHAR(50),

  -- Location (optional)
  ip_address INET,
  country VARCHAR(2),
  region VARCHAR(100)
);

-- ============================================
-- INDEXES
-- ============================================

-- Budget Calculator Indexes
CREATE INDEX idx_budget_calculations_created_at ON budget_calculations(created_at DESC);
CREATE INDEX idx_budget_calculations_session_id ON budget_calculations(session_id);
CREATE INDEX idx_budget_calculations_email ON budget_calculations(email);
CREATE INDEX idx_budget_calculations_family_size ON budget_calculations(family_size);

CREATE INDEX idx_budget_leads_email ON budget_leads(email);
CREATE INDEX idx_budget_leads_created_at ON budget_leads(created_at DESC);
CREATE INDEX idx_budget_leads_trial_started ON budget_leads(trial_started);

-- Meal Plan Generator Indexes
CREATE INDEX idx_meal_plan_generations_created_at ON meal_plan_generations(created_at DESC);
CREATE INDEX idx_meal_plan_generations_session_id ON meal_plan_generations(session_id);
CREATE INDEX idx_meal_plan_generations_email ON meal_plan_generations(email);
CREATE INDEX idx_meal_plan_generations_family_size ON meal_plan_generations(family_size);
CREATE INDEX idx_meal_plan_generations_picky_eater_level ON meal_plan_generations(picky_eater_level);

CREATE INDEX idx_meal_plan_leads_email ON meal_plan_leads(email);
CREATE INDEX idx_meal_plan_leads_created_at ON meal_plan_leads(created_at DESC);
CREATE INDEX idx_meal_plan_leads_trial_started ON meal_plan_leads(trial_started);

-- Analytics Indexes
CREATE INDEX idx_tool_analytics_tool_name ON tool_analytics(tool_name);
CREATE INDEX idx_tool_analytics_session_id ON tool_analytics(session_id);
CREATE INDEX idx_tool_analytics_event_type ON tool_analytics(event_type);
CREATE INDEX idx_tool_analytics_created_at ON tool_analytics(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE budget_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Budget Calculator
CREATE POLICY "Anyone can create budget calculations"
  ON budget_calculations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view their own calculations"
  ON budget_calculations FOR SELECT
  TO authenticated
  USING (email = auth.jwt()->>'email');

-- RLS Policies - Budget Leads
CREATE POLICY "Anyone can create budget leads"
  ON budget_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view their own budget leads"
  ON budget_leads FOR SELECT
  TO authenticated
  USING (email = auth.jwt()->>'email');

CREATE POLICY "Users can update their own budget leads"
  ON budget_leads FOR UPDATE
  TO authenticated
  USING (email = auth.jwt()->>'email')
  WITH CHECK (email = auth.jwt()->>'email');

-- RLS Policies - Meal Plan Generations
CREATE POLICY "Anyone can create meal plans"
  ON meal_plan_generations FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view their own meal plans"
  ON meal_plan_generations FOR SELECT
  TO authenticated
  USING (email = auth.jwt()->>'email');

-- RLS Policies - Meal Plan Leads
CREATE POLICY "Anyone can create meal plan leads"
  ON meal_plan_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view their own meal plan leads"
  ON meal_plan_leads FOR SELECT
  TO authenticated
  USING (email = auth.jwt()->>'email');

CREATE POLICY "Users can update their own meal plan leads"
  ON meal_plan_leads FOR UPDATE
  TO authenticated
  USING (email = auth.jwt()->>'email')
  WITH CHECK (email = auth.jwt()->>'email');

-- RLS Policies - Analytics (anyone can insert)
CREATE POLICY "Anyone can track analytics"
  ON tool_analytics FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ============================================
-- TRIGGERS
-- ============================================

-- Updated_at triggers
CREATE TRIGGER update_budget_leads_updated_at BEFORE UPDATE ON budget_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meal_plan_leads_updated_at BEFORE UPDATE ON meal_plan_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to increment referral counts
CREATE OR REPLACE FUNCTION increment_budget_referral_count(referrer_email_param TEXT)
RETURNS void AS $$
BEGIN
  UPDATE budget_leads
  SET referral_count = referral_count + 1
  WHERE email = referrer_email_param;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_meal_plan_referral_count(referrer_email_param TEXT)
RETURNS void AS $$
BEGIN
  UPDATE meal_plan_leads
  SET referral_count = referral_count + 1
  WHERE email = referrer_email_param;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE budget_calculations IS 'Stores all grocery budget calculator submissions and results';
COMMENT ON TABLE budget_leads IS 'Email leads captured from budget calculator with nurture tracking';
COMMENT ON TABLE meal_plan_generations IS 'Stores all 5-day meal plan generation requests and results';
COMMENT ON TABLE meal_plan_leads IS 'Email leads captured from meal plan generator with nurture tracking';
COMMENT ON TABLE tool_analytics IS 'Unified analytics tracking for all lead magnet tools';
