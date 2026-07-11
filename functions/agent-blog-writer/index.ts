/**
 * Blog writer agent (US-503).
 *
 * Picks 'approved' blog rows from content_calendar, generates the post (title,
 * body HTML, excerpt, meta description) with Claude and a hero image via the
 * image pipeline (best-effort, stored in Supabase Storage), and submits ONE
 * rich 'blog_post' approval draft. The calendar row moves to 'generated' so it
 * is not re-picked. On approval the executor publishes it (US-503 executor).
 *
 * POST /agent-blog-writer  { trigger, agent_id? }
 * Auth: verify_jwt=false; internal AGENT_DISPATCH_SECRET header (dispatcher).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.25.76';
import { runAgent, type AgentDefinition, type Json } from '../_shared/agent-runtime.ts';
import { slugify, slugWithSuffix, readingTimeMinutes } from '../_shared/blog-writer-logic.ts';

const AGENT_NAME = 'blog-writer';
const BATCH_SIZE = 2;
const STORAGE_BUCKET = 'blog-images';

const PostSchema = z.object({
  title: z.string().min(1).max(160),
  body: z.string().min(1),
  excerpt: z.string().min(1).max(400),
  meta_description: z.string().min(1).max(200),
});
interface PostOut {
  title: string;
  body: string;
  excerpt: string;
  meta_description: string;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/** Generate a hero image and store it in Supabase Storage; null on any failure. */
async function generateHeroImage(db: SupabaseClient, topic: string, key: string): Promise<string | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: `Warm, editorial hero image for a parenting/nutrition blog post about "${topic}". Soft natural light, no text.`,
        size: '1792x1024',
        n: 1,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data: Array<{ url?: string }> };
    const imgUrl = data.data?.[0]?.url;
    if (!imgUrl) return null;

    const bytes = new Uint8Array(await (await fetch(imgUrl)).arrayBuffer());
    const path = `blog/${key}.png`;
    const { error } = await db.storage.from(STORAGE_BUCKET).upload(path, bytes, {
      contentType: 'image/png',
      upsert: true,
    });
    if (error) return imgUrl; // fall back to the provider URL if storage unavailable
    const { data: pub } = db.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return pub?.publicUrl ?? imgUrl;
  } catch {
    return null;
  }
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
      const { data: rows } = await db
        .from('content_calendar')
        .select('id, topic, keywords')
        .eq('status', 'approved')
        .eq('content_type', 'blog')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE);
      const topics = (rows ?? []) as Array<{ id: string; topic: string; keywords: string[] }>;
      let drafted = 0;

      for (const row of topics) {
        // Claim it so a re-run doesn't regenerate the same topic.
        await db.from('content_calendar').update({ status: 'generated' }).eq('id', row.id);

        const post = await ctx.structuredOutput<PostOut>({
          schema: PostSchema,
          prompt:
            `Write an evidence-based EatPal blog post about "${row.topic}" for parents of children ` +
            `with ARFID / extreme picky eating. Keywords: ${JSON.stringify(row.keywords)}. ` +
            `Calm, hopeful, food-chaining science; include concrete examples and a CTA to EatPal's plan. ` +
            `Return JSON: title, body (HTML with h2/h3/p/ul/li), excerpt (2 sentences), meta_description (<=155 chars).`,
        });

        const heroImageUrl = await generateHeroImage(db, row.topic, row.id);
        const slug = slugWithSuffix(slugify(post.title), row.id);

        await ctx.requestApproval({
          actionType: 'blog_post',
          payload: {
            calendar_id: row.id,
            title: post.title,
            slug,
            body: post.body,
            excerpt: post.excerpt,
            meta_description: post.meta_description,
            hero_image_url: heroImageUrl,
            reading_time_minutes: readingTimeMinutes(post.body),
            keywords: row.keywords,
          } as unknown as Json,
          expiresInHours: 336,
        });
        drafted++;
      }

      return { picked: topics.length, drafted };
    },
  });

  return json(result, result.status === 'failed' ? 500 : 200);
});
