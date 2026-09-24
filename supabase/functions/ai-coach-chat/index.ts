import { getCorsHeaders, securityHeaders, noCacheHeaders } from "../common/headers.ts";
import { gateAiRequest } from '../_shared/ai-gate.ts';
import { AIServiceV2, AIMessage } from "../_shared/ai-service-v2.ts";
import { withSafetyRules } from "../_shared/safety.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  COACH_CLIENT_HEADER,
  LEGACY_ENFORCE_FLAG,
  classifyCoachClient,
  runCoachTurn,
  type LimitLookup,
} from '../_shared/aiCoachGate.ts';

/**
 * AI Coach Chat Edge Function
 * 
 * Handles conversational AI coaching for meal planning and picky eaters.
 * Uses AIServiceV2 for centralized AI configuration.
 *
 * The daily plan limit (check_feature_limit / increment_usage for 'ai_coach')
 * is enforced here, not only drawn by the web page. Web callers are refused
 * over the limit; shipped iOS builds get a grace period that ends when the
 * feature_flags row 'ai_coach_limit_enforce_legacy' is enabled. The whole
 * contract is in ../_shared/aiCoachGate.ts.
 */

/**
 * Service-role client for the two SECURITY DEFINER calls. auth.uid() is NULL
 * under service_role, so check_feature_limit / increment_usage's caller-id
 * guard (20260925000001) lets us act for the user the JWT named. Null when the
 * env is missing: the check then reads as failed (web fails closed).
 */
