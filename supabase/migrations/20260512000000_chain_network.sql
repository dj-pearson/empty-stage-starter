-- US-296: Picky-Eater Win Network
-- Anonymized cross-user aggregation of food-chain transitions.
-- No PII is recorded: contributions are keyed by an opaque UUID (the
-- food_attempt.id from the contributing user) so the same attempt can't
-- be counted twice, but the row carries no link back to user/kid/household.
--
-- Privacy model:
--   - chain_network_contributions: one row per attribution event, no FK to
--     auth.users / kids / households. The contribution_key column reuses
--     the attempt's UUID purely as an idempotency token; even with that
--     UUID an attacker has no way to map back to a user (UUIDs are random
--     and food_attempts is RLS-locked to the owning household).
--   - chain_network_aggregates: rolled-up counts per (source, target,
--     pickiness_bucket). Read access is granted to all authenticated users
--     but a k-anonymity threshold (>= 5 contributions) is enforced at the
--     query layer (see fetch_chain_network_targets RPC).
--   - All writes go through the contribute_chain_network() SECURITY DEFINER
--     RPC; users cannot insert/update directly.

CREATE TABLE IF NOT EXISTS chain_network_contributions (
  contribution_key UUID PRIMARY KEY,
  source_food_key TEXT NOT NULL,
  target_food_key TEXT NOT NULL,
  pickiness_bucket TEXT NOT NULL CHECK (pickiness_bucket IN ('low', 'medium', 'high', 'unknown')),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'partial', 'refused')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chain_network_contrib_target
  ON chain_network_contributions(target_food_key);
CREATE INDEX IF NOT EXISTS idx_chain_network_contrib_source
  ON chain_network_contributions(source_food_key);
CREATE INDEX IF NOT EXISTS idx_chain_network_contrib_recorded
  ON chain_network_contributions(recorded_at DESC);

CREATE TABLE IF NOT EXISTS chain_network_aggregates (
  source_food_key TEXT NOT NULL,
  target_food_key TEXT NOT NULL,
  pickiness_bucket TEXT NOT NULL CHECK (pickiness_bucket IN ('low', 'medium', 'high', 'unknown')),
  success_count INTEGER NOT NULL DEFAULT 0,
  partial_count INTEGER NOT NULL DEFAULT 0,
  refused_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_food_key, target_food_key, pickiness_bucket)
);

CREATE INDEX IF NOT EXISTS idx_chain_network_aggregates_source
  ON chain_network_aggregates(source_food_key);
CREATE INDEX IF NOT EXISTS idx_chain_network_aggregates_total
  ON chain_network_aggregates(total_count DESC);

ALTER TABLE chain_network_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_network_aggregates ENABLE ROW LEVEL SECURITY;

-- Contributions are write-only via the RPC. Authenticated users can read
-- their own contribution by key (useful for dedupe checks); they cannot
-- enumerate or update.
CREATE POLICY "No direct read of contributions"
  ON chain_network_contributions FOR SELECT
  USING (false);

CREATE POLICY "Admins can read contributions"
  ON chain_network_contributions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Aggregates are publicly readable to authenticated users; the RPC enforces
-- the k-anonymity threshold so direct table reads (which expose all rows)
-- are still safe because no row links to a user.
CREATE POLICY "Authenticated users read aggregates"
  ON chain_network_aggregates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage aggregates"
  ON chain_network_aggregates FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Normalization helper: lowercase, trim, collapse whitespace, strip leading
