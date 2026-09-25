/**
 * The AI Coach daily plan limit, enforced on the server (owner decision 1a,
 * 2026-09-24).
 *
 * Before this, ai-coach-chat ran the per-user hourly budget (gateAiRequest)
 * and nothing else. check_feature_limit('ai_coach') was only ever called by
 * the web page, so a Free plan (ai_coach_daily_limit 0) was a padlock drawn by
 * the client, and the counter behind the daily limit never moved because the
 * server never called increment_usage.
 *
 * Who is who. The web client sends `X-Client-Info: eatpal-web/<n>`. The global
 * supabase-js client in src/integrations/supabase/client.ts has sent
 * `eatpal-web` on every request for a long time, and `x-client-info` is
 * already in every function's CORS allow-list, so reusing that header needs
 * no preflight change. The ai-coach-chat call sends the versioned form
 * explicitly (src/lib/aiCoachClient.ts). Shipped iOS builds call through
 * EdgeFunctions.swift with raw URLSession and send no X-Client-Info at all, so
 * anything without the `eatpal-web` prefix is `legacy`.
 *
 * What happens to whom:
 *   web     over the limit -> 402 { code: 'ai_coach_limit' }. The check RPC
 *           failing -> 503 { code: 'ai_coach_limit_unavailable' }: fail
 *           closed, but do not tell the user they are out of questions.
 *   legacy  grace period: never refused by this gate (the hourly budget still
 *           applies), and metered, so the counts are real on the day the
 *           grace ends.
 *           After grace (flag on): treated exactly like web.
 *   both    increment_usage runs once, after the model has replied, never
 *           before and never on a failed turn.
 *
 * Kill switch: public.feature_flags row key 'ai_coach_limit_enforce_legacy'
 * (seeded disabled by 20260928000006_ai_coach_limit.sql). Only `enabled` is
 * read; rollout_percentage and targeting_rules are ignored. Set enabled = true
 * to end the grace period without a deploy; set it back to false to restore
 * grace. A missing row, or a failed read, means grace continues.
 *
 * Pure: no Deno globals, no network. The function wires real clients into
 * runCoachTurn; the tests wire fakes. Vitest mirror:
 * src/lib/aiCoachGateShared.test.ts.
 */

/** The header the web client identifies itself with. Lower-case for Headers.get. */
export const COACH_CLIENT_HEADER = 'x-client-info';

/** Prefix of the web client's X-Client-Info value. */
export const WEB_CLIENT_PREFIX = 'eatpal-web';

/** feature_flags.key of the switch that ends the iOS grace period. */
export const LEGACY_ENFORCE_FLAG = 'ai_coach_limit_enforce_legacy';

/** The response code the web client already parses (AIMealCoach.tsx). */
export const AI_COACH_LIMIT_CODE = 'ai_coach_limit';

/** The code for "could not check the plan", distinct so the UI does not claim a used-up quota. */
export const AI_COACH_LIMIT_UNAVAILABLE_CODE = 'ai_coach_limit_unavailable';

export type CoachClient =
  | { kind: 'web'; version: number }
  | { kind: 'legacy' };

/**
 * Classify a caller from its X-Client-Info value.
 *
 * `eatpal-web` alone (the global header, no version) is web version 0.
 * `eatpal-web/<n>` is web version n. Anything else, including supabase-js's
 * own default `supabase-js-web/...` and no header at all, is legacy.
 */
export function classifyCoachClient(headerValue: string | null | undefined): CoachClient {
  const value = (headerValue ?? '').trim().toLowerCase();
  if (value !== WEB_CLIENT_PREFIX && !value.startsWith(`${WEB_CLIENT_PREFIX}/`)) {
    return { kind: 'legacy' };
  }
  const match = /^eatpal-web\/(\d+)/.exec(value);
  return { kind: 'web', version: match ? Number(match[1]) : 0 };
}

/** What check_feature_limit returns for 'ai_coach'. */
export interface FeatureLimitCheck {
  allowed: boolean;
  limit?: number | null;
  current?: number | null;
  message?: string;
}

/** A check that either answered or failed. A failure carries no detail on purpose. */
export type LimitLookup = { ok: true; result: FeatureLimitCheck } | { ok: false };

export interface CoachLimitBody {
  error: string;
  code: typeof AI_COACH_LIMIT_CODE | typeof AI_COACH_LIMIT_UNAVAILABLE_CODE;
  limit?: number | null;
  current?: number | null;
}

export type CoachGateReason =
  | 'within_limit'
  | 'over_limit'
  | 'check_failed'
  | 'legacy_grace'
  | 'legacy_grace_check_failed';

