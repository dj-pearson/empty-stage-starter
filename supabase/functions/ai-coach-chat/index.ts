import { getCorsHeaders, securityHeaders, noCacheHeaders } from "../common/headers.ts";
import { requireUser } from '../_shared/require-admin.ts';
import { AIServiceV2, AIMessage } from "../_shared/ai-service-v2.ts";

/**
 * AI Coach Chat Edge Function
 * 
 * Handles conversational AI coaching for meal planning and picky eaters.
 * Uses AIServiceV2 for centralized AI configuration.
 */

export default async (req: Request) => {
  // Get secure CORS headers based on request origin
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // US-618: denial-of-wallet gate. This endpoint spends real model tokens, and
  // the runtime is --no-verify-jwt, so in-function auth is the only thing
  // standing between an anonymous script and our AI bill.
  const gate = await requireUser(req);
  if (!gate.ok) {
    return new Response(
      JSON.stringify({ error: gate.error ?? 'Unauthorized' }),
      { status: gate.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

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
    const recentMessages = messages.slice(-MAX_MESSAGES);

    const aiMessages: AIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...recentMessages.map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }))
    ];

    console.log('[ai-coach-chat] Processing request with', aiMessages.length, 'messages');

    // Use AI service to generate response
    const aiService = new AIServiceV2();
    const response = await aiService.generateContent(
      {
        messages: aiMessages,
        maxTokens,
        temperature: 0.7
      },
      'standard' // Use standard model for conversational quality
    );

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
    console.error('[ai-coach-chat] Error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to generate AI response',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
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
