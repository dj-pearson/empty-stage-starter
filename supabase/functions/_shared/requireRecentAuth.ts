/**
 * Recent authentication for destructive requests (owner decision 1a,
 * 2026-09-25). First caller: delete-account.
 *
 * A valid JWT proves a session, not a person. An access token is refreshed
 * silently for as long as the refresh token lives, so a laptop left signed in
 * for a month can still delete the account. This asks for a sign-in within the
 * last RECENT_AUTH_MAX_AGE_SECONDS.
 *
 * WHEN DID THE USER LAST AUTHENTICATE. GoTrue puts an `amr` claim in every
 * access token: [{ method: 'password' | 'otp' | 'oauth' | ..., timestamp }].
 * A token refresh copies the session's amr entries forward with their
 * original timestamps, while `iat` moves to the refresh time. So amr is the
 * sign-in time and iat is only "this token was minted". The newest amr
 * timestamp is used; iat is the fallback only for a token with no usable amr,
 * which GoTrue does not issue today.
 *
 * WHO IS ASKED. Only the web client, identified the way ai-coach-chat does it:
 * `X-Client-Info: eatpal-web[/n]` (classifyCoachClient). Shipped iOS builds
 * call through EdgeFunctions.swift with no X-Client-Info and no way to
 * re-authenticate on demand, so they keep today's rule (a valid JWT). That is
 * a gap by construction: a caller that omits the header is treated as legacy.
 * It closes when a later iOS build sends a header and the legacy path is
 * retired; it is not a boundary an attacker holding a stolen token has to
 * cross today.
 *
 * Pure: no Deno globals, no network. Vitest mirror:
 * src/lib/requireRecentAuthShared.test.ts.
 */

import { classifyCoachClient, COACH_CLIENT_HEADER } from './aiCoachGate.ts';

/** How recent a web caller's sign-in must be. */
export const RECENT_AUTH_MAX_AGE_SECONDS = 10 * 60;

/** Tolerated clock difference between GoTrue and the function. */
export const RECENT_AUTH_CLOCK_SKEW_SECONDS = 60;

/** The refusal text. The web client matches on it (invokeEdgeFunction keeps only `error`). */
export const REAUTH_REQUIRED_MESSAGE = 'Please sign in again to confirm it is you.';

/** The code the web client reads to ask the user to sign in again. */
export const REAUTH_REQUIRED_CODE = 'reauth_required';

export interface ReauthRequiredBody {
  error: string;
  code: typeof REAUTH_REQUIRED_CODE;
  maxAgeSeconds: number;
}

export type RecentAuthDecision =
  | { ok: true; reason: 'legacy_client' | 'recent' }
  | { ok: false; status: 401; reason: 'stale' | 'unreadable'; body: ReauthRequiredBody };

/** The bearer token from an Authorization header, or null. */
export function bearerToken(authorization: string | null | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec((authorization ?? '').trim());
  return match ? match[1] : null;
}

function base64UrlDecode(segment: string): string | null {
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(Math.ceil(segment.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * The payload of a JWT, WITHOUT verifying it. Only call this on a token the
 * auth server has already accepted (auth.getUser succeeded for it).
 */
export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const json = base64UrlDecode(parts[1]);
  if (json === null) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Seconds since the epoch of the user's most recent sign-in, per the token. */
export function authenticatedAtSeconds(payload: Record<string, unknown> | null): number | null {
  if (!payload) return null;
  const amr = payload.amr;
  if (Array.isArray(amr)) {
    let newest: number | null = null;
    for (const entry of amr) {
      if (!entry || typeof entry !== 'object') continue;
      const ts = finiteNumber((entry as { timestamp?: unknown }).timestamp);
      if (ts !== null && (newest === null || ts > newest)) newest = ts;
    }
    if (newest !== null) return newest;
  }
  return finiteNumber(payload.iat);
}

/**
 * Whether this request may go ahead.
 *
 * `clientHeader` is the raw X-Client-Info value. `token` is the bearer token
 * the auth server has already accepted.
 */
export function decideRecentAuth(input: {
  clientHeader: string | null | undefined;
  token: string | null | undefined;
  nowSeconds: number;
  maxAgeSeconds?: number;
}): RecentAuthDecision {
  const maxAge = input.maxAgeSeconds ?? RECENT_AUTH_MAX_AGE_SECONDS;
  if (classifyCoachClient(input.clientHeader).kind === 'legacy') {
    return { ok: true, reason: 'legacy_client' };
  }

  const body: ReauthRequiredBody = {
    error: REAUTH_REQUIRED_MESSAGE,
    code: REAUTH_REQUIRED_CODE,
    maxAgeSeconds: maxAge,
  };
  const at = authenticatedAtSeconds(decodeJwtPayload(input.token));
  if (at === null) {
    return { ok: false, status: 401, reason: 'unreadable', body };
  }
  const age = input.nowSeconds - at;
  if (age > maxAge || age < -RECENT_AUTH_CLOCK_SKEW_SECONDS) {
    return { ok: false, status: 401, reason: 'stale', body };
  }
  return { ok: true, reason: 'recent' };
}

/** decideRecentAuth for a Request. */
export function decideRecentAuthForRequest(req: Request, nowSeconds: number): RecentAuthDecision {
  return decideRecentAuth({
    clientHeader: req.headers.get(COACH_CLIENT_HEADER),
    token: bearerToken(req.headers.get('authorization')),
    nowSeconds,
  });
}
