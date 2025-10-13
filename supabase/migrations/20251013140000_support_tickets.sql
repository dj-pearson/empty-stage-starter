-- =====================================================
-- SUPPORT TICKET SYSTEM
-- =====================================================
-- Purpose: Full-featured ticketing for user support
-- Features: User portal, admin management, AI triage

-- =====================================================
-- 1. SUPPORT TICKETS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT CHECK (status IN ('new', 'in_progress', 'waiting_user', 'resolved', 'closed')) DEFAULT 'new',
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  category TEXT CHECK (category IN ('bug', 'feature_request', 'question', 'billing', 'other')) DEFAULT 'other',
  assigned_to UUID REFERENCES profiles(id),
  context JSONB DEFAULT '{}', -- Page URL, user state, browser info, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON support_tickets(created_at DESC);

-- Enable RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Policies (drop existing ones first to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own tickets" ON support_tickets;
DROP POLICY IF EXISTS "Users can create own tickets" ON support_tickets;
DROP POLICY IF EXISTS "Admins can view all tickets" ON support_tickets;
DROP POLICY IF EXISTS "Admins can update all tickets" ON support_tickets;

CREATE POLICY "Users can view own tickets"
  ON support_tickets
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own tickets"
  ON support_tickets
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all tickets"
  ON support_tickets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update all tickets"
  ON support_tickets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 2. TICKET MESSAGES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE, -- Internal admin notes
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_author ON ticket_messages(author_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created ON ticket_messages(created_at DESC);

-- Enable RLS
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

-- Policies (drop existing ones first to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own ticket messages" ON ticket_messages;
DROP POLICY IF EXISTS "Users can create messages on own tickets" ON ticket_messages;
DROP POLICY IF EXISTS "Admins can view all messages" ON ticket_messages;
DROP POLICY IF EXISTS "Admins can create messages" ON ticket_messages;

CREATE POLICY "Users can view own ticket messages"
  ON ticket_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = ticket_messages.ticket_id
      AND support_tickets.user_id = auth.uid()
    )
    AND is_internal = FALSE
  );

CREATE POLICY "Users can create messages on own tickets"
  ON ticket_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE support_tickets.id = ticket_messages.ticket_id
      AND support_tickets.user_id = auth.uid()
    )
    AND is_internal = FALSE
  );

CREATE POLICY "Admins can view all messages"
  ON ticket_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can create messages"
  ON ticket_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 3. CANNED RESPONSES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS ticket_canned_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ticket_canned_responses ENABLE ROW LEVEL SECURITY;

-- Policy: Admins only (drop existing first)
DROP POLICY IF EXISTS "Admins can manage canned responses" ON ticket_canned_responses;

CREATE POLICY "Admins can manage canned responses"
  ON ticket_canned_responses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- =====================================================
-- 4. HELPER FUNCTIONS
-- =====================================================

-- Function to auto-update ticket timestamp
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_ticket_timestamp ON support_tickets;

CREATE TRIGGER set_ticket_timestamp
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_timestamp();

-- Function to log ticket creation activity
CREATE OR REPLACE FUNCTION log_ticket_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Log to admin activity feed
  INSERT INTO admin_live_activity (user_id, activity_type, activity_data, severity)
  VALUES (
    NEW.user_id,
    'support_ticket_created',
    jsonb_build_object(
      'ticket_id', NEW.id,
      'subject', NEW.subject,
      'priority', NEW.priority,
      'category', NEW.category
    ),
    CASE 
      WHEN NEW.priority = 'urgent' THEN 'critical'
      WHEN NEW.priority = 'high' THEN 'warning'
      ELSE 'info'
    END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_new_ticket ON support_tickets;

CREATE TRIGGER log_new_ticket
  AFTER INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION log_ticket_activity();

-- =====================================================
-- 5. VIEWS FOR DASHBOARD
-- =====================================================

-- View: Ticket queue with user details
CREATE OR REPLACE VIEW ticket_queue AS
SELECT 
  t.id,
  t.user_id,
  u.email,
  p.full_name,
  t.subject,
  t.description,
  t.status,
  t.priority,
  t.category,
  t.assigned_to,
  admin.full_name as assigned_to_name,
  t.context,
  t.created_at,
  t.updated_at,
  t.resolved_at,
  COUNT(tm.id) as message_count,
  MAX(tm.created_at) as last_message_at
FROM support_tickets t
LEFT JOIN auth.users u ON u.id = t.user_id
LEFT JOIN profiles p ON p.id = t.user_id
LEFT JOIN profiles admin ON admin.id = t.assigned_to
LEFT JOIN ticket_messages tm ON tm.ticket_id = t.id
GROUP BY t.id, u.email, p.full_name, admin.full_name
ORDER BY 
  CASE t.priority
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
  END,
  t.created_at DESC;

-- =====================================================
-- 6. SEED DATA - CANNED RESPONSES
-- =====================================================

INSERT INTO ticket_canned_responses (title, content, category)
VALUES 
  (
    'Welcome Response',
    'Thank you for contacting EatPal support! We''ve received your ticket and will respond within 24 hours. In the meantime, check out our Help Center for common questions.',
    'general'
  ),
  (
    'Meal Plan Help',
    'To create a meal plan, go to the Planner page and click "Generate Meal Plan". You can customize it based on your child''s preferences and dietary needs. Need more help? Let me know!',
    'question'
  ),
  (
    'Subscription Issue',
    'I''m sorry you''re experiencing subscription issues. I''ve escalated this to our billing team. They''ll reach out within 4 hours to resolve this for you.',
    'billing'
  ),
  (
    'Bug Report Received',
    'Thank you for reporting this bug! Our development team has been notified and will investigate. We''ll update you as soon as we have more information.',
    'bug'
  ),
  (
    'Feature Request Received',
    'Thanks for the feature suggestion! We''ve added it to our roadmap. We''ll keep you updated on progress. Your feedback helps make EatPal better!',
    'feature_request'
  )
ON CONFLICT DO NOTHING;

-- =====================================================
-- 7. GRANT PERMISSIONS
-- =====================================================

GRANT ALL ON support_tickets TO service_role;
GRANT ALL ON ticket_messages TO service_role;
GRANT ALL ON ticket_canned_responses TO service_role;

GRANT EXECUTE ON FUNCTION update_ticket_timestamp TO service_role;
GRANT EXECUTE ON FUNCTION log_ticket_activity TO service_role;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

COMMENT ON TABLE support_tickets IS 'Support tickets submitted by users';
COMMENT ON TABLE ticket_messages IS 'Messages/replies on support tickets';
COMMENT ON TABLE ticket_canned_responses IS 'Pre-written response templates for admins';

