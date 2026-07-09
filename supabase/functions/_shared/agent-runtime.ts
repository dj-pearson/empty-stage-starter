/**
 * Agentic OS — Shared Agent Runtime (US-477)
 *
 * A thin wrapper around the Claude API that gives every agent handler
 * run bookkeeping (agent_runs row), a multi-turn tool-use loop, per-model
 * cost accounting, structured output validation, and API retries for free.
 *
 * INVARIANT (draft-first autonomy): this module exposes NO direct
 * email / webhook / HTTP side-effect helpers to handlers. Outward-facing
 * actions must go through requestApproval()/escalate() (added in US-479),
 * which write draft rows to agent_approvals / agent_escalations. A handler
 * only ever gets the Claude helpers below — never the service-role client,
 * never a way to send anything to the outside world directly.
 *
 * Conventions mirror _shared/ai-service-v2.ts (fetch to api.anthropic.com,
 * x-api-key + anthropic-version headers) and the Deno esm.sh import style.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  buildApprovalRow,
  buildEscalationRow,
  buildAuditRow,
  approvalOutcome,
  type AutonomyPolicy,
  type EscalationTier,
  type EscalationSeverity,
} from './agent-approvals.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_API_ATTEMPTS = 3;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_TOOL_STEPS = 8;

// ---------------------------------------------------------------------------
// Per-model pricing (USD per 1M tokens). Values are the published Anthropic
// list prices; override per-agent later if pricing changes. Keyed by a
// substring of the model id so dated model ids ("...-20251001") still match.
// ---------------------------------------------------------------------------
interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}
const MODEL_PRICING: Array<{ match: string; price: ModelPrice }> = [
  { match: 'haiku', price: { inputPerMTok: 1.0, outputPerMTok: 5.0 } },
  { match: 'sonnet', price: { inputPerMTok: 3.0, outputPerMTok: 15.0 } },
  { match: 'opus', price: { inputPerMTok: 15.0, outputPerMTok: 75.0 } },
];
const FALLBACK_PRICE: ModelPrice = { inputPerMTok: 3.0, outputPerMTok: 15.0 };

export function priceForModel(model: string): ModelPrice {
  const found = MODEL_PRICING.find((p) => model.toLowerCase().includes(p.match));
  return found ? found.price : FALLBACK_PRICE;
}

export function computeCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const price = priceForModel(model);
  const cost = (tokensIn / 1_000_000) * price.inputPerMTok + (tokensOut / 1_000_000) * price.outputPerMTok;
  // Round to 6 decimals — sub-cent precision without float noise.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AgentDefinition {
  id: string;
  name: string;
  model: string;
  system_prompt?: string | null;
  autonomy_policy?: Record<string, unknown> | null;
  daily_cost_cap_usd?: number | null;
  [key: string]: unknown;
}

/** A tool the model may call during a converse() loop. */
export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema for the tool input (Anthropic `input_schema`). */
  inputSchema: Record<string, unknown>;
  /** Executes the tool call and returns a JSON-serializable result. */
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
}

type ClaudeMessage = { role: 'user' | 'assistant'; content: unknown };

interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
}

/** Everything a handler is allowed to touch. Intentionally no supabase client. */
export interface AgentContext {
  runId: string;
  agent: AgentDefinition;
  trigger: string | null;
  input: unknown;
  /** Running token/cost totals for this run (read-only snapshot via getUsage). */
  getUsage: () => { tokensIn: number; tokensOut: number; costUsd: number };
  /** Single Claude message call. Accumulates tokens/cost onto the run. */
  claude: (opts: ClaudeCallOptions) => Promise<ClaudeResult>;
  /** Multi-turn tool-use loop until the model stops requesting tools. */
  converse: (opts: ConverseOptions) => Promise<ClaudeResult>;
  /** Ask the model for JSON matching a Zod schema; retries once on invalid. */
  structured: <T>(opts: StructuredOptions<T>) => Promise<T>;
  /**
   * Draft-first outward action. Inserts an agent_approvals row (status 'draft'
   * unless the agent's autonomy_policy allowlists the action type, in which
   * case 'approved') and an agent_audit_log entry. Returns the approval id.
   * The action is NEVER performed here — the approval-executor (US-482) does.
   */
  requestApproval: (opts: RequestApprovalOptions) => Promise<string>;
  /** Raise a human escalation (agent_escalations) + audit entry. Returns id. */
  escalate: (opts: EscalateOptions) => Promise<string>;
}

export interface RequestApprovalOptions {
  actionType: string;
  payload: unknown;
  expiresInHours?: number;
}

export interface EscalateOptions {
  tier: EscalationTier;
  severity: EscalationSeverity;
  domain?: string | null;
  title?: string | null;
  context?: unknown;
}

export interface ClaudeCallOptions {
  system?: string;
  messages: ClaudeMessage[];
  tools?: AgentTool[];
  maxTokens?: number;
  temperature?: number;
}

export interface ConverseOptions {
  system?: string;
  messages: ClaudeMessage[];
  tools: AgentTool[];
  maxTokens?: number;
  temperature?: number;
  maxSteps?: number;
}

