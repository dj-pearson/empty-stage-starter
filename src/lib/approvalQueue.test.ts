import { describe, it, expect } from 'vitest';
import {
  payloadString,
  isTemplated,
  canBulkApprove,
  applyEdits,
  EDITABLE_FIELDS,
} from './approvalQueue';

describe('payloadString', () => {
  it('returns the string value or empty', () => {
    expect(payloadString({ subject: 'Hi' }, 'subject')).toBe('Hi');
    expect(payloadString({ subject: 123 }, 'subject')).toBe('');
    expect(payloadString(null, 'subject')).toBe('');
    expect(payloadString({}, 'missing')).toBe('');
  });
});

describe('isTemplated', () => {
  it('is true only when templated === true', () => {
    expect(isTemplated({ templated: true })).toBe(true);
    expect(isTemplated({ templated: false })).toBe(false);
    expect(isTemplated({})).toBe(false);
    expect(isTemplated(null)).toBe(false);
  });
});

describe('canBulkApprove', () => {
  const t = (id: string, action_type: string, templated: boolean) => ({
    id,
    action_type,
    payload: { templated },
  });

  it('requires at least two selections', () => {
    expect(canBulkApprove([]).ok).toBe(false);
    expect(canBulkApprove([t('1', 'send_email', true)]).ok).toBe(false);
  });

  it('rejects mixed action types', () => {
    const r = canBulkApprove([t('1', 'send_email', true), t('2', 'social_webhook', true)]);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/same action type/);
  });

  it('rejects when any row is not templated', () => {
    const r = canBulkApprove([t('1', 'send_email', true), t('2', 'send_email', false)]);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/templated/);
  });

  it('allows same-type, all-templated selections', () => {
    expect(canBulkApprove([t('1', 'send_email', true), t('2', 'send_email', true)]).ok).toBe(true);
  });
});

describe('applyEdits', () => {
  it('overwrites edited fields and preserves the rest', () => {
    const out = applyEdits({ subject: 'old', to: 'x@y.z' }, { subject: 'new' });
    expect(out.subject).toBe('new');
    expect(out.to).toBe('x@y.z');
  });

  it('mirrors a body edit into html when the draft used html', () => {
    const out = applyEdits({ html: '<p>old</p>', body: 'old' }, { body: 'new' });
    expect(out.body).toBe('new');
    expect(out.html).toBe('new');
  });

  it('does not invent an html field when the draft had none', () => {
    const out = applyEdits({ body: 'old' }, { body: 'new' });
    expect(out.html).toBeUndefined();
  });
});

describe('EDITABLE_FIELDS', () => {
  it('defines fields for each known action type', () => {
    expect(EDITABLE_FIELDS.send_email).toContain('subject');
    expect(EDITABLE_FIELDS.social_webhook).toContain('caption');
    expect(EDITABLE_FIELDS.github_issue).toContain('title');
  });
});
