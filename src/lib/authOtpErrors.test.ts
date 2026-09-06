import { describe, it, expect } from 'vitest';
import {
  classifyOtpError,
  isUnconfirmedEmailError,
  otpFailureMessageKey,
} from './authOtpErrors';
import en from '@/i18n/locales/en.json';

/**
 * US-702 AC 2. The reason this classifier exists is that GoTrue words a wrong
 * code and an expired code identically, so the message alone cannot be trusted
 * to pick the remedy. These cases pin the shapes actually observed from a
 * self-hosted GoTrue, not invented ones.
 */
describe('classifyOtpError', () => {
  it('reads the error code in preference to the message', () => {
    // The message here is the ambiguous one; only the code separates the cases.
    expect(
      classifyOtpError({ code: 'otp_expired', message: 'Token has expired or is invalid' }),
    ).toBe('expired');
  });

  it('falls back to the message when a GoTrue build sends no code', () => {
    expect(classifyOtpError({ message: 'Token has expired or is invalid' })).toBe('expired');
    expect(classifyOtpError({ message: 'Invalid token' })).toBe('invalid');
  });

  it('treats an already-verified address as its own outcome, not an expiry', () => {
    // GoTrue words a spent token as "invalid or has expired", which would send
    // a user who is already verified round the resend loop for ever.
    expect(
      classifyOtpError({ message: 'User already confirmed. Email link is invalid or has expired' }),
    ).toBe('already_confirmed');
  });

  it('recognises throttling from the code, the status and the message', () => {
    expect(classifyOtpError({ code: 'over_email_send_rate_limit' })).toBe('rate_limited');
    expect(classifyOtpError({ status: 429, message: 'nope' })).toBe('rate_limited');
    expect(classifyOtpError({ message: 'For security purposes, rate limit exceeded' })).toBe(
      'rate_limited',
    );
  });

  it('returns unknown rather than guessing', () => {
    expect(classifyOtpError(null)).toBe('unknown');
    expect(classifyOtpError({})).toBe('unknown');
    expect(classifyOtpError({ message: 'Database error saving new user' })).toBe('unknown');
  });
});

describe('isUnconfirmedEmailError', () => {
  it('matches the code and the message form', () => {
    expect(isUnconfirmedEmailError({ code: 'email_not_confirmed' })).toBe(true);
    expect(isUnconfirmedEmailError({ message: 'Email not confirmed' })).toBe(true);
  });

  it('does not fire on a wrong password', () => {
    expect(isUnconfirmedEmailError({ message: 'Invalid login credentials' })).toBe(false);
    expect(isUnconfirmedEmailError(null)).toBe(false);
  });
});

describe('otpFailureMessageKey', () => {
  /**
   * A key that resolves to nothing renders as the raw dotted key on screen,
   * which is worse than the raw Supabase string this story set out to replace.
   */
  it('names a key that exists in the auth namespace', () => {
    const outcomes = ['expired', 'invalid', 'already_confirmed', 'rate_limited', 'unknown'] as const;
    for (const outcome of outcomes) {
      const key = otpFailureMessageKey(outcome);
      expect(key.startsWith('auth.')).toBe(true);
      const leaf = key.slice('auth.'.length);
      expect(Object.keys(en.auth)).toContain(leaf);
      expect((en.auth as Record<string, string>)[leaf].length).toBeGreaterThan(10);
    }
  });

  it('gives expired and invalid different copy, since that is the whole point', () => {
    expect(otpFailureMessageKey('expired')).not.toBe(otpFailureMessageKey('invalid'));
  });
});