export type CoachGateDecision =
  | { action: 'proceed'; reason: CoachGateReason }
  | { action: 'refuse'; status: 402 | 503; reason: CoachGateReason; body: CoachLimitBody };

const OVER_LIMIT_MESSAGE = 'Daily AI Coach limit reached.';
const UNAVAILABLE_MESSAGE = 'Could not check your AI Coach plan. Please try again shortly.';

/**
 * The gate decision for one request.
 *
 * `enforceLegacy` is the flag value. It only matters for a legacy caller that
 * the check refused or could not answer; the caller may skip reading the flag
 * otherwise (see needsLegacyFlag).
 */
export function decideCoachGate(input: {
  client: CoachClient;
  lookup: LimitLookup;
  enforceLegacy: boolean;
}): CoachGateDecision {
  const { client, lookup, enforceLegacy } = input;
  const enforced = client.kind === 'web' || enforceLegacy;

  if (!lookup.ok) {
    if (!enforced) return { action: 'proceed', reason: 'legacy_grace_check_failed' };
    return {
      action: 'refuse',
      status: 503,
      reason: 'check_failed',
      body: { error: UNAVAILABLE_MESSAGE, code: AI_COACH_LIMIT_UNAVAILABLE_CODE },
    };
  }

  if (lookup.result.allowed === true) return { action: 'proceed', reason: 'within_limit' };

  if (!enforced) return { action: 'proceed', reason: 'legacy_grace' };
  return {
    action: 'refuse',
    status: 402,
    reason: 'over_limit',
    body: {
      error: OVER_LIMIT_MESSAGE,
      code: AI_COACH_LIMIT_CODE,
      limit: typeof lookup.result.limit === 'number' ? lookup.result.limit : null,
      current: typeof lookup.result.current === 'number' ? lookup.result.current : null,
    },
  };
}

/** Whether the flag has to be read to decide. Web never needs it; an allowed legacy call does not either. */
export function needsLegacyFlag(client: CoachClient, lookup: LimitLookup): boolean {
  return client.kind === 'legacy' && (!lookup.ok || lookup.result.allowed !== true);
}

export interface CoachTurnDeps<T> {
  client: CoachClient;
  /** check_feature_limit(userId, 'ai_coach'). Should not throw; a throw is read as a failed check. */
  checkLimit: () => Promise<LimitLookup>;
  /** The kill-switch flag. A throw is read as "off" (grace continues). */
  readEnforceLegacy: () => Promise<boolean>;
  /** The model call. Its throw propagates, and nothing is metered. */
  generate: () => Promise<T>;
  /** increment_usage(userId, 'ai_coach'). A throw is logged, not surfaced: the reply was already paid for. */
  incrementUsage: () => Promise<void>;
  log?: (event: string, detail: Record<string, unknown>) => void;
}

export type CoachTurnOutcome<T> =
  | { kind: 'refused'; decision: Extract<CoachGateDecision, { action: 'refuse' }> }
  | { kind: 'replied'; value: T; reason: CoachGateReason; metered: boolean };

/**
 * Check, decide, generate, then meter. The order is the contract:
 * a refused request never reaches the model, and a count only moves for a
 * reply that exists.
 */
export async function runCoachTurn<T>(deps: CoachTurnDeps<T>): Promise<CoachTurnOutcome<T>> {
  const log = deps.log ?? (() => {});

  let lookup: LimitLookup;
  try {
    lookup = await deps.checkLimit();
  } catch {
    lookup = { ok: false };
  }

  let enforceLegacy = false;
  if (needsLegacyFlag(deps.client, lookup)) {
    try {
      enforceLegacy = (await deps.readEnforceLegacy()) === true;
    } catch {
      enforceLegacy = false;
      log('legacy_flag_read_failed', {});
    }
  }

  const decision = decideCoachGate({ client: deps.client, lookup, enforceLegacy });
  if (decision.action === 'refuse') {
    log('refused', { client: deps.client.kind, reason: decision.reason, status: decision.status });
    return { kind: 'refused', decision };
  }
  if (decision.reason === 'legacy_grace' || decision.reason === 'legacy_grace_check_failed') {
    // The number to watch before flipping the flag: legacy turns the limit
    // would have refused.
    log('legacy_grace_allowed', { reason: decision.reason });
  }

  const value = await deps.generate();

  let metered = true;
  try {
    await deps.incrementUsage();
  } catch {
    metered = false;
    log('increment_failed', { client: deps.client.kind });
  }
  return { kind: 'replied', value, reason: decision.reason, metered };
}
