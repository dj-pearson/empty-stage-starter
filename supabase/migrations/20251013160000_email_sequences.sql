-- Email Sequences System
-- Allows creation of automated, multi-step email sequences triggered by events

-- Create email sequences table
CREATE TABLE IF NOT EXISTS email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL, -- 'lead_created', 'trial_start', 'trial_ending', 'subscription_active', 'subscription_canceled'
  trigger_conditions JSONB DEFAULT '{}'::jsonb, -- Optional: conditions like source='contact_form'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create email sequence steps table
CREATE TABLE IF NOT EXISTS email_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,
  delay_hours INTEGER NOT NULL DEFAULT 0,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  condition_rules JSONB DEFAULT '{}'::jsonb, -- Optional: send only if conditions met
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sequence_id, step_order)
);

-- Create user enrollment tracking table
CREATE TABLE IF NOT EXISTS user_email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  current_step INTEGER DEFAULT 0,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(user_id, sequence_id),
  CHECK (user_id IS NOT NULL OR lead_id IS NOT NULL)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_sequences_trigger ON email_sequences(trigger_event, is_active);
CREATE INDEX IF NOT EXISTS idx_email_sequence_steps_sequence ON email_sequence_steps(sequence_id, step_order);
CREATE INDEX IF NOT EXISTS idx_user_email_sequences_user ON user_email_sequences(user_id, sequence_id);
CREATE INDEX IF NOT EXISTS idx_user_email_sequences_lead ON user_email_sequences(lead_id, sequence_id);
CREATE INDEX IF NOT EXISTS idx_user_email_sequences_enrolled ON user_email_sequences(enrolled_at) WHERE completed_at IS NULL AND canceled_at IS NULL;

-- Enable RLS
ALTER TABLE email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_email_sequences ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Admin only)
CREATE POLICY "Admins can manage email sequences"
  ON email_sequences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage sequence steps"
  ON email_sequence_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view enrollments"
  ON user_email_sequences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Function to enroll user/lead in a sequence