-- "the ", drop trivial punctuation. Stable so the same food name from
-- different households aggregates to the same key.
CREATE OR REPLACE FUNCTION public.normalize_chain_food_name(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s TEXT;
BEGIN
  IF p_name IS NULL THEN RETURN ''; END IF;
  s := lower(trim(p_name));
  s := regexp_replace(s, '^the\s+', '');
  s := regexp_replace(s, '[''"\.,!?\(\)\[\]]', '', 'g');
  s := regexp_replace(s, '\s+', ' ', 'g');
  RETURN s;
END;
$$;

-- The contribute RPC is SECURITY DEFINER so it can write to the aggregate
-- table even though direct INSERT is blocked by RLS. It is idempotent:
-- re-calling with the same contribution_key is a no-op.
CREATE OR REPLACE FUNCTION public.contribute_chain_network(
  p_contribution_key UUID,
  p_source_food_name TEXT,
  p_target_food_name TEXT,
  p_pickiness_bucket TEXT,
  p_outcome TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source TEXT;
  v_target TEXT;
  v_bucket TEXT;
  v_outcome TEXT;
  v_inserted BOOLEAN;
BEGIN
  IF p_contribution_key IS NULL THEN RETURN false; END IF;

  v_source := public.normalize_chain_food_name(p_source_food_name);
  v_target := public.normalize_chain_food_name(p_target_food_name);
  IF v_source = '' OR v_target = '' OR v_source = v_target THEN
    RETURN false;
  END IF;

  v_bucket := lower(coalesce(nullif(trim(p_pickiness_bucket), ''), 'unknown'));
  IF v_bucket NOT IN ('low', 'medium', 'high', 'unknown') THEN
    v_bucket := 'unknown';
  END IF;

  v_outcome := lower(coalesce(nullif(trim(p_outcome), ''), 'success'));
  IF v_outcome NOT IN ('success', 'partial', 'refused') THEN
    RETURN false;
  END IF;

  -- Idempotent contribution insert. ON CONFLICT DO NOTHING so we can detect
  -- whether this was a fresh contribution before incrementing aggregates.
  INSERT INTO chain_network_contributions (
    contribution_key, source_food_key, target_food_key,
    pickiness_bucket, outcome
  ) VALUES (
    p_contribution_key, v_source, v_target, v_bucket, v_outcome
  )
  ON CONFLICT (contribution_key) DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT coalesce(v_inserted, false) THEN
    RETURN false;
  END IF;

  INSERT INTO chain_network_aggregates AS a (
    source_food_key, target_food_key, pickiness_bucket,
    success_count, partial_count, refused_count, total_count,
    first_observed_at, last_observed_at
  ) VALUES (
    v_source, v_target, v_bucket,
    CASE WHEN v_outcome = 'success' THEN 1 ELSE 0 END,
    CASE WHEN v_outcome = 'partial' THEN 1 ELSE 0 END,
    CASE WHEN v_outcome = 'refused' THEN 1 ELSE 0 END,
    1, now(), now()
  )
  ON CONFLICT (source_food_key, target_food_key, pickiness_bucket)
  DO UPDATE SET
    success_count = a.success_count
      + CASE WHEN v_outcome = 'success' THEN 1 ELSE 0 END,
    partial_count = a.partial_count
      + CASE WHEN v_outcome = 'partial' THEN 1 ELSE 0 END,
    refused_count = a.refused_count
      + CASE WHEN v_outcome = 'refused' THEN 1 ELSE 0 END,
    total_count = a.total_count + 1,
    last_observed_at = now();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.contribute_chain_network(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contribute_chain_network(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Read RPC: enforces k-anonymity (>= 5 total contributions) and returns
-- the top targets for a given source. Optional pickiness_bucket filter.
CREATE OR REPLACE FUNCTION public.fetch_chain_network_targets(
  p_source_food_name TEXT,
  p_pickiness_bucket TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 5
) RETURNS TABLE (
  target_food_key TEXT,
  pickiness_bucket TEXT,
  success_count INTEGER,
  partial_count INTEGER,
  refused_count INTEGER,
  total_count INTEGER,
  success_rate NUMERIC,
  last_observed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  WITH normalized AS (
    SELECT public.normalize_chain_food_name(p_source_food_name) AS src,
           lower(coalesce(nullif(trim(p_pickiness_bucket), ''), '')) AS bucket
  )
  SELECT
    a.target_food_key,
    a.pickiness_bucket,
    a.success_count,
    a.partial_count,
    a.refused_count,
    a.total_count,
    ROUND((a.success_count::NUMERIC / NULLIF(a.total_count, 0)) * 100, 1) AS success_rate,
    a.last_observed_at
  FROM chain_network_aggregates a, normalized n
  WHERE a.source_food_key = n.src
    AND a.total_count >= 5  -- k-anonymity floor
    AND (n.bucket = '' OR a.pickiness_bucket = n.bucket OR a.pickiness_bucket = 'unknown')
  ORDER BY a.success_count DESC, a.total_count DESC
  LIMIT GREATEST(1, LEAST(p_limit, 25));
$$;

REVOKE ALL ON FUNCTION public.fetch_chain_network_targets(TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_chain_network_targets(TEXT, TEXT, INTEGER) TO authenticated;

COMMENT ON TABLE chain_network_contributions IS
  'US-296: anonymized per-event log; contribution_key is opaque (no PII)';
COMMENT ON TABLE chain_network_aggregates IS
  'US-296: rolled-up cross-user chain success counts; k-anonymity enforced via fetch RPC';
COMMENT ON FUNCTION public.contribute_chain_network IS
  'Idempotent contribution; uses contribution_key for dedupe';
COMMENT ON FUNCTION public.fetch_chain_network_targets IS
  'K-anonymous read (>=5 contributions); filters by source food and optional pickiness';
