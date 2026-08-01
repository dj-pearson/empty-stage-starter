/**
 * Adaptive Exposure Ladder — progression policy (US-597).
 *
 * Pure module. Decides where a child sits on a food's exposure ladder after
 * each logged attempt, and when that food is next due.
 *
 * The eight rungs are the same labels the app has always written to
 * `food_attempts.stage` (see the STAGES list in FoodSuccessTracker). Reusing
 * that vocabulary is what makes deriving a ladder from existing history
 * possible at all — see `deriveLadderFromAttempts` (US-598).
 *
 * The single most important rule here is that a refusal steps the rung DOWN,
 * not sideways and never up. Repeating an exposure that a child just refused
 * raises the pressure at the table, which is the opposite of what the food
 * chaining and SOS-style literature this feature is modelled on does. The
 * whole point of encoding the policy in one pure function is that this rule
 * cannot be quietly lost in a UI branch somewhere.
 *
 * Nothing here reads the clock or touches Supabase: the current date is
 * injected, so every rule below is directly unit-testable.
 */

/** Ordered rungs, gentlest first. Mirrored in the Swift policy (US-606). */
export const RUNGS = [
  'looking',
  'touching',
  'smelling',
  'licking',
  'tiny_taste',
  'small_bite',
  'full_bite',
  'full_portion',
] as const;

export type Rung = (typeof RUNGS)[number];

/** Outcomes already used by food_attempts.outcome. */
export type AttemptOutcome = 'success' | 'partial' | 'refused' | 'tantrum';

export type LadderStatus = 'active' | 'paused' | 'mastered' | 'backed_off';

/** Consecutive successes at a rung before the child moves up. */
export const ADVANCE_THRESHOLD = 2;
/** Days before a food that went fine (or held) comes back around. */
export const REPEAT_DAYS = 2;
/** Days of rest after a refusal. Deliberately longer than REPEAT_DAYS. */
export const COOLDOWN_DAYS = 4;
/** Days of rest after real distress. Also flips the row to backed_off. */
export const TANTRUM_COOLDOWN_DAYS = 7;
/**
 * Refusals in a row before the food rests until a parent says otherwise
 * (US-602). Two bad nights on the same food is a signal to stop, not to
 * keep trying at a lower rung.
 */
export const AUTO_PAUSE_REFUSALS = 2;

export interface LadderState {
  currentRung: Rung;
  consecutiveSuccesses: number;
  consecutiveHolds: number;
  consecutiveRefusals: number;
  status: LadderStatus;
  /** ISO date 'YYYY-MM-DD', or null when nothing is scheduled. */
  nextDueOn: string | null;
  /** ISO timestamp of the most recent attempt folded in, or null. */
  lastAttemptAt: string | null;
  pausedReason: string | null;
}

export interface ApplyOptions {
  /** ISO date 'YYYY-MM-DD' used as "today" when computing the next due date. */
  today: string;
  /** ISO timestamp of the attempt being applied. Defaults to `today`. */
  attemptAt?: string;
}

/** A fresh ladder row for a food the child has not worked on yet. */
export function initialLadderState(today: string): LadderState {
  return {
    currentRung: RUNGS[0],
    consecutiveSuccesses: 0,
    consecutiveHolds: 0,
    consecutiveRefusals: 0,
    status: 'active',
    nextDueOn: today,
    lastAttemptAt: null,
    pausedReason: null,
  };
}

export function rungIndex(rung: string): number {
  const idx = (RUNGS as readonly string[]).indexOf(rung);
  return idx === -1 ? 0 : idx;
}

export function isRung(value: unknown): value is Rung {
  return typeof value === 'string' && (RUNGS as readonly string[]).includes(value);
}

/** Next rung up, or null when already at the top. */
export function nextRung(rung: Rung): Rung | null {
  const idx = rungIndex(rung);
  return idx >= RUNGS.length - 1 ? null : RUNGS[idx + 1];
}

/** Next rung down; clamps at the bottom rather than underflowing. */
export function prevRung(rung: Rung): Rung {
  const idx = rungIndex(rung);
  return idx <= 0 ? RUNGS[0] : RUNGS[idx - 1];
}

/** Human label + emoji, matching what FoodSuccessTracker already shows. */
export const RUNG_META: Record<Rung, { label: string; emoji: string }> = {
  looking: { label: 'Looking', emoji: '👀' },
  touching: { label: 'Touching', emoji: '✋' },
  smelling: { label: 'Smelling', emoji: '👃' },
  licking: { label: 'Licking', emoji: '👅' },
  tiny_taste: { label: 'Tiny Taste', emoji: '🔬' },
  small_bite: { label: 'Small Bite', emoji: '🍴' },
  full_bite: { label: 'Full Bite', emoji: '😋' },
  full_portion: { label: 'Full Portion', emoji: '🎉' },
};

/**
 * Add whole days to an ISO 'YYYY-MM-DD' date without going near the local
 * timezone. Date arithmetic through `new Date(str)` shifts the day for
 * anyone west of UTC, which would silently move every cooldown.
 */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const ms = Date.UTC(y, (m ?? 1) - 1, d ?? 1) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Fold one attempt outcome into a ladder state.
 *
 * Returns a NEW state; the input is never mutated, so callers can keep the
 * prior value around for optimistic-update rollback (US-600).
 */
