/**
 * RAG support answer agent (US-491).
 *
 * For triaged how_to tickets, embeds the question, retrieves the top knowledge
 * matches via match_agent_knowledge(), and — when retrieval AND the model are
 * confident — drafts a send_email reply through requestApproval (draft-first).
 * Low-confidence tickets are escalated (tier-2) instead of drafting a guess.
 *
 * POST /agent-support-answer  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import {
  decideAnswer,
  knowledgeUsed,
  replySubject,
  MIN_SIMILARITY,
  type KnowledgeMatch,
  type ModelConfidence,
} from '../_shared/support-answer-logic.ts';

const AGENT_NAME = 'support-answer';
const BATCH_SIZE = 5;
const MATCH_COUNT = 4;
const EMBEDDING_MODEL = 'text-embedding-3-small';

const ReplySchema = z.object({
  reply: z.string().min(1),
  confidence: z.enum(['low', 'medium', 'high']),
});

interface TicketRow {
  id: string;
  subject: string;
  description: string | null;
  email: string | null;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function embed(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

serve(async (req) => {
  const expected = Deno.env.get('AGENT_DISPATCH_SECRET');
  if (!expected || req.headers.get('x-agent-dispatch-secret') !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const { data: def } = await db
    .from('agent_definitions')
    .select('id, name, model, system_prompt, daily_cost_cap_usd, autonomy_policy')
    .eq('name', AGENT_NAME)
    .maybeSingle();
  if (!def) return json({ error: `agent '${AGENT_NAME}' is not registered` }, 404);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'OPENAI_API_KEY is not configured' }, 503);

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      const { data: tickets } = await db
        .from('support_tickets')
        .select('id, subject, description, email')
        .eq('status', 'triaged')
        .eq('category', 'how_to')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE);

      const batch = (tickets ?? []) as TicketRow[];
      let drafted = 0;
      let escalated = 0;
      let skipped = 0;

      for (const ticket of batch) {
        // Idempotency: skip if this ticket already has an open escalation.
        const { count: openEsc } = await db
          .from('agent_escalations')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open')
          .eq('context->>ticket_id', ticket.id);
        if ((openEsc ?? 0) > 0) {
          skipped++;
          continue;
        }

        const question = `${ticket.subject}\n\n${ticket.description ?? ''}`.trim();
        const queryEmbedding = await embed(question, apiKey);

        const { data: matchData } = await db.rpc('match_agent_knowledge', {
          query_embedding: queryEmbedding,
          match_count: MATCH_COUNT,
          min_similarity: 0, // filter in code so we can distinguish weak retrieval
        });
        const matches = (matchData ?? []) as KnowledgeMatch[];

        // Only ask the model to write a reply when retrieval is at least plausible.
        let confidence: ModelConfidence = 'low';
        let reply = '';
        if (matches.length > 0 && matches[0].similarity >= MIN_SIMILARITY) {
          const context = matches
            .map((m, i) => `[${i + 1}] ${m.title}\n${m.content}`)
            .join('\n\n');
          const drafted2 = await ctx.structuredOutput<{ reply: string; confidence: ModelConfidence }>({
            schema: ReplySchema,
            prompt:
              `A user asked EatPal support:\n"${question}"\n\n` +
              `Use ONLY these knowledge-base entries to answer. If they don't cover it, set confidence "low".\n\n` +
              `${context}\n\n` +
              `Write a friendly, concise reply (plain text) and rate your confidence (low|medium|high). JSON only.`,
          });
          reply = drafted2.reply;
          confidence = drafted2.confidence;
        }

        const decision = decideAnswer(matches, confidence);

        if (decision === 'draft') {
          await ctx.requestApproval({
            actionType: 'send_email',
            payload: {
              to: ticket.email,
              subject: replySubject(ticket.subject),
              body: reply,
              ticket_id: ticket.id,
              knowledge_used: knowledgeUsed(matches),
            } as unknown as Json,
            expiresInHours: 72,
          });
          await db.from('support_tickets').update({ status: 'awaiting_reply' }).eq('id', ticket.id);
          drafted++;
        } else {
          await ctx.escalate({
            tier: 2,
            severity: 'medium',
            domain: 'customer_service',
            title: `No confident answer for: ${ticket.subject}`,
            context: {
              ticket_id: ticket.id,
              email: ticket.email,
              reason: matches.length === 0 ? 'no knowledge match' : 'low confidence',
              top_similarity: matches[0]?.similarity ?? null,
            } as unknown as Json,
          });
          escalated++;
        }
      }

      return { processed: batch.length, drafted, escalated, skipped };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
