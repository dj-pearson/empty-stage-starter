-- Agentic OS — US-492: declarative escalation rules engine.
-- Escalation routing as data so policy changes need no code deploy. Additive
-- only: one new table with admin-only RLS + seed rules.

CREATE TABLE IF NOT EXISTS public.agent_escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT,
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  tier INTEGER NOT NULL CHECK (tier IN (2, 3)),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_escalation_rules_enabled
  ON public.agent_escalation_rules(enabled) WHERE enabled = TRUE;

COMMENT ON TABLE public.agent_escalation_rules IS
  'Declarative escalation routing rules (US-492). condition is a small JSON DSL evaluated by functions/_shared/escalation-rules.ts.';

ALTER TABLE public.agent_escalation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage escalation rules"
  ON public.agent_escalation_rules FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

-- ============================================================================
-- Seed rules (idempotent by description). condition mirrors escalation-rules.ts.
-- ============================================================================
INSERT INTO public.agent_escalation_rules (domain, condition, tier, severity, description)
SELECT * FROM (VALUES
  (
    'customer_service',
    '{"any":[{"field":"category","in":["billing"]},{"anyKeyword":["refund"]}]}'::jsonb,
    2, 'medium', 'Billing or refund request'
  ),
  (
    'customer_service',
    '{"any":[{"field":"category","in":["account_data"]},{"anyKeyword":["legal","data deletion","delete my account","delete my data","gdpr","ccpa","right to be forgotten"]}]}'::jsonb,
    3, 'high', 'Legal or data-deletion request'
  ),
  (
    'security',
    '{"anyKeyword":["security breach","data breach","breach","hacked","vulnerability","exposed","data leak"]}'::jsonb,
    3, 'critical', 'Security concern'
  ),
  (
    'customer_service',
    '{"field":"sentiment","equals":"angry"}'::jsonb,
    2, 'medium', 'Angry customer'
  ),
  (
    'customer_service',
    '{"olderThanHours":24,"statusIn":["new","triaged","awaiting_reply"]}'::jsonb,
    2, 'medium', 'No reply after 24h (SLA breach)'
  )
) AS seed(domain, condition, tier, severity, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_escalation_rules r WHERE r.description = seed.description
);
