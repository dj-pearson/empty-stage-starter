-- Push Notifications System
-- Enables meal reminders, grocery alerts, milestone celebrations, and partner activity notifications

-- User notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- Master toggles
  push_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,

  -- Notification types
  meal_reminders BOOLEAN DEFAULT true,
  grocery_reminders BOOLEAN DEFAULT true,
  prep_reminders BOOLEAN DEFAULT true,
  milestone_celebrations BOOLEAN DEFAULT true,
  partner_updates BOOLEAN DEFAULT true,
  weekly_summary BOOLEAN DEFAULT true,
  food_success_updates BOOLEAN DEFAULT true,
  template_suggestions BOOLEAN DEFAULT true,

  -- Timing preferences
  meal_reminder_time_minutes INTEGER DEFAULT 60, -- 1hr before meal
  grocery_reminder_day TEXT DEFAULT 'saturday', -- Weekly grocery reminder day
  grocery_reminder_time TIME DEFAULT '09:00:00', -- Morning reminder
  prep_reminder_time TIME DEFAULT '18:00:00', -- Evening prep reminder
  weekly_summary_day TEXT DEFAULT 'sunday',
  weekly_summary_time TIME DEFAULT '19:00:00',

  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT true,
  quiet_hours_start TIME DEFAULT '21:00:00',
  quiet_hours_end TIME DEFAULT '07:00:00',

  -- Frequency controls
  max_notifications_per_day INTEGER DEFAULT 10,
  digest_mode BOOLEAN DEFAULT false, -- Bundle notifications into digest

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_reminder_time CHECK (meal_reminder_time_minutes >= 0 AND meal_reminder_time_minutes <= 1440),
  CONSTRAINT valid_max_notifications CHECK (max_notifications_per_day >= 0 AND max_notifications_per_day <= 50)
);

-- Device push tokens (for Expo/FCM/APNs)
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Token details
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('expo', 'ios', 'android', 'web')),
  device_name TEXT,
  device_id TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ DEFAULT now(),
  failed_attempts INTEGER DEFAULT 0,
  last_error TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Notification queue (pending notifications)
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- Notification content
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb, -- Custom data payload
  icon TEXT,
  image_url TEXT,
  action_url TEXT, -- Deep link for click action

  -- Channel (determines delivery method)
  channel TEXT NOT NULL DEFAULT 'push' CHECK (channel IN ('push', 'email', 'sms', 'in_app')),

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled', 'throttled')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Grouping for digest mode
  digest_group TEXT, -- Group related notifications
  batch_id UUID, -- Link to batch send

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Notification history (for analytics and user viewing)
CREATE TABLE IF NOT EXISTS notification_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Notification details
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT NOT NULL,

  -- User interaction
  was_delivered BOOLEAN DEFAULT false,
  was_clicked BOOLEAN DEFAULT false,
  was_dismissed BOOLEAN DEFAULT false,

  -- Timestamps
  sent_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scheduled notification rules (recurring notifications)
CREATE TABLE IF NOT EXISTS notification_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Rule definition
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('meal_reminder', 'grocery_reminder', 'prep_reminder', 'weekly_summary')),
  is_active BOOLEAN DEFAULT true,

  -- Trigger conditions
  trigger_time_offset INTEGER, -- Minutes before event
  trigger_days TEXT[], -- Days of week: ['monday', 'wednesday', 'friday']
  trigger_time TIME,

  -- Notification template
  title_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  notification_data JSONB DEFAULT '{}'::jsonb,

  -- Targeting
  target_user_ids UUID[], -- Specific users, or NULL for all in household

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_household ON notification_preferences(household_id);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_push_tokens_platform ON push_tokens(platform);

