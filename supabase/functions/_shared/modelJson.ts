/**
 * Reading JSON out of a model reply, and building the chat request that
 * AIServiceV2.generateContent takes.
 *
 * Pure: no Deno globals, no network, no imports, so edge functions import it
 * under Deno and Vitest imports it in src/lib/modelJson.test.ts.
 *
 * generateContent(request: AIRequest, taskType) takes { messages, temperature?,
 * maxTokens? } and resolves to { content, model, usage }. Several functions
 * called it as generateContent(prompt, { systemPrompt, taskType }), which sends
 * no messages and throws on every attempt; buildChatRequest is the shape they
 * meant.
 */

export type JsonRecord = Record<string, unknown>;

/** Structurally the AIRequest AIServiceV2.generateContent takes. */
export interface ChatRequest {
  messages: { role: 'system' | 'user'; content: string }[];
  temperature?: number;
  maxTokens?: number;
}

export function buildChatRequest(
  systemPrompt: string,
  userPrompt: string,
  options: { temperature?: number; maxTokens?: number } = {},
): ChatRequest {
  const request: ChatRequest = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
  if (options.temperature !== undefined) request.temperature = options.temperature;
  if (options.maxTokens !== undefined) request.maxTokens = options.maxTokens;
  return request;
}

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The body of the first ``` fence if there is one, else the whole text. */
function unfence(text: string): string {
  const fenced = text.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/);
  return fenced ? fenced[1] : text;
}

/** JSON.parse, retried once with trailing commas removed; undefined on failure. */
function parseLenient(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(candidate.replace(/,(\s*[}\]])/g, '$1'));
    } catch {
      return undefined;
    }
  }
}

/** Starting points tried before giving up, so a stray "[1]" in prose can't sink the reply. */
const MAX_STARTS = 20;

/**
 * Parse the span from an opening bracket to the last closing one. The first
 * opening bracket is tried first; if prose before the payload holds a stray
 * one ("step [1] of..."), later ones are tried in turn.
 */
function parseSpan(text: string, open: string, close: string): unknown {
  const end = text.lastIndexOf(close);
  let start = text.indexOf(open);
  for (let tries = 0; start !== -1 && start < end && tries < MAX_STARTS; tries++) {
    const parsed = parseLenient(text.slice(start, end + 1));
    if (parsed !== undefined) return parsed;
    start = text.indexOf(open, start + 1);
  }
  return undefined;
}

/**
 * The JSON object in a model reply, or null. Tolerates a ```json fence, prose
 * before and after the object, and trailing commas. Anything that is not a
 * string, or parses to something other than a plain object, is null.
 */
export function extractJsonObject(content: unknown): JsonRecord | null {
  if (typeof content !== 'string' || content.trim() === '') return null;
  const parsed = parseSpan(unfence(content), '{', '}');
  return isJsonRecord(parsed) ? parsed : null;
}

/**
 * The JSON array in a model reply, or null. Same tolerance as
 * extractJsonObject: fences, surrounding prose, trailing commas.
 */
export function extractJsonArray(content: unknown): unknown[] | null {
  if (typeof content !== 'string' || content.trim() === '') return null;
  const parsed = parseSpan(unfence(content), '[', ']');
  return Array.isArray(parsed) ? parsed : null;
}
