-- Picky Eater Quiz Tables
-- Stores quiz responses, lead captures, and analytics for the picky eater quiz tool

-- Table: quiz_responses
-- Stores all quiz submissions with answers and calculated personality type
CREATE TABLE IF NOT EXISTS quiz_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Quiz answers (stored as JSONB for flexibility)
  answers JSONB NOT NULL,

  -- Calculated results
  personality_type VARCHAR(50) NOT NULL,
  secondary_type VARCHAR(50),
  scores JSONB NOT NULL, -- Stores all personality type scores

  -- User information (optional, collected after email capture)
  email VARCHAR(255),
  child_name VARCHAR(100),
  parent_name VARCHAR(100),

  -- Tracking
  session_id VARCHAR(100),
  referral_source VARCHAR(255),
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  ab_test_variant VARCHAR(50),

  -- Engagement tracking
  email_captured BOOLEAN DEFAULT false,
  pdf_downloaded BOOLEAN DEFAULT false,
  shared_social BOOLEAN DEFAULT false,
  trial_started BOOLEAN DEFAULT false,

  -- Analytics
  completion_time_seconds INTEGER,
  device_type VARCHAR(50),
  user_agent TEXT,

  CONSTRAINT valid_personality_type CHECK (
    personality_type IN (
      'texture_detective',
      'beige_brigade',
      'slow_explorer',
      'visual_critic',
      'mix_master',
      'flavor_seeker'
    )
  )
);

-- Table: quiz_leads
-- Stores email capture information and nurture sequence tracking
CREATE TABLE IF NOT EXISTS quiz_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Lead information
  email VARCHAR(255) NOT NULL UNIQUE,
  child_name VARCHAR(100),
  parent_name VARCHAR(100),

  -- Associated quiz response
  quiz_response_id UUID REFERENCES quiz_responses(id),
  personality_type VARCHAR(50),

  -- Email sequence tracking
  email_sequence_started BOOLEAN DEFAULT false,
  email_1_sent_at TIMESTAMP WITH TIME ZONE,
  email_1_opened BOOLEAN DEFAULT false,
  email_1_clicked BOOLEAN DEFAULT false,
  email_2_sent_at TIMESTAMP WITH TIME ZONE,
  email_2_opened BOOLEAN DEFAULT false,
  email_2_clicked BOOLEAN DEFAULT false,
  email_3_sent_at TIMESTAMP WITH TIME ZONE,
  email_3_opened BOOLEAN DEFAULT false,
  email_3_clicked BOOLEAN DEFAULT false,
  email_4_sent_at TIMESTAMP WITH TIME ZONE,
  email_4_opened BOOLEAN DEFAULT false,
  email_4_clicked BOOLEAN DEFAULT false,
  email_5_sent_at TIMESTAMP WITH TIME ZONE,
  email_5_opened BOOLEAN DEFAULT false,
  email_5_clicked BOOLEAN DEFAULT false,
  email_6_sent_at TIMESTAMP WITH TIME ZONE,
  email_6_opened BOOLEAN DEFAULT false,
  email_6_clicked BOOLEAN DEFAULT false,
  email_7_sent_at TIMESTAMP WITH TIME ZONE,
  email_7_opened BOOLEAN DEFAULT false,
  email_7_clicked BOOLEAN DEFAULT false,

  -- Conversion tracking
  trial_started BOOLEAN DEFAULT false,
  trial_started_at TIMESTAMP WITH TIME ZONE,
  subscription_active BOOLEAN DEFAULT false,
  subscription_started_at TIMESTAMP WITH TIME ZONE,

  -- Referral tracking
  referral_code VARCHAR(50) UNIQUE,
  referral_count INTEGER DEFAULT 0,

  -- Status
  unsubscribed BOOLEAN DEFAULT false,
  unsubscribed_at TIMESTAMP WITH TIME ZONE,

  -- Marketing consent
  accepts_marketing BOOLEAN DEFAULT true
);

-- Table: quiz_analytics
-- Stores detailed analytics events for quiz flow optimization
CREATE TABLE IF NOT EXISTS quiz_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Session tracking
  session_id VARCHAR(100) NOT NULL,
  quiz_response_id UUID REFERENCES quiz_responses(id),

  -- Event data
  event_type VARCHAR(100) NOT NULL, -- e.g., 'quiz_started', 'question_answered', 'quiz_abandoned', etc.
  event_data JSONB,

  -- Page/Step tracking
  current_step INTEGER,
  total_steps INTEGER,

  -- Timing
  time_on_page_seconds INTEGER,

  -- Device/Browser
  device_type VARCHAR(50),
  browser VARCHAR(100),
  user_agent TEXT,

  -- A/B Testing
  ab_test_variant VARCHAR(50),

  -- Source tracking
  referral_source VARCHAR(255),
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100)
);

