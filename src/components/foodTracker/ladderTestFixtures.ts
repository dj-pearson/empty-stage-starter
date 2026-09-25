import type { LadderRow } from '@/hooks/useFoodLadder';

/** A ladder row for tests; override what the case is about. */
export function ladderRow(overrides: Partial<LadderRow> = {}): LadderRow {
  return {
    id: 'row-1',
    kidId: 'kid-1',
    foodId: 'food-1',
    currentRung: 'touching',
    consecutiveSuccesses: 0,
    consecutiveHolds: 0,
    consecutiveRefusals: 0,
    status: 'active',
    nextDueOn: '2026-09-24',
    lastAttemptAt: null,
    pairedSafeFoodId: null,
    preferredPrep: null,
    preferredMealSlot: null,
    pausedReason: null,
    ...overrides,
  };
}