function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async (req: Request) => {
  // Get secure CORS headers based on request origin
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // US-618: denial-of-wallet gate. This endpoint spends real model tokens, and
  // the runtime is --no-verify-jwt, so in-function auth is the only thing
  // standing between an anonymous script and our AI bill.
  const gate = await gateAiRequest(req, 'ai-coach-chat', corsHeaders);
  if (gate.response) return gate.response;

  try {
    const { messages, kidContext, maxTokens: requestedMaxTokens } = await req.json();

    // US-618: the client asks, the server decides. An unclamped caller-supplied
    // maxTokens is a cost multiplier on every request.
    const MAX_TOKENS_CEILING = 2000;
    const maxTokens = Math.min(
      Number.isFinite(requestedMaxTokens) && requestedMaxTokens > 0
        ? Math.floor(requestedMaxTokens)
        : MAX_TOKENS_CEILING,
      MAX_TOKENS_CEILING,
    );

    // Cap conversation length too — the whole history is re-sent as input
    // tokens on every turn, so an unbounded array is the larger cost lever.
    const MAX_MESSAGES = 40;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { 
          status: 400, 
          headers: { 
            ...corsHeaders, 
            ...securityHeaders, 
            ...noCacheHeaders(),
            'Content-Type': 'application/json' 
          } 
        }
      );
    }

    // Build system prompt with kid context if provided
    let systemPrompt = `You are a friendly, supportive AI meal coach specializing in helping parents manage picky eaters and family meal planning.

Your role is to:
- Provide practical, judgment-free advice about picky eating and meal planning
- Suggest age-appropriate feeding strategies based on pediatric nutrition best practices
- Help parents feel confident and supported in their feeding journey
- Offer creative solutions for meal variety while respecting kids' preferences
- Be empathetic and understanding about feeding challenges`;

    if (kidContext) {
      systemPrompt += `\n\nCurrent child context:
- Name: ${kidContext.name || 'Not specified'}
- Age: ${kidContext.age ? `${kidContext.age} years old` : 'Not specified'}
- Allergens to avoid: ${kidContext.allergens?.length ? kidContext.allergens.join(', ') : 'None'}
- Safe foods: ${kidContext.safeFoodsCount || 0} items
- Try-bite foods: ${kidContext.tryBiteFoodsCount || 0} items`;
    }

    // Prepare messages for AI service. Keep only the most recent turns: the
    // tail is what carries the conversation, and truncating from the front
    // bounds input cost without changing behaviour for a normal chat.
    // Only user and assistant turns with string content reach the model: a
    // caller-supplied "system" turn would sit beside the safety rules with the
    // same authority. Each turn is capped, well above the web composer's 2000
    // characters plus its family-data block, so one huge paste cannot be the
    // cost lever the message cap above exists to remove.
    const MAX_CONTENT_CHARS = 16000;
    const recentMessages = messages
      .filter(
        (msg: unknown): msg is { role: 'user' | 'assistant'; content: string } =>
          typeof msg === 'object' &&
          msg !== null &&
          ((msg as { role?: unknown }).role === 'user' || (msg as { role?: unknown }).role === 'assistant') &&
          typeof (msg as { content?: unknown }).content === 'string',
      )
      .slice(-MAX_MESSAGES)
      .map((msg: { role: 'user' | 'assistant'; content: string }) => ({
        role: msg.role,
        content: msg.content.slice(0, MAX_CONTENT_CHARS),
      }));
    if (recentMessages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            ...securityHeaders,
            ...noCacheHeaders(),
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // US-629: the safety block goes on last so it is the final instruction the
    // model reads, and so it cannot be skipped by an early return above.
    const aiMessages: AIMessage[] = [
      { role: 'system', content: withSafetyRules(systemPrompt) },
      ...recentMessages,
    ];

    console.log('[ai-coach-chat] Processing request with', aiMessages.length, 'messages');

    const generate = () =>
      new AIServiceV2().generateContent(
        {
          messages: aiMessages,
          maxTokens,
          temperature: 0.7
        },
        'standard' // Use standard model for conversational quality
      );

    let response: Awaited<ReturnType<typeof generate>>;
    if (!gate.userId) {
      // Trusted service-role call (function-to-function): no user to bill.
      response = await generate();
    } else {
      const userId = gate.userId;
      const client = classifyCoachClient(req.headers.get(COACH_CLIENT_HEADER));
      const admin = serviceClient();
      const outcome = await runCoachTurn({
        client,
        checkLimit: async (): Promise<LimitLookup> => {
          if (!admin) return { ok: false };
          const { data, error } = await admin.rpc('check_feature_limit', {
            p_user_id: userId,
            p_feature_type: 'ai_coach',
          });
          if (error) {
            console.error('[ai-coach-chat] check_feature_limit failed:', error.message);
            return { ok: false };
          }
          if (!data || typeof data !== 'object' || typeof (data as { allowed?: unknown }).allowed !== 'boolean') {
            console.error('[ai-coach-chat] check_feature_limit returned an unexpected shape');
            return { ok: false };
          }
          return { ok: true, result: data as { allowed: boolean; limit?: number | null; current?: number | null } };
        },
        readEnforceLegacy: async () => {
          if (!admin) return false;
          const { data, error } = await admin
            .from('feature_flags')
            .select('enabled')
            .eq('key', LEGACY_ENFORCE_FLAG)
            .maybeSingle();
          if (error) throw error;
          return (data as { enabled?: unknown } | null)?.enabled === true;
        },
        generate,
        incrementUsage: async () => {
          if (!admin) throw new Error('no service client');
          const { error } = await admin.rpc('increment_usage', {
            p_user_id: userId,
            p_feature_type: 'ai_coach',
          });
          if (error) {
            console.error('[ai-coach-chat] increment_usage failed:', error.message);
            throw error;
          }
        },
        log: (event, detail) => console.log(`[ai-coach-chat] limit ${event}`, { userId, ...detail }),
      });

      if (outcome.kind === 'refused') {
        const { status, body } = outcome.decision;
        return new Response(JSON.stringify(body), {
          status,
          headers: {
            ...corsHeaders,
            ...securityHeaders,
            ...noCacheHeaders(),
            ...(status === 503 ? { 'Retry-After': '60' } : {}),
            'Content-Type': 'application/json'
          }
        });
      }
      response = outcome.value;
    }

    console.log('[ai-coach-chat] Response generated:', {
      model: response.model,
      tokens: response.usage?.totalTokens,
      contentLength: response.content.length
    });

    return new Response(
      JSON.stringify({
        message: response.content,
        model: response.model,
        usage: response.usage
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          ...securityHeaders,
          ...noCacheHeaders(),
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    // The detail stays in the log: it can carry a provider's response body or
    // a Postgres error naming internals (US-870). The caller gets a sentence.
    console.error('[ai-coach-chat] Error:', error instanceof Error ? error.message : error);

    return new Response(
      JSON.stringify({ error: 'Failed to generate AI response' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          ...securityHeaders,
          ...noCacheHeaders(),
          'Content-Type': 'application/json'
        }
      }
    );
  }
};
