-- Create email lists table
CREATE TABLE IF NOT EXISTS email_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  subscriber_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email subscribers table
CREATE TABLE IF NOT EXISTS email_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  status TEXT DEFAULT 'active', -- active, unsubscribed, bounced, complained
  source TEXT DEFAULT 'manual', -- manual, signup_form, import, api
  confirmed BOOLEAN DEFAULT FALSE,
  confirmation_token TEXT,
  unsubscribe_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  metadata JSONB DEFAULT '{}'::jsonb,
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email)
);

-- Create list subscribers junction table
CREATE TABLE IF NOT EXISTS list_subscribers (
  list_id UUID REFERENCES email_lists(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES email_subscribers(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active', -- active, unsubscribed
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  PRIMARY KEY (list_id, subscriber_id)
);

-- Create email campaigns table
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  preview_text TEXT,
  from_name TEXT NOT NULL DEFAULT 'EatPal',
  from_email TEXT NOT NULL,
  reply_to TEXT,
  content_html TEXT NOT NULL,
  content_text TEXT,
  status TEXT DEFAULT 'draft', -- draft, scheduled, sending, sent, paused, cancelled
  list_ids UUID[] NOT NULL,
  segment_criteria JSONB, -- Optional filters for subscribers
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_recipients INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_opens INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_bounces INTEGER DEFAULT 0,
  total_complaints INTEGER DEFAULT 0,
  total_unsubscribes INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2) DEFAULT 0,
  click_rate DECIMAL(5,2) DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email events table (opens, clicks, bounces, etc)
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  subscriber_id UUID REFERENCES email_subscribers(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- sent, delivered, opened, clicked, bounced, complained, unsubscribed
  event_data JSONB DEFAULT '{}'::jsonb, -- Additional data like link clicked, user agent, etc
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  subject_template TEXT NOT NULL,
  content_html TEXT NOT NULL,
  content_text TEXT,
  variables JSONB DEFAULT '[]'::jsonb, -- List of template variables like {{first_name}}
  category TEXT DEFAULT 'general', -- general, promotional, transactional, newsletter
  is_default BOOLEAN DEFAULT FALSE,
  thumbnail_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create automation workflows table
CREATE TABLE IF NOT EXISTS email_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL, -- user_signup, subscription_created, trial_ending, etc
  trigger_config JSONB DEFAULT '{}'::jsonb,
  list_id UUID REFERENCES email_lists(id) ON DELETE SET NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  delay_hours INTEGER DEFAULT 0, -- How long after trigger to send
  is_active BOOLEAN DEFAULT TRUE,
  total_triggered INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_subscribers_email ON email_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_status ON email_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_list_subscribers_list ON list_subscribers(list_id);
CREATE INDEX IF NOT EXISTS idx_list_subscribers_subscriber ON list_subscribers(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_sent_at ON email_campaigns(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_subscriber ON email_events(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_automations_active ON email_automations(is_active);

-- Enable RLS
ALTER TABLE email_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_automations ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Admin only for management)

CREATE POLICY "Admins can manage email lists"
  ON email_lists FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage subscribers"
  ON email_subscribers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage list subscribers"
  ON list_subscribers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage campaigns"
  ON email_campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view events"
  ON email_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage templates"
  ON email_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage automations"
  ON email_automations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_email_lists_updated_at
  BEFORE UPDATE ON email_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_subscribers_updated_at
  BEFORE UPDATE ON email_subscribers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_campaigns_updated_at
  BEFORE UPDATE ON email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_automations_updated_at
  BEFORE UPDATE ON email_automations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to update list subscriber count
CREATE OR REPLACE FUNCTION update_list_subscriber_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE email_lists
    SET subscriber_count = subscriber_count + 1
    WHERE id = NEW.list_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE email_lists
    SET subscriber_count = subscriber_count - 1
    WHERE id = OLD.list_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER list_subscribers_count
  AFTER INSERT OR DELETE ON list_subscribers
  FOR EACH ROW
  EXECUTE FUNCTION update_list_subscriber_count();

-- Function to calculate campaign metrics
CREATE OR REPLACE FUNCTION update_campaign_metrics()
RETURNS TRIGGER AS $$
DECLARE
  campaign_record RECORD;
BEGIN
  -- Get campaign totals
  SELECT
    c.id,
    c.total_sent,
    COUNT(e.id) FILTER (WHERE e.event_type = 'opened') as opens,
    COUNT(e.id) FILTER (WHERE e.event_type = 'clicked') as clicks
  INTO campaign_record
  FROM email_campaigns c
  LEFT JOIN email_events e ON e.campaign_id = c.id
  WHERE c.id = NEW.campaign_id
  GROUP BY c.id, c.total_sent;

  -- Update campaign with calculated rates
  IF campaign_record.total_sent > 0 THEN
    UPDATE email_campaigns
    SET
      total_opens = campaign_record.opens,
      total_clicks = campaign_record.clicks,
      open_rate = (campaign_record.opens::DECIMAL / campaign_record.total_sent * 100),
      click_rate = (campaign_record.clicks::DECIMAL / campaign_record.total_sent * 100)
    WHERE id = NEW.campaign_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaign_metrics_trigger
  AFTER INSERT ON email_events
  FOR EACH ROW
  WHEN (NEW.event_type IN ('opened', 'clicked'))
  EXECUTE FUNCTION update_campaign_metrics();

-- Function to get email marketing stats
CREATE OR REPLACE FUNCTION get_email_marketing_stats()
RETURNS TABLE (
  total_subscribers INTEGER,
  active_subscribers INTEGER,
  total_campaigns INTEGER,
  sent_campaigns INTEGER,
  avg_open_rate DECIMAL,
  avg_click_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT es.id)::INTEGER as total_subscribers,
    COUNT(DISTINCT es.id) FILTER (WHERE es.status = 'active')::INTEGER as active_subscribers,
    COUNT(DISTINCT ec.id)::INTEGER as total_campaigns,
    COUNT(DISTINCT ec.id) FILTER (WHERE ec.status = 'sent')::INTEGER as sent_campaigns,
    COALESCE(AVG(ec.open_rate) FILTER (WHERE ec.status = 'sent'), 0)::DECIMAL as avg_open_rate,
    COALESCE(AVG(ec.click_rate) FILTER (WHERE ec.status = 'sent'), 0)::DECIMAL as avg_click_rate
  FROM email_subscribers es
  CROSS JOIN email_campaigns ec;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default email list
INSERT INTO email_lists (name, description)
VALUES
  ('General Subscribers', 'Main email list for all subscribers'),
  ('Trial Users', 'Users currently on trial'),
  ('Paid Subscribers', 'Active paying subscribers'),
  ('Newsletter', 'Users who opted in to newsletter')
ON CONFLICT DO NOTHING;

-- Insert default email templates
INSERT INTO email_templates (name, description, subject_template, content_html, content_text, category, variables)
VALUES
  (
    'Welcome Email',
    'Sent to new users after signup',
    'Welcome to EatPal, {{first_name}}!',
    '<html><body><h1>Welcome to EatPal!</h1><p>Hi {{first_name}},</p><p>We''re excited to have you join our community of parents making mealtime easier.</p></body></html>',
    'Welcome to EatPal! Hi {{first_name}}, We''re excited to have you join our community.',
    'transactional',
    '["first_name", "email"]'::jsonb
  ),
  (
    'Weekly Newsletter',
    'Weekly tips and recipes',
    '🍽️ This Week''s Meal Planning Tips',
    '<html><body><h1>This Week at EatPal</h1><p>Hi {{first_name}},</p><p>Here are this week''s top meal planning tips and recipes...</p></body></html>',
    'This Week at EatPal. Hi {{first_name}}, Here are this week''s top meal planning tips...',
    'newsletter',
    '["first_name"]'::jsonb
  ),
  (
    'Trial Ending Soon',
    'Reminder that trial is ending',
    'Your EatPal trial ends in {{days_remaining}} days',
    '<html><body><h1>Trial Ending Soon</h1><p>Hi {{first_name}},</p><p>Your free trial ends in {{days_remaining}} days. Upgrade now to continue enjoying all features!</p></body></html>',
    'Trial Ending Soon. Hi {{first_name}}, Your free trial ends in {{days_remaining}} days.',
    'promotional',
    '["first_name", "days_remaining"]'::jsonb
  )
ON CONFLICT DO NOTHING;
