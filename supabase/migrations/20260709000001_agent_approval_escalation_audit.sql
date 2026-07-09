-- Agentic OS — US-476: Approval, escalation, and audit schema
-- Draft actions (agent_approvals), human escalations (agent_escalations), and an
-- append-only audit trail (agent_audit_log) that enforces draft-first autonomy.
-- Additive only. RLS admin-only, reusing the user_roles admin-role pattern.

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
-- Supports the expiry sweep (drafts past expires_at).
CREATE INDEX IF NOT EXISTS idx_agent_approvals_expires
  ON public.agent_approvals(expires_at) WHERE status = 'draft';

-- ============================================================================
-- 2. agent_escalations — tiered human escalation queue
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.agent_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.agent_definitions(id) ON DELETE SET NULL,
  tier INTEGER NOT NULL CHECK (tier IN (2, 3)),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  domain TEXT,
  title TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_escalations_status ON public.agent_escalations(status);
CREATE INDEX IF NOT EXISTS idx_agent_escalations_tier ON public.agent_escalations(tier);
CREATE INDEX IF NOT EXISTS idx_agent_escalations_domain ON public.agent_escalations(domain);
CREATE INDEX IF NOT EXISTS idx_agent_escalations_created ON public.agent_escalations(created_at DESC);
-- Open tier-3 count / sort by tier desc then severity then created_at.
CREATE INDEX IF NOT EXISTS idx_agent_escalations_open
  ON public.agent_escalations(tier DESC, created_at DESC) WHERE status = 'open';

-- ============================================================================
-- 3. agent_audit_log — append-only trail of all agent + human actions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.agent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,
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

-- Append-only: writes happen through the service role (which bypasses these grants),
-- but no non-service client may ever mutate history.
REVOKE UPDATE, DELETE ON public.agent_audit_log FROM authenticated;
REVOKE UPDATE, DELETE ON public.agent_audit_log FROM anon;

-- ============================================================================
-- 4. Row Level Security — admin-only on all three tables
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

-- Audit log is admin-readable and admin-insertable only; UPDATE/DELETE are
-- revoked above so the trail stays append-only even for admins.
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

-- ============================================================================
-- 5. Comments
-- ============================================================================
COMMENT ON TABLE public.agent_approvals IS 'Agentic OS: draft-first approval queue for outward-facing agent actions';
COMMENT ON TABLE public.agent_escalations IS 'Agentic OS: tiered human escalation queue (tier 2 review, tier 3 urgent)';
COMMENT ON TABLE public.agent_audit_log IS 'Agentic OS: append-only audit trail (UPDATE/DELETE revoked from non-service roles)';
