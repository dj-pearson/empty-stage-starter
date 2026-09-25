-- Win Network ("Other families' wins", US-296) privacy hardening.
--
-- Three problems with the network as 20260512000000 + 20260928000008 left it:
--
-- 1. The k-anonymity floor counted attempts, not families.
--    fetch_chain_network_targets showed a row once total_count >= 5, and one
--    household logging five attempts reaches that alone. A row is now public
--    only when at least 5 DISTINCT households contributed to it
--    (distinct_contributors >= 5) as well as total_count >= 5. 5 is the floor
--    the original migration used; nothing else in the repo defines one.
--
-- 2. chain_network_aggregates had an open SELECT policy
--    ("Authenticated users read aggregates", USING (true)), so every row,
--    including the ones under the floor, was readable with a plain
--    `select * from chain_network_aggregates`. That policy is dropped and
--    SELECT/INSERT/UPDATE/DELETE are revoked from anon and authenticated.
--    fetch_chain_network_targets becomes SECURITY DEFINER and is now the only
--    client read path, with the floor applied inside it.
--
-- 3. contribute_chain_network trusted the client. Food names and outcome were
--    whatever the caller sent, the contribution key referenced nothing the
--    server checked, and there was no rate limit, so any signed-in user could
--    write arbitrary text (a child's name, a brand, anything) into a table
--    other families read, as many times as they liked. Now:
--      - the key must resolve to a row the caller's household owns (see
--        "Resolving the key" below); otherwise the call returns false;
--      - names come from the shared catalog, never from the client: a food
--        counts only if it maps to a VERIFIED grocery_product_catalog row
--        (foods.canonical_id, or an exact normalized-name match on a verified
--        generic row). A household's own food with no such mapping is not
--        contributed at all, so personal names never enter the network. A
--        branded catalog row contributes its generic parent's name, or
--        nothing if it has none;
--      - the outcome comes from the stored attempt (success, partial,
--        refused; tantrum counts as refused), not from p_outcome;
--      - at most 100 calls per user per UTC day reach the resolver.
--    p_source_food_name, p_target_food_name and p_outcome are still accepted,
--    so the signature is unchanged, and are ignored. p_pickiness_bucket is
--    still taken from the client: it is one of four fixed values and carries
--    nothing identifying.
--
-- Resolving the key. The web client builds p_contribution_key with
-- deterministicUuid() (src/lib/chainNetworkKeys.ts, FNV-1a expanded to a UUID)
-- from one of two strings, and has done since before this migration:
--   - '<food_attempts.id>:<food_chain_suggestions.source_food_id>'
--     (recordContributionsFromAttempt, src/lib/chainNetwork.ts)
--   - 'ladder:<kid_food_ladder.id>'
--     (buildWinContribution, src/lib/ladderMastery.ts)
-- public.chain_network_key() reproduces that function, so the server can find
-- which of the caller's own attempts or ladder rows the key was built from
-- without any client change. Candidates are limited to the caller's
-- households, to attempts created and ladder rows updated in the last 30
-- days, and (ladder) to status = 'mastered'. A key that matches none of them
-- is refused.
--
-- Distinct contributors. Each new contribution stores contributor_hash =
-- sha256(secret || 'household:<kid's household_id>') in hex (or 'user:<id>'
-- for a legacy kid with no household). The secret is 32 random bytes made by
-- this migration into chain_network_secret, a table no client role can read;
-- it is not in the repo. The hash lets the server count distinct families per
-- aggregate row without storing a household id next to the food data.
--
-- Backfill. Rows written before this migration have no contributor_hash and
-- no way to recover one. Existing aggregates get distinct_contributors = 1
-- (the column default), and recomputation counts only hashed contributions
-- with a floor of 1, so every pre-existing row is hidden until five distinct
-- households contribute to it through the verified path. That is deliberate:
-- an old row could be one household's five attempts.
--
-- Clients. The web app is the only caller of both RPCs
-- (src/lib/chainNetwork.ts: contribute_chain_network, fetch_chain_network_targets)
-- and never selects chain_network_aggregates directly. Nothing under ios/ or
-- app/ references either RPC or either table (checked 2026-09-25), so no
-- shipped iOS build loses anything. Both RPC signatures and return types are
-- unchanged, and a refused contribution still returns false, not an error.
--
-- The admin-only policies stay but become inert for client roles, because the
-- table privileges are revoked; admin tooling reads through service_role. No
-- code in src/ reads either table (only the generated types mention them).
--
-- migration-safety: allow drop-policy (US-296 network fix, owner-approved 2026-09-25: "Authenticated users read aggregates" exposed rows under the k-anonymity floor; no client reads the table directly, reads go through fetch_chain_network_targets)

