-- Agentic OS — US-489: support ticket intake schema.
--
-- IMPORTANT: public.support_tickets ALREADY EXISTS (20251013140000_support_tickets.sql)
-- with a different shape (description NOT NULL; status/category/priority CHECKs;
-- message thread in ticket_messages). Rather than a conflicting CREATE (which
-- would silently no-op), this migration RECONCILES the existing table
-- backward-compatibly and adds the new support_messages thread table used by the
-- Agentic OS support agents (US-490..US-495).
--
-- Backward-compat rules (CLAUDE.md): additive columns only; the status CHECK is
-- WIDENED to the UNION of old + new values (never narrowed), so existing rows
-- and older iOS clients keep working while the new workflow statuses are allowed.

-- ============================================================================
-- 1. Extend support_tickets additively
-- ============================================================================
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS sentiment TEXT;
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS tier INTEGER;

-- Widen the status CHECK to allow the new workflow statuses without breaking the
-- old ones. The inline constraint from the original migration is named
-- support_tickets_status_check; drop-if-exists then re-add the union.
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_status_check
  CHECK (status IN (
    -- original values (kept for backward compatibility with shipped clients)
    'new', 'in_progress', 'waiting_user', 'resolved', 'closed',
    -- new Agentic OS workflow values
    'triaged', 'awaiting_reply', 'awaiting_user'
  ));

COMMENT ON COLUMN public.support_tickets.email IS
  'Reply-to email; set by support-intake (US-489). Nullable because pre-existing rows predate it.';
COMMENT ON COLUMN public.support_tickets.tier IS 'Escalation tier assigned by the triage agent (US-490).';

-- ============================================================================
-- 2. support_messages — Agentic OS ticket thread (distinct from ticket_messages)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'agent', 'admin')),
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket
  ON public.support_messages(ticket_id, created_at);

COMMENT ON TABLE public.support_messages IS
  'Agentic OS support ticket thread. sender: user | agent (AI) | admin. metadata may flag internal notes.';

-- ============================================================================
-- 3. RLS on support_messages — users own their tickets'' messages; admins all
--    (support_tickets already has RLS from the original migration; not touched.)
-- ============================================================================
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own support messages"
  ON public.support_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users post to own support tickets"
  ON public.support_messages FOR INSERT
  WITH CHECK (
    sender = 'user'
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage all support messages"
  ON public.support_messages FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );
