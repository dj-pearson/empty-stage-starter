-- Agentic OS — US-481: Knowledge base with pgvector for RAG
-- An embedded knowledge base of product docs / FAQs so drafted support answers
-- (US-491) are grounded in real product truth via semantic retrieval.
--
-- Additive only: enables the vector extension (idempotent) and creates one new
-- table plus one match RPC. RLS: admin-only (same user_roles pattern as
-- agent_definitions). The match RPC runs SECURITY INVOKER so RLS is respected
-- for admin callers; the agents query it with the service role (RLS bypassed).

-- ============================================================================
-- 0. pgvector extension
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 1. agent_knowledge — chunked, embedded knowledge entries
-- ============================================================================
-- Embeddings are OpenAI text-embedding-3-small (1536 dims), matching the
-- embedding model used by the ingest function.
CREATE TABLE IF NOT EXISTS public.agent_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT,
  title TEXT,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approximate-nearest-neighbour index for cosine distance (pgvector HNSW).
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_embedding
  ON public.agent_knowledge USING hnsw (embedding vector_cosine_ops);
-- Re-ingest deletes prior chunks for a (source, title) pair; index that lookup.
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_source_title
  ON public.agent_knowledge(source, title);

COMMENT ON TABLE public.agent_knowledge IS
  'RAG knowledge base: chunked product docs/FAQ entries with OpenAI 1536-dim embeddings for semantic retrieval.';

DROP TRIGGER IF EXISTS trg_agent_knowledge_updated_at ON public.agent_knowledge;
CREATE TRIGGER trg_agent_knowledge_updated_at
  BEFORE UPDATE ON public.agent_knowledge
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. match_agent_knowledge — cosine-similarity retrieval RPC
-- ============================================================================
-- Returns rows whose cosine similarity (1 - cosine distance) meets the floor,
-- best matches first, capped at match_count.
CREATE OR REPLACE FUNCTION public.match_agent_knowledge(
  query_embedding vector(1536),
  match_count INT,
  min_similarity FLOAT
)
RETURNS TABLE (id UUID, title TEXT, content TEXT, similarity FLOAT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    k.id,
    k.title,
    k.content,
    1 - (k.embedding <=> query_embedding) AS similarity
  FROM public.agent_knowledge k
  WHERE k.embedding IS NOT NULL
    AND 1 - (k.embedding <=> query_embedding) >= min_similarity
  ORDER BY k.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 0);
$$;

COMMENT ON FUNCTION public.match_agent_knowledge IS
  'Semantic search over agent_knowledge: returns id, title, content, cosine similarity for the closest chunks above min_similarity.';

-- ============================================================================
-- 3. RLS — admin-only (same pattern as agent_definitions / admin_alerts)
-- ============================================================================
ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage agent knowledge"
  ON public.agent_knowledge FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );
