/**
 * Agentic OS — Knowledge Base Ingest (US-481)
 *
 * Admin-only (JWT + user_roles check). Two modes:
 *  - POST {source, title, content}: chunk the content (~1000 chars, overlap),
 *    embed each chunk (OpenAI text-embedding-3-small, 1536-dim), and upsert
 *    one agent_knowledge row per chunk.
 *  - POST {backfill: true}: embed existing rows whose embedding IS NULL (used
 *    to backfill the seeded FAQ entries after deploy).
 *
 * config.toml sets verify_jwt = true; we additionally require the caller to
 * hold the 'admin' role before doing anything.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { chunkText } from '../_shared/chunk.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIM = 1536;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Generate an embedding for one text via OpenAI. Throws on failure. */
async function embed(text: string, apiKey: string): Promise<number[]> {
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: text, dimensions: EMBED_DIM }),
  });
  if (!resp.ok) {
    throw new Error(`OpenAI embeddings error ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.data[0].embedding as number[];
}

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const openaiKey = Deno.env.get('OPENAI_GLOBAL_API');

  // --- Admin gate: verify the caller's JWT and require the admin role -------
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Unauthorized: missing token' }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Unauthorized: invalid token' }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .maybeSingle();
  if (!roleRow) return json({ error: 'Forbidden: admin role required' }, 403);

  if (!openaiKey) return json({ error: 'OPENAI_GLOBAL_API not configured' }, 500);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    // --- Backfill mode: embed rows that are missing an embedding -----------
    if (payload.backfill === true) {
      const { data: rows, error } = await admin
        .from('agent_knowledge')
        .select('id, content')
        .is('embedding', null)
        .limit(200);
      if (error) throw new Error(error.message);

      let embedded = 0;
      for (const row of rows ?? []) {
        const vector = await embed(row.content as string, openaiKey);
        const { error: upErr } = await admin
          .from('agent_knowledge')
          .update({ embedding: vector as unknown as string })
          .eq('id', row.id);
        if (!upErr) embedded++;
      }
      return json({ mode: 'backfill', embedded, remaining: (rows?.length ?? 0) - embedded });
    }

    // --- Ingest mode: chunk + embed + insert -------------------------------
    const source = typeof payload.source === 'string' ? payload.source : '';
    const title = typeof payload.title === 'string' ? payload.title : '';
    const content = typeof payload.content === 'string' ? payload.content : '';
    if (!source || !title || !content) {
      return json({ error: 'source, title, and content are required' }, 400);
    }

    const chunks = chunkText(content);
    const inserted: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vector = await embed(chunk, openaiKey);
      const { data, error } = await admin
        .from('agent_knowledge')
        .insert({
          source,
          title: chunks.length > 1 ? `${title} (part ${i + 1}/${chunks.length})` : title,
          content: chunk,
          embedding: vector as unknown as string,
          metadata: { chunkIndex: i, chunkCount: chunks.length, ingestedBy: userData.user.id },
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      if (data) inserted.push(data.id as string);
    }

    return json({ mode: 'ingest', chunks: chunks.length, ids: inserted });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
};
