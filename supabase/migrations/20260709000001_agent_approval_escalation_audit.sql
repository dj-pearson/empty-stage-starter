-- Agentic OS — US-476: Approval, escalation, and audit schema
-- Draft-first autonomy needs three durable stores:
--   * agent_approvals   — outward-facing actions an agent drafts, pending human review
--   * agent_escalations — items a human must look at (tier 2) or act on now (tier 3)
--   * agent_audit_log   — append-only trail of every agent/human action
--
-- Additive only: three brand-new tables, no changes to existing objects.
-- RLS: admin-only on all three, reusing the user_roles admin-check pattern.

-- ============================================================================
-- 1. agent_approvals — draft-first queue for outward-facing actions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.agent_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.agent_definitions(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'rejected', 'executed', 'expired')),
  review_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_status ON public.agent_approvals(status);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_agent ON public.agent_approvals(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_run ON public.agent_approvals(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_action_type ON public.agent_approvals(action_type);
-- Draft queue view (US-484) and the expiry sweep (US-482) both scan open drafts by age.
CREATE INDEX IF NOT EXISTS idx_agent_approvals_draft_created
  ON public.agent_approvals(created_at DESC) WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS idx_agent_approvals_expires
  ON public.agent_approvals(expires_at) WHERE status = 'draft';

COMMENT ON TABLE public.agent_approvals IS
  'Draft-first queue: every outward-facing agent action lands here for human review before the executor runs it.';

-- ============================================================================
-- 2. agent_escalations — tiered human-attention queue
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.agent_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.agent_definitions(id) ON DELETE SET NULL,
  tier INTEGER NOT NULL CHECK (tier IN (2, 3)),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  domain TEXT,
  title TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_escalations_status ON public.agent_escalations(status);
CREATE INDEX IF NOT EXISTS idx_agent_escalations_domain ON public.agent_escalations(domain);
CREATE INDEX IF NOT EXISTS idx_agent_escalations_agent ON public.agent_escalations(agent_id);
-- Queue ordering (US-485): tier desc, then severity, then recency; open items first.
CREATE INDEX IF NOT EXISTS idx_agent_escalations_open_tier
  ON public.agent_escalations(tier DESC, created_at DESC) WHERE status = 'open';

COMMENT ON TABLE public.agent_escalations IS
  'Tiered human-attention queue: tier 2 = review soon, tier 3 = act now (urgent/sensitive).';

-- ============================================================================
-- 3. agent_audit_log — append-only trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.agent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,          -- agent name or user id
  action TEXT NOT NULL,
  subject_type TEXT,
  subject_id TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_audit_log_created ON public.agent_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_audit_log_actor ON public.agent_audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_agent_audit_log_action ON public.agent_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_agent_audit_log_subject ON public.agent_audit_log(subject_type, subject_id);

COMMENT ON TABLE public.agent_audit_log IS
  'Append-only audit trail of every agent and human action. UPDATE/DELETE revoked from client roles.';

-- Append-only: no client role may mutate history. Inserts still allowed (admins/service role);
-- the service role bypasses RLS entirely, and admin RLS below governs authenticated inserts.
REVOKE UPDATE, DELETE ON public.agent_audit_log FROM authenticated;
REVOKE UPDATE, DELETE ON public.agent_audit_log FROM anon;

-- ============================================================================
-- 4. RLS — admin-only on all three tables (same pattern as admin_alerts)
-- ============================================================================
ALTER TABLE public.agent_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage agent approvals"
  ON public.agent_approvals FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage agent escalations"
  ON public.agent_escalations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Audit log: admins may SELECT and INSERT, but never UPDATE/DELETE (append-only,
-- enforced by both the REVOKE above and the absence of UPDATE/DELETE policies).
CREATE POLICY "Admins can view audit log"
  ON public.agent_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert audit log"
  ON public.agent_audit_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );
