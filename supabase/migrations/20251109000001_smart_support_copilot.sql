-- Smart Support Copilot Database Schema
-- This migration creates the necessary tables and functions for AI-powered support automation

-- ============================================================================
-- 1. TICKET AI ANALYSIS CACHE
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_ticket_ai_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,

  -- AI Classification
  issue_type TEXT, -- 'billing', 'bug', 'feature_request', 'question', 'account', 'technical'
  issue_confidence NUMERIC(3,2) CHECK (issue_confidence >= 0 AND issue_confidence <= 1),
  affected_feature TEXT, -- 'meal_plans', 'recipes', 'subscription', 'login', etc.

  -- Auto-resolution assessment
  auto_resolvable BOOLEAN DEFAULT false,
  auto_resolution_confidence NUMERIC(3,2) CHECK (auto_resolution_confidence >= 0 AND auto_resolution_confidence <= 1),

  -- Response suggestions
  suggested_response TEXT,
  response_template_id UUID,

  -- Similar tickets (for learning from past resolutions)
  similar_ticket_ids UUID[],
  similarity_scores NUMERIC[],

  -- User context (auto-gathered)
  auto_gathered_context JSONB DEFAULT '{}'::jsonb,
  /*
    Context includes:
    - subscription_status
    - recent_errors (last 7 days)
    - recent_activity
    - feature_flags
    - user_tier
    - health_score
  */

  -- Sentiment analysis
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'frustrated')),
  sentiment_score NUMERIC(3,2),
  urgency_score INTEGER CHECK (urgency_score >= 0 AND urgency_score <= 100),

  -- Processing metadata
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  analysis_model TEXT DEFAULT 'gpt-4o-mini',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_ai_analysis_ticket_id ON support_ticket_ai_analysis(ticket_id);
CREATE INDEX idx_ticket_ai_analysis_auto_resolvable ON support_ticket_ai_analysis(auto_resolvable) WHERE auto_resolvable = true;
CREATE INDEX idx_ticket_ai_analysis_issue_type ON support_ticket_ai_analysis(issue_type);

-- ============================================================================
-- 2. KNOWLEDGE BASE ARTICLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_kb_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Article content
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,

  -- Organization
  category TEXT, -- 'getting_started', 'billing', 'troubleshooting', 'features', 'faq'
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Auto-generation tracking
  auto_generated BOOLEAN DEFAULT false,
  created_from_ticket_id UUID REFERENCES support_tickets(id),
  generated_from_pattern TEXT, -- Description of the pattern that triggered creation

  -- Publishing
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,

  -- Analytics
  view_count INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,

  -- Related articles
  related_article_ids UUID[],

  -- Search optimization
  search_vector tsvector,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_kb_articles_category ON support_kb_articles(category);
CREATE INDEX idx_kb_articles_status ON support_kb_articles(status);
CREATE INDEX idx_kb_articles_search_vector ON support_kb_articles USING GIN(search_vector);
CREATE INDEX idx_kb_articles_tags ON support_kb_articles USING GIN(tags);

-- Trigger to update search_vector
CREATE OR REPLACE FUNCTION update_kb_article_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_kb_search_vector
  BEFORE INSERT OR UPDATE OF title, content, summary, tags ON support_kb_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_kb_article_search_vector();

-- ============================================================================
-- 3. SUPPORT RESPONSE TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_response_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template details
  name TEXT NOT NULL,
  category TEXT, -- 'billing', 'bug', 'feature_request', 'question', 'greeting', 'closing'
  template_text TEXT NOT NULL,

  -- Variables support (e.g., {{user_name}}, {{subscription_status}})
  variables TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Success metrics
  avg_resolution_time_hours NUMERIC(10,2),
  success_rate NUMERIC(3,2), -- Based on CSAT ratings

  -- Template metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_response_templates_category ON support_response_templates(category);
CREATE INDEX idx_response_templates_active ON support_response_templates(is_active) WHERE is_active = true;

-- ============================================================================
-- 4. TICKET SATISFACTION RATINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_ticket_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,

  -- CSAT rating
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback_text TEXT,

  -- Tracking
  ai_assisted BOOLEAN DEFAULT false,
  auto_resolved BOOLEAN DEFAULT false,
  response_template_used UUID REFERENCES support_response_templates(id),

  -- Analysis
  rating_category TEXT GENERATED ALWAYS AS (
    CASE
      WHEN rating >= 4 THEN 'satisfied'
      WHEN rating = 3 THEN 'neutral'
      ELSE 'unsatisfied'
    END
  ) STORED,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(ticket_id)
);

CREATE INDEX idx_ticket_ratings_rating ON support_ticket_ratings(rating);
CREATE INDEX idx_ticket_ratings_ai_assisted ON support_ticket_ratings(ai_assisted);
CREATE INDEX idx_ticket_ratings_auto_resolved ON support_ticket_ratings(auto_resolved);

-- ============================================================================
-- 5. SUPPORT PERFORMANCE METRICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW support_performance_metrics AS
WITH ticket_stats AS (
  SELECT
    DATE(st.created_at) as metric_date,
    COUNT(*) as total_tickets,
    COUNT(*) FILTER (WHERE staa.auto_resolvable = true) as auto_resolvable_tickets,
    COUNT(*) FILTER (WHERE staa.auto_resolvable = true AND st.status IN ('resolved', 'closed')) as auto_resolved_tickets,
    COUNT(*) FILTER (WHERE staa.id IS NOT NULL) as ai_assisted_tickets,
    COUNT(*) FILTER (WHERE st.status IN ('resolved', 'closed')) as resolved_tickets,
    AVG(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 3600) FILTER (WHERE st.status IN ('resolved', 'closed')) as avg_resolution_hours,
    AVG(str.rating) as avg_csat_rating,
    AVG(str.rating) FILTER (WHERE staa.id IS NOT NULL) as avg_csat_ai_assisted,
    AVG(str.rating) FILTER (WHERE str.auto_resolved = true) as avg_csat_auto_resolved
  FROM support_tickets st
  LEFT JOIN support_ticket_ai_analysis staa ON st.id = staa.ticket_id
  LEFT JOIN support_ticket_ratings str ON st.id = str.ticket_id
  WHERE st.created_at >= NOW() - INTERVAL '90 days'
  GROUP BY DATE(st.created_at)
),
issue_breakdown AS (
  SELECT
    staa.issue_type,
    COUNT(*) as ticket_count,
    AVG(staa.issue_confidence) as avg_confidence,
    COUNT(*) FILTER (WHERE st.status IN ('resolved', 'closed')) as resolved_count,
    AVG(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 3600) FILTER (WHERE st.status IN ('resolved', 'closed')) as avg_resolution_hours
  FROM support_tickets st
  JOIN support_ticket_ai_analysis staa ON st.id = staa.ticket_id
  WHERE st.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY staa.issue_type
)
SELECT
  ts.*,
  json_agg(
    json_build_object(
      'issue_type', ib.issue_type,
      'ticket_count', ib.ticket_count,
      'avg_confidence', ib.avg_confidence,
      'resolved_count', ib.resolved_count,
      'avg_resolution_hours', ib.avg_resolution_hours
    )
  ) as issue_breakdown
FROM ticket_stats ts
CROSS JOIN issue_breakdown ib
GROUP BY ts.metric_date, ts.total_tickets, ts.auto_resolvable_tickets, ts.auto_resolved_tickets,
         ts.ai_assisted_tickets, ts.resolved_tickets, ts.avg_resolution_hours, ts.avg_csat_rating,
         ts.avg_csat_ai_assisted, ts.avg_csat_auto_resolved
ORDER BY ts.metric_date DESC;

-- ============================================================================
-- 6. FUNCTION: AUTO-GATHER USER CONTEXT FOR TICKET
-- ============================================================================

