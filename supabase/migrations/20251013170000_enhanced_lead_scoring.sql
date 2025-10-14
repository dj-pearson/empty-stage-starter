-- Enhanced Lead Scoring System
-- Expands on existing scoring to include behavioral triggers and automation

-- Create lead score history table for tracking changes
CREATE TABLE IF NOT EXISTS lead_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  old_score INTEGER NOT NULL,
  new_score INTEGER NOT NULL,
  score_delta INTEGER GENERATED ALWAYS AS (new_score - old_score) STORED,
  reason TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_score_history_lead ON lead_score_history(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_score_history_date ON lead_score_history(created_at DESC);

-- Enable RLS
ALTER TABLE lead_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view score history"
  ON lead_score_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Enhanced lead scoring function with behavioral triggers
CREATE OR REPLACE FUNCTION calculate_enhanced_lead_score(p_lead_id UUID)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
  lead_record RECORD;
  interaction_count INTEGER;
  email_opens INTEGER;
  email_clicks INTEGER;
  days_since_contact INTEGER;
  pricing_views INTEGER;
BEGIN
  -- Get lead record
  SELECT * INTO lead_record FROM leads WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Base score for contact information (35 points max)
  IF lead_record.email IS NOT NULL THEN
    score := score + 10;
  END IF;

  IF lead_record.full_name IS NOT NULL THEN
    score := score + 10;
  END IF;

  IF lead_record.phone IS NOT NULL THEN
    score := score + 15;
  END IF;

  -- Source quality scoring (25 points max)
  CASE lead_record.source
    WHEN 'referral' THEN score := score + 20;
    WHEN 'trial_signup' THEN score := score + 25;
    WHEN 'paid_ad' THEN score := score + 10;
    WHEN 'organic_search' THEN score := score + 15;
    WHEN 'contact_form' THEN score := score + 12;
    WHEN 'newsletter' THEN score := score + 8;
    ELSE score := score + 5;
  END CASE;

  -- Interaction scoring (30 points max)
  SELECT COUNT(*) INTO interaction_count
  FROM lead_interactions
  WHERE lead_interactions.lead_id = p_lead_id;

  score := score + LEAST(interaction_count * 5, 30);

  -- Email engagement scoring (30 points max)
  SELECT
    COUNT(*) FILTER (WHERE event_type = 'opened'),
    COUNT(*) FILTER (WHERE event_type = 'clicked')
  INTO email_opens, email_clicks
  FROM email_events ee
  JOIN email_queue eq ON eq.id = ee.email_id
  WHERE eq.to_email = lead_record.email;

  score := score + LEAST(email_opens * 5, 15); -- Up to 15 points for opens
  score := score + LEAST(email_clicks * 10, 15); -- Up to 15 points for clicks

  -- Recency bonus (10 points)
  days_since_contact := EXTRACT(DAY FROM NOW() - lead_record.last_contacted_at);

  IF days_since_contact <= 3 THEN
    score := score + 10;
  ELSIF days_since_contact <= 7 THEN
    score := score + 7;
  ELSIF days_since_contact <= 14 THEN
    score := score + 5;
  ELSIF days_since_contact <= 30 THEN
    score := score + 2;
  END IF;

  -- High-intent behavior bonuses
  -- Check for pricing page views (stored in metadata)
  pricing_views := COALESCE((lead_record.metadata->>'pricing_views')::INTEGER, 0);
  IF pricing_views > 0 THEN
    score := score + LEAST(pricing_views * 10, 20);
  END IF;

  -- Check if payment method added but not converted
  IF (lead_record.metadata->>'payment_added')::BOOLEAN = TRUE AND lead_record.status != 'converted' THEN
    score := score + 25;
  END IF;

  -- Check for trial started
  IF (lead_record.metadata->>'trial_started')::BOOLEAN = TRUE THEN
    score := score + 25;
  END IF;

  -- Penalty for long inactivity (after 60 days, start reducing score)
  IF days_since_contact > 60 THEN
    score := score - LEAST((days_since_contact - 60) / 10, 20);
  END IF;

  -- Ensure score stays within bounds
  RETURN GREATEST(LEAST(score, 100), 0);
END;
$$ LANGUAGE plpgsql;

-- Function to log score changes
CREATE OR REPLACE FUNCTION log_score_change(
  p_lead_id UUID,
  p_old_score INTEGER,
  p_new_score INTEGER,
  p_reason TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
BEGIN
  IF p_old_score != p_new_score THEN
    INSERT INTO lead_score_history (lead_id, old_score, new_score, reason, metadata)
    VALUES (p_lead_id, p_old_score, p_new_score, p_reason, p_metadata);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Updated trigger function for lead score with logging
CREATE OR REPLACE FUNCTION update_lead_score_with_logging()
RETURNS TRIGGER AS $$
DECLARE
  old_score INTEGER;
  new_score INTEGER;
BEGIN
  old_score := OLD.score;
  new_score := calculate_enhanced_lead_score(NEW.id);

  NEW.score := new_score;

  -- Log the change
  PERFORM log_score_change(NEW.id, old_score, new_score, 'automatic_update', jsonb_build_object(
    'trigger', TG_OP,
    'changed_fields', CASE
      WHEN TG_OP = 'UPDATE' THEN (
        SELECT jsonb_object_agg(key, value)
        FROM jsonb_each(to_jsonb(NEW)) AS new_data(key, value)
        WHERE to_jsonb(OLD)->>key IS DISTINCT FROM value::text
      )
      ELSE '{}'::jsonb
    END
  ));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace old trigger
DROP TRIGGER IF EXISTS trigger_update_lead_score ON leads;
CREATE TRIGGER trigger_update_lead_score
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_score_with_logging();

-- Also calculate score on insert
CREATE OR REPLACE FUNCTION calculate_initial_lead_score()
RETURNS TRIGGER AS $$
BEGIN
  NEW.score := calculate_enhanced_lead_score(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_initial_lead_score ON leads;
CREATE TRIGGER trigger_initial_lead_score
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION calculate_initial_lead_score();

-- Function to trigger automated actions based on score
CREATE OR REPLACE FUNCTION trigger_score_based_actions()
RETURNS TRIGGER AS $$
DECLARE
  score_threshold_high INTEGER := 80;
  score_threshold_medium INTEGER := 60;
BEGIN
  -- High score actions (80+)
  IF NEW.score >= score_threshold_high AND (OLD.score IS NULL OR OLD.score < score_threshold_high) THEN
    -- Auto-qualify the lead
    IF NEW.status = 'new' THEN
      NEW.status := 'qualified';
    END IF;

    -- Create admin notification (would need admin_notifications table)
    INSERT INTO admin_notifications (
      title,
      message,
      severity,
      category,
      entity_type,
      entity_id
    ) VALUES (
      'High-Score Lead',
      format('Lead %s has reached a score of %s', COALESCE(NEW.full_name, NEW.email), NEW.score),
      'high',
      'leads',
      'lead',
      NEW.id
    ) ON CONFLICT DO NOTHING;

  -- Medium score actions (60-79)
  ELSIF NEW.score >= score_threshold_medium AND NEW.score < score_threshold_high THEN
    -- Add to priority nurture sequence (would trigger via email automation)
    NULL; -- Placeholder for future automation

  -- Low score after 30 days (< 40)
  ELSIF NEW.score < 40 AND EXTRACT(DAY FROM NOW() - NEW.created_at) > 30 THEN
    IF NEW.status = 'new' THEN
      NEW.status := 'unqualified';
    END IF;

    -- Cancel active email sequences
    UPDATE user_email_sequences
    SET canceled_at = NOW()
    WHERE lead_id = NEW.id
      AND canceled_at IS NULL
      AND completed_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_score_actions ON leads;
CREATE TRIGGER trigger_score_actions
  BEFORE UPDATE ON leads
  FOR EACH ROW
  WHEN (OLD.score IS DISTINCT FROM NEW.score)
  EXECUTE FUNCTION trigger_score_based_actions();

-- Function to batch recalculate all lead scores (for admin use)
CREATE OR REPLACE FUNCTION recalculate_all_lead_scores()
RETURNS TABLE (lead_id UUID, old_score INTEGER, new_score INTEGER) AS $$
BEGIN
  RETURN QUERY
  UPDATE leads
  SET score = calculate_enhanced_lead_score(id)
  WHERE score != calculate_enhanced_lead_score(id)
  RETURNING id, score AS old_score, calculate_enhanced_lead_score(id) AS new_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get lead score breakdown (for debugging)
CREATE OR REPLACE FUNCTION get_lead_score_breakdown(p_lead_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  lead_record RECORD;
  interaction_count INTEGER;
  email_opens INTEGER;
  email_clicks INTEGER;
BEGIN
  SELECT * INTO lead_record FROM leads WHERE id = p_lead_id;

  SELECT COUNT(*) INTO interaction_count
  FROM lead_interactions WHERE lead_id = p_lead_id;

  SELECT
    COUNT(*) FILTER (WHERE event_type = 'opened'),
    COUNT(*) FILTER (WHERE event_type = 'clicked')
  INTO email_opens, email_clicks
  FROM email_events ee
  JOIN email_queue eq ON eq.id = ee.email_id
  WHERE eq.to_email = lead_record.email;

  result := jsonb_build_object(
    'base_info', jsonb_build_object(
      'has_email', lead_record.email IS NOT NULL,
      'has_name', lead_record.full_name IS NOT NULL,
      'has_phone', lead_record.phone IS NOT NULL,
      'points', CASE
        WHEN lead_record.email IS NOT NULL THEN 10 ELSE 0
      END + CASE
        WHEN lead_record.full_name IS NOT NULL THEN 10 ELSE 0
      END + CASE
        WHEN lead_record.phone IS NOT NULL THEN 15 ELSE 0
      END
    ),
    'source_quality', jsonb_build_object(
      'source', lead_record.source,
      'points', CASE lead_record.source
        WHEN 'referral' THEN 20
        WHEN 'trial_signup' THEN 25
        WHEN 'paid_ad' THEN 10
        WHEN 'organic_search' THEN 15
        WHEN 'contact_form' THEN 12
        WHEN 'newsletter' THEN 8
        ELSE 5
      END
    ),
    'interactions', jsonb_build_object(
      'count', interaction_count,
      'points', LEAST(interaction_count * 5, 30)
    ),
    'email_engagement', jsonb_build_object(
      'opens', email_opens,
      'clicks', email_clicks,
      'points', LEAST(email_opens * 5, 15) + LEAST(email_clicks * 10, 15)
    ),
    'recency', jsonb_build_object(
      'days_since_contact', EXTRACT(DAY FROM NOW() - lead_record.last_contacted_at),
      'points', CASE
        WHEN EXTRACT(DAY FROM NOW() - lead_record.last_contacted_at) <= 3 THEN 10
        WHEN EXTRACT(DAY FROM NOW() - lead_record.last_contacted_at) <= 7 THEN 7
        WHEN EXTRACT(DAY FROM NOW() - lead_record.last_contacted_at) <= 14 THEN 5
        WHEN EXTRACT(DAY FROM NOW() - lead_record.last_contacted_at) <= 30 THEN 2
        ELSE 0
      END
    ),
    'current_score', lead_record.score,
    'calculated_score', calculate_enhanced_lead_score(p_lead_id)
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE lead_score_history IS 'Tracks historical changes to lead scores for audit and analysis';
COMMENT ON FUNCTION calculate_enhanced_lead_score IS 'Enhanced scoring algorithm including behavioral signals';
COMMENT ON FUNCTION get_lead_score_breakdown IS 'Returns detailed breakdown of how a lead score is calculated';