-- ------------------------------------------------------------ secret ---
CREATE TABLE IF NOT EXISTS public.chain_network_secret (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  salt BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chain_network_secret ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the table owner (SECURITY DEFINER functions)
-- reads it.
REVOKE ALL ON TABLE public.chain_network_secret FROM PUBLIC, anon, authenticated;

-- 32 bytes from two gen_random_uuid() values (pg_strong_random underneath;
-- 244 random bits after the fixed version/variant bits). Built-in, so it does
-- not depend on which schema pgcrypto lives in.
INSERT INTO public.chain_network_secret (id, salt)
VALUES (
  true,
  decode(
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
    'hex')
)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.chain_network_secret IS
  'Win Network: server-only salt for contributor_hash (20260928000010). Never exposed to clients.';

-- ------------------------------------------------------- rate limit ---
CREATE TABLE IF NOT EXISTS public.chain_network_contribution_quota (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.chain_network_contribution_quota ENABLE ROW LEVEL SECURITY;
-- No policies: written and read only by contribute_chain_network.
REVOKE ALL ON TABLE public.chain_network_contribution_quota FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.chain_network_contribution_quota IS
  'Win Network: per-user daily call counter for contribute_chain_network (20260928000010).';

-- ---------------------------------------------------- new columns ---
ALTER TABLE public.chain_network_contributions
  ADD COLUMN IF NOT EXISTS contributor_hash TEXT;

ALTER TABLE public.chain_network_aggregates
  ADD COLUMN IF NOT EXISTS distinct_contributors INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_chain_network_contrib_triple_contributor
  ON public.chain_network_contributions
     (source_food_key, target_food_key, pickiness_bucket, contributor_hash);

COMMENT ON COLUMN public.chain_network_contributions.contributor_hash IS
  'sha256(server salt || household) hex; NULL for rows written before 20260928000010.';
COMMENT ON COLUMN public.chain_network_aggregates.distinct_contributors IS
  'Distinct hashed households behind this row, floor 1. Pre-20260928000010 rows are 1 '
  'because their contributors cannot be recovered. The public floor is >= 5.';

-- ------------------------------------------------ aggregate access ---
DROP POLICY IF EXISTS "Authenticated users read aggregates" ON public.chain_network_aggregates;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.chain_network_aggregates FROM PUBLIC, anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.chain_network_contributions FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------- key helpers ---
-- FNV-1a over the UTF-8 bytes, as 8 lowercase hex digits. Mirrors fnv1a() in
-- src/lib/chainNetworkKeys.ts, which walks UTF-16 code units; the two agree
-- for ASCII, and every input here is a UUID plus ASCII punctuation.
CREATE OR REPLACE FUNCTION public.chain_network_fnv1a_hex(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  b BYTEA := convert_to(p_input, 'UTF8');
  h BIGINT := 2166136261;
  i INTEGER;
BEGIN
  FOR i IN 0 .. length(b) - 1 LOOP
    h := ((h # get_byte(b, i)) * 16777619) & 4294967295;
  END LOOP;
  RETURN lpad(to_hex(h), 8, '0');
END;
$$;

-- deterministicUuid() from src/lib/chainNetworkKeys.ts.
CREATE OR REPLACE FUNCTION public.chain_network_key(p_input TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  a TEXT := public.chain_network_fnv1a_hex(p_input);
  b TEXT := public.chain_network_fnv1a_hex(p_input || ':b');
  c TEXT := public.chain_network_fnv1a_hex(p_input || ':c');
  d TEXT := public.chain_network_fnv1a_hex(p_input || ':d');
BEGIN
  RETURN (a || '-' || substr(b, 1, 4) || '-4' || substr(b, 5, 3) || '-8'
          || substr(c, 1, 3) || '-' || substr(c, 5, 4) || d)::uuid;
END;
$$;

-- The network key for a household food: the normalized name of the verified
-- catalog row it maps to, or NULL when it maps to none (then it is never
-- contributed). A branded row stands in for its verified generic parent.
CREATE OR REPLACE FUNCTION public.chain_network_food_key(p_food_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT nullif(public.normalize_chain_food_name(k.name), '')
  FROM (
    -- 1. foods.canonical_id -> verified generic row, or a verified branded
    --    row's verified generic parent.
    SELECT coalesce(
             CASE WHEN c.kind = 'generic' THEN c.name END,
             CASE WHEN c.kind = 'branded' AND p.kind = 'generic'
                       AND p.verification = 'verified' THEN p.name END
           ) AS name, 1 AS pref
    FROM public.foods f
    JOIN public.grocery_product_catalog c ON c.id = f.canonical_id
    LEFT JOIN public.grocery_product_catalog p ON p.id = c.parent_food_id
    WHERE f.id = p_food_id
      AND c.verification = 'verified'
    UNION ALL
    -- 2. The household's name, exactly as the catalog normalizes it, equals a
    --    verified generic row.
    SELECT c.name, 2
    FROM public.foods f
    JOIN public.grocery_product_catalog c
      ON c.name_normalized = public.normalize_product_name(f.name)
    WHERE f.id = p_food_id
      AND c.kind = 'generic'
      AND c.verification = 'verified'
  ) k
  WHERE k.name IS NOT NULL
  ORDER BY k.pref
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.chain_network_fnv1a_hex(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chain_network_key(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chain_network_food_key(UUID) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.chain_network_key(TEXT) IS
  'Server copy of deterministicUuid() in src/lib/chainNetworkKeys.ts; keep the two identical.';
COMMENT ON FUNCTION public.chain_network_food_key(UUID) IS
  'Win Network key for a household food: its verified catalog name, normalized; NULL if unmapped.';

-- ---------------------------------------------- contribute_chain_network ---
CREATE OR REPLACE FUNCTION public.contribute_chain_network(
  p_contribution_key UUID,
  p_source_food_name TEXT,
  p_target_food_name TEXT,
  p_pickiness_bucket TEXT,
  p_outcome TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_daily_limit CONSTANT INTEGER := 100;
  c_window CONSTANT INTERVAL := interval '30 days';
  v_uid UUID := auth.uid();
  v_share BOOLEAN;
  v_calls INTEGER;
  v_prefix TEXT;
  v_source_food UUID;
  v_target_food UUID;
  v_raw_outcome TEXT;
  v_household UUID;
  v_kid_user UUID;
  v_found BOOLEAN := false;
  v_source TEXT;
  v_target TEXT;
  v_bucket TEXT;
  v_outcome TEXT;
  v_hash TEXT;
  v_inserted BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  -- Consent (20260928000008). No row means the column default, TRUE.
  SELECT p.share_chain_outcomes INTO v_share
  FROM public.picky_win_preferences p
  WHERE p.user_id = v_uid;
  IF FOUND AND v_share IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF p_contribution_key IS NULL THEN RETURN false; END IF;

  -- Rate limit: every consenting call counts, accepted or not, so guessing
  -- keys costs quota too.
  INSERT INTO public.chain_network_contribution_quota AS q (user_id, day, calls)
  VALUES (v_uid, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET calls = q.calls + 1
  RETURNING q.calls INTO v_calls;
  DELETE FROM public.chain_network_contribution_quota
   WHERE user_id = v_uid AND day < (now() AT TIME ZONE 'utc')::date - 1;
  IF v_calls > c_daily_limit THEN
    RETURN false;
  END IF;

  v_prefix := left(p_contribution_key::text, 8);

  -- Resolve the key: an attempt of one of the caller's kids, paired with a
  -- chain suggestion that targets the attempted food.
  SELECT fcs.source_food_id, fa.food_id, fa.outcome, k.household_id, k.user_id
    INTO v_source_food, v_target_food, v_raw_outcome, v_household, v_kid_user
  FROM public.food_attempts fa
  JOIN public.kids k ON k.id = fa.kid_id
  JOIN public.food_chain_suggestions fcs ON fcs.target_food_id = fa.food_id
  WHERE (k.household_id IN (SELECT hm.household_id FROM public.household_members hm
                             WHERE hm.user_id = v_uid)
         OR (k.household_id IS NULL AND k.user_id = v_uid))
    AND coalesce(fa.created_at, fa.attempted_at) >= now() - c_window
    AND fcs.source_food_id IS NOT NULL
    AND public.chain_network_fnv1a_hex(fa.id::text || ':' || fcs.source_food_id::text) = v_prefix
    AND public.chain_network_key(fa.id::text || ':' || fcs.source_food_id::text) = p_contribution_key
  LIMIT 1;
  v_found := FOUND;

  -- Or a mastered ladder row of one of the caller's kids.
  IF NOT v_found THEN
    SELECT coalesce(l.paired_safe_food_id, l.food_id), l.food_id, 'success',
           k.household_id, k.user_id
      INTO v_source_food, v_target_food, v_raw_outcome, v_household, v_kid_user
    FROM public.kid_food_ladder l
    JOIN public.kids k ON k.id = l.kid_id
    WHERE (k.household_id IN (SELECT hm.household_id FROM public.household_members hm
                               WHERE hm.user_id = v_uid)
           OR (k.household_id IS NULL AND k.user_id = v_uid))
      AND l.status = 'mastered'
      AND GREATEST(l.updated_at, coalesce(l.last_attempt_at, l.updated_at)) >= now() - c_window
      AND public.chain_network_fnv1a_hex('ladder:' || l.id::text) = v_prefix
      AND public.chain_network_key('ladder:' || l.id::text) = p_contribution_key
    LIMIT 1;
    v_found := FOUND;
  END IF;

  IF NOT v_found THEN RETURN false; END IF;

  -- Both foods must be the same household's (or the same legacy user's).
  IF NOT EXISTS (
       SELECT 1 FROM public.foods f
       WHERE f.id = v_source_food
         AND (f.household_id = v_household
              OR (f.household_id IS NULL AND f.user_id = v_kid_user)))
     OR NOT EXISTS (
       SELECT 1 FROM public.foods f
       WHERE f.id = v_target_food
         AND (f.household_id = v_household
              OR (f.household_id IS NULL AND f.user_id = v_kid_user))) THEN
    RETURN false;
  END IF;

  -- Catalog names only; an unmapped food is not contributed.
  v_source := public.chain_network_food_key(v_source_food);
  v_target := public.chain_network_food_key(v_target_food);
  IF v_source IS NULL OR v_target IS NULL OR v_source = v_target THEN
    RETURN false;
  END IF;

  v_outcome := CASE lower(trim(coalesce(v_raw_outcome, '')))
                 WHEN 'success' THEN 'success'
                 WHEN 'partial' THEN 'partial'
                 WHEN 'refused' THEN 'refused'
                 WHEN 'tantrum' THEN 'refused'
               END;
  IF v_outcome IS NULL THEN RETURN false; END IF;

  v_bucket := lower(coalesce(nullif(trim(p_pickiness_bucket), ''), 'unknown'));
  IF v_bucket NOT IN ('low', 'medium', 'high', 'unknown') THEN
    v_bucket := 'unknown';
  END IF;

  SELECT encode(sha256(s.salt || convert_to(
           CASE WHEN v_household IS NOT NULL THEN 'household:' || v_household::text
                ELSE 'user:' || v_kid_user::text END, 'UTF8')), 'hex')
    INTO v_hash
  FROM public.chain_network_secret s
  WHERE s.id;
  IF v_hash IS NULL THEN RETURN false; END IF;

  INSERT INTO public.chain_network_contributions (
    contribution_key, source_food_key, target_food_key,
    pickiness_bucket, outcome, contributor_hash
  ) VALUES (
    p_contribution_key, v_source, v_target, v_bucket, v_outcome, v_hash
  )
  ON CONFLICT (contribution_key) DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT coalesce(v_inserted, false) THEN
    RETURN false;
  END IF;

  INSERT INTO public.chain_network_aggregates AS a (
    source_food_key, target_food_key, pickiness_bucket,
    success_count, partial_count, refused_count, total_count,
    distinct_contributors, first_observed_at, last_observed_at
  ) VALUES (
    v_source, v_target, v_bucket,
    CASE WHEN v_outcome = 'success' THEN 1 ELSE 0 END,
    CASE WHEN v_outcome = 'partial' THEN 1 ELSE 0 END,
    CASE WHEN v_outcome = 'refused' THEN 1 ELSE 0 END,
    1, 1, now(), now()
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

  -- Recount from the hashed log, floor 1. Legacy (NULL-hash) contributions
  -- never raise it: they may all be one household.
  UPDATE public.chain_network_aggregates a
     SET distinct_contributors = GREATEST(1, (
           SELECT count(DISTINCT c.contributor_hash)
           FROM public.chain_network_contributions c
           WHERE c.source_food_key = v_source
             AND c.target_food_key = v_target
             AND c.pickiness_bucket = v_bucket
             AND c.contributor_hash IS NOT NULL))
   WHERE a.source_food_key = v_source
     AND a.target_food_key = v_target
     AND a.pickiness_bucket = v_bucket;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.contribute_chain_network(UUID, TEXT, TEXT, TEXT, TEXT) IS
  'Idempotent contribution keyed by the client''s deterministicUuid of an attempt+source or a '
  'mastered ladder row the caller''s household owns. Names come from the verified catalog and '
  'the outcome from the stored attempt; the name/outcome arguments are ignored. Returns false '
  'when refused: opted out, over 100 calls/day, unknown key, or an unmapped food (20260928000010).';

REVOKE ALL ON FUNCTION public.contribute_chain_network(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contribute_chain_network(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ------------------------------------------- fetch_chain_network_targets ---
-- Same signature and columns. The source name the web client sends is a
-- household food name, so it is mapped to the same catalog key contributions
-- use: the caller's own food with that name, else a verified generic catalog
-- row with that name, else the name itself normalized.
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
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH input AS (
    SELECT public.normalize_chain_food_name(p_source_food_name) AS raw_key,
           lower(coalesce(nullif(trim(p_pickiness_bucket), ''), '')) AS bucket
  ),
  resolved AS (
    SELECT coalesce(
      (SELECT public.chain_network_food_key(f.id)
         FROM public.foods f, input i
        WHERE public.normalize_chain_food_name(f.name) = i.raw_key
          AND auth.uid() IS NOT NULL
          AND (f.household_id IN (SELECT hm.household_id FROM public.household_members hm
                                   WHERE hm.user_id = auth.uid())
               OR (f.household_id IS NULL AND f.user_id = auth.uid()))
          AND public.chain_network_food_key(f.id) IS NOT NULL
        LIMIT 1),
      (SELECT nullif(public.normalize_chain_food_name(c.name), '')
         FROM public.grocery_product_catalog c
        WHERE c.name_normalized = public.normalize_product_name(p_source_food_name)
          AND c.kind = 'generic'
          AND c.verification = 'verified'
        LIMIT 1),
      (SELECT i.raw_key FROM input i)
    ) AS src
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
  FROM public.chain_network_aggregates a, resolved r, input n
  WHERE r.src <> ''
    AND a.source_food_key = r.src
    -- k-anonymity: five distinct households, not five attempts.
    AND a.distinct_contributors >= 5
    AND a.total_count >= 5
    AND (n.bucket = '' OR a.pickiness_bucket = n.bucket OR a.pickiness_bucket = 'unknown')
  ORDER BY a.success_count DESC, a.total_count DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 5), 25));
$$;

COMMENT ON FUNCTION public.fetch_chain_network_targets(TEXT, TEXT, INTEGER) IS
  'The only client read of the Win Network. Returns rows with >= 5 distinct contributing '
  'households and >= 5 contributions; SECURITY DEFINER because the table is not client-readable '
  '(20260928000010).';

REVOKE ALL ON FUNCTION public.fetch_chain_network_targets(TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_chain_network_targets(TEXT, TEXT, INTEGER) TO authenticated;

COMMENT ON TABLE public.chain_network_aggregates IS
  'US-296: rolled-up cross-household chain counts. Not client-readable; served only through '
  'fetch_chain_network_targets with a 5-distinct-household floor (20260928000010).';
