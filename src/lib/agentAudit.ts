/**
 * Best-effort audit logging for human actions in the Command Center (US-487).
 *
 * Human actions (approve, reject, acknowledge, resolve, enable/disable, kill
 * switch) are recorded in agent_audit_log with actor = the acting user's id so
 * the audit viewer can distinguish them from agent/system actions. The table is
 * append-only (UPDATE/DELETE revoked); admins may INSERT under RLS.
 *
 * These calls are best-effort: a logging failure must never block or roll back
 * the user's actual action, so errors are swallowed (and logged to the console).
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface AgentAuditParams {
  /** The acting user's id (becomes agent_audit_log.actor). */
  actor: string;
  action: string;
  subjectType?: string;
  subjectId?: string | null;
  detail?: Json;
}

export async function logAgentAudit(params: AgentAuditParams): Promise<void> {
  try {
    await supabase.from('agent_audit_log').insert({
      actor: params.actor,
      action: params.action,
      subject_type: params.subjectType ?? null,
      subject_id: params.subjectId ?? null,
      detail: params.detail ?? {},
    });
  } catch (err) {
    console.error('audit log write failed (non-blocking):', err);
  }
}