export interface StructuredOptions<T> {
  system?: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  temperature?: number;
}

export interface ClaudeResult {
  /** Concatenated text blocks of the final assistant message. */
  text: string;
  /** Raw content blocks of the final assistant message. */
  content: Array<Record<string, unknown>>;
  stopReason: string | null;
  usage: { tokensIn: number; tokensOut: number };
}

export interface RunAgentOptions {
  agentDefinition: AgentDefinition;
  trigger?: string | null;
  input?: unknown;
  handler: (ctx: AgentContext) => Promise<unknown>;
}

export interface RunAgentResult {
  runId: string;
  status: 'succeeded' | 'failed';
  output?: unknown;
  error?: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

// ---------------------------------------------------------------------------
// Service-role client — created inside the module, never handed to handlers.
// ---------------------------------------------------------------------------
function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('agent-runtime: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Low-level Claude call with exponential-backoff retries.
// ---------------------------------------------------------------------------
async function callAnthropic(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ content: Array<Record<string, unknown>>; stop_reason: string | null; usage: ClaudeUsage }> {
  /** Marks an HTTP error the caller should NOT retry (4xx except 429). */
  class NonRetryableError extends Error {}

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        return await response.json();
      }

      const errText = await response.text();
      const message = `Claude API error ${response.status}: ${errText}`;
      // 4xx other than 429 (rate limit) are client errors — fail fast, no retry.
      if (response.status < 500 && response.status !== 429) {
        throw new NonRetryableError(message);
      }
      lastError = new Error(message);
    } catch (err) {
      // A deliberate fail-fast error escapes the retry loop immediately.
      if (err instanceof NonRetryableError) throw err;
      lastError = err;
    }

