-- Create lead sources enum
CREATE TYPE lead_source AS ENUM (
  'landing_page',
  'signup_form',
  'trial_signup',
  'newsletter',
  'contact_form',
  'referral',
  'social_media',
  'organic_search',
  'paid_ad',
  'other'
);

-- Create lead status enum
CREATE TYPE lead_status AS ENUM (
  'new',
  'contacted',
  'qualified',
  'converted',
  'unqualified',
  'lost'
);

-- Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  source lead_source NOT NULL,
  utm_campaign TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_content TEXT,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  conversion_goal TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  source lead_source NOT NULL DEFAULT 'landing_page',
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  status lead_status NOT NULL DEFAULT 'new',
  score INTEGER DEFAULT 0, -- Lead scoring 0-100
  metadata JSONB DEFAULT '{}'::jsonb, -- Custom fields, UTM params, etc.
  notes TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create lead interactions table (activity log)
CREATE TABLE IF NOT EXISTS lead_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL, -- email, call, meeting, form_submission, page_view
  subject TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create campaign analytics table
CREATE TABLE IF NOT EXISTS campaign_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  cost DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_id ON lead_interactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_created_at ON lead_interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_is_active ON campaigns(is_active);
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_campaign_date ON campaign_analytics(campaign_id, date DESC);

-- Enable RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Campaigns: Only admins can manage
CREATE POLICY "Admins can manage campaigns"
  ON campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Leads: Only admins can manage
CREATE POLICY "Admins can manage leads"
  ON leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Allow public insert for lead capture forms (service role will be used)
CREATE POLICY "Public can create leads via service role"
  ON leads FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'anon');

-- Lead interactions: Only admins
CREATE POLICY "Admins can manage lead interactions"
  ON lead_interactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Campaign analytics: Only admins
CREATE POLICY "Admins can view campaign analytics"
  ON campaign_analytics FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Function to automatically score leads
CREATE OR REPLACE FUNCTION calculate_lead_score(lead_id UUID)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
  lead_record RECORD;
  interaction_count INTEGER;
BEGIN
  SELECT * INTO lead_record FROM leads WHERE id = lead_id;

  -- Base score for having required fields
  IF lead_record.email IS NOT NULL THEN score := score + 10; END IF;
  IF lead_record.full_name IS NOT NULL THEN score := score + 10; END IF;
  IF lead_record.phone IS NOT NULL THEN score := score + 15; END IF;

  -- Score based on source quality
  CASE lead_record.source
    WHEN 'referral' THEN score := score + 20;
    WHEN 'trial_signup' THEN score := score + 25;
    WHEN 'paid_ad' THEN score := score + 10;
    WHEN 'organic_search' THEN score := score + 15;
    ELSE score := score + 5;
  END CASE;

  -- Score based on interactions
  SELECT COUNT(*) INTO interaction_count
  FROM lead_interactions
  WHERE lead_interactions.lead_id = lead_id;

  score := score + LEAST(interaction_count * 5, 30);

  -- Recency bonus (contacted in last 7 days)
  IF lead_record.last_contacted_at > NOW() - INTERVAL '7 days' THEN
    score := score + 10;
  END IF;

  RETURN LEAST(score, 100); -- Cap at 100
END;
$$ LANGUAGE plpgsql;

-- Trigger to update lead score on changes
CREATE OR REPLACE FUNCTION update_lead_score()
RETURNS TRIGGER AS $$
BEGIN
  NEW.score := calculate_lead_score(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_lead_score
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_score();

-- Function to update updated_at timestamp
CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to get campaign conversion rate
CREATE OR REPLACE FUNCTION get_campaign_stats(campaign_uuid UUID)
RETURNS TABLE (
  total_leads INTEGER,
  converted_leads INTEGER,
  conversion_rate DECIMAL,
  avg_score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_leads,
    COUNT(*) FILTER (WHERE status = 'converted')::INTEGER as converted_leads,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND((COUNT(*) FILTER (WHERE status = 'converted')::DECIMAL / COUNT(*)) * 100, 2)
      ELSE 0
    END as conversion_rate,
    ROUND(AVG(score), 2) as avg_score
  FROM leads
  WHERE campaign_id = campaign_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default campaign
INSERT INTO campaigns (name, description, source, is_active)
VALUES
  ('General Lead Capture', 'Default campaign for leads without specific attribution', 'landing_page', true),
  ('Free Trial Signups', 'Track users who start free trials', 'trial_signup', true),
  ('Newsletter Subscribers', 'Email newsletter signups', 'newsletter', true)
ON CONFLICT DO NOTHING;
