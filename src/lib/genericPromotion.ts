import { supabase } from '@/integrations/supabase/client';

/**
 * Promoting a food into the shared catalog because several families
 * independently typed it (US-798).
 *
 * PRIVACY IS THE POINT OF THE GATE. A household food row is private data:
 * "Grandma's casserole", or a row with a child's name in it, must never reach a
 * public catalog. Requiring several UNRELATED households to have independently
 * typed the same name is itself a decent privacy filter, and the human review
 * below is the backstop. Nothing reaches the catalog without an admin pressing
 * accept.
 */

/**
 * How many separate households must have typed a name before it is worth an
 * operator's attention.
 *
 * ONE NAMED CONSTANT, and it lives here rather than in the SQL body so it can
 * be raised without a migration -- the database takes it as a parameter and
 * only enforces a floor of 2. Three is a starting point, not a finding: raise
 * it if the queue fills with noise.
 */
export const GENERIC_PROMOTION_MIN_HOUSEHOLDS = 3;

export interface PromotionCandidate {
  /** The normalized name, which is what the catalog is keyed by. */
  nameNormalized: string;
  /** How many SEPARATE households typed it. Never a count of adds. */
  householdCount: number;
  /** One example of how a family actually spelled it, for the reviewer. */
  sampleName: string;
}

interface CandidateRow {
  name_normalized: string;
  household_count: number;
  sample_name: string;
}

/**
 * Read the queue. The count is computed by the database when this is called --
 * there is no stored counter anywhere in this path, deliberately, because
 * foods.times_added counts ADDS and one household adding a food three times
 * must not trip a threshold of three.
 */
export async function fetchPromotionCandidates(
  minHouseholds: number = GENERIC_PROMOTION_MIN_HOUSEHOLDS
): Promise<PromotionCandidate[]> {
  const { data, error } = await supabase.rpc('generic_promotion_candidates', {
    p_min_households: minHouseholds,
  });
  if (error) throw error;

  return ((data ?? []) as CandidateRow[]).map((row) => ({
    nameNormalized: row.name_normalized,
    householdCount: Number(row.household_count),
    sampleName: row.sample_name,
  }));
}

/**
 * The row an accepted candidate becomes.
 *
 * `source: 'user'` and `verification: 'verified'`, because a human looked at
 * it -- which is the one thing separating this from the barcode path, where a
 * scan lands `unverified` and nobody has checked anything.
 *
 * verified_by and verified_at are DELIBERATELY ABSENT. The gpc_guard_verification
 * trigger sets them from auth.uid() and now() on any row arriving verified, and
 * overwrites whatever the caller sent -- so that an admin cannot be tricked
 * into rubber-stamping a forged stamp that came in alongside
 * verification='verified'. Sending them from here would be ignored, and worse,
 * would read as though the client decides who signed off.
 *
 * Pure, so the shape can be tested without a database or a rendered screen.
 */
export function buildPromotedCatalogRow(candidate: PromotionCandidate): {
  name: string;
  name_normalized: string;
  kind: 'generic';
  source: 'user';
  verification: 'verified';
} {
  return {
    // The name a family typed, not the normalized key: the normalized form is
    // lowercased and exists for matching, so showing it back would be a
    // downgrade in every catalog row this path creates.
    name: candidate.sampleName.trim() || candidate.nameNormalized,
    name_normalized: candidate.nameNormalized,
    kind: 'generic',
    source: 'user',
    verification: 'verified',
  };
}

/**
 * Accept a candidate: one catalog row, stamped by the database with the admin
 * who is signed in.
 */
export async function promoteCandidate(candidate: PromotionCandidate): Promise<void> {
  const { error } = await supabase
    .from('grocery_product_catalog')
    .insert(buildPromotedCatalogRow(candidate));
  if (error) throw error;
}
