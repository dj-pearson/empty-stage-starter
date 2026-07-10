/**
 * Shared agent runtime for Agentic OS edge functions (US-477).
 *
 * Every agent handler runs through `runAgent()`, which:
 *   1. opens an `agent_runs` row (status 'running'),
 *   2. hands the handler a context with a Claude client (single-shot,
 *      multi-turn tool-use loop, and Zod-validated structured output),
 *   3. accumulates token/cost accounting on the run row after every Claude call,
 *   4. finalizes the run to 'succeeded' (with output) or 'failed' (with error).
 *
 * Design invariants:
 *   - The service-role Supabase client is created INSIDE this module and is
 *     used only for run bookkeeping. It is NEVER handed to handlers — handlers
 *     that need database access create their own client (as the other edge
 *     functions do). This keeps run accounting tamper-resistant.
 *   - This module exports NO direct email/webhook/HTTP side-effect helpers to
 *     handlers. Outward-facing actions must go through requestApproval/escalate
 *     (added in US-479) so every external effect is draft-first and audited.
 *
 * Conventions follow the other `_shared` modules (cors.ts, auth.ts): remote
 * imports pinned, secrets read from `Deno.env`, no secrets logged.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import {
  buildApproval,
  buildEscalation,
  type AutonomyPolicy,
} from './agent-approval-logic.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Subset of an `agent_definitions` row the runtime needs. */
export interface AgentDefinition {
  id: string;
  name: string;
  model: string;
  system_prompt?: string | null;
  daily_cost_cap_usd?: number;
  autonomy_policy?: Record<string, unknown>;
}

/** Anthropic tool declaration passed through to the Messages API. */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Executes a tool call the model requested; returns any JSON-serializable result. */
export type ToolExecutor = (input: Record<string, unknown>) => Promise<Json> | Json;

interface Usage {
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface CompleteParams {
  messages: ClaudeMessage[];
  system?: string;
  tools?: ToolDefinition[];
  toolExecutors?: Record<string, ToolExecutor>;
  maxTokens?: number;
  temperature?: number;
}

export interface CompleteResult {
  text: string;
  stopReason: string | null;
  messages: ClaudeMessage[];
}

export interface StructuredOutputParams<T> {
  schema: z.ZodType<T>;
  prompt?: string;
  messages?: ClaudeMessage[];
  system?: string;
  maxTokens?: number;
}

export interface RequestApprovalParams {
  actionType: string;
  payload?: Json;
  expiresInHours?: number;
}

export interface EscalateParams {
  tier: number;
  severity: string;
  domain?: string;
  title: string;
  context?: Json;
}

/**
 * Context handed to each agent handler. Deliberately does NOT expose the DB
 * client, nor any direct email/webhook/HTTP side-effect helper (see the
 * DRAFT-FIRST INVARIANT below): handlers may only reach the outside world by
 * drafting an approval (executed later by the approval-executor, US-482) or by
 * escalating to a human. This makes it structurally impossible for an agent to
 * send an email, hit a webhook, or open an issue directly.
 */
export interface AgentContext {
  runId: string;
  agent: AgentDefinition;
  /** Full multi-turn completion; runs the tool-use loop to a natural stop. */
  complete(params: CompleteParams): Promise<CompleteResult>;
  /** One-shot JSON completion validated against a Zod schema (retries once). */
  structuredOutput<T>(params: StructuredOutputParams<T>): Promise<T>;
  /**
   * Draft an outward-facing action for human review. Inserts an agent_approvals
   * row (status 'draft', or 'approved' when the agent's autonomy_policy
   * allowlists the action type) and writes an agent_audit_log entry. Returns the
   * new approval id. It NEVER performs the action itself.
   */
  requestApproval(params: RequestApprovalParams): Promise<string>;
  /**
   * Raise a tier-2/3 escalation for a human. Inserts an agent_escalations row
   * and writes an audit entry. Returns the new escalation id.
   */
  escalate(params: EscalateParams): Promise<string>;
  /** Current accumulated usage for this run (read-only snapshot). */
  usage(): Usage;
}

export interface RunAgentParams {
  agentDefinition: AgentDefinition;
  trigger: string;
  input?: Json;
  tools?: ToolDefinition[];
  handler: (ctx: AgentContext) => Promise<Json>;
}

export interface AgentRunResult {
  runId: string;
  status: 'succeeded' | 'failed';
  output?: Json;
  error?: string;
  usage: Usage;
}

// Anthropic message shapes (minimal, structural).
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}
interface ClaudeContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
}
interface ClaudeResponse {
  content: ClaudeContentBlock[];
  stop_reason: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
}

