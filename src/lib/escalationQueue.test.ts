import { describe, it, expect } from 'vitest';
import {
  severityRank,
  sortEscalations,
  humanizeKey,
  flattenContext,
  distinctDomains,
  type EscalationLike,
} from './escalationQueue';

const mk = (over: Partial<EscalationLike>): EscalationLike => ({
  id: Math.random().toString(36).slice(2),
  tier: 2,
  severity: 'medium',
  domain: 'ops',
  title: 't',
  context: {},
  status: 'open',
  created_at: '2026-07-10T12:00:00Z',
  ...over,
});

describe('severityRank', () => {
  it('orders critical > high > medium > low, unknown last', () => {
    expect(severityRank('critical')).toBeGreaterThan(severityRank('high'));
    expect(severityRank('high')).toBeGreaterThan(severityRank('medium'));
    expect(severityRank('medium')).toBeGreaterThan(severityRank('low'));
    expect(severityRank('bogus')).toBe(0);
  });
});

describe('sortEscalations', () => {
  it('sorts tier desc, then severity desc, then created_at desc', () => {
    const rows = [
      mk({ id: 't2-med-old', tier: 2, severity: 'medium', created_at: '2026-07-01T00:00:00Z' }),
      mk({ id: 't3-low', tier: 3, severity: 'low', created_at: '2026-07-01T00:00:00Z' }),
      mk({ id: 't3-crit', tier: 3, severity: 'critical', created_at: '2026-07-01T00:00:00Z' }),
      mk({ id: 't2-med-new', tier: 2, severity: 'medium', created_at: '2026-07-09T00:00:00Z' }),
    ];
    const sorted = sortEscalations(rows).map((r) => r.id);
    expect(sorted).toEqual(['t3-crit', 't3-low', 't2-med-new', 't2-med-old']);
  });

  it('does not mutate the input', () => {
    const rows = [mk({ id: 'a', tier: 2 }), mk({ id: 'b', tier: 3 })];
    const copy = [...rows];
    sortEscalations(rows);
    expect(rows).toEqual(copy);
  });
});

describe('humanizeKey', () => {
  it('turns snake_case and camelCase into Title Case', () => {
    expect(humanizeKey('sample_ips')).toBe('Sample ips');
    expect(humanizeKey('lastError')).toBe('Last Error');
    expect(humanizeKey('capUsd')).toBe('Cap Usd');
  });
});

describe('flattenContext', () => {
  it('flattens an object into key/value pairs', () => {
    const pairs = flattenContext({ approval_id: 'x1', attempts: 3, ok: false });
    expect(pairs).toContainEqual({ key: 'Approval id', value: 'x1' });
    expect(pairs).toContainEqual({ key: 'Attempts', value: '3' });
    expect(pairs).toContainEqual({ key: 'Ok', value: 'false' });
  });

  it('renders nested objects/arrays as compact JSON', () => {
    const pairs = flattenContext({ ips: ['1.2.3.4', '5.6.7.8'] });
    expect(pairs[0].value).toBe('["1.2.3.4","5.6.7.8"]');
  });

  it('handles null and non-object contexts', () => {
    expect(flattenContext(null)).toEqual([]);
    expect(flattenContext('just text')).toEqual([{ key: 'Detail', value: 'just text' }]);
  });
});

describe('distinctDomains', () => {
  it('returns sorted unique non-null domains', () => {
    const rows = [mk({ domain: 'security' }), mk({ domain: 'ops' }), mk({ domain: 'security' }), mk({ domain: null })];
    expect(distinctDomains(rows)).toEqual(['ops', 'security']);
  });
});
