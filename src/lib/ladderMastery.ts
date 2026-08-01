/**
 * Mastery handoff (US-603).
 *
 * Pure module. When a food reaches the top of the ladder, the question stops
 * being "how is this going" and becomes "what next" — and the app already
 * knows, because `calculate-food-similarity` has been producing chain targets
 * from the sensory model since US-296. Until now those suggestions died on a
 * page. This is the piece that turns a win into the next rung.
 *
 * Two rules keep the handoff honest:
 *
 *   - Never re-suggest a food the child is already working on (or has already
 *     mastered). A "next step" that is really a step they took last month
 *     reads as the app not paying attention.
 *   - Never suggest something the child is allergic to, no matter how well it
 *     scores on sensory similarity.
 */

import type { ChainOutcome, PickinessBucket } from './chainNetwork';

export interface ChainSuggestion {
  foodId: string;
  foodName: string;
  similarityScore: number;
  reasons: string[];
}

export interface MasteryCandidate extends ChainSuggestion {
  /** The mastered food this target chains from — the new row's anchor. */
  anchorFoodId: string;
}

export interface HandoffContext {
  /** The ladder row that just reached 'mastered'. */
  masteredFoodId: string;
  /** Every food already on this child's ladder, whatever its status. */
  ladderFoodIds: string[];
  /** Lowercased allergens for the child. */
  kidAllergens: string[];
  /** Allergens per candidate food, keyed by food id. */
  allergensByFoodId: Map<string, string[]>;
  /** How many targets to offer. Kept small on purpose. */
  limit?: number;
}

/** Offering a wall of options is its own kind of pressure. */
export const DEFAULT_HANDOFF_LIMIT = 3;

function lower(values: string[] | null | undefined): string[] {
  return (values ?? []).map((v) => v.toLowerCase().trim()).filter(Boolean);
}

/**
 * Pick the next ladder targets after a food is mastered.
 *
 * Returns candidates ranked by the existing similarity score, already
 * filtered and pre-paired with the mastered food as their anchor — which is
 * the whole point of chaining from a win rather than starting cold.
 */
export function selectHandoffCandidates(
  suggestions: ChainSuggestion[],
  ctx: HandoffContext
): MasteryCandidate[] {
  const alreadyTracked = new Set(ctx.ladderFoodIds);
  const allergens = new Set(lower(ctx.kidAllergens));
  const limit = ctx.limit ?? DEFAULT_HANDOFF_LIMIT;

  return suggestions
    .filter((s) => {
      if (!s.foodId) return false;
      if (s.foodId === ctx.masteredFoodId) return false;
      if (alreadyTracked.has(s.foodId)) return false;

      if (allergens.size > 0) {
        const foodAllergens = lower(ctx.allergensByFoodId.get(s.foodId));
        if (foodAllergens.some((a) => allergens.has(a))) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (b.similarityScore !== a.similarityScore) {
        return b.similarityScore - a.similarityScore;
      }
      // Deterministic tiebreak so the same win always offers the same list.
      return a.foodId.localeCompare(b.foodId);
    })
    .slice(0, limit)
    .map((s) => ({ ...s, anchorFoodId: ctx.masteredFoodId }));
}

export interface WinContributionArgs {
  /** Ladder row id — reused as the idempotency key. */
  ladderRowId: string;
  sourceFoodName: string;
  targetFoodName: string;
  pickinessBucket: PickinessBucket;
  /** False when the household has opted out of sharing. */
  shareEnabled: boolean;
}

export interface WinContribution {
  contributionKey: string;
  sourceFoodName: string;
  targetFoodName: string;
  pickinessBucket: PickinessBucket;
  outcome: ChainOutcome;
}

/**
 * Build the Win Network contribution for a mastery event, or null when the
 * household has opted out or the payload would be meaningless.
 *
 * The ladder row id is the idempotency key, mirroring how US-296 reuses an
 * attempt's UUID: a row can only be mastered once, so re-saving or replaying
 * a queued write cannot inflate the cross-family counts.
 */
export function buildWinContribution(args: WinContributionArgs): WinContribution | null {
  if (!args.shareEnabled) return null;

  const source = args.sourceFoodName.trim();
  const target = args.targetFoodName.trim();
  // A contribution keyed to an unnamed food teaches the network nothing.
  if (!source || !target) return null;

  return {
    contributionKey: `ladder:${args.ladderRowId}`,
    sourceFoodName: source,
    targetFoodName: target,
    pickinessBucket: args.pickinessBucket,
    outcome: 'success',
  };
}