CREATE OR REPLACE FUNCTION gather_ticket_user_context(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_context JSONB;
BEGIN
  SELECT jsonb_build_object(
    'subscription_status', (
      SELECT status
      FROM subscriptions
      WHERE user_id = p_user_id
        AND status IN ('active', 'trialing', 'past_due')
      LIMIT 1
    ),
    'subscription_mrr', (
      SELECT spm.price_monthly
      FROM subscriptions s
      JOIN stripe_product_mapping spm ON s.stripe_price_id = spm.stripe_price_id
      WHERE s.user_id = p_user_id
        AND s.status IN ('active', 'trialing', 'past_due')
      LIMIT 1
    ),
    'recent_errors', (
      SELECT json_agg(
        json_build_object(
          'activity_type', activity_type,
          'description', activity_description,
          'created_at', created_at
        )
      )
      FROM (
        SELECT activity_type, activity_description, created_at
        FROM admin_live_activity
        WHERE user_id = p_user_id
          AND severity = 'error'
          AND created_at > NOW() - INTERVAL '7 days'
        ORDER BY created_at DESC
        LIMIT 5
      ) errors
    ),
    'last_login', (
      SELECT MAX(created_at)
      FROM admin_live_activity
      WHERE user_id = p_user_id
        AND activity_type = 'login'
    ),
    'user_tier', (
      SELECT user_tier
      FROM admin_user_intelligence
      WHERE id = p_user_id
    ),
    'health_score', (
      SELECT health_score
      FROM admin_user_intelligence
      WHERE id = p_user_id
    ),
    'open_tickets_count', (
      SELECT COUNT(*)
      FROM support_tickets
      WHERE user_id = p_user_id
        AND status IN ('new', 'in_progress', 'waiting_user')
    ),
    'total_tickets_count', (
      SELECT COUNT(*)
      FROM support_tickets
      WHERE user_id = p_user_id
    ),
    'account_age_days', (
      SELECT EXTRACT(DAY FROM NOW() - created_at)::INTEGER
      FROM profiles
      WHERE id = p_user_id
    )
  ) INTO v_context;

  RETURN v_context;
END;
$$;

-- ============================================================================
-- 7. FUNCTION: FIND SIMILAR TICKETS (FOR AI LEARNING)
-- ============================================================================

CREATE OR REPLACE FUNCTION find_similar_tickets(
  p_ticket_id UUID,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  similar_ticket_id UUID,
  similarity_score NUMERIC,
  resolution_summary TEXT,
  resolution_time_hours NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH current_ticket AS (
    SELECT
      st.subject,
      st.description,
      st.category,
      staa.issue_type
    FROM support_tickets st
    LEFT JOIN support_ticket_ai_analysis staa ON st.id = staa.ticket_id
    WHERE st.id = p_ticket_id
  )
  SELECT
    st.id as similar_ticket_id,
    -- Simple similarity based on category and issue_type match
    CASE
      WHEN st.category = ct.category AND staa.issue_type = ct.issue_type THEN 0.9
      WHEN st.category = ct.category THEN 0.6
      WHEN staa.issue_type = ct.issue_type THEN 0.5
      ELSE 0.3
    END as similarity_score,
    LEFT(st.description, 200) as resolution_summary,
    EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 3600 as resolution_time_hours
  FROM support_tickets st
  JOIN support_ticket_ai_analysis staa ON st.id = staa.ticket_id
  CROSS JOIN current_ticket ct
  WHERE st.id != p_ticket_id
    AND st.status IN ('resolved', 'closed')
    AND (
      st.category = ct.category OR
      staa.issue_type = ct.issue_type
    )
  ORDER BY similarity_score DESC, st.updated_at DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 8. FUNCTION: SEARCH KNOWLEDGE BASE
-- ============================================================================

CREATE OR REPLACE FUNCTION search_kb_articles(
  p_query TEXT,
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  article_id UUID,
  title TEXT,
  summary TEXT,
  category TEXT,
  relevance_rank REAL
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.title,
    kb.summary,
    kb.category,
    ts_rank(kb.search_vector, plainto_tsquery('english', p_query)) as relevance_rank
  FROM support_kb_articles kb
  WHERE kb.status = 'published'
    AND (p_category IS NULL OR kb.category = p_category)
    AND kb.search_vector @@ plainto_tsquery('english', p_query)
  ORDER BY relevance_rank DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 9. TRIGGER: AUTO-UPDATE TEMPLATE USAGE STATS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_template_usage_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update usage count and last used timestamp
  IF NEW.response_template_used IS NOT NULL THEN
    UPDATE support_response_templates
    SET
      usage_count = usage_count + 1,
      last_used_at = NOW()
    WHERE id = NEW.response_template_used;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_template_usage
  AFTER INSERT ON support_ticket_ratings
  FOR EACH ROW
  WHEN (NEW.response_template_used IS NOT NULL)
  EXECUTE FUNCTION update_template_usage_stats();

-- ============================================================================
-- 10. TRIGGER: UPDATE TEMPLATE SUCCESS RATE
-- ============================================================================

CREATE OR REPLACE FUNCTION update_template_success_rate()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate success rate for the template
  UPDATE support_response_templates srt
  SET success_rate = (
    SELECT AVG(rating)::NUMERIC / 5.0
    FROM support_ticket_ratings
    WHERE response_template_used = NEW.response_template_used
  )
  WHERE id = NEW.response_template_used;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_template_success_rate
  AFTER INSERT OR UPDATE OF rating ON support_ticket_ratings
  FOR EACH ROW
  WHEN (NEW.response_template_used IS NOT NULL)
  EXECUTE FUNCTION update_template_success_rate();

-- ============================================================================
-- 11. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE support_ticket_ai_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_response_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_ratings ENABLE ROW LEVEL SECURITY;

-- Admin-only access for AI analysis and templates
CREATE POLICY support_ai_analysis_admin_all ON support_ticket_ai_analysis
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY support_templates_admin_all ON support_response_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- KB articles - admins can do all, users can read published
CREATE POLICY kb_articles_admin_all ON support_kb_articles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY kb_articles_user_read ON support_kb_articles
  FOR SELECT USING (status = 'published');

-- Ticket ratings - users can rate their own tickets
CREATE POLICY ticket_ratings_own ON support_ticket_ratings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets st
      WHERE st.id = ticket_id AND st.user_id = auth.uid()
    )
  );

CREATE POLICY ticket_ratings_admin_read ON support_ticket_ratings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================================================
-- 12. GRANTS
-- ============================================================================

GRANT SELECT ON support_performance_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION gather_ticket_user_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION find_similar_tickets(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION search_kb_articles(TEXT, TEXT, INTEGER) TO authenticated;

-- ============================================================================
-- 13. SEED DATA - DEFAULT RESPONSE TEMPLATES
-- ============================================================================

INSERT INTO support_response_templates (name, category, template_text, variables) VALUES
('Password Reset', 'account', 'Hi {{user_name}},

I can help you reset your password. I''ve sent a password reset link to your email address ({{user_email}}).

Please check your inbox and spam folder. The link will expire in 1 hour.

If you don''t receive it within a few minutes, please let me know and I''ll resend it.

Best regards,
Support Team', ARRAY['user_name', 'user_email']),

('Subscription Cancellation Confirmation', 'billing', 'Hi {{user_name}},

I''ve confirmed that your subscription has been cancelled. Your access will continue until {{end_date}}, and you won''t be charged again.

We''re sorry to see you go! If there''s anything we could have done better, we''d love to hear your feedback.

If you change your mind, you can reactivate your subscription anytime from your account settings.

Thank you for being a customer!

Best regards,
Support Team', ARRAY['user_name', 'end_date']),

('Feature Request Acknowledgment', 'feature_request', 'Hi {{user_name}},

Thank you for suggesting this feature! We really appreciate customers who take the time to share ideas.

I''ve forwarded your request to our product team for review. While I can''t promise when or if this will be implemented, we carefully consider all feature requests when planning our roadmap.

We''ll keep you updated if we decide to move forward with this feature.

Is there anything else I can help you with today?

Best regards,
Support Team', ARRAY['user_name']),

('Bug Report - Under Investigation', 'bug', 'Hi {{user_name}},

Thank you for reporting this issue. I''ve confirmed this is a bug and our engineering team is now investigating.

Here''s what we know so far:
- Issue: {{issue_description}}
- Status: Under investigation
- Priority: {{priority}}

I''ll keep you updated on our progress. We aim to resolve this as quickly as possible.

As a workaround, you might try: {{workaround}}

Thank you for your patience!

Best regards,
Support Team', ARRAY['user_name', 'issue_description', 'priority', 'workaround']),

('General Question - Browser Cache Clear', 'technical', 'Hi {{user_name}},

This issue is often resolved by clearing your browser cache. Here''s how:

**Chrome:**
1. Press Ctrl+Shift+Delete (Cmd+Shift+Delete on Mac)
2. Select "Cached images and files"
3. Click "Clear data"

**Safari:**
1. Go to Safari > Preferences > Privacy
2. Click "Manage Website Data"
3. Click "Remove All"

After clearing the cache, please log out and log back in.

Let me know if this resolves the issue or if you need further assistance!

Best regards,
Support Team', ARRAY['user_name'])

ON CONFLICT DO NOTHING;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE support_ticket_ai_analysis IS 'AI-powered analysis cache for support tickets including classification, sentiment, and resolution suggestions';
COMMENT ON TABLE support_kb_articles IS 'Knowledge base articles for self-service support, can be auto-generated from ticket patterns';
COMMENT ON TABLE support_response_templates IS 'Reusable response templates with usage tracking and success metrics';
COMMENT ON TABLE support_ticket_ratings IS 'Customer satisfaction ratings for support tickets';
COMMENT ON VIEW support_performance_metrics IS 'Aggregated support performance metrics including AI assistance effectiveness';
COMMENT ON FUNCTION gather_ticket_user_context(UUID) IS 'Automatically gathers relevant user context for support ticket triage';
COMMENT ON FUNCTION find_similar_tickets(UUID, INTEGER) IS 'Finds similar resolved tickets for learning from past resolutions';
COMMENT ON FUNCTION search_kb_articles(TEXT, TEXT, INTEGER) IS 'Full-text search across knowledge base articles';
