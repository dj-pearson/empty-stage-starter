/**
 * Content calendar agent (US-502).
 *
 * Weekly (dispatcher). Proposes 3 blog + 5 social topics from the seed keyword
 * list (agent autonomy_policy.content_keywords) and the published blog
 * inventory, deduped against existing calendar rows and published titles. Each
 * surviving proposal is inserted (status 'proposed') and drafted as a tier-2
 * 'content_topic' approval so topics are approved before any generation spend.
 *
 * POST /agent-content-calendar  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import {
  normalizeTopic,
  dedupeProposals,
  seedKeywords,
  type ContentProposal,
} from '../_shared/content-calendar-logic.ts';

const AGENT_NAME = 'content-calendar';

const ProposalsSchema = z.object({
  proposals: z
    .array(
      z.object({
        topic: z.string().min(1).max(160),
        content_type: z.enum(['blog', 'social']),
        keywords: z.array(z.string()).max(8),
        rationale: z.string(),
      }),
    )
    .max(20),
});

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

serve(async (req) => {
  const expected = Deno.env.get('AGENT_DISPATCH_SECRET');
  if (!expected || req.headers.get('x-agent-dispatch-secret') !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db: SupabaseClient = createClient(
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

  const keywords = seedKeywords((def as AgentDefinition).autonomy_policy as Record<string, unknown>);

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      // Existing fingerprints: calendar topics + published blog titles.
      const [calRows, blogRows] = await Promise.all([
        db.from('content_calendar').select('topic'),
        db.from('blog_posts').select('title').eq('status', 'published').limit(500),
      ]);
      const existing = new Set<string>();
      for (const r of (calRows.data ?? []) as Array<{ topic: string }>) existing.add(normalizeTopic(r.topic));
      for (const r of (blogRows.data ?? []) as Array<{ title: string }>) existing.add(normalizeTopic(r.title));

      const { proposals } = await ctx.structuredOutput<{ proposals: ContentProposal[] }>({
        schema: ProposalsSchema,
        prompt:
          `Propose exactly 3 blog and 5 social content topics for EatPal.\n` +
          `Seed keywords: ${JSON.stringify(keywords)}\n` +
          `Avoid these existing/published titles: ${JSON.stringify([...existing].slice(0, 100))}\n` +
          `Return JSON {"proposals":[{topic, content_type ("blog"|"social"), keywords[], rationale}]}.`,
      });

      const fresh = dedupeProposals(proposals ?? [], existing);
      let created = 0;

      for (const p of fresh) {
        const { data: row, error } = await db
          .from('content_calendar')
          .insert({
            topic: p.topic,
            content_type: p.content_type,
            keywords: p.keywords,
            rationale: p.rationale,
            status: 'proposed',
          })
          .select('id')
          .single();
        if (error || !row) continue;

        await ctx.requestApproval({
          actionType: 'content_topic',
          payload: {
            calendar_id: row.id,
            topic: p.topic,
            content_type: p.content_type,
            keywords: p.keywords,
            rationale: p.rationale,
          } as unknown as Json,
          expiresInHours: 336,
        });
        created++;
      }

      return { proposed: proposals?.length ?? 0, created };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
