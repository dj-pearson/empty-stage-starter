import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildInviteLink, parseInviteCode, inviteErrorMessage } from '@/lib/householdInvite';

/**
 * One invite link, two clients (US-851).
 *
 * A parent mints a code in one place and pastes it into a text message. The
 * recipient taps it on whatever they happen to be holding. So the two
 * implementations have to agree on what the link looks like, how the code is
 * normalised before it reaches `accept_household_invite`, and what a failure
 * is called -- and the Swift suite cannot see this file any more than this one
 * can compile Swift.
 *
 * Same arrangement as `onboardingCopyParity.test.ts`: the web suite is the
 * only place that sees both trees.
 */

const ROOT = path.resolve(__dirname, '..', '..');

const SWIFT = readFileSync(
  path.join(ROOT, 'ios', 'EatPal', 'EatPal', 'Utilities', 'HouseholdInviteLink.swift'),
  'utf8',
);
const HANDLER = readFileSync(
  path.join(ROOT, 'ios', 'EatPal', 'EatPal', 'Utilities', 'DeepLinkHandler.swift'),
  'utf8',
);
const APP_STATE = readFileSync(
  path.join(ROOT, 'ios', 'EatPal', 'EatPal', 'App', 'AppState.swift'),
  'utf8',
);

describe('invite link parity (US-851)', () => {
  it('agrees on the path', () => {
    expect(buildInviteLink('abc123', 'https://tryeatpal.com')).toBe(
      'https://tryeatpal.com/join?code=ABC123',
    );
    expect(SWIFT).toContain('static let joinPath = "/join"');
  });

  it('normalises a code the same way on both clients', () => {
    // The RPC compares it uppercased, so a code typed in lower case or pasted
    // with a trailing space is the same invite. If one client trimmed and the
    // other did not, half the taps would report an invalid code.
    expect(parseInviteCode('?code=  abc123  ')).toBe('ABC123');
    expect(parseInviteCode('?code=')).toBeNull();
    expect(parseInviteCode('')).toBeNull();

    expect(SWIFT).toContain('trimmingCharacters(in: .whitespacesAndNewlines).uppercased()');
    expect(SWIFT, 'an empty code would reach the RPC as ""').toContain(
      'return code.isEmpty ? nil : code',
    );
  });

  it('matches on the same two error strings the RPC raises', () => {
    // These come from migration 20260426000001's RAISE statements. A client
    // matching on different words falls through to the generic message and
    // tells a parent to "check the link" when the real answer is "sign in".
    expect(inviteErrorMessage({ message: 'Invite code is invalid or expired' })).toBe(
      'This invite link is invalid, expired, or already used.',
    );
    expect(inviteErrorMessage({ message: 'Sign in required' })).toBe(
      'Please sign in to accept this invite.',
    );

    expect(SWIFT).toContain('message.contains("invalid or expired")');
    expect(SWIFT).toContain('message.contains("sign in")');
    expect(SWIFT).toContain('"This invite link is invalid, expired, or already used."');
    expect(SWIFT).toContain('"Please sign in to accept this invite."');
  });

  it('routes the link and parks the code', () => {
    // AC1 and AC2. Parking is what makes a tap from a signed-out phone work:
    // the web lets ?code= ride through its /auth redirect, and the app has no
    // redirect to ride.
    expect(HANDLER).toContain('case "join":');
    expect(HANDLER).toContain('HouseholdInviteLink.parseCode(from: url)');
    expect(HANDLER).toContain('HouseholdInviteLink.storePending(code: code)');
  });

  it('resumes through the same RPC the household screen already calls', () => {
    // AC1 and AC4. Not a second acceptance path -- accept_household_invite is
    // the one the web route and HouseholdSettingsView both use.
    expect(APP_STATE).toContain('func drainPendingHouseholdInvite() async');
    expect(APP_STATE).toContain('HouseholdService.acceptInvite(code: code)');
  });

  it('accepts the invite before loading, not after', () => {
    // The membership decides which rows RLS returns. Joining after the fetches
    // would load the old household's data and need a second full load to
    // correct itself -- a visible flash of the wrong family's week.
    const start = APP_STATE.indexOf('func loadAllData(');
    expect(start, 'loadAllData not found').toBeGreaterThan(-1);
    const body = APP_STATE.slice(start, APP_STATE.indexOf('\n    }', start));

    const drain = body.indexOf('drainPendingHouseholdInvite()');
    const firstFetch = body.indexOf('dataService.fetchFoods()');
    expect(drain, 'loadAllData does not drain a pending invite').toBeGreaterThan(-1);
    expect(drain).toBeLessThan(firstFetch);
  });

  it('clears the code before sending it, so a bad one cannot loop', () => {
    // The RPC raises on an expired or already-used code. A code that stayed
    // parked would retry a doomed join on every launch and show the same
    // error with no way to dismiss it.
    expect(SWIFT).toContain('static func takePending() -> String?');
    const start = SWIFT.indexOf('static func takePending()');
    const body = SWIFT.slice(start, SWIFT.indexOf('\n    }', start));
    expect(body).toContain('clearPending()');
    expect(APP_STATE).toContain('HouseholdInviteLink.takePending()');
  });
});
