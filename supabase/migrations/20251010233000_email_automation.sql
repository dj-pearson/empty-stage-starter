-- ============================================================================
-- EMAIL AUTOMATION SYSTEM
-- ============================================================================
-- Automated email campaigns, transactional emails, and notifications
-- Note: Using "automation_" prefix to avoid conflicts with existing email marketing tables

-- ============================================================================
-- EMAIL TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT UNIQUE NOT NULL,
  template_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  category TEXT NOT NULL, -- 'transactional', 'marketing', 'notification'
  variables JSONB, -- List of available template variables
  is_active BOOLEAN DEFAULT true,
  send_delay_minutes INTEGER DEFAULT 0, -- Delay before sending (for drip campaigns)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_automation_email_templates_key ON automation_email_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_automation_email_templates_category ON automation_email_templates(category, is_active);

-- Enable RLS
ALTER TABLE automation_email_templates ENABLE ROW LEVEL SECURITY;

-- Anyone can read active templates
CREATE POLICY "Anyone can read active templates"
  ON automation_email_templates FOR SELECT
  USING (is_active = true);

-- Only admins can manage templates
CREATE POLICY "Admins can manage templates"
  ON automation_email_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- ============================================================================
-- EMAIL QUEUE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL REFERENCES automation_email_templates(template_key),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  template_variables JSONB,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'cancelled'
  priority INTEGER DEFAULT 5, -- 1-10, higher = more important
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_automation_email_queue_user ON automation_email_queue(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_email_queue_status ON automation_email_queue(status, scheduled_for, priority DESC);
CREATE INDEX IF NOT EXISTS idx_automation_email_queue_pending ON automation_email_queue(scheduled_for, priority DESC) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE automation_email_queue ENABLE ROW LEVEL SECURITY;

-- Users can view their own emails
CREATE POLICY "Users can view their own email queue"
  ON automation_email_queue FOR SELECT
  USING (auth.uid() = user_id);

-- System can manage emails
CREATE POLICY "System can manage email queue"
  ON automation_email_queue FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- EMAIL SUBSCRIPTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_email_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  welcome_emails BOOLEAN DEFAULT true,
  milestone_emails BOOLEAN DEFAULT true,
  weekly_summary BOOLEAN DEFAULT true,
  tips_and_advice BOOLEAN DEFAULT true,
  marketing_emails BOOLEAN DEFAULT false,
  unsubscribe_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_automation_email_subscriptions_user ON automation_email_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_email_subscriptions_token ON automation_email_subscriptions(unsubscribe_token);

-- Enable RLS
ALTER TABLE automation_email_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can manage their own subscriptions
CREATE POLICY "Users can manage their own email subscriptions"
  ON automation_email_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- EMAIL EVENTS TABLE (for tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES automation_email_queue(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_automation_email_events_email ON automation_email_events(email_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_email_events_type ON automation_email_events(event_type, created_at DESC);

-- Enable RLS
ALTER TABLE automation_email_events ENABLE ROW LEVEL SECURITY;

-- System manages events
CREATE POLICY "System can manage email events"
  ON automation_email_events FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- QUEUE EMAIL FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION queue_email(
  p_user_id UUID,
  p_template_key TEXT,
  p_to_email TEXT,
  p_template_variables JSONB DEFAULT '{}'::jsonb,
  p_priority INTEGER DEFAULT 5,
  p_delay_minutes INTEGER DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
  v_template RECORD;
  v_subject TEXT;
  v_html_body TEXT;
  v_text_body TEXT;
  v_email_id UUID;
  v_key TEXT;
  v_value TEXT;
BEGIN
  -- Get template
  SELECT * INTO v_template
  FROM automation_email_templates
  WHERE template_key = p_template_key
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email template not found: %', p_template_key;
  END IF;

  -- Replace variables in subject
  v_subject := v_template.subject;
  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_template_variables)
  LOOP
    v_subject := REPLACE(v_subject, '{{' || v_key || '}}', v_value);
  END LOOP;

  -- Replace variables in HTML body
  v_html_body := v_template.html_body;
  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_template_variables)
  LOOP
    v_html_body := REPLACE(v_html_body, '{{' || v_key || '}}', v_value);
  END LOOP;

  -- Replace variables in text body
  v_text_body := v_template.text_body;
  IF v_text_body IS NOT NULL THEN
    FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_template_variables)
    LOOP
      v_text_body := REPLACE(v_text_body, '{{' || v_key || '}}', v_value);
    END LOOP;
  END IF;

  -- Insert into queue
  INSERT INTO automation_email_queue (
    user_id,
    template_key,
    to_email,
    subject,
    html_body,
    text_body,
    template_variables,
    priority,
    scheduled_for
  ) VALUES (
    p_user_id,
    p_template_key,
    p_to_email,
    v_subject,
    v_html_body,
    v_text_body,
    p_template_variables,
    p_priority,
    NOW() + (COALESCE(p_delay_minutes, v_template.send_delay_minutes, 0) || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_email_id;

  RETURN v_email_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- CHECK EMAIL SUBSCRIPTION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION check_email_subscription(
  p_user_id UUID,
  p_email_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_subscribed BOOLEAN;
BEGIN
  SELECT CASE p_email_type
    WHEN 'welcome' THEN welcome_emails
    WHEN 'milestone' THEN milestone_emails
    WHEN 'weekly_summary' THEN weekly_summary
    WHEN 'tips' THEN tips_and_advice
    WHEN 'marketing' THEN marketing_emails
    ELSE false
  END INTO v_subscribed
  FROM automation_email_subscriptions
  WHERE user_id = p_user_id;

  RETURN COALESCE(v_subscribed, true); -- Default to true if no preferences set
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGER: SEND WELCOME EMAIL ON SIGNUP
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_welcome_email()
RETURNS TRIGGER AS $$
DECLARE
  v_user_email TEXT;
BEGIN
  -- Get user email
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = NEW.id;

  -- Initialize email subscriptions
  INSERT INTO automation_email_subscriptions (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Queue welcome email
  IF check_email_subscription(NEW.id, 'welcome') THEN
    PERFORM queue_email(
      NEW.id,
      'welcome',
      v_user_email,
      jsonb_build_object(
        'user_name', COALESCE(NEW.full_name, 'there'),
        'app_url', 'https://eatpal.com'
      ),
      10 -- High priority
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_profile_created_send_welcome
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_welcome_email();

-- ============================================================================
-- TRIGGER: SEND MILESTONE EMAILS
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_milestone_email()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_kid_name TEXT;
BEGIN
  -- Get user info
  SELECT k.user_id, k.name INTO v_user_id, v_kid_name
  FROM kids k
  WHERE k.id = NEW.kid_id;

  SELECT u.email INTO v_user_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  -- Queue milestone email
  IF check_email_subscription(v_user_id, 'milestone') THEN
    PERFORM queue_email(
      v_user_id,
      'milestone_achieved',
      v_user_email,
      jsonb_build_object(
        'kid_name', v_kid_name,
        'achievement_title', NEW.title,
        'achievement_description', NEW.description,
        'app_url', 'https://eatpal.com'
      ),
      8 -- High priority
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_achievement_earned_send_email
  AFTER INSERT ON kid_achievements
  FOR EACH ROW
  EXECUTE FUNCTION trigger_milestone_email();

-- ============================================================================
-- WEEKLY SUMMARY SCHEDULING
-- ============================================================================

CREATE OR REPLACE FUNCTION schedule_weekly_summaries()
RETURNS INTEGER AS $$
DECLARE
  v_user RECORD;
  v_user_email TEXT;
  v_scheduled_count INTEGER := 0;
BEGIN
  -- For each user subscribed to weekly summaries
  FOR v_user IN
    SELECT es.user_id
    FROM automation_email_subscriptions es
    WHERE es.weekly_summary = true
      AND es.unsubscribed_at IS NULL
  LOOP
    -- Get user email
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = v_user.user_id;

    -- Check if already queued for this week
    IF NOT EXISTS (
      SELECT 1 FROM automation_email_queue
      WHERE user_id = v_user.user_id
        AND template_key = 'weekly_summary'
        AND scheduled_for >= DATE_TRUNC('week', NOW())
        AND status = 'pending'
    ) THEN
      -- Queue weekly summary
      PERFORM queue_email(
        v_user.user_id,
        'weekly_summary',
        v_user_email,
        jsonb_build_object('app_url', 'https://eatpal.com'),
        5 -- Normal priority
      );

      v_scheduled_count := v_scheduled_count + 1;
    END IF;
  END LOOP;

  RETURN v_scheduled_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- EMAIL STATISTICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW automation_email_statistics AS
SELECT
  eq.template_key,
  et.template_name,
  et.category,
  COUNT(*) as total_sent,
  COUNT(*) FILTER (WHERE eq.status = 'sent') as successful,
  COUNT(*) FILTER (WHERE eq.status = 'failed') as failed,
  COUNT(*) FILTER (WHERE eq.status = 'pending') as pending,
  COUNT(DISTINCT ee.email_id) FILTER (WHERE ee.event_type = 'opened') as opened_count,
  COUNT(DISTINCT ee.email_id) FILTER (WHERE ee.event_type = 'clicked') as clicked_count,
  ROUND(
    COUNT(DISTINCT ee.email_id) FILTER (WHERE ee.event_type = 'opened')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE eq.status = 'sent'), 0) * 100,
    2
  ) as open_rate,
  ROUND(
    COUNT(DISTINCT ee.email_id) FILTER (WHERE ee.event_type = 'clicked')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE eq.status = 'sent'), 0) * 100,
    2
  ) as click_rate
FROM automation_email_queue eq
JOIN automation_email_templates et ON et.template_key = eq.template_key
LEFT JOIN automation_email_events ee ON ee.email_id = eq.id
GROUP BY eq.template_key, et.template_name, et.category;

-- ============================================================================
-- DEFAULT EMAIL TEMPLATES
-- ============================================================================

INSERT INTO automation_email_templates (template_key, template_name, subject, html_body, text_body, category, variables) VALUES

-- Welcome Email
('welcome', 'Welcome Email', 'Welcome to EatPal! 🎉',
'<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
  <h1 style="color: white; margin: 0;">Welcome to EatPal!</h1>
</div>
<div style="padding: 40px 20px;">
  <p>Hi {{user_name}},</p>
  <p>We''re thrilled to have you join our community of parents helping their kids explore new foods!</p>

  <h3>Getting Started:</h3>
  <ul>
    <li><strong>Add Your Child:</strong> Create a profile with their food preferences and goals</li>
    <li><strong>Build Your Pantry:</strong> Add safe foods and try-bites</li>
    <li><strong>Create Meal Plans:</strong> Use our AI-powered planner for balanced meals</li>
    <li><strong>Track Progress:</strong> Log food attempts and celebrate milestones</li>
  </ul>

  <div style="text-align: center; margin: 30px 0;">
    <a href="{{app_url}}" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Get Started</a>
  </div>

  <p>Need help? Reply to this email anytime!</p>
  <p>Happy feeding,<br>The EatPal Team</p>
</div>
</body></html>',
'Welcome to EatPal!

Hi {{user_name}},

We''re thrilled to have you join our community of parents helping their kids explore new foods!

Getting Started:
- Add Your Child: Create a profile with their food preferences
- Build Your Pantry: Add safe foods and try-bites
- Create Meal Plans: Use our AI-powered planner
- Track Progress: Log food attempts and celebrate milestones

Visit {{app_url}} to get started!

Happy feeding,
The EatPal Team',
'transactional',
'["user_name", "app_url"]'::jsonb),

-- Milestone Achievement
('milestone_achieved', 'Milestone Achievement', '🎉 {{kid_name}} earned a new achievement!',
'<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<div style="background: #10b981; padding: 40px 20px; text-align: center;">
  <h1 style="color: white; margin: 0;">🎉 New Achievement Unlocked!</h1>
</div>
<div style="padding: 40px 20px;">
  <h2 style="color: #10b981;">{{achievement_title}}</h2>
  <p style="font-size: 18px;">{{achievement_description}}</p>

  <p>Way to go! Every small step is a big victory in your feeding journey.</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="{{app_url}}/analytics" style="background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View All Achievements</a>
  </div>

  <p>Keep up the amazing work!</p>
  <p>The EatPal Team</p>
</div>
</body></html>',
'🎉 {{kid_name}} earned a new achievement!

{{achievement_title}}
{{achievement_description}}

Way to go! Every small step is a big victory.

View all achievements: {{app_url}}/analytics

Keep up the amazing work!
The EatPal Team',
'notification',
'["kid_name", "achievement_title", "achievement_description", "app_url"]'::jsonb),

-- Weekly Summary
('weekly_summary', 'Weekly Summary', 'Your Weekly EatPal Summary',
'<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
<div style="background: #667eea; padding: 40px 20px; text-align: center;">
  <h1 style="color: white; margin: 0;">Your Week at a Glance</h1>
</div>
<div style="padding: 40px 20px;">
  <p>This week''s highlights will be populated with your child''s progress data.</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="{{app_url}}/analytics" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Detailed Analytics</a>
  </div>

  <p>The EatPal Team</p>
</div>
</body></html>',
'Your Weekly EatPal Summary

View your detailed analytics: {{app_url}}/analytics

The EatPal Team',
'notification',
'["app_url"]'::jsonb)

ON CONFLICT (template_key) DO NOTHING;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_automation_email_templates_updated_at
  BEFORE UPDATE ON automation_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_automation_email_queue_updated_at
  BEFORE UPDATE ON automation_email_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_automation_email_subscriptions_updated_at
  BEFORE UPDATE ON automation_email_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE automation_email_templates IS 'Email templates with variable substitution';
COMMENT ON TABLE automation_email_queue IS 'Queue for outgoing emails with retry logic';
COMMENT ON TABLE automation_email_subscriptions IS 'User email preferences and unsubscribe tokens';
COMMENT ON TABLE automation_email_events IS 'Email delivery and engagement tracking';
COMMENT ON FUNCTION queue_email IS 'Queue an email with template variable substitution';
COMMENT ON FUNCTION check_email_subscription IS 'Check if user is subscribed to email type';
COMMENT ON FUNCTION schedule_weekly_summaries IS 'Schedule weekly summary emails for subscribed users';
COMMENT ON VIEW automation_email_statistics IS 'Email campaign performance metrics';
