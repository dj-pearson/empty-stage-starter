/**
 * Pure helpers for the agent audit log viewer (US-487).
 *
 * The agent_audit_log.actor column holds either an agent/system name (e.g.
 * 'support-answer', 'approval-executor') or a user id (a UUID) for human
 * actions. We classify by shape so the viewer can visually distinguish the two
 * and the CSV export is a pure, testable transform.
 */

import { toCsv, type CsvColumn } from './csvExport';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ActorKind = 'human' | 'agent';

/** A UUID actor is a user id (human action); anything else is an agent/system. */
export function isHumanActor(actor: string): boolean {
  return UUID_RE.test(actor.trim());
}

export function actorKind(actor: string): ActorKind {
  return isHumanActor(actor) ? 'human' : 'agent';
}

export interface AuditRow {
  id: string;
  actor: string;
  action: string;
  subject_type: string | null;
  subject_id: string | null;
  detail: unknown;
  created_at: string;
}

/** Column order for the CSV export of the current filtered view. */
export function auditCsvColumns(): CsvColumn<AuditRow>[] {
  return [
    { header: 'created_at', value: (r) => r.created_at },
    { header: 'actor', value: (r) => r.actor },
    { header: 'actor_kind', value: (r) => actorKind(r.actor) },
    { header: 'action', value: (r) => r.action },
    { header: 'subject_type', value: (r) => r.subject_type ?? '' },
    { header: 'subject_id', value: (r) => r.subject_id ?? '' },
    {
      header: 'detail',
      value: (r) => (r.detail == null ? '' : JSON.stringify(r.detail)),
    },
  ];
}

/** Serialize the current filtered rows to a CSV string. */
export function auditRowsToCsv(rows: AuditRow[]): string {
  return toCsv(rows, auditCsvColumns());
}