// ---------------------------------------------------------------------------
// Model pricing (USD per 1M tokens). Extend as models are added.
// ---------------------------------------------------------------------------

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-opus-4-1': { input: 15, output: 75 },
  'claude-opus-4': { input: 15, output: 75 },
};
const DEFAULT_PRICING = { input: 1, output: 5 };

/** Compute USD cost for a call from the per-model pricing map. Exported for tests. */
export function computeCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const p = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const cost = (tokensIn / 1_000_000) * p.input + (tokensOut / 1_000_000) * p.output;
  // Round to 6 decimals to avoid floating-point noise on the numeric column.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Service-role client (module-private; never exposed to handlers)
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type ServiceClient = any;

let _serviceClient: ServiceClient | null = null;
function getServiceClient(): ServiceClient {
  if (_serviceClient) return _serviceClient;
  _serviceClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
  return _serviceClient;
}

// ---------------------------------------------------------------------------
// Claude API client with retry + backoff
// ---------------------------------------------------------------------------

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_API_ATTEMPTS = 3;
const MAX_TOOL_TURNS = 8;

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

/** Backoff delay for a given attempt (1-based), exported for tests. */
export function backoffMs(attempt: number): number {
  // 2^attempt * 250ms, capped, with light deterministic jitter by attempt.
  const base = Math.min(2 ** attempt * 250, 8_000);
  return base + attempt * 50;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RawCallBody {
  model: string;
  system?: string;
  messages: ClaudeMessage[];
  tools?: ToolDefinition[];
  max_tokens: number;
  temperature?: number;
}

async function callAnthropic(body: RawCallBody): Promise<ClaudeResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        return (await res.json()) as ClaudeResponse;
      }

      // Drain the body so the connection can be reused; keep a short detail.
      const detail = (await res.text()).slice(0, 500);
      if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_API_ATTEMPTS) {
        lastError = new Error(`Anthropic ${res.status}: ${detail}`);
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`Anthropic ${res.status}: ${detail}`);
    } catch (err) {
      // Network/transport error: retry unless we've exhausted attempts.
      lastError = err;
      if (attempt < MAX_API_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Anthropic request failed');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractText(content: ClaudeContentBlock[]): string {
  return content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/** Pull the first JSON object/array out of a text blob (handles ```json fences). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const match = candidate.match(/[[{][\s\S]*[\]}]/);
  const raw = (match ? match[0] : candidate).trim();
  return JSON.parse(raw);
}

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// runAgent
// ---------------------------------------------------------------------------

export async function runAgent(params: RunAgentParams): Promise<AgentRunResult> {
  const { agentDefinition, trigger, input, tools, handler } = params;
  const db = getServiceClient();

  const { data: run, error: insertError } = await db
    .from('agent_runs')
    .insert({
      agent_id: agentDefinition.id,
      trigger,
      status: 'running',
      input: input ?? {},
    })
    .select('id')
    .single();

  if (insertError || !run) {
    throw new Error(`Failed to open agent run: ${insertError?.message ?? 'unknown'}`);
  }
  const runId: string = run.id;

  const usage: Usage = { tokensIn: 0, tokensOut: 0, costUsd: 0 };

  // Persist accumulated usage to the run row after each Claude call (AC3).
  async function persistUsage(): Promise<void> {
    await db
      .from('agent_runs')
      .update({
        tokens_in: usage.tokensIn,
        tokens_out: usage.tokensOut,
        cost_usd: usage.costUsd,
      })
      .eq('id', runId);
  }

  function accumulate(model: string, resp: ClaudeResponse): void {
    const inTok = resp.usage?.input_tokens ?? 0;
    const outTok = resp.usage?.output_tokens ?? 0;
    usage.tokensIn += inTok;
    usage.tokensOut += outTok;
    usage.costUsd = Math.round((usage.costUsd + computeCostUsd(model, inTok, outTok)) * 1_000_000) / 1_000_000;
  }

  const model = agentDefinition.model;

  async function complete(p: CompleteParams): Promise<CompleteResult> {
    const convo: ClaudeMessage[] = [...p.messages];
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const resp = await callAnthropic({
        model,
        system: p.system ?? agentDefinition.system_prompt ?? undefined,
        messages: convo,
        tools: p.tools,
        max_tokens: p.maxTokens ?? 1024,
        temperature: p.temperature,
      });
      accumulate(model, resp);
      await persistUsage();

      convo.push({ role: 'assistant', content: resp.content });

      const toolUses = resp.content.filter((b) => b.type === 'tool_use');
      if (resp.stop_reason !== 'tool_use' || toolUses.length === 0) {
        return { text: extractText(resp.content), stopReason: resp.stop_reason, messages: convo };
      }

      // Execute each requested tool and feed results back for the next turn.
      const results: ClaudeContentBlock[] = [];
      for (const tu of toolUses) {
        const executor = p.toolExecutors?.[tu.name ?? ''];
        let result: Json;
        try {
          result = executor
            ? await executor(tu.input ?? {})
            : ({ error: `No executor registered for tool '${tu.name}'` } as Json);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) } as Json;
        }
        results.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }
      convo.push({ role: 'user', content: results });
    }
    throw new Error(`Tool-use loop exceeded ${MAX_TOOL_TURNS} turns`);
  }

  async function structuredOutput<T>(p: StructuredOutputParams<T>): Promise<T> {
    const JSON_INSTRUCTION =
      'Respond with a single valid JSON value only — no prose, no code fences.';
    const baseSystem = [p.system ?? agentDefinition.system_prompt ?? '', JSON_INSTRUCTION]
      .filter(Boolean)
      .join('\n\n');

    const convo: ClaudeMessage[] =
      p.messages ?? [{ role: 'user', content: p.prompt ?? '' }];

    let lastError = '';
    // 2 attempts total = "retries once on validation failure" (AC4).
    for (let attempt = 1; attempt <= 2; attempt++) {
      const resp = await callAnthropic({
        model,
        system: baseSystem,
        messages: convo,
        max_tokens: p.maxTokens ?? 1024,
      });
      accumulate(model, resp);
      await persistUsage();

      const text = extractText(resp.content);
      try {
        const parsed = p.schema.safeParse(extractJson(text));
        if (parsed.success) return parsed.data;
        lastError = parsed.error.message;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }

      // Give the model the failing output plus the reason, then retry once.
      convo.push({ role: 'assistant', content: text });
      convo.push({
        role: 'user',
        content:
          `That was not valid against the required schema (${lastError}). ` +
          `Return corrected JSON only.`,
      });
    }
    throw new Error(`Structured output failed schema validation: ${lastError}`);
  }

  async function requestApproval(p: RequestApprovalParams): Promise<string> {
    const { approval, audit } = buildApproval(
      {
        agentId: agentDefinition.id,
        agentName: agentDefinition.name,
        runId,
        actionType: p.actionType,
        payload: p.payload,
        expiresInHours: p.expiresInHours,
        autonomyPolicy: (agentDefinition.autonomy_policy ?? null) as AutonomyPolicy | null,
      },
      new Date(),
    );

    const { data: row, error } = await db
      .from('agent_approvals')
      .insert(approval)
      .select('id')
      .single();
    if (error || !row) {
      throw new Error(`Failed to create approval: ${error?.message ?? 'unknown'}`);
    }
    await db.from('agent_audit_log').insert({ ...audit, subject_id: row.id });
    return row.id as string;
  }

  async function escalate(p: EscalateParams): Promise<string> {
    const { escalation, audit } = buildEscalation(
      {
        agentId: agentDefinition.id,
        agentName: agentDefinition.name,
        runId,
        tier: p.tier,
        severity: p.severity,
        domain: p.domain,
        title: p.title,
        context: p.context,
      },
      new Date(),
    );

    const { data: row, error } = await db
      .from('agent_escalations')
      .insert(escalation)
      .select('id')
      .single();
    if (error || !row) {
      throw new Error(`Failed to create escalation: ${error?.message ?? 'unknown'}`);
    }
    await db.from('agent_audit_log').insert({ ...audit, subject_id: row.id });
    return row.id as string;
  }

  const ctx: AgentContext = {
    runId,
    agent: agentDefinition,
    complete,
    structuredOutput,
    requestApproval,
    escalate,
    usage: () => ({ ...usage }),
  };

  try {
    const output = await handler(ctx);
    await db
      .from('agent_runs')
      .update({
        status: 'succeeded',
        output: output ?? {},
        tokens_in: usage.tokensIn,
        tokens_out: usage.tokensOut,
        cost_usd: usage.costUsd,
        finished_at: nowIso(),
      })
      .eq('id', runId);
    return { runId, status: 'succeeded', output: output ?? {}, usage: { ...usage } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from('agent_runs')
      .update({
        status: 'failed',
        error: message,
        tokens_in: usage.tokensIn,
        tokens_out: usage.tokensOut,
        cost_usd: usage.costUsd,
        finished_at: nowIso(),
      })
      .eq('id', runId);
    return { runId, status: 'failed', error: message, usage: { ...usage } };
  }
}
