import { describe, it, expect } from 'vitest';
import {
  buildInviteLink,
  parseInviteCode,
  inviteErrorMessage,
  JOIN_PATH,
  HOUSEHOLD_FULL_MESSAGE,
} from './householdInvite';
import { OFFLINE_MESSAGE } from './networkFailure';

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

  it('inviteErrorMessage tells a joiner a full household needs the inviter to upgrade (US-840)', () => {
    const msg = inviteErrorMessage({
      message: 'This household is full. Upgrade to Family Plus to add more caregivers.',
    });
    expect(msg).toBe(HOUSEHOLD_FULL_MESSAGE);
    expect(msg).toBe(
      'This household is full on its current plan. Ask the person who invited you to upgrade, then use the same link again.',
    );
  });

  it('inviteErrorMessage says offline instead of blaming the link', () => {
    expect(inviteErrorMessage({ name: 'TypeError', message: 'Failed to fetch' })).toBe(OFFLINE_MESSAGE);
    // A server answer is never offline, whatever its text.
    expect(inviteErrorMessage({ status: 500, message: 'Failed to fetch' })).toMatch(/could not join/i);
  });
});