    if (attempt < MAX_API_ATTEMPTS) {
      // 0.5s, 1s exponential backoff between the 3 attempts.
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Extract concatenated text from Anthropic content blocks. */
function textFromContent(content: Array<Record<string, unknown>>): string {
  return content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
    .trim();
}

/** Pull the first JSON object/array out of a text blob (handles ```json fences). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back to the first {...} or [...] span.
    const span = candidate.match(/[[{][\s\S]*[\]}]/);
    if (span) return JSON.parse(span[0]);
    throw new Error('No JSON found in model response');
  }
}

// ---------------------------------------------------------------------------
// runAgent — the entry point every agent handler uses.
// ---------------------------------------------------------------------------
export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const { agentDefinition, trigger = null, input = null, handler } = opts;
  const supabase = serviceClient();
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');

  // Create the run row up front so an early crash still leaves a trace.
  const { data: runRow, error: insertErr } = await supabase
    .from('agent_runs')
    .insert({ agent_id: agentDefinition.id, trigger, status: 'running', input })
    .select('id')
    .single();

  if (insertErr || !runRow) {
    throw new Error(`agent-runtime: failed to create run row: ${insertErr?.message ?? 'unknown'}`);
  }
  const runId = runRow.id as string;

  // Mutable usage totals accumulated across every Claude call this run.
  const usage = { tokensIn: 0, tokensOut: 0, costUsd: 0 };
  const accrue = (u: ClaudeUsage) => {
    usage.tokensIn += u.input_tokens ?? 0;
    usage.tokensOut += u.output_tokens ?? 0;
    usage.costUsd = computeCostUsd(agentDefinition.model, usage.tokensIn, usage.tokensOut);
  };

  const requireKey = (): string => {
    if (!apiKey) throw new Error('agent-runtime: ANTHROPIC_API_KEY is not configured');
    return apiKey;
  };

  const claude = async (callOpts: ClaudeCallOptions): Promise<ClaudeResult> => {
    const body: Record<string, unknown> = {
      model: agentDefinition.model,
      max_tokens: callOpts.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: callOpts.messages,
    };
    if (callOpts.system ?? agentDefinition.system_prompt) {
      body.system = callOpts.system ?? agentDefinition.system_prompt;
    }
    if (typeof callOpts.temperature === 'number') body.temperature = callOpts.temperature;
    if (callOpts.tools && callOpts.tools.length > 0) {
      body.tools = callOpts.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));
    }
    const resp = await callAnthropic(requireKey(), body);
    accrue(resp.usage);
    return {
      text: textFromContent(resp.content),
      content: resp.content,
      stopReason: resp.stop_reason,
      usage: { tokensIn: resp.usage.input_tokens, tokensOut: resp.usage.output_tokens },
    };
  };

  const converse = async (convOpts: ConverseOptions): Promise<ClaudeResult> => {
    const maxSteps = convOpts.maxSteps ?? DEFAULT_MAX_TOOL_STEPS;
    const toolMap = new Map(convOpts.tools.map((t) => [t.name, t]));
    const messages: ClaudeMessage[] = [...convOpts.messages];
    let last: ClaudeResult | null = null;

    for (let step = 0; step < maxSteps; step++) {
      last = await claude({
        system: convOpts.system,
        messages,
        tools: convOpts.tools,
        maxTokens: convOpts.maxTokens,
        temperature: convOpts.temperature,
      });

      if (last.stopReason !== 'tool_use') return last;

      // Append the assistant turn, then run each requested tool and reply.
      messages.push({ role: 'assistant', content: last.content });
      const toolResults: Array<Record<string, unknown>> = [];
      for (const block of last.content) {
        if (block.type !== 'tool_use') continue;
        const tool = toolMap.get(block.name as string);
        let resultContent: string;
        let isError = false;
        try {
          if (!tool) throw new Error(`Unknown tool: ${block.name}`);
          const out = await tool.execute((block.input ?? {}) as Record<string, unknown>);
          resultContent = typeof out === 'string' ? out : JSON.stringify(out);
        } catch (err) {
          isError = true;
          resultContent = err instanceof Error ? err.message : String(err);
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultContent,
          is_error: isError,
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    // Ran out of steps — return the last assistant message we have.
    return last as ClaudeResult;
  };

  const structured = async <T>(sOpts: StructuredOptions<T>): Promise<T> => {
    const askOnce = async (extra?: string): Promise<T> => {
      const userText = extra ? `${sOpts.prompt}\n\n${extra}` : sOpts.prompt;
      const result = await claude({
        system: sOpts.system,
        messages: [{ role: 'user', content: userText }],
        maxTokens: sOpts.maxTokens,
        temperature: sOpts.temperature ?? 0,
      });
      const json = extractJson(result.text);
      return sOpts.schema.parse(json);
    };
    try {
      return await askOnce();
    } catch (firstErr) {
      // One retry with the validation error fed back to the model.
      const hint =
        firstErr instanceof Error
          ? `Your previous response was invalid: ${firstErr.message}. Respond with ONLY valid JSON matching the required schema.`
          : 'Respond with ONLY valid JSON matching the required schema.';
      return await askOnce(hint);
    }
  };

  const policy = (agentDefinition.autonomy_policy ?? null) as AutonomyPolicy | null;

  const requestApproval = async (aOpts: RequestApprovalOptions): Promise<string> => {
    const now = new Date();
    const approvalRow = buildApprovalRow(
      {
        runId,
        agentId: agentDefinition.id,
        actionType: aOpts.actionType,
        payload: aOpts.payload,
        policy,
        expiresInHours: aOpts.expiresInHours,
      },
      now,
    );
    const { data, error } = await supabase
      .from('agent_approvals')
      .insert(approvalRow)
      .select('id')
      .single();
    if (error || !data) {
      throw new Error(`requestApproval: failed to insert approval: ${error?.message ?? 'unknown'}`);
    }
    const approvalId = data.id as string;

    const outcome = approvalOutcome(policy, aOpts.actionType);
    await supabase.from('agent_audit_log').insert(
      buildAuditRow(
        {
          actor: agentDefinition.name,
          action: outcome.auditAction,
          subjectType: 'agent_approval',
          subjectId: approvalId,
          detail: { actionType: aOpts.actionType, status: outcome.status, runId },
        },
        now,
      ),
    );
    return approvalId;
  };

  const escalate = async (eOpts: EscalateOptions): Promise<string> => {
    const now = new Date();
    const escalationRow = buildEscalationRow(
      {
        runId,
        agentId: agentDefinition.id,
        tier: eOpts.tier,
        severity: eOpts.severity,
        domain: eOpts.domain,
        title: eOpts.title,
        context: eOpts.context,
      },
      now,
    );
    const { data, error } = await supabase
      .from('agent_escalations')
      .insert(escalationRow)
      .select('id')
      .single();
    if (error || !data) {
      throw new Error(`escalate: failed to insert escalation: ${error?.message ?? 'unknown'}`);
    }
    const escalationId = data.id as string;

    await supabase.from('agent_audit_log').insert(
      buildAuditRow(
        {
          actor: agentDefinition.name,
          action: 'agent.escalation_raised',
          subjectType: 'agent_escalation',
          subjectId: escalationId,
          detail: { tier: eOpts.tier, severity: eOpts.severity, domain: eOpts.domain ?? null, runId },
        },
        now,
      ),
    );
    return escalationId;
  };

  const ctx: AgentContext = {
    runId,
    agent: agentDefinition,
    trigger,
    input,
    getUsage: () => ({ ...usage }),
    claude,
    converse,
    structured,
    requestApproval,
    escalate,
  };

  // Execute the handler and finalize the run either way.
  try {
    const output = await handler(ctx);
    await supabase
      .from('agent_runs')
      .update({
        status: 'succeeded',
        output: (output ?? null) as unknown,
        tokens_in: usage.tokensIn,
        tokens_out: usage.tokensOut,
        cost_usd: usage.costUsd,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
    return { runId, status: 'succeeded', output, ...usage };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('agent_runs')
      .update({
        status: 'failed',
        error: message,
        tokens_in: usage.tokensIn,
        tokens_out: usage.tokensOut,
        cost_usd: usage.costUsd,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
    return { runId, status: 'failed', error: message, ...usage };
  }
}
