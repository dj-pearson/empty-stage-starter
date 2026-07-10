/**
 * Social post agent (US-504).
 *
 * Drafts per-network social posts (Instagram caption, Pinterest title/
 * description) for approved 'social' calendar topics and newly published blog
 * posts. Enforces a per-network daily cap (max 1/network/day). Each draft goes
 * out via requestApproval({actionType:'social_webhook'}); the executor posts to
 * the Instagram/Pinterest webhook on approval.
 *
 * POST /agent-social-writer  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import {
  SOCIAL_NETWORKS,
  networksUnderCap,
  tallyNetworks,
} from '../_shared/social-writer-logic.ts';

const AGENT_NAME = 'social-writer';

const CaptionSchema = z.object({
  instagram_caption: z.string(),
  pinterest_title: z.string(),
  pinterest_description: z.string(),
});
interface CaptionOut {
  instagram_caption: string;
  pinterest_title: string;
  pinterest_description: string;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

function startOfUtcDay(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

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

  const result = await runAgent({
    agentDefinition: def as AgentDefinition,
    trigger: 'dispatcher',
    handler: async (ctx) => {
      const now = new Date();
      const dayStart = startOfUtcDay(now);

      // Per-network daily cap: tally today's social_webhook approvals.
      const { data: todaySocial } = await db
        .from('agent_approvals')
        .select('payload')
        .eq('action_type', 'social_webhook')
        .gte('created_at', dayStart);
      const networkLists = ((todaySocial ?? []) as Array<{ payload: { networks?: string[] } }>).map(
        (a) => (Array.isArray(a.payload?.networks) ? a.payload.networks : []),
      );
      const underCap = networksUnderCap(SOCIAL_NETWORKS, tallyNetworks(networkLists));
      if (underCap.length === 0) return { drafted: 0, reason: 'all networks at daily cap' };

      // Source: an approved social calendar topic, else a newly published blog.
      let source: { kind: 'calendar' | 'blog'; id: string; topic: string; url?: string } | null = null;
      const { data: calRow } = await db
        .from('content_calendar')
        .select('id, topic')
        .eq('status', 'approved')
        .eq('content_type', 'social')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (calRow) {
        source = { kind: 'calendar', id: calRow.id, topic: calRow.topic };
      } else {
        const { data: blog } = await db
          .from('blog_posts')
          .select('id, title, slug')
          .eq('status', 'published')
          .eq('ai_generated', true)
          .order('published_at', { ascending: false })
          .limit(5);
        for (const b of (blog ?? []) as Array<{ id: string; title: string; slug: string }>) {
          const { count } = await db
            .from('agent_approvals')
            .select('id', { count: 'exact', head: true })
            .eq('action_type', 'social_webhook')
            .eq('payload->>blog_post_id', b.id);
          if ((count ?? 0) === 0) {
            source = { kind: 'blog', id: b.id, topic: b.title, url: `https://tryeatpal.com/blog/${b.slug}` };
            break;
          }
        }
      }
      if (!source) return { drafted: 0, reason: 'no source content' };

      const captions = await ctx.structuredOutput<CaptionOut>({
        schema: CaptionSchema,
        prompt:
          `Write on-brand social posts for EatPal about "${source.topic}"` +
          (source.url ? ` (link: ${source.url})` : '') +
          `. Return JSON: instagram_caption (with 3-5 hashtags), pinterest_title (<=100 chars), ` +
          `pinterest_description (<=500 chars). Warm, evidence-based, parent-focused.`,
      });

      const payload: Record<string, unknown> = {
        networks: underCap,
        image_url: null, // image pipeline is best-effort; admin can attach in review
        [source.kind === 'calendar' ? 'calendar_id' : 'blog_post_id']: source.id,
        source_url: source.url ?? null,
      };
      if (underCap.includes('instagram')) {
        payload.instagram = { caption: captions.instagram_caption, image_url: null };
        payload.caption = captions.instagram_caption; // executor/preview convenience
      }
      if (underCap.includes('pinterest')) {
        payload.pinterest = {
          title: captions.pinterest_title,
          description: captions.pinterest_description,
          link: source.url ?? null,
        };
      }

      await ctx.requestApproval({
        actionType: 'social_webhook',
        payload: payload as unknown as Json,
        expiresInHours: 168,
      });
      if (source.kind === 'calendar') {
        await db.from('content_calendar').update({ status: 'generated' }).eq('id', source.id);
      }

      return { drafted: 1, networks: underCap, source: source.kind };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
