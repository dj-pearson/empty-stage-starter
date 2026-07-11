/**
 * Unit tests for the auth anomaly detectors (US-510).
 * Run with: `deno test functions/_shared/auth-anomaly-logic_test.ts`
 *
 * Synthetic fixtures exercise each detector at, below, and above its
 * threshold, plus the negative (benign traffic) case.
 */

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  detectCredentialStuffing,
  detectSignupBurst,
  detectGeoSwitch,
  detectAll,
  resolveThresholds,
  DEFAULT_THRESHOLDS,
  type AuthEvent,
} from './auth-anomaly-logic.ts';

const t = DEFAULT_THRESHOLDS;
const at = '2026-07-10T12:00:00Z';

const failure = (ip: string, account: string): AuthEvent => ({
  user_id: null,
  email: account,
  ip,
  country: null,
  event_type: 'login_failure',
  created_at: at,
});

Deno.test('credential stuffing: one IP many failures across many accounts is flagged', () => {
  const events: AuthEvent[] = [];
  for (let i = 0; i < 25; i++) events.push(failure('1.2.3.4', `victim${i % 8}@x.com`));
  const out = detectCredentialStuffing(events, t);
  assertEquals(out.length, 1);
  assertEquals(out[0].type, 'credential_stuffing');
  assertEquals(out[0].fingerprint, 'credential_stuffing:1.2.3.4');
  assertEquals(out[0].evidence.failures, 25);
  assertEquals(out[0].evidence.distinctAccounts, 8);
  assert(Array.isArray(out[0].evidence.sampleAccounts));
  assertEquals((out[0].evidence.sampleAccounts as string[]).length, 5);
});

Deno.test('credential stuffing: many failures but few accounts is NOT flagged', () => {
  // 30 failures from one IP but only 2 accounts — a single user fat-fingering,
  // not a spray. distinctAccounts (2) < credStuffAccounts (5).
  const events: AuthEvent[] = [];
  for (let i = 0; i < 30; i++) events.push(failure('9.9.9.9', `me${i % 2}@x.com`));
  assertEquals(detectCredentialStuffing(events, t).length, 0);
});

Deno.test('credential stuffing: enough accounts but few failures is NOT flagged', () => {
  const events: AuthEvent[] = [];
  for (let i = 0; i < 6; i++) events.push(failure('8.8.8.8', `u${i}@x.com`));
  assertEquals(detectCredentialStuffing(events, t).length, 0);
});

Deno.test('credential stuffing: success events do not count toward the failure total', () => {
  const events: AuthEvent[] = [];
  for (let i = 0; i < 8; i++) events.push(failure('7.7.7.7', `u${i}@x.com`));
  for (let i = 0; i < 30; i++) {
    events.push({ ...failure('7.7.7.7', `u${i}@x.com`), event_type: 'login_success' });
  }
  // Only 8 failures across 8 accounts → below the 20-failure threshold.
  assertEquals(detectCredentialStuffing(events, t).length, 0);
});

Deno.test('signup burst: a spike of signups is flagged once', () => {
  const events: AuthEvent[] = [];
  for (let i = 0; i < 30; i++) {
    events.push({ user_id: `u${i}`, email: `s${i}@x.com`, ip: `10.0.0.${i % 4}`, country: null, event_type: 'signup', created_at: at });
  }
  const out = detectSignupBurst(events, t);
  assertEquals(out.length, 1);
  assertEquals(out[0].fingerprint, 'signup_burst');
  assertEquals(out[0].evidence.count, 30);
  assertEquals((out[0].evidence.sampleIps as string[]).length, 4);
});

Deno.test('signup burst: normal signup volume is NOT flagged', () => {
  const events: AuthEvent[] = [];
  for (let i = 0; i < 5; i++) {
    events.push({ user_id: `u${i}`, email: `s${i}@x.com`, ip: '10.0.0.1', country: null, event_type: 'signup', created_at: at });
  }
  assertEquals(detectSignupBurst(events, t).length, 0);
});

