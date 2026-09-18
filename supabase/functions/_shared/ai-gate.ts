/**
 * The gate every token-spending endpoint in the DEPLOYED tree runs first
 * (US-773).
 *
 * Three checks that were written once per function in the serve() tree at
 * functions/ and, because that tree never deploys, applied to no live traffic:
 *
 *   1. POST only. A GET reaching an LLM handler is either a crawler or a
 *      probe, and it costs the same tokens as a real request.
 *   2. An authenticated caller. The runtime is --no-verify-jwt, so in-function
 *      auth is the only thing between an anonymous script and the model bill
 *      (US-618 put requireUser on these; this keeps it).
 *   3. A per-user budget. rate_limit_config has carried rows for
 *      identify-product, parse-receipt-image, generate-social-content and
 *      generate-blog-content since 20260613000001 and nothing in the deployed
 *      tree read them -- tonight-mode was the only caller of enforceRateLimit
 *      in 93 functions. Endpoints with no row fall back to the RPC's 50/hr
 *      default, which is a budget rather than none.
 *
 * Service-role callers (scheduled functions, function-to-function invokes)
 * pass auth and skip the per-user limit: there is no user to bill it to, and
 * the key is never shipped to a client.
 *
 * Returns { response } when the request must stop -- return it unchanged --
 * and { userId } when it may proceed.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUser } from './require-admin.ts';
import { enforceRateLimit } from './rate-limit.ts';

export interface AiGateOutcome {
  /** Non-null when the caller must return it and do no further work. */
  response: Response | null;
  /** The caller's user id. Undefined for a trusted service-role call. */
  userId?: string;
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

export async function gateAiRequest(
  req: Request,
  endpoint: string,
  headers: Record<string, string>,
): Promise<AiGateOutcome> {
  if (req.method !== 'POST') {
    return { response: json({ error: 'Method not allowed' }, 405, headers) };
  }

  const gate = await requireUser(req);
  if (!gate.ok) {
    return { response: json({ error: gate.error ?? 'Unauthorized' }, gate.status, headers) };
  }

  // A service-role caller has no user id to meter, and is trusted by
  // definition -- the key only exists server-side.
  if (!gate.userId) {
    return { response: null };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    // Fail closed, the same way enforceRateLimit does on a broken RPC: an
    // unmeterable request to a paid endpoint is not a request to wave through.
    console.error(`ai-gate: cannot meter ${endpoint}, SUPABASE_URL/SERVICE_ROLE_KEY missing`);
    return {
      response: json(
        { error: 'Rate limit check unavailable. Please try again shortly.' },
        429,
        { ...headers, 'Retry-After': '60' },
      ),
    };
  }

  // Service-role client because check_rate_limit_with_tier is SECURITY
  // DEFINER and takes the user id explicitly (same call tonight-mode makes).
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const limited = await enforceRateLimit(supabase, gate.userId, endpoint, headers);
  if (limited) return { response: limited };

  return { response: null, userId: gate.userId };
}

/**
 * The budget half of the gate, for endpoints that keep `requireAdmin`
 * (US-870).
 *
 * `gateAiRequest` authenticates ANY signed-in user, so swapping it in for an
 * admin gate would widen the endpoint -- the opposite of the point. These call
 * requireAdmin themselves and then meter the result through here.
 *
 * An admin token is not a blank cheque for a model. A leaked one, or an admin
 * account with a stuck retry loop behind it, should cost a budget rather than
 * a bill. Service-role callers (cron, function-to-function) are not metered:
 * there is no user to bill it to and the key never leaves the server.
 */
export async function meterAdminRequest(
  gate: { ok: boolean; userId?: string; admin?: unknown },
  endpoint: string,
  headers: Record<string, string>,
): Promise<Response | null> {
  if (!gate.ok || !gate.userId) return null;

  // requireAdmin hands back a service-role client; check_rate_limit_with_tier
  // is SECURITY DEFINER and takes the user id explicitly.
  // deno-lint-ignore no-explicit-any
  const supabase = gate.admin as any;
  if (!supabase) return null;

  return enforceRateLimit(supabase, gate.userId, endpoint, headers);
}

/**
 * 405 for anything but POST, or null to continue.
 *
 * A GET reaching an LLM handler is a crawler or a probe and costs the same
 * tokens as a real request. Kept separate from the gate above because the
 * admin endpoints run their own auth between the two.
 */
export function rejectNonPost(
  req: Request,
  headers: Record<string, string>,
): Response | null {
  if (req.method === 'POST') return null;
  return json({ error: 'Method not allowed' }, 405, headers);
}
