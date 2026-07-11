/**
 * Knowledge-base ingest edge function (US-481).
 *
 * Embeds product docs / FAQ entries into public.agent_knowledge so the RAG
 * support agent (US-491) can retrieve them via match_agent_knowledge().
 *
 * POST /agent-knowledge-ingest
 * Body (single):  { "source": "faq", "title": "...", "content": "..." }
 * Body (seed):    { "seed": true }   // ingests the bundled EatPal FAQ entries
 * Auth: JWT via Authorization header; admin only.
 *
 * Behaviour:
 *   - Long content is chunked (~1000 chars, word-aware, with overlap).
 *   - Each chunk is embedded with OpenAI text-embedding-3-small (1536 dims).
 *   - Ingest is idempotent per (source, title): prior chunks are deleted and
 *     replaced, so re-running never accumulates duplicates.
 *
 * Response (200): { ingested: [{ source, title, chunks }], total_chunks }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { assertAdmin } from '../_shared/admin.ts';
import { chunkContent } from '../_shared/agent-knowledge-chunk.ts';
import { KNOWLEDGE_SEED, type SeedEntry } from './seed-data.ts';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
const MAX_CONTENT_CHARS = 50_000; // guardrail against oversized payloads

/** Batch-embed an array of texts with OpenAI; returns one vector per input. */
async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch(EMBEDDING_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw new Error(`OpenAI embeddings ${res.status}: ${detail}`);
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
  // Preserve input order (the API returns an index per item).
  return json.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/** Chunk, embed, and replace all rows for one (source, title) entry. */
async function ingestEntry(
  db: SupabaseClient,
  entry: SeedEntry,
  apiKey: string,
): Promise<number> {
  const chunks = chunkContent(entry.content);
  if (chunks.length === 0) return 0;

  const embeddings = await embedTexts(chunks, apiKey);

  // Idempotent replace: drop prior chunks for this (source, title) pair first.
  await db.from('agent_knowledge').delete().eq('source', entry.source).eq('title', entry.title);

  const rows = chunks.map((chunk, i) => ({
    source: entry.source,
    title: entry.title,
    content: chunk,
    embedding: embeddings[i],
    metadata: { chunk_index: i, chunk_count: chunks.length },
  }));

  const { error } = await db.from('agent_knowledge').insert(rows);
  if (error) throw new Error(`Insert failed for "${entry.title}": ${error.message}`);
  return chunks.length;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight(req);
  }

  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;
  const user = auth.user;

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Admin-only: this writes to an admin-scoped knowledge base.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const notAdmin = await assertAdmin(supabase, user.id, corsHeaders);
    if (notAdmin) return notAdmin;

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const body = await req.json().catch(() => ({}));

    // Resolve the set of entries to ingest: bundled seed or a single entry.
    let entries: SeedEntry[];
    if (body?.seed === true) {
      entries = KNOWLEDGE_SEED;
    } else {
      const source = typeof body?.source === 'string' ? body.source.trim() : '';
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      const content = typeof body?.content === 'string' ? body.content : '';
      if (!title || !content.trim()) {
        return new Response(
          JSON.stringify({ error: 'title and content are required' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        );
      }
      if (content.length > MAX_CONTENT_CHARS) {
        return new Response(
          JSON.stringify({ error: `content exceeds ${MAX_CONTENT_CHARS} characters` }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        );
      }
      entries = [{ source: source || 'manual', title, content }];
    }

    const ingested: Array<{ source: string; title: string; chunks: number }> = [];
    let totalChunks = 0;
    for (const entry of entries) {
      const chunks = await ingestEntry(supabase, entry, apiKey);
      ingested.push({ source: entry.source, title: entry.title, chunks });
      totalChunks += chunks;
    }

    return new Response(
      JSON.stringify({ ingested, total_chunks: totalChunks }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (err) {
    console.error('agent-knowledge-ingest error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
