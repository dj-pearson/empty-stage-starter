/**
 * Rate limiting + payload/text-size guards for expensive AI/LLM edge functions
 * (US-325).
 *
 * Every expensive AI call must be gated so a single authenticated user (or a
 * single source IP) cannot run up unbounded OpenAI/Anthropic spend or exhaust
 * quota. This module reuses the existing server-side rate-limiting infra:
 *
 *   - per-user:  check_rate_limit(p_user_id, p_endpoint, p_max_requests, p_window_minutes)
 *                -> TABLE(allowed, current_count, limit_exceeded, reset_at)
 *                (supabase/migrations/20251010230000_rate_limiting_system.sql)
 *   - per-IP:    check_rate_limit(p_identifier, p_action, p_max_attempts, p_window_seconds)
 *                -> BOOLEAN  (TRUE = allowed)
 *                (supabase/migrations/20260223000000_rate_limiting.sql)
 *
 * PostgREST disambiguates the two `check_rate_limit` overloads by argument name.
 *
 * This module is intentionally free of Deno URL imports so its logic can be
 * unit-tested under vitest with a mocked client (see
 * src/test/security/ai-rate-limit.test.ts). The supabase client is injected and
 * typed with a minimal structural interface.
 *
 * Fail-open policy: if the limiter infra (table/RPC) is unavailable — e.g. the
 * rate-limiting migrations have not yet been applied to the target DB (the
 * US-323 prod-deploy gap) — the request is ALLOWED and the failure logged.
 * Blocking every AI call on a missing RPC would be a worse outage than briefly
 * not enforcing a limit. A *definitive* "limit exceeded" still returns 429.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const DEFAULT_WINDOW_MINUTES = 60;

// ---------------------------------------------------------------------------
// Structural client type (the real supabase-js client satisfies this at runtime)
// ---------------------------------------------------------------------------

export interface RateLimitRow {
  allowed: boolean;
  current_count: number;
  limit_exceeded: boolean;
  reset_at: string;
}

export interface RateLimitClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: RateLimitRow[] | RateLimitRow | boolean | null; error: unknown }>;
}

// ---------------------------------------------------------------------------
// Per-function limits (single source of truth — documented in SECURITY.md)
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  endpoint: string;
  /** Max requests per user per window. */
  maxRequests: number;
  /** Window length in minutes (default 60). */
  windowMinutes?: number;
}

/**
 * Free-tier per-user hourly caps for each expensive AI/LLM endpoint. Tuned to be
 * generous for real use yet bound worst-case spend. Vision endpoints are the
 * most expensive (OpenAI vision at detail:'high'), so they get the tightest caps.
 */
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'ai-meal-plan': { endpoint: 'ai-meal-plan', maxRequests: 20, windowMinutes: 60 },
  'suggest-foods': { endpoint: 'suggest-foods', maxRequests: 30, windowMinutes: 60 },
  'suggest-recipe': { endpoint: 'suggest-recipe', maxRequests: 30, windowMinutes: 60 },
  'tonight-mode': { endpoint: 'tonight-mode', maxRequests: 30, windowMinutes: 60 },
  'parse-grocery-image': { endpoint: 'parse-grocery-image', maxRequests: 20, windowMinutes: 60 },
  'parse-receipt-image': { endpoint: 'parse-receipt-image', maxRequests: 20, windowMinutes: 60 },
  'identify-product': { endpoint: 'identify-product', maxRequests: 30, windowMinutes: 60 },
  'generate-social-content': {
    endpoint: 'generate-social-content',
    maxRequests: 20,
    windowMinutes: 60,
  },
  'generate-blog-content': {
    endpoint: 'generate-blog-content',
    maxRequests: 20,
    windowMinutes: 60,
  },
};

/**
 * Per-IP cap = this multiple of the per-user cap. Looser than the per-user limit
 * because many users legitimately share an egress IP (NAT, corporate, mobile
 * carrier), but still bounds a single host spinning up throwaway accounts.
 */
const IP_LIMIT_MULTIPLIER = 4;

// ---------------------------------------------------------------------------
// Retry-After computation
// ---------------------------------------------------------------------------

/**
 * Seconds until the window resets. Derives from `reset_at` when parseable,
 * otherwise falls back to the full window. `now` is injectable for deterministic
 * tests.
 */
export function computeRetryAfter(
  resetAt: string | null | undefined,
  windowMinutes: number,
  now: number = Date.now(),
): number {
  const windowSeconds = Math.max(1, Math.round(windowMinutes * 60));
  if (typeof resetAt === 'string') {
    const reset = new Date(resetAt).getTime();
    if (!Number.isNaN(reset)) {
      const seconds = Math.ceil((reset - now) / 1000);
      if (seconds > 0) return Math.min(seconds, windowSeconds);
    }
  }
  return windowSeconds;
}

// ---------------------------------------------------------------------------
// Per-user rate limit
// ---------------------------------------------------------------------------

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  currentCount: number;
  limit: number;
}

/**
 * Checks (and records) one request against the per-user limit. Fails open on any
 * infra error (see module header).
 */
export async function checkRateLimit(
  supabase: RateLimitClient,
  userId: string,
  config: RateLimitConfig,
): Promise<RateLimitDecision> {
  const windowMinutes = config.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  const allowOpen: RateLimitDecision = {
    allowed: true,
    retryAfterSeconds: 0,
    currentCount: 0,
    limit: config.maxRequests,
  };

  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_user_id: userId,
      p_endpoint: config.endpoint,
      p_max_requests: config.maxRequests,
      p_window_minutes: windowMinutes,
    });

    if (error) {
      console.warn('[rate-limit] per-user check failed (allowing):', config.endpoint, error);
      return allowOpen;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row === 'boolean') return allowOpen;

    const allowed = row.allowed === true && row.limit_exceeded !== true;
    return {
      allowed,
      retryAfterSeconds: allowed ? 0 : computeRetryAfter(row.reset_at, windowMinutes),
      currentCount: typeof row.current_count === 'number' ? row.current_count : 0,
      limit: config.maxRequests,
    };
  } catch (err) {
    console.warn('[rate-limit] per-user check threw (allowing):', config.endpoint, err);
    return allowOpen;
  }
}

