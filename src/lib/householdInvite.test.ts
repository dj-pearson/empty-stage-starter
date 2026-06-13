import { describe, it, expect } from 'vitest';
import { buildInviteLink, parseInviteCode, inviteErrorMessage, JOIN_PATH } from './householdInvite';

describe('householdInvite helpers (US-337)', () => {
  it('buildInviteLink produces a /join?code= URL with a normalized code', () => {
    expect(buildInviteLink('abc123', 'https://tryeatpal.com')).toBe(
      'https://tryeatpal.com/join?code=ABC123',
    );
    expect(buildInviteLink('  xy z ', 'https://x.com')).toContain(`${JOIN_PATH}?code=XY%20Z`);
  });

  it('parseInviteCode extracts + normalizes the code (or null)', () => {
    expect(parseInviteCode('?code=abc123')).toBe('ABC123');
    expect(parseInviteCode('?code=%20zz%20')).toBe('ZZ');
    expect(parseInviteCode('?foo=bar')).toBeNull();
    expect(parseInviteCode('?code=')).toBeNull();
    expect(parseInviteCode('')).toBeNull();
  });

  it('inviteErrorMessage maps RPC errors to friendly copy', () => {
    expect(inviteErrorMessage({ message: 'Invite code is invalid or expired' })).toMatch(
      /invalid, expired, or already used/i,
    );
    expect(inviteErrorMessage({ message: 'Sign in required' })).toMatch(/sign in/i);
    expect(inviteErrorMessage(new Error('boom'))).toMatch(/could not join/i);
    expect(inviteErrorMessage(undefined)).toMatch(/could not join/i);
  });
});
