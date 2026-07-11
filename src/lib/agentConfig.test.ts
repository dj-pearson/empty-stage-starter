import { describe, it, expect } from 'vitest';
import {
  isValidCron,
  validateCap,
  getAllowlist,
  toggleAllowlist,
  KNOWN_ACTION_TYPES,
} from './agentConfig';

describe('isValidCron', () => {
  it('accepts common valid expressions', () => {
    expect(isValidCron('*/15 * * * *')).toBe(true);
    expect(isValidCron('0 8 * * 1')).toBe(true);
    expect(isValidCron('0 0 1 1 *')).toBe(true);
    expect(isValidCron('1-30/2 0 * * 1-5')).toBe(true);
    expect(isValidCron('0,15,30,45 * * * *')).toBe(true);
  });

  it('rejects wrong field counts and empties', () => {
    expect(isValidCron('')).toBe(false);
    expect(isValidCron('* * * *')).toBe(false);
    expect(isValidCron('* * * * * *')).toBe(false);
  });

  it('rejects out-of-range values', () => {
    expect(isValidCron('60 * * * *')).toBe(false); // minute max 59
    expect(isValidCron('* 24 * * *')).toBe(false); // hour max 23
    expect(isValidCron('* * 0 * *')).toBe(false); // dom min 1
    expect(isValidCron('* * * 13 *')).toBe(false); // month max 12
    expect(isValidCron('* * * * 7')).toBe(false); // dow max 6
  });

  it('rejects malformed terms', () => {
    expect(isValidCron('*/0 * * * *')).toBe(false); // zero step
    expect(isValidCron('5-1 * * * *')).toBe(false); // inverted range
    expect(isValidCron('abc * * * *')).toBe(false);
    expect(isValidCron('1//2 * * * *')).toBe(false);
  });
});

describe('validateCap', () => {
  it('accepts non-negative numbers', () => {
    expect(validateCap('5')).toEqual({ ok: true, value: 5 });
    expect(validateCap('0')).toEqual({ ok: true, value: 0 });
    expect(validateCap(2.5)).toEqual({ ok: true, value: 2.5 });
  });

  it('rejects negatives, blanks, and non-numbers', () => {
    expect(validateCap('-1').ok).toBe(false);
    expect(validateCap('-1').error).toBe('negative');
    expect(validateCap('').ok).toBe(false);
    expect(validateCap('abc').ok).toBe(false);
  });
});

describe('allowlist helpers', () => {
  it('reads autoExecute list defensively', () => {
    expect(getAllowlist(null)).toEqual([]);
    expect(getAllowlist({})).toEqual([]);
    expect(getAllowlist({ autoExecute: ['send_email', 42, 'blog_post'] })).toEqual(['send_email', 'blog_post']);
  });

  it('toggles an action type on and off, preserving other keys', () => {
    const p1 = toggleAllowlist({ maxPerDay: 3 }, 'send_email', true);
    expect(p1).toEqual({ maxPerDay: 3, autoExecute: ['send_email'] });
    const p2 = toggleAllowlist(p1, 'blog_post', true);
    expect(p2.autoExecute).toEqual(['blog_post', 'send_email']); // sorted
    const p3 = toggleAllowlist(p2, 'send_email', false);
    expect(p3.autoExecute).toEqual(['blog_post']);
    expect(p3.maxPerDay).toBe(3);
  });

  it('every known action type is a non-empty string', () => {
    expect(KNOWN_ACTION_TYPES.length).toBeGreaterThan(0);
    for (const a of KNOWN_ACTION_TYPES) expect(typeof a).toBe('string');
  });
});
