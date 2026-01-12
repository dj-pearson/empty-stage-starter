-- =================================================================
-- User Accessibility Preferences Table
-- Stores user-configurable accessibility settings for ADA compliance
-- =================================================================

-- Create the user accessibility preferences table
CREATE TABLE IF NOT EXISTS public.user_accessibility_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{
    "reducedMotion": false,
    "highContrast": false,
    "largeText": false,
    "fontSize": "default",
    "screenReaderMode": false,
    "announcePageChanges": true,
    "verboseDescriptions": false,
    "enhancedFocus": false,
    "keyboardShortcuts": true,
    "extendedTimeouts": false,
    "disableAutoplay": true,
    "simplifiedUI": false,
    "dyslexiaFont": false
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_accessibility_preferences_user_unique UNIQUE (user_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_accessibility_preferences_user_id
  ON public.user_accessibility_preferences(user_id);

-- Enable Row Level Security
ALTER TABLE public.user_accessibility_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own accessibility preferences
CREATE POLICY "Users can view own accessibility preferences"
  ON public.user_accessibility_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own accessibility preferences
CREATE POLICY "Users can insert own accessibility preferences"
  ON public.user_accessibility_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own accessibility preferences
CREATE POLICY "Users can update own accessibility preferences"
  ON public.user_accessibility_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own accessibility preferences
CREATE POLICY "Users can delete own accessibility preferences"
  ON public.user_accessibility_preferences
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_accessibility_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_accessibility_preferences_updated_at
  BEFORE UPDATE ON public.user_accessibility_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_accessibility_preferences_updated_at();

-- =================================================================
-- Accessibility Feedback Table
-- For users to report accessibility issues and request accommodations
-- =================================================================

CREATE TABLE IF NOT EXISTS public.accessibility_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('issue', 'accommodation_request', 'suggestion', 'question')),
  page_url TEXT,
  description TEXT NOT NULL,
  assistive_technology TEXT,
  browser TEXT,
  operating_system TEXT,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for accessibility feedback
CREATE INDEX IF NOT EXISTS idx_accessibility_feedback_user_id
  ON public.accessibility_feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_accessibility_feedback_status
  ON public.accessibility_feedback(status);

CREATE INDEX IF NOT EXISTS idx_accessibility_feedback_type
  ON public.accessibility_feedback(feedback_type);

CREATE INDEX IF NOT EXISTS idx_accessibility_feedback_created_at
  ON public.accessibility_feedback(created_at DESC);

-- Enable RLS for accessibility feedback
ALTER TABLE public.accessibility_feedback ENABLE ROW LEVEL SECURITY;

-- Users can view their own feedback submissions
CREATE POLICY "Users can view own accessibility feedback"
  ON public.accessibility_feedback
  FOR SELECT
  USING (auth.uid() = user_id);

-- Anyone can submit accessibility feedback (even anonymous)
CREATE POLICY "Anyone can submit accessibility feedback"
  ON public.accessibility_feedback
  FOR INSERT
  WITH CHECK (true);

-- Users can update their own feedback if still open
CREATE POLICY "Users can update own open accessibility feedback"
  ON public.accessibility_feedback
  FOR UPDATE
  USING (auth.uid() = user_id AND status = 'open');

-- Admins can view all accessibility feedback
CREATE POLICY "Admins can view all accessibility feedback"
  ON public.accessibility_feedback
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'support')
    )
  );

-- Admins can update any accessibility feedback
CREATE POLICY "Admins can update accessibility feedback"
  ON public.accessibility_feedback
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'support')
    )
  );

-- Create trigger for accessibility_feedback updated_at
CREATE TRIGGER trigger_update_accessibility_feedback_updated_at
  BEFORE UPDATE ON public.accessibility_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_accessibility_preferences_updated_at();

-- =================================================================
-- Accessibility Audit Log
-- Track accessibility-related changes and compliance efforts
-- =================================================================

CREATE TABLE IF NOT EXISTS public.accessibility_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'wcag_test_run',
    'issue_identified',
    'issue_fixed',
    'preference_updated',
    'accommodation_provided',
    'feedback_received',
    'training_completed'
  )),
  component_name TEXT,
  wcag_criterion TEXT,
  details JSONB,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for audit log
CREATE INDEX IF NOT EXISTS idx_accessibility_audit_log_action_type
  ON public.accessibility_audit_log(action_type);

CREATE INDEX IF NOT EXISTS idx_accessibility_audit_log_created_at
  ON public.accessibility_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accessibility_audit_log_wcag_criterion
  ON public.accessibility_audit_log(wcag_criterion);

-- Enable RLS for audit log
ALTER TABLE public.accessibility_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit log
CREATE POLICY "Admins can view accessibility audit log"
  ON public.accessibility_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- System can insert audit log entries
CREATE POLICY "System can insert accessibility audit log"
  ON public.accessibility_audit_log
  FOR INSERT
  WITH CHECK (true);

-- =================================================================
-- Grant permissions to authenticated users
-- =================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_accessibility_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.accessibility_feedback TO authenticated;
GRANT SELECT ON public.accessibility_audit_log TO authenticated;

-- =================================================================
-- Comments for documentation
-- =================================================================

COMMENT ON TABLE public.user_accessibility_preferences IS
  'Stores user accessibility preferences for ADA/WCAG compliance. Each user can customize their accessibility settings.';

COMMENT ON TABLE public.accessibility_feedback IS
  'Stores accessibility issue reports, accommodation requests, and suggestions from users.';

COMMENT ON TABLE public.accessibility_audit_log IS
  'Audit log for tracking accessibility-related changes and compliance efforts.';

COMMENT ON COLUMN public.user_accessibility_preferences.preferences IS
  'JSON object containing all accessibility preferences: reducedMotion, highContrast, largeText, fontSize, screenReaderMode, announcePageChanges, verboseDescriptions, enhancedFocus, keyboardShortcuts, extendedTimeouts, disableAutoplay, simplifiedUI, dyslexiaFont';