CREATE INDEX IF NOT EXISTS idx_notification_queue_user ON notification_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled ON notification_queue(scheduled_for, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_type ON notification_queue(notification_type);

CREATE INDEX IF NOT EXISTS idx_notification_history_user ON notification_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_sent ON notification_history(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history(notification_type);

CREATE INDEX IF NOT EXISTS idx_notification_rules_household ON notification_rules(household_id);
CREATE INDEX IF NOT EXISTS idx_notification_rules_active ON notification_rules(is_active) WHERE is_active = true;

-- Row Level Security Policies
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;

-- Notification Preferences Policies
CREATE POLICY "Users can view own preferences"
  ON notification_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own preferences"
  ON notification_preferences FOR UPDATE
  USING (user_id = auth.uid());

-- Push Tokens Policies
CREATE POLICY "Users can view own tokens"
  ON push_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own tokens"
  ON push_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own tokens"
  ON push_tokens FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own tokens"
  ON push_tokens FOR DELETE
  USING (user_id = auth.uid());

-- Notification Queue Policies (users can view their notifications)
CREATE POLICY "Users can view own notifications"
  ON notification_queue FOR SELECT
  USING (user_id = auth.uid());

-- Notification History Policies
CREATE POLICY "Users can view own history"
  ON notification_history FOR SELECT
  USING (user_id = auth.uid());

-- Notification Rules Policies
CREATE POLICY "Users can view household rules"
  ON notification_rules FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create household rules"
  ON notification_rules FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update household rules"
  ON notification_rules FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own rules"
  ON notification_rules FOR DELETE
  USING (created_by = auth.uid());

-- Admins have full access
CREATE POLICY "Admins can manage all notifications"
  ON notification_queue FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_push_tokens_updated_at
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_notification_queue_updated_at
  BEFORE UPDATE ON notification_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_notification_rules_updated_at
  BEFORE UPDATE ON notification_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

-- Function to automatically create default preferences for new users
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_preferences (user_id, household_id)
  SELECT
    NEW.user_id,
    NEW.household_id
  FROM profiles
  WHERE user_id = NEW.user_id
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create preferences on profile creation
CREATE TRIGGER create_notification_preferences_on_profile
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_default_notification_preferences();

-- Function to check if notification should be sent (respects quiet hours)
CREATE OR REPLACE FUNCTION should_send_notification(
  p_user_id UUID,
  p_notification_type TEXT,
  p_scheduled_time TIMESTAMPTZ
)
RETURNS BOOLEAN AS $$
DECLARE
  prefs RECORD;
  scheduled_time_local TIME;
  notification_count INTEGER;
BEGIN
  -- Get user preferences
  SELECT * INTO prefs
  FROM notification_preferences
  WHERE user_id = p_user_id;

  -- If no preferences, allow (defaults to enabled)
  IF prefs IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Check if notification type is enabled
  CASE p_notification_type
    WHEN 'meal_reminder' THEN
      IF NOT prefs.meal_reminders THEN RETURN FALSE; END IF;
    WHEN 'grocery_reminder' THEN
      IF NOT prefs.grocery_reminders THEN RETURN FALSE; END IF;
    WHEN 'prep_reminder' THEN
      IF NOT prefs.prep_reminders THEN RETURN FALSE; END IF;
    WHEN 'milestone_celebration' THEN
      IF NOT prefs.milestone_celebrations THEN RETURN FALSE; END IF;
    WHEN 'partner_update' THEN
      IF NOT prefs.partner_updates THEN RETURN FALSE; END IF;
    WHEN 'weekly_summary' THEN
      IF NOT prefs.weekly_summary THEN RETURN FALSE; END IF;
    WHEN 'food_success' THEN
      IF NOT prefs.food_success_updates THEN RETURN FALSE; END IF;
    WHEN 'template_suggestion' THEN
      IF NOT prefs.template_suggestions THEN RETURN FALSE; END IF;
    ELSE
      RETURN TRUE; -- Unknown type, allow
  END CASE;

  -- Check quiet hours
  IF prefs.quiet_hours_enabled THEN
    scheduled_time_local := p_scheduled_time::TIME;
    IF scheduled_time_local >= prefs.quiet_hours_start
       OR scheduled_time_local <= prefs.quiet_hours_end THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Check max notifications per day
  IF prefs.max_notifications_per_day IS NOT NULL THEN
    SELECT COUNT(*) INTO notification_count
    FROM notification_history
    WHERE user_id = p_user_id
      AND sent_at >= CURRENT_DATE
      AND was_delivered = TRUE;

    IF notification_count >= prefs.max_notifications_per_day THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE notification_preferences IS 'User notification preferences and settings';
COMMENT ON TABLE push_tokens IS 'Device push notification tokens for Expo/FCM/APNs';
COMMENT ON TABLE notification_queue IS 'Pending and scheduled notifications';
COMMENT ON TABLE notification_history IS 'Historical log of sent notifications for analytics';
COMMENT ON TABLE notification_rules IS 'Automated recurring notification rules';
COMMENT ON FUNCTION should_send_notification IS 'Checks if notification should be sent based on user preferences';