export function applyAttemptOutcome(
  state: LadderState,
  outcome: AttemptOutcome,
  opts: ApplyOptions
): LadderState {
  const { today } = opts;
  const attemptAt = opts.attemptAt ?? today;
  const next: LadderState = { ...state, lastAttemptAt: attemptAt };

  switch (outcome) {
    case 'success': {
      next.consecutiveHolds = 0;
      next.consecutiveRefusals = 0;
      next.consecutiveSuccesses = state.consecutiveSuccesses + 1;

      if (next.consecutiveSuccesses >= ADVANCE_THRESHOLD) {
        const up = nextRung(state.currentRung);
        if (up === null) {
          // Already accepting a full portion, twice over. Nothing left to
          // climb: the food graduates and stops being scheduled.
          next.status = 'mastered';
          next.nextDueOn = null;
          next.consecutiveSuccesses = 0;
          return next;
        }
        next.currentRung = up;
        next.consecutiveSuccesses = 0;
      }
      next.nextDueOn = addDays(today, REPEAT_DAYS);
      return next;
    }

    case 'partial': {
      // Engaged but not all the way. Hold the rung — pushing up on a partial
      // is how a child gets ahead of their own comfort and bounces back down.
      next.consecutiveSuccesses = 0;
      next.consecutiveRefusals = 0;
      next.consecutiveHolds = state.consecutiveHolds + 1;
      next.nextDueOn = addDays(today, REPEAT_DAYS);
      return next;
    }

    case 'refused': {
      next.consecutiveSuccesses = 0;
      next.consecutiveHolds = 0;
      next.consecutiveRefusals = state.consecutiveRefusals + 1;
      // Step down. At the bottom rung there is nowhere gentler to go, so we
      // hold at 'looking' — but the cooldown still applies.
      next.currentRung = prevRung(state.currentRung);
      next.nextDueOn = addDays(today, COOLDOWN_DAYS);

      if (next.consecutiveRefusals >= AUTO_PAUSE_REFUSALS) {
        // US-602: two in a row means this food rests until a parent chooses
        // to resume it. No nudge, no retry prompt.
        next.status = 'paused';
        next.pausedReason = 'two_refusals';
        next.nextDueOn = null;
      }
      return next;
    }

    case 'tantrum': {
      // Real distress. Longest rest, and the row will not be auto-scheduled
      // again until a parent explicitly resumes it.
      next.consecutiveSuccesses = 0;
      next.consecutiveHolds = 0;
      next.consecutiveRefusals = state.consecutiveRefusals + 1;
      next.currentRung = prevRung(state.currentRung);
      next.status = 'backed_off';
      next.pausedReason = 'distress';
      next.nextDueOn = addDays(today, TANTRUM_COOLDOWN_DAYS);
      return next;
    }

    default: {
      // Unknown outcome (an older client writing a label we do not model):
      // leave the ladder exactly where it is rather than guessing.
      return next;
    }
  }
}

/** An attempt row as this module needs it — a narrow view of food_attempts. */
export interface LadderAttempt {
  kidId: string | null;
  foodId: string | null;
  /** food_attempts.stage. Unrecognized values fall back to the first rung. */
  stage: string | null;
  outcome: string | null;
  /** ISO timestamp. Used for ordering and for lastAttemptAt. */
  attemptedAt: string | null;
}

export interface DerivedLadderRow {
  kidId: string;
  foodId: string;
  state: LadderState;
}

function isOutcome(value: unknown): value is AttemptOutcome {
  return (
    value === 'success' || value === 'partial' || value === 'refused' || value === 'tantrum'
  );
}

/**
 * Derive ladder rows from existing `food_attempts` history (US-598).
 *
 * Existing households have months of logged attempts, so the ladder should
 * open populated rather than empty. Each (kid, food) group is replayed oldest
 * first through `applyAttemptOutcome`, which means the derived rung is
 * produced by exactly the same rules that will govern it going forward — no
 * second, drifting implementation of "where are they now".
 *
 * Deterministic and idempotent: the same attempts always yield the same rows,
 * so re-running the backfill upserts instead of duplicating.
 */
export function deriveLadderFromAttempts(
  attempts: LadderAttempt[],
  opts: ApplyOptions
): DerivedLadderRow[] {
  const groups = new Map<string, { kidId: string; foodId: string; rows: LadderAttempt[] }>();

  for (const attempt of attempts) {
    // A row that is not anchored to both a kid and a food cannot describe a
    // ladder position. Skip rather than throw — history is messy.
    if (!attempt.kidId || !attempt.foodId) continue;
    if (!isOutcome(attempt.outcome)) continue;

    const key = `${attempt.kidId}::${attempt.foodId}`;
    const group = groups.get(key);
    if (group) {
      group.rows.push(attempt);
    } else {
      groups.set(key, { kidId: attempt.kidId, foodId: attempt.foodId, rows: [attempt] });
    }
  }

  const derived: DerivedLadderRow[] = [];

  for (const { kidId, foodId, rows } of groups.values()) {
    const ordered = [...rows].sort((a, b) => {
      const at = a.attemptedAt ?? '';
      const bt = b.attemptedAt ?? '';
      if (at === bt) return 0;
      return at < bt ? -1 : 1;
    });

    // Seed the fold at the rung the earliest attempt was actually logged at,
    // so a family who has been working at 'small_bite' for months does not get
    // sent back to 'looking' by the backfill.
    const first = ordered[0];
    let state = initialLadderState(opts.today);
    if (isRung(first.stage)) {
      state = { ...state, currentRung: first.stage };
    }

    for (const attempt of ordered) {
      if (!isOutcome(attempt.outcome)) continue;
      state = applyAttemptOutcome(state, attempt.outcome, {
        today: opts.today,
        attemptAt: attempt.attemptedAt ?? opts.today,
      });
    }

    derived.push({ kidId, foodId, state });
  }

  // Stable ordering keeps the backfill's inserts (and its tests) predictable.
  derived.sort((a, b) =>
    a.kidId === b.kidId ? a.foodId.localeCompare(b.foodId) : a.kidId.localeCompare(b.kidId)
  );

  return derived;
}