CREATE OR REPLACE FUNCTION enroll_in_email_sequence(
  p_user_id UUID DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL,
  p_sequence_id UUID DEFAULT NULL,
  p_trigger_event TEXT DEFAULT NULL,
  p_trigger_conditions JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_sequence_id UUID;
  v_enrollment_id UUID;
  v_existing_enrollment UUID;
BEGIN
  -- Find sequence by ID or by trigger event
  IF p_sequence_id IS NOT NULL THEN
    v_sequence_id := p_sequence_id;
  ELSIF p_trigger_event IS NOT NULL THEN
    SELECT id INTO v_sequence_id
    FROM email_sequences
    WHERE trigger_event = p_trigger_event
      AND is_active = TRUE
      AND (
        trigger_conditions = '{}'::jsonb
        OR trigger_conditions @> p_trigger_conditions
      )
    LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Must provide either sequence_id or trigger_event';
  END IF;

  IF v_sequence_id IS NULL THEN
    RAISE NOTICE 'No matching sequence found for trigger: %', p_trigger_event;
    RETURN NULL;
  END IF;

  -- Check if already enrolled
  SELECT id INTO v_existing_enrollment
  FROM user_email_sequences
  WHERE (
    (p_user_id IS NOT NULL AND user_id = p_user_id) OR
    (p_lead_id IS NOT NULL AND lead_id = p_lead_id)
  )
  AND sequence_id = v_sequence_id
  AND canceled_at IS NULL;

  IF v_existing_enrollment IS NOT NULL THEN
    RAISE NOTICE 'Already enrolled in sequence: %', v_sequence_id;
    RETURN v_existing_enrollment;
  END IF;

  -- Create enrollment
  INSERT INTO user_email_sequences (user_id, lead_id, sequence_id, current_step, enrolled_at)
  VALUES (p_user_id, p_lead_id, v_sequence_id, 0, NOW())
  RETURNING id INTO v_enrollment_id;

  -- Schedule first email immediately
  PERFORM schedule_next_sequence_email(v_enrollment_id);

  RETURN v_enrollment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to schedule next email in sequence
CREATE OR REPLACE FUNCTION schedule_next_sequence_email(p_enrollment_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_enrollment RECORD;
  v_step RECORD;
  v_next_step_order INTEGER;
  v_send_at TIMESTAMPTZ;
  v_email_address TEXT;
  v_user_name TEXT;
  v_final_subject TEXT;
  v_final_html TEXT;
  v_final_text TEXT;
BEGIN
  -- Get enrollment details
  SELECT * INTO v_enrollment
  FROM user_email_sequences
  WHERE id = p_enrollment_id
    AND completed_at IS NULL
    AND canceled_at IS NULL;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Get next step
  v_next_step_order := v_enrollment.current_step + 1;

  SELECT * INTO v_step
  FROM email_sequence_steps
  WHERE sequence_id = v_enrollment.sequence_id
    AND step_order = v_next_step_order;

  IF NOT FOUND THEN
    -- No more steps, mark sequence as completed
    UPDATE user_email_sequences
    SET completed_at = NOW()
    WHERE id = p_enrollment_id;
    RETURN TRUE;
  END IF;

  -- Calculate send time
  v_send_at := v_enrollment.enrolled_at +
               (v_step.delay_days || ' days')::INTERVAL +
               (v_step.delay_hours || ' hours')::INTERVAL;

  -- Get recipient email and name
  IF v_enrollment.user_id IS NOT NULL THEN
    SELECT email INTO v_email_address
    FROM auth.users
    WHERE id = v_enrollment.user_id;

    SELECT full_name INTO v_user_name
    FROM profiles
    WHERE id = v_enrollment.user_id;
  ELSIF v_enrollment.lead_id IS NOT NULL THEN
    SELECT email, full_name INTO v_email_address, v_user_name
    FROM leads
    WHERE id = v_enrollment.lead_id;
  END IF;

  IF v_email_address IS NULL THEN
    RAISE EXCEPTION 'No email address found for enrollment: %', p_enrollment_id;
  END IF;

  -- Replace template variables
  v_final_subject := replace_email_variables(v_step.subject, v_user_name, v_enrollment.metadata);
  v_final_html := replace_email_variables(v_step.html_body, v_user_name, v_enrollment.metadata);
  v_final_text := replace_email_variables(v_step.text_body, v_user_name, v_enrollment.metadata);

  -- Queue email
  INSERT INTO email_queue (
    to_email,
    subject,
    html_body,
    text_body,
    scheduled_for,
    status,
    priority,
    metadata
  ) VALUES (
    v_email_address,
    v_final_subject,
    v_final_html,
    v_final_text,
    v_send_at,
    'pending',
    5,
    jsonb_build_object(
      'enrollment_id', p_enrollment_id,
      'sequence_id', v_enrollment.sequence_id,
      'step_order', v_next_step_order
    )
  );

  -- Update current step
  UPDATE user_email_sequences
  SET current_step = v_next_step_order
  WHERE id = p_enrollment_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to replace template variables
CREATE OR REPLACE FUNCTION replace_email_variables(
  p_text TEXT,
  p_user_name TEXT,
  p_metadata JSONB
)
RETURNS TEXT AS $$
DECLARE
  v_result TEXT;
  v_first_name TEXT;
BEGIN
  v_result := p_text;

  -- Extract first name
  IF p_user_name IS NOT NULL THEN
    v_first_name := split_part(p_user_name, ' ', 1);
  ELSE
    v_first_name := 'there';
  END IF;

  -- Replace common variables
  v_result := replace(v_result, '{{first_name}}', v_first_name);
  v_result := replace(v_result, '{{full_name}}', COALESCE(p_user_name, 'there'));

  -- Replace metadata variables if present
  IF p_metadata IS NOT NULL THEN
    -- This is simplified - in production you'd iterate through metadata keys
    v_result := regexp_replace(v_result, '\{\{([^}]+)\}\}', COALESCE(p_metadata->>'\1', ''), 'g');
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function to auto-enroll on events
CREATE OR REPLACE FUNCTION trigger_email_sequences()
RETURNS TRIGGER AS $$
DECLARE
  v_trigger_event TEXT;
  v_user_id UUID;
  v_lead_id UUID;
BEGIN
  -- Determine trigger event based on table and operation
  IF TG_TABLE_NAME = 'leads' AND TG_OP = 'INSERT' THEN
    v_trigger_event := 'lead_created';
    v_lead_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'user_subscriptions' AND TG_OP = 'INSERT' AND NEW.status = 'trialing' THEN
    v_trigger_event := 'trial_start';
    v_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'user_subscriptions' AND TG_OP = 'UPDATE' AND OLD.status = 'trialing' AND NEW.status = 'active' THEN
    v_trigger_event := 'subscription_active';
    v_user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'user_subscriptions' AND TG_OP = 'UPDATE' AND OLD.status != 'canceled' AND NEW.status = 'canceled' THEN
    v_trigger_event := 'subscription_canceled';
    v_user_id := NEW.user_id;
  ELSE
    RETURN NEW;
  END IF;

  -- Enroll in sequence
  PERFORM enroll_in_email_sequence(
    p_user_id := v_user_id,
    p_lead_id := v_lead_id,
    p_trigger_event := v_trigger_event
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_email_sequences_on_lead ON leads;
CREATE TRIGGER trigger_email_sequences_on_lead
  AFTER INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION trigger_email_sequences();

DROP TRIGGER IF EXISTS trigger_email_sequences_on_subscription ON user_subscriptions;
CREATE TRIGGER trigger_email_sequences_on_subscription
  AFTER INSERT OR UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_email_sequences();

-- Insert default email sequences
INSERT INTO email_sequences (name, description, trigger_event, trigger_conditions, is_active)
VALUES
  (
    'Contact Form Welcome',
    'Welcome email sequence for contact form submissions',
    'lead_created',
    '{"source": "contact_form"}'::jsonb,
    TRUE
  ),
  (
    'Newsletter Welcome',
    'Welcome email sequence for newsletter subscribers',
    'lead_created',
    '{"source": "newsletter"}'::jsonb,
    TRUE
  ),
  (
    'Trial Onboarding',
    'Onboarding email sequence for trial users',
    'trial_start',
    '{}'::jsonb,
    TRUE
  ),
  (
    'New Customer Welcome',
    'Welcome sequence for new paying customers',
    'subscription_active',
    '{}'::jsonb,
    TRUE
  ),
  (
    'Win-back Campaign',
    'Win-back sequence for canceled subscriptions',
    'subscription_canceled',
    '{}'::jsonb,
    TRUE
  )
ON CONFLICT DO NOTHING;

-- Insert email sequence steps for Contact Form Welcome
DO $$
DECLARE
  v_sequence_id UUID;
BEGIN
  SELECT id INTO v_sequence_id FROM email_sequences WHERE name = 'Contact Form Welcome';

  IF v_sequence_id IS NOT NULL THEN
    INSERT INTO email_sequence_steps (sequence_id, step_order, delay_days, delay_hours, subject, html_body, text_body)
    VALUES
      (
        v_sequence_id, 1, 0, 0,
        'Thanks for reaching out, {{first_name}}!',
        '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #10b981;">Thanks for contacting EatPal!</h2><p>Hi {{first_name}},</p><p>We received your message and our team will get back to you within 24-48 hours.</p><p>In the meantime, did you know you can start using EatPal right away with a free trial?</p><div style="text-align: center; margin: 30px 0;"><a href="https://tryeatpal.com/auth" style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Start Free Trial</a></div><p>Best regards,<br>The EatPal Team</p></div>',
        'Hi {{first_name}},\n\nWe received your message and will get back to you within 24-48 hours.\n\nStart your free trial: https://tryeatpal.com/auth\n\nBest regards,\nThe EatPal Team'
      ),
      (
        v_sequence_id, 2, 1, 0,
        'Here''s how EatPal helps families like yours',
        '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #10b981;">Making mealtime easier for picky eaters</h2><p>Hi {{first_name}},</p><p>While you wait to hear back from us, here''s how EatPal helps families with picky eaters:</p><ul style="line-height: 1.8;"><li><strong>Personalized meal planning</strong> based on your child''s preferences</li><li><strong>Food tracking</strong> to monitor progress and patterns</li><li><strong>Evidence-based strategies</strong> like food chaining</li><li><strong>Progress monitoring</strong> with visual charts</li></ul><p>Over 1,000 families are already using EatPal to reduce mealtime stress.</p><div style="text-align: center; margin: 30px 0;"><a href="https://tryeatpal.com/auth" style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Try It Free</a></div><p>Questions? Just reply to this email.</p><p>Best regards,<br>The EatPal Team</p></div>',
        'Hi {{first_name}},\n\nHere''s how EatPal helps families:\n- Personalized meal planning\n- Food tracking\n- Evidence-based strategies\n- Progress monitoring\n\nTry it free: https://tryeatpal.com/auth\n\nBest regards,\nThe EatPal Team'
      ),
      (
        v_sequence_id, 3, 3, 0,
        'Ready to try EatPal, {{first_name}}?',
        '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h2 style="color: #10b981;">Start your free trial today</h2><p>Hi {{first_name}},</p><p>We wanted to follow up on your inquiry about EatPal.</p><p>Starting is easy:<br>1. Create your free account<br>2. Add your child''s profile<br>3. Start tracking meals</p><p>No credit card required for your free trial!</p><div style="text-align: center; margin: 30px 0;"><a href="https://tryeatpal.com/auth" style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Get Started Free</a></div><p>Questions? We''re here to help.</p><p>Best regards,<br>The EatPal Team</p></div>',
        'Hi {{first_name}},\n\nReady to try EatPal?\n\n1. Create account\n2. Add child profile\n3. Start tracking\n\nNo credit card required!\n\nhttps://tryeatpal.com/auth\n\nBest regards,\nThe EatPal Team'
      );
  END IF;
END $$;

COMMENT ON TABLE email_sequences IS 'Automated email sequences triggered by events';
COMMENT ON TABLE email_sequence_steps IS 'Individual steps/emails in a sequence';
COMMENT ON TABLE user_email_sequences IS 'Tracks user enrollment in email sequences';
