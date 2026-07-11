import { describe, it, expect } from 'vitest';
import { isHumanActor, actorKind, auditRowsToCsv, type AuditRow } from './auditLog';

describe('isHumanActor / actorKind', () => {
  it('treats a UUID actor as human', () => {
    expect(isHumanActor('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
    expect(actorKind('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe('human');
  });
  it('treats an agent/system name as agent', () => {
    expect(isHumanActor('approval-executor')).toBe(false);
    expect(isHumanActor('support-triage')).toBe(false);
    expect(actorKind('support-triage')).toBe('agent');
  });
  it('tolerates surrounding whitespace', () => {
    expect(isHumanActor('  3f2504e0-4f89-41d3-9a0c-0305e82c3301  ')).toBe(true);
  });
});

describe('auditRowsToCsv', () => {
  const rows: AuditRow[] = [
    {
      id: '1',
      actor: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      action: 'approval_approved',
      subject_type: 'agent_approval',
      subject_id: 'a1',
      detail: { note: 'looks good, ship it' },
      created_at: '2026-07-10T12:00:00Z',
    },
    {
      id: '2',
      actor: 'approval-executor',
      action: 'action_executed',
      subject_type: 'agent_approval',
      subject_id: 'a1',
      detail: { result: { message_id: 'm1' } },
      created_at: '2026-07-10T12:01:00Z',
    },
  ];

  it('emits a header row and one row per entry', () => {
    const csv = auditRowsToCsv(rows);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('created_at,actor,actor_kind,action,subject_type,subject_id,detail');
  });

  it('classifies actor_kind per row', () => {
    const csv = auditRowsToCsv(rows);
    expect(csv).toContain('human');
    expect(csv).toContain('agent');
  });

  it('quotes detail JSON containing commas', () => {
    const csv = auditRowsToCsv(rows);
    // The first row detail has a comma inside the note -> must be quoted.
    expect(csv).toContain('"{""note"":""looks good, ship it""}"');
  });

  it('renders null detail as empty', () => {
    const csv = auditRowsToCsv([
      { ...rows[0], detail: null },
    ]);
    expect(csv.split('\r\n')[1].endsWith(',')).toBe(true);
  });
});