-- Table: quiz_shares
-- Tracks social sharing and virality
CREATE TABLE IF NOT EXISTS quiz_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Original quiz response
  quiz_response_id UUID REFERENCES quiz_responses(id),

  -- Share details
  platform VARCHAR(50) NOT NULL, -- facebook, instagram, twitter, pinterest, email
  personality_type VARCHAR(50),

  -- Tracking
  share_url TEXT,
  referral_code VARCHAR(50),
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0
);

-- Table: quiz_referrals
-- Tracks referral conversions
CREATE TABLE IF NOT EXISTS quiz_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Referrer information
  referrer_email VARCHAR(255) REFERENCES quiz_leads(email),
  referral_code VARCHAR(50) NOT NULL,

  -- Referred user
  referred_quiz_response_id UUID REFERENCES quiz_responses(id),
  referred_email VARCHAR(255),

  -- Conversion status
  converted BOOLEAN DEFAULT false,
  reward_granted BOOLEAN DEFAULT false
);

-- Indexes for performance
CREATE INDEX idx_quiz_responses_created_at ON quiz_responses(created_at DESC);
CREATE INDEX idx_quiz_responses_personality_type ON quiz_responses(personality_type);
CREATE INDEX idx_quiz_responses_email ON quiz_responses(email);
CREATE INDEX idx_quiz_responses_session_id ON quiz_responses(session_id);

CREATE INDEX idx_quiz_leads_email ON quiz_leads(email);
CREATE INDEX idx_quiz_leads_created_at ON quiz_leads(created_at DESC);
CREATE INDEX idx_quiz_leads_personality_type ON quiz_leads(personality_type);
CREATE INDEX idx_quiz_leads_trial_started ON quiz_leads(trial_started);

CREATE INDEX idx_quiz_analytics_session_id ON quiz_analytics(session_id);
CREATE INDEX idx_quiz_analytics_event_type ON quiz_analytics(event_type);
CREATE INDEX idx_quiz_analytics_created_at ON quiz_analytics(created_at DESC);

CREATE INDEX idx_quiz_shares_quiz_response_id ON quiz_shares(quiz_response_id);
CREATE INDEX idx_quiz_shares_platform ON quiz_shares(platform);
CREATE INDEX idx_quiz_shares_referral_code ON quiz_shares(referral_code);

CREATE INDEX idx_quiz_referrals_referral_code ON quiz_referrals(referral_code);
CREATE INDEX idx_quiz_referrals_referrer_email ON quiz_referrals(referrer_email);

-- Enable Row Level Security
ALTER TABLE quiz_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_referrals ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- quiz_responses: Anyone can insert (anonymous quiz taking), only admins can view all
CREATE POLICY "Anyone can submit quiz responses"
  ON quiz_responses FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view their own quiz responses"
  ON quiz_responses FOR SELECT
  TO authenticated
  USING (email = auth.jwt()->>'email');

-- quiz_leads: Users can update their own lead info
CREATE POLICY "Anyone can create leads"
  ON quiz_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view their own lead info"
  ON quiz_leads FOR SELECT
  TO authenticated
  USING (email = auth.jwt()->>'email');

CREATE POLICY "Users can update their own lead info"
  ON quiz_leads FOR UPDATE
  TO authenticated
  USING (email = auth.jwt()->>'email')
  WITH CHECK (email = auth.jwt()->>'email');

-- quiz_analytics: Anyone can insert events
CREATE POLICY "Anyone can track analytics"
  ON quiz_analytics FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- quiz_shares: Anyone can create shares
CREATE POLICY "Anyone can create shares"
  ON quiz_shares FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- quiz_referrals: Anyone can create referrals
CREATE POLICY "Anyone can create referrals"
  ON quiz_referrals FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Updated_at trigger for quiz_leads
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_quiz_leads_updated_at BEFORE UPDATE ON quiz_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE quiz_responses IS 'Stores all picky eater quiz submissions with answers and calculated personality types';
COMMENT ON TABLE quiz_leads IS 'Email leads captured from quiz with nurture sequence tracking';
COMMENT ON TABLE quiz_analytics IS 'Detailed event tracking for quiz flow optimization and A/B testing';
COMMENT ON TABLE quiz_shares IS 'Social sharing tracking for virality metrics';
COMMENT ON TABLE quiz_referrals IS 'Referral program tracking and reward management';
