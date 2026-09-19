import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const insert = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({ insert: (...args: unknown[]) => insert(...args) }),
  },
}));

const {
  GENERIC_PROMOTION_MIN_HOUSEHOLDS,
  buildPromotedCatalogRow,
  fetchPromotionCandidates,
  promoteCandidate,
} = await import('./genericPromotion');

/**
 * US-798: promote a food because several families independently typed it.
 *
 * The database half is pinned by supabase/tests/us798_generic_promotion.test.sql,
 * which is where the count(DISTINCT household_id) rule lives and where the
 * story's named case -- one household adding the same food three times -- is
 * proven not to become a candidate. This file pins the client half: the
 * threshold constant, what is asked of the database, and the shape of the row
 * an accepted candidate becomes.
 */

beforeEach(() => {
  rpc.mockReset();
  insert.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
  insert.mockResolvedValue({ error: null });
});

describe('the threshold', () => {
  it('is one named constant, so raising it needs no migration', () => {
    expect(GENERIC_PROMOTION_MIN_HOUSEHOLDS).toBe(3);
  });

  it('is what the queue asks the database for', () => {
    // The SQL default is a floor for a caller that passes nothing, not the
    // setting. The setting is here.
    void fetchPromotionCandidates();
    expect(rpc).toHaveBeenCalledWith('generic_promotion_candidates', {
      p_min_households: GENERIC_PROMOTION_MIN_HOUSEHOLDS,
    });
  });

  it('can be overridden per call without touching the constant', () => {
    void fetchPromotionCandidates(5);
    expect(rpc).toHaveBeenCalledWith('generic_promotion_candidates', {
      p_min_households: 5,
    });
  });
});

describe('reading the queue', () => {
  it('maps the row into something a screen can render', async () => {
    rpc.mockResolvedValue({
      data: [{ name_normalized: 'oat milk', household_count: 4, sample_name: 'Oat Milk' }],
      error: null,
    });

    expect(await fetchPromotionCandidates()).toEqual([
      { nameNormalized: 'oat milk', householdCount: 4, sampleName: 'Oat Milk' },
    ]);
  });

  it('coerces the count, because Postgres bigint arrives as a string', async () => {
    rpc.mockResolvedValue({
      data: [{ name_normalized: 'oat milk', household_count: '4', sample_name: 'Oat Milk' }],
      error: null,
    });

    const [candidate] = await fetchPromotionCandidates();
    expect(candidate.householdCount).toBe(4);
    expect(typeof candidate.householdCount).toBe('number');
  });

  it('survives a null data field', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchPromotionCandidates()).toEqual([]);
  });

  it('throws rather than showing an empty queue on an error', async () => {
    // An empty queue and a failed read look identical on screen, and one of
    // them means "there is nothing to review" while the other does not.
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(fetchPromotionCandidates()).rejects.toMatchObject({
      message: 'permission denied',
    });
  });
});

describe('the row an accepted candidate becomes', () => {
  const candidate = { nameNormalized: 'oat milk', householdCount: 3, sampleName: 'Oat Milk' };

  it('is a verified generic from a user, because a human looked at it', () => {
    expect(buildPromotedCatalogRow(candidate)).toEqual({
      name: 'Oat Milk',
      name_normalized: 'oat milk',
      kind: 'generic',
      source: 'user',
      verification: 'verified',
    });
  });

  it('keeps the name a family typed, not the lowercased matching key', () => {
    const row = buildPromotedCatalogRow({ ...candidate, sampleName: 'Cheerios Multigrain' });
    expect(row.name).toBe('Cheerios Multigrain');
    expect(row.name_normalized).toBe('oat milk');
  });

  it('falls back to the normalized name when the sample is blank', () => {
    expect(buildPromotedCatalogRow({ ...candidate, sampleName: '   ' }).name).toBe('oat milk');
  });

  it('sends no verified_by or verified_at', () => {
    // gpc_guard_verification sets both from auth.uid() and now() and
    // overwrites whatever arrives, so an admin cannot be tricked into
    // rubber-stamping a forged stamp. Sending them would be ignored, and would
    // read as though the client decides who signed off.
    const row = buildPromotedCatalogRow(candidate) as Record<string, unknown>;
    expect(row).not.toHaveProperty('verified_by');
    expect(row).not.toHaveProperty('verified_at');
  });
});

describe('accepting', () => {
  it('inserts exactly that row', async () => {
    await promoteCandidate({ nameNormalized: 'oat milk', householdCount: 3, sampleName: 'Oat Milk' });
    expect(insert).toHaveBeenCalledWith({
      name: 'Oat Milk',
      name_normalized: 'oat milk',
      kind: 'generic',
      source: 'user',
      verification: 'verified',
    });
  });

  it('throws when the insert is rejected, so the row is not removed on screen', async () => {
    insert.mockResolvedValue({ error: { message: 'duplicate key' } });
    await expect(
      promoteCandidate({ nameNormalized: 'oat milk', householdCount: 3, sampleName: 'Oat Milk' })
    ).rejects.toMatchObject({ message: 'duplicate key' });
  });
});