Deno.test('geo switch: one account from several countries is flagged', () => {
  const events: AuthEvent[] = [
    { user_id: 'u1', email: 'a@x.com', ip: '1.1.1.1', country: 'US', event_type: 'login_success', created_at: at },
    { user_id: 'u1', email: 'a@x.com', ip: '2.2.2.2', country: 'RU', event_type: 'login_success', created_at: at },
    { user_id: 'u1', email: 'a@x.com', ip: '3.3.3.3', country: 'CN', event_type: 'login_failure', created_at: at },
  ];
  const out = detectGeoSwitch(events, t);
  assertEquals(out.length, 1);
  assertEquals(out[0].fingerprint, 'geo_switch:u1');
  assertEquals((out[0].evidence.countries as string[]).sort().join(','), 'CN,RU,US');
});

Deno.test('geo switch: one account one country is NOT flagged', () => {
  const events: AuthEvent[] = [
    { user_id: 'u1', email: 'a@x.com', ip: '1.1.1.1', country: 'US', event_type: 'login_success', created_at: at },
    { user_id: 'u1', email: 'a@x.com', ip: '1.1.1.2', country: 'US', event_type: 'login_success', created_at: at },
  ];
  assertEquals(detectGeoSwitch(events, t).length, 0);
});

Deno.test('geo switch: events with null country are ignored', () => {
  const events: AuthEvent[] = [
    { user_id: 'u1', email: 'a@x.com', ip: '1.1.1.1', country: null, event_type: 'login_success', created_at: at },
    { user_id: 'u1', email: 'a@x.com', ip: '2.2.2.2', country: null, event_type: 'login_success', created_at: at },
  ];
  assertEquals(detectGeoSwitch(events, t).length, 0);
});

Deno.test('resolveThresholds: falls back to defaults and honors overrides', () => {
  assertEquals(resolveThresholds(null), DEFAULT_THRESHOLDS);
  assertEquals(resolveThresholds({}), DEFAULT_THRESHOLDS);
  const custom = resolveThresholds({ anomaly_thresholds: { credStuffFailures: 5, signupBurst: 3 } });
  assertEquals(custom.credStuffFailures, 5);
  assertEquals(custom.signupBurst, 3);
  // Unset keys keep defaults; non-positive values are ignored.
  assertEquals(custom.credStuffAccounts, DEFAULT_THRESHOLDS.credStuffAccounts);
  assertEquals(resolveThresholds({ anomaly_thresholds: { credStuffFailures: 0 } }).credStuffFailures, DEFAULT_THRESHOLDS.credStuffFailures);
  assertEquals(resolveThresholds({ anomaly_thresholds: { credStuffFailures: -3 } }).credStuffFailures, DEFAULT_THRESHOLDS.credStuffFailures);
});

Deno.test('detectAll: combines detectors and stays quiet on benign traffic', () => {
  const benign: AuthEvent[] = [
    { user_id: 'u1', email: 'a@x.com', ip: '1.1.1.1', country: 'US', event_type: 'login_success', created_at: at },
    { user_id: 'u2', email: 'b@x.com', ip: '1.1.1.2', country: 'US', event_type: 'signup', created_at: at },
    failure('1.1.1.3', 'a@x.com'),
  ];
  assertEquals(detectAll(benign, t).length, 0);

  const noisy: AuthEvent[] = [];
  for (let i = 0; i < 25; i++) noisy.push(failure('5.5.5.5', `v${i % 6}@x.com`));
  for (let i = 0; i < 30; i++) noisy.push({ user_id: `s${i}`, email: `s${i}@x.com`, ip: '6.6.6.6', country: null, event_type: 'signup', created_at: at });
  const out = detectAll(noisy, t);
  assert(out.some((d) => d.type === 'credential_stuffing'));
  assert(out.some((d) => d.type === 'signup_burst'));
});
