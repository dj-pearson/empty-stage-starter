import { describe, it, expect, vi } from 'vitest';
import {
  checkRateLimit,
  checkIpRateLimit,
  enforceRateLimit,
  computeRetryAfter,
  decodedBase64Bytes,
  assertImageWithinLimit,
  capText,
  getClientIp,
  MAX_IMAGE_BYTES,
  MAX_PROMPT_TEXT_LENGTH,
  RATE_LIMITS,
  type RateLimitRow,
  type RateLimitConfig,
} from '../../../functions/_shared/rate-limit';

/**
 * US-325: every expensive AI/LLM edge function must be gated by per-user (and
 * per-IP) rate limits + payload-size caps so one authenticated user cannot run
 * up unbounded AI spend or DoS the vision endpoints. These tests cover the
 * shared helpers in functions/_shared/rate-limit.ts.
 */

const CONFIG: RateLimitConfig = { endpoint: 'test-endpoint', maxRequests: 5, windowMinutes: 60 };

/**
 * Minimal supabase-client mock. The real client's `.rpc()` resolves to
 * `{ data, error }`; this dispatches on the argument names to mirror the two
 * `check_rate_limit` overloads (per-user TABLE vs per-IP BOOLEAN).
 */
function mockClient(opts: {
  userRow?: Partial<RateLimitRow> | null;
  userAsScalar?: boolean;
  userError?: unknown;
  userThrows?: boolean;
  ipAllowed?: boolean;
  ipError?: unknown;
} = {}) {
  return {
    rpc(_fn: string, args: Record<string, unknown>) {
      // Per-IP overload (TEXT identifier) -> BOOLEAN
      if ('p_identifier' in args) {
        if (opts.ipError) return Promise.resolve({ data: null, error: opts.ipError });
        return Promise.resolve({ data: opts.ipAllowed ?? true, error: null });
      }
      // Per-user overload (UUID) -> TABLE rows
      if (opts.userThrows) {
        return Promise.reject(new Error('connection lost'));
      }
      if (opts.userError) {
        return Promise.resolve({ data: null, error: opts.userError });
      }
      const row =
        opts.userRow === undefined
          ? { allowed: true, current_count: 1, limit_exceeded: false, reset_at: '' }
          : opts.userRow;
      const data = row == null ? null : opts.userAsScalar ? row : [row];
      return Promise.resolve({ data, error: null });
    },
  };
}

describe('checkRateLimit (per-user)', () => {
  it('allows when the RPC reports allowed and not exceeded', async () => {
    const c = mockClient({ userRow: { allowed: true, current_count: 2, limit_exceeded: false, reset_at: '' } });
    const d = await checkRateLimit(c, 'user-1', CONFIG);
    expect(d.allowed).toBe(true);
    expect(d.retryAfterSeconds).toBe(0);
    expect(d.currentCount).toBe(2);
    expect(d.limit).toBe(5);
  });

  it('denies when limit_exceeded is true and sets a positive Retry-After', async () => {
    const c = mockClient({ userRow: { allowed: false, current_count: 6, limit_exceeded: true, reset_at: '' } });
    const d = await checkRateLimit(c, 'user-1', CONFIG);
    expect(d.allowed).toBe(false);
    expect(d.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('fails OPEN when the RPC returns an error (infra not deployed yet)', async () => {
    const c = mockClient({ userError: { message: 'function check_rate_limit does not exist' } });
    const d = await checkRateLimit(c, 'user-1', CONFIG);
    expect(d.allowed).toBe(true);
  });

  it('fails OPEN when the RPC throws', async () => {
    const c = mockClient({ userThrows: true });
    const d = await checkRateLimit(c, 'user-1', CONFIG);
    expect(d.allowed).toBe(true);
  });

  it('handles a scalar (non-array) row shape', async () => {
    const c = mockClient({
      userAsScalar: true,
      userRow: { allowed: false, current_count: 9, limit_exceeded: true, reset_at: '' },
    });
    const d = await checkRateLimit(c, 'user-1', CONFIG);
    expect(d.allowed).toBe(false);
  });

  it('fails OPEN when no row comes back', async () => {
    const c = mockClient({ userRow: null });
    const d = await checkRateLimit(c, 'user-1', CONFIG);
    expect(d.allowed).toBe(true);
  });
});

describe('checkIpRateLimit (per-IP)', () => {
  it('returns true when the BOOLEAN overload returns true', async () => {
    expect(await checkIpRateLimit(mockClient({ ipAllowed: true }), '1.2.3.4', CONFIG)).toBe(true);
  });
  it('returns false when the BOOLEAN overload returns false', async () => {
    expect(await checkIpRateLimit(mockClient({ ipAllowed: false }), '1.2.3.4', CONFIG)).toBe(false);
  });
  it('fails OPEN (true) on infra error', async () => {
    expect(await checkIpRateLimit(mockClient({ ipError: { message: 'boom' } }), '1.2.3.4', CONFIG)).toBe(true);
  });
});

describe('enforceRateLimit', () => {
  it('returns null when allowed', async () => {
    const c = mockClient({ userRow: { allowed: true, current_count: 1, limit_exceeded: false, reset_at: '' } });
    const res = await enforceRateLimit(c, { userId: 'u1' }, CONFIG);
    expect(res).toBeNull();
  });

  it('returns 429 with Retry-After when the per-user limit is exceeded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = mockClient({ userRow: { allowed: false, current_count: 6, limit_exceeded: true, reset_at: '' } });
    const res = await enforceRateLimit(c, { userId: 'u1', clientIp: '1.2.3.4' }, CONFIG, {
      'Access-Control-Allow-Origin': 'https://tryeatpal.com',
    });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get('Retry-After')).toBeTruthy();
    // CORS headers propagate so the browser can read the 429.
    expect(res!.headers.get('Access-Control-Allow-Origin')).toBe('https://tryeatpal.com');
    const body = await res!.json();
    expect(body.retryAfter).toBeGreaterThan(0);
    warn.mockRestore();
  });

  it('returns 429 when the per-user check passes but the per-IP limit is exceeded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = mockClient({
      userRow: { allowed: true, current_count: 1, limit_exceeded: false, reset_at: '' },
      ipAllowed: false,
    });
    const res = await enforceRateLimit(c, { userId: 'u1', clientIp: '9.9.9.9' }, CONFIG);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    warn.mockRestore();
  });

  it('passes through when both per-user and per-IP allow', async () => {
    const c = mockClient({
      userRow: { allowed: true, current_count: 1, limit_exceeded: false, reset_at: '' },
      ipAllowed: true,
    });
    const res = await enforceRateLimit(c, { userId: 'u1', clientIp: '9.9.9.9' }, CONFIG);
    expect(res).toBeNull();
  });
});

describe('computeRetryAfter', () => {
  const now = 1_700_000_000_000;
  it('derives seconds from reset_at when in the future', () => {
    const resetAt = new Date(now + 30_000).toISOString();
    expect(computeRetryAfter(resetAt, 60, now)).toBe(30);
  });
  it('falls back to the full window when reset_at is empty/unparseable', () => {
    expect(computeRetryAfter('', 60, now)).toBe(3600);
    expect(computeRetryAfter('not-a-date', 15, now)).toBe(900);
  });
  it('clamps to the window when reset_at is implausibly far out', () => {
    const resetAt = new Date(now + 999_999_000).toISOString();
    expect(computeRetryAfter(resetAt, 60, now)).toBe(3600);
  });
});

describe('decodedBase64Bytes + assertImageWithinLimit', () => {
  it('computes decoded byte length (with padding)', () => {
    // "hello" -> "aGVsbG8=" (5 bytes)
    expect(decodedBase64Bytes('aGVsbG8=')).toBe(5);
    // "hi" -> "aGk=" (2 bytes)
    expect(decodedBase64Bytes('aGk=')).toBe(2);
  });
  it('strips a data: URL prefix and embedded whitespace', () => {
    expect(decodedBase64Bytes('data:image/png;base64,aGVsbG8=')).toBe(5);
    expect(decodedBase64Bytes('aGVs\nbG8=')).toBe(5);
  });
  it('returns 0 for non-strings / empty', () => {
    expect(decodedBase64Bytes(undefined)).toBe(0);
    expect(decodedBase64Bytes('')).toBe(0);
    expect(decodedBase64Bytes(12345 as unknown)).toBe(0);
  });
  it('allows an image under the limit', () => {
    expect(assertImageWithinLimit('aGVsbG8=', {})).toBeNull();
  });
  it('rejects an image over the limit with 413', () => {
    // Build a base64 string that decodes to > maxBytes using a tiny custom max.
    const res = assertImageWithinLimit('aGVsbG8=', { 'X-Test': '1' }, 2);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(413);
    expect(res!.headers.get('X-Test')).toBe('1');
  });
  it('default max is 5MB', () => {
    expect(MAX_IMAGE_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe('capText', () => {
  it('truncates over-long text', () => {
    const long = 'x'.repeat(MAX_PROMPT_TEXT_LENGTH + 100);
    expect(capText(long).length).toBe(MAX_PROMPT_TEXT_LENGTH);
  });
  it('passes through short text unchanged', () => {
    expect(capText('hello')).toBe('hello');
  });
  it('respects a custom max', () => {
    expect(capText('abcdef', 3)).toBe('abc');
  });
  it('returns empty string for non-strings', () => {
    expect(capText(undefined)).toBe('');
    expect(capText({ a: 1 })).toBe('');
  });
});

describe('getClientIp', () => {
  function reqWith(headers: Record<string, string>) {
    const map = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return { headers: { get: (n: string) => map.get(n.toLowerCase()) ?? null } };
  }
  it('uses the first x-forwarded-for hop', () => {
    expect(getClientIp(reqWith({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('1.1.1.1');
  });
  it('falls back to cf-connecting-ip', () => {
    expect(getClientIp(reqWith({ 'cf-connecting-ip': '3.3.3.3' }))).toBe('3.3.3.3');
  });
  it('falls back to x-real-ip', () => {
    expect(getClientIp(reqWith({ 'x-real-ip': '4.4.4.4' }))).toBe('4.4.4.4');
  });
  it('returns null when no IP header is present', () => {
    expect(getClientIp(reqWith({}))).toBeNull();
  });
});

describe('RATE_LIMITS config', () => {
  it('covers every US-325 AI/LLM endpoint', () => {
    for (const ep of [
      'ai-meal-plan',
      'suggest-foods',
      'suggest-recipe',
      'tonight-mode',
      'parse-grocery-image',
      'parse-receipt-image',
      'identify-product',
      'generate-social-content',
    ]) {
      expect(RATE_LIMITS[ep]).toBeDefined();
      expect(RATE_LIMITS[ep].endpoint).toBe(ep);
      expect(RATE_LIMITS[ep].maxRequests).toBeGreaterThan(0);
    }
  });
});