/**
 * Checks one request against the per-IP limit using the TEXT-identifier overload.
 * Fails open on infra error. Returns `true` when allowed.
 */
export async function checkIpRateLimit(
  supabase: RateLimitClient,
  ip: string,
  config: RateLimitConfig,
): Promise<boolean> {
  const windowMinutes = config.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_identifier: ip,
      p_action: `ai:${config.endpoint}`,
      p_max_attempts: config.maxRequests * IP_LIMIT_MULTIPLIER,
      p_window_seconds: Math.round(windowMinutes * 60),
    });
    if (error) {
      console.warn('[rate-limit] per-IP check failed (allowing):', config.endpoint, error);
      return true;
    }
    // The BOOLEAN overload returns TRUE when allowed. Treat anything non-false as allowed (fail open).
    return data !== false;
  } catch (err) {
    console.warn('[rate-limit] per-IP check threw (allowing):', config.endpoint, err);
    return true;
  }
}

export interface RequestIdentity {
  userId: string;
  clientIp?: string | null;
}

/**
 * Enforces the per-user (and best-effort per-IP) rate limit for an endpoint.
 *
 * @returns a `429` `Response` (with `Retry-After`) when the limit is exceeded, or
 * `null` when the request may proceed.
 */
export async function enforceRateLimit(
  supabase: RateLimitClient,
  identity: RequestIdentity,
  config: RateLimitConfig,
  headers: Record<string, string> = {},
): Promise<Response | null> {
  const decision = await checkRateLimit(supabase, identity.userId, config);

  let blocked = !decision.allowed;
  let retryAfter = decision.retryAfterSeconds;

  // Per-IP is a secondary, looser guard; only consult it when the per-user check
  // passed (no point double-charging the limiter on an already-blocked request).
  if (!blocked && identity.clientIp) {
    const ipAllowed = await checkIpRateLimit(supabase, identity.clientIp, config);
    if (!ipAllowed) {
      blocked = true;
      retryAfter = Math.max(1, Math.round((config.windowMinutes ?? DEFAULT_WINDOW_MINUTES) * 60));
    }
  }

  if (!blocked) return null;

  // Log to the cost/security monitoring path (picked up by Supabase logs / Sentry).
  console.warn(
    `[rate-limit] 429 ${config.endpoint} user=${identity.userId} ip=${identity.clientIp ?? 'n/a'} count=${decision.currentCount}/${decision.limit}`,
  );

  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded. Please slow down and try again shortly.',
      retryAfter,
    }),
    {
      status: 429,
      headers: { ...JSON_HEADERS, ...headers, 'Retry-After': String(retryAfter) },
    },
  );
}

// ---------------------------------------------------------------------------
// Client IP extraction
// ---------------------------------------------------------------------------

interface HeaderBag {
  get(name: string): string | null;
}

/** Best-effort client IP from standard proxy headers (first XFF hop wins). */
export function getClientIp(req: { headers: HeaderBag }): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip');
}

// ---------------------------------------------------------------------------
// Payload / image size validation
// ---------------------------------------------------------------------------

/** Max decoded image size accepted by the vision endpoints (5 MB). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Decoded byte length of a base64 string. Tolerates a `data:` URL prefix and
 * embedded whitespace/newlines. Returns 0 for non-strings / empty input.
 */
export function decodedBase64Bytes(b64: unknown): number {
  if (typeof b64 !== 'string' || b64.length === 0) return 0;
  const comma = b64.indexOf(',');
  let s = b64.startsWith('data:') && comma !== -1 ? b64.slice(comma + 1) : b64;
  s = s.replace(/\s/g, '');
  if (s.length === 0) return 0;
  let padding = 0;
  if (s.endsWith('==')) padding = 2;
  else if (s.endsWith('=')) padding = 1;
  return Math.max(0, Math.floor((s.length * 3) / 4) - padding);
}

/**
 * Returns a `413` `Response` when the decoded image exceeds `maxBytes`, otherwise
 * `null`. Reject BEFORE forwarding to the (expensive) vision API.
 */
export function assertImageWithinLimit(
  imageBase64: unknown,
  headers: Record<string, string> = {},
  maxBytes: number = MAX_IMAGE_BYTES,
): Response | null {
  const bytes = decodedBase64Bytes(imageBase64);
  if (bytes > maxBytes) {
    return new Response(
      JSON.stringify({
        error: `Image too large: ${Math.round(bytes / 1024)}KB exceeds the ${Math.round(
          maxBytes / 1024,
        )}KB limit.`,
      }),
      { status: 413, headers: { ...JSON_HEADERS, ...headers } },
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Free-text capping (before embedding untrusted text into an LLM prompt)
// ---------------------------------------------------------------------------

/** Default cap for free-text fields embedded into prompts. */
export const MAX_PROMPT_TEXT_LENGTH = 4000;

/**
 * Truncates untrusted free text to `maxLength` before it is embedded into an LLM
 * prompt (caps token spend and shrinks the prompt-injection surface). Returns ''
 * for non-strings.
 */
export function capText(input: unknown, maxLength: number = MAX_PROMPT_TEXT_LENGTH): string {
  if (typeof input !== 'string') return '';
  return input.length > maxLength ? input.slice(0, maxLength) : input;
}
