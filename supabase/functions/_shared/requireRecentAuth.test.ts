// Deno tests for the recent-authentication rule on destructive requests
// (owner decision 1a). Run with:
//   deno test supabase/functions/_shared/requireRecentAuth.test.ts
// Vitest mirror: src/lib/requireRecentAuthShared.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  authenticatedAtSeconds,
  bearerToken,
  decideRecentAuth,
  decideRecentAuthForRequest,
  decodeJwtPayload,
  REAUTH_REQUIRED_CODE,
  RECENT_AUTH_MAX_AGE_SECONDS,
} from './requireRecentAuth.ts';

const NOW = 1_790_000_000;

/** base64url of the UTF-8 bytes, which is how a real JWT is encoded. */
function b64url(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jwt(payload: Record<string, unknown>): string {
  return `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify(payload))}.sig`;
}

Deno.test('a web caller who signed in five minutes ago may proceed', () => {
  const token = jwt({ iat: NOW - 60, amr: [{ method: 'password', timestamp: NOW - 300 }] });
  assertEquals(decideRecentAuth({ clientHeader: 'eatpal-web/1', token, nowSeconds: NOW }), {
    ok: true,
    reason: 'recent',
  });
});

Deno.test('a refreshed token does not count as a fresh sign-in', () => {
  // iat is one minute old (a silent refresh) but the sign-in was a day ago.
  const token = jwt({ iat: NOW - 60, amr: [{ method: 'password', timestamp: NOW - 86_400 }] });
  const decision = decideRecentAuth({ clientHeader: 'eatpal-web', token, nowSeconds: NOW });
  assertEquals(decision.ok, false);
  if (!decision.ok) {
    assertEquals(decision.status, 401);
    assertEquals(decision.reason, 'stale');
    assertEquals(decision.body.code, REAUTH_REQUIRED_CODE);
    assertEquals(decision.body.maxAgeSeconds, RECENT_AUTH_MAX_AGE_SECONDS);
  }
});

Deno.test('the newest amr entry wins, and the limit is ten minutes', () => {
  const payload = { amr: [{ method: 'oauth', timestamp: NOW - 5000 }, { method: 'otp', timestamp: NOW - 600 }] };
  assertEquals(authenticatedAtSeconds(payload), NOW - 600);
  assertEquals(decideRecentAuth({ clientHeader: 'eatpal-web/1', token: jwt(payload), nowSeconds: NOW }).ok, true);
  assertEquals(decideRecentAuth({ clientHeader: 'eatpal-web/1', token: jwt(payload), nowSeconds: NOW + 1 }).ok, false);
});

Deno.test('iat is the fallback only when amr has no timestamp', () => {
  assertEquals(authenticatedAtSeconds({ iat: NOW - 10 }), NOW - 10);
  assertEquals(authenticatedAtSeconds({ iat: NOW - 10, amr: [{ method: 'password' }] }), NOW - 10);
  assertEquals(authenticatedAtSeconds({}), null);
});

Deno.test('shipped iOS builds keep the valid-JWT rule', () => {
  const stale = jwt({ iat: NOW - 86_400, amr: [{ method: 'password', timestamp: NOW - 86_400 }] });
  for (const header of [null, undefined, '', 'supabase-js-web/2.57.0', 'eatpal-webby']) {
    assertEquals(decideRecentAuth({ clientHeader: header, token: stale, nowSeconds: NOW }), {
      ok: true,
      reason: 'legacy_client',
    });
  }
});

Deno.test('a web token that cannot be read fails closed', () => {
  for (const token of [null, '', 'not-a-jwt', 'a.b.c', `x.${b64url('[1,2]')}.y`]) {
    const decision = decideRecentAuth({ clientHeader: 'eatpal-web/1', token, nowSeconds: NOW });
    assertEquals(decision.ok, false);
    if (!decision.ok) assertEquals(decision.reason, 'unreadable');
  }
});

Deno.test('a sign-in time far in the future is refused, small skew is not', () => {
  const skewed = jwt({ amr: [{ method: 'password', timestamp: NOW + 30 }] });
  assertEquals(decideRecentAuth({ clientHeader: 'eatpal-web/1', token: skewed, nowSeconds: NOW }).ok, true);
  const future = jwt({ amr: [{ method: 'password', timestamp: NOW + 3600 }] });
  assertEquals(decideRecentAuth({ clientHeader: 'eatpal-web/1', token: future, nowSeconds: NOW }).ok, false);
});

Deno.test('reads the headers off a Request', () => {
  const fresh = jwt({ amr: [{ method: 'password', timestamp: NOW - 5 }] });
  const stale = jwt({ amr: [{ method: 'password', timestamp: NOW - 5000 }] });
  const web = (token: string) =>
    new Request('https://x.test', { headers: { authorization: `Bearer ${token}`, 'X-Client-Info': 'eatpal-web/1' } });
  assertEquals(decideRecentAuthForRequest(web(fresh), NOW).ok, true);
  assertEquals(decideRecentAuthForRequest(web(stale), NOW).ok, false);
  const ios = new Request('https://x.test', { headers: { authorization: `Bearer ${stale}` } });
  assertEquals(decideRecentAuthForRequest(ios, NOW).ok, true);
});

Deno.test('bearerToken and decodeJwtPayload', () => {
  assertEquals(bearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assertEquals(bearerToken('bearer   abc'), 'abc');
  assertEquals(bearerToken('Basic abc'), null);
  assertEquals(bearerToken(null), null);
  assertEquals(decodeJwtPayload(jwt({ sub: 'u1', name: 'Zo\u00eb' })), { sub: 'u1', name: 'Zo\u00eb' });
});
