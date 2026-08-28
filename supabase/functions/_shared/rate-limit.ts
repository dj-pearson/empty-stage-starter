/**
 * Shared per-user rate limiting for the DEPLOYED edge-function tree (US-325).
 *
 * This is the `export default` tree that edge-functions-server.ts loads and
 * both Dockerfiles copy. The serve()-style twin at functions/_shared/rate-limit.ts
 * has carried this logic since US-325, but nothing in that tree ships, so the
 * limit it enforces has never applied to live traffic.
 *
 * Enforces limits SERVER-SIDE by calling the `check_rate_limit_with_tier`
 * RPC (SECURITY DEFINER, defined in 20251010230000_rate_limiting_system.sql;
 * per-endpoint budgets seeded in 20260613000001_rate_limit_config_ai_endpoints.sql).
 * Client-side limits (src/lib/rate-limit.ts) are advisory only and can be
 * bypassed, so every expensive function must call this before doing real work.
 *
 * Returns a 429 `Response` (with `Retry-After`) when the limit is exceeded,
 * or `null` when the request is allowed to proceed.
 *
 * Fails CLOSED: if the RPC errors we deny the request rather than letting an
 * attacker disable limiting by breaking the rate-limit table. Callers on the
 * client side (TonightModeService.swift, src/lib/tonightMode.ts) treat any
 * non-200 as "use the local ranker", so a closed limiter degrades to the
 * on-device fallback rather than to an error surface.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

interface TierRateLimitRow {
  allowed: boolean;
  current_count: number;
  max_requests: number;
  reset_at: string;
  tier: string;
}

export async function enforceRateLimit(
  supabase: SupabaseClient,
  userId: string,
  endpoint: string,
  headers: Record<string, string>,
): Promise<Response | null> {
  let row: TierRateLimitRow | undefined;
  try {
    const { data, error } = await supabase.rpc('check_rate_limit_with_tier', {
      p_user_id: userId,
      p_endpoint: endpoint,
    });
    if (error) throw error;
    row = Array.isArray(data) ? (data[0] as TierRateLimitRow) : (data as TierRateLimitRow);
  } catch (error) {
    // Fail closed — a broken limiter must not become an open door.
    console.error(`rate-limit check failed for ${endpoint}:`, error);
    return new Response(
      JSON.stringify({ error: 'Rate limit check unavailable. Please try again shortly.' }),
      { status: 429, headers: { ...headers, 'Retry-After': '60' } },
    );
  }

  if (!row || !row.allowed) {
    const resetAt = row?.reset_at ? new Date(row.reset_at).getTime() : Date.now() + 60_000;
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    // Log to the cost/security monitoring path.
    console.warn(
      `rate-limit exceeded: user=${userId} endpoint=${endpoint} ` +
        `count=${row?.current_count ?? '?'} max=${row?.max_requests ?? '?'} tier=${row?.tier ?? '?'}`,
    );
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        endpoint,
        max_requests: row?.max_requests,
        retry_after_seconds: retryAfter,
      }),
      { status: 429, headers: { ...headers, 'Retry-After': String(retryAfter) } },
    );
  }

  return null;
}
