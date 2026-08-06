/**
 * Safe Food Insurance — what to surface, and when (US-611).
 *
 * Pure module sitting between the risk scores (US-610) and the card. It
 * answers three questions the UI should not be deciding for itself: which
 * slipping foods are worth showing, whether an offer to serve one less often
 * makes any sense, and whether a food the parent already dismissed has earned
 * the right to come back.
 *
 * The dismissal rule is the important one. A warning a parent has already
 * seen and set aside must not reappear the next time they open the app —
 * that is how a useful signal turns into noise they learn to swipe past. So a
 * dismissal holds for `DISMISS_DAYS`, and the only thing that overrides it is
 * genuinely new information: a food that was merely worth watching when it was
 * dismissed has since crossed into at-risk. Same food, worse news, so it is
 * allowed to speak once more.
 *
 * Nothing here reads the clock — `now` is injected.
 */

import type { SafeFoodRisk, SafeFoodSignal } from './safeFoodRisk';

/** How long a dismissal silences a food. Long enough not to nag. */
export const DISMISS_DAYS = 14;
/** At most this many cards at once. A wall of warnings is its own alarm. */
export const MAX_ALERTS = 2;

export interface SafeFoodDismissal {
  foodId: string;
  /** ISO timestamp of when the parent dismissed it. */
  at: string;
  /** The level the food was at when dismissed, so an escalation can override. */
  level: SafeFoodRisk['level'];
}

export interface SafeFoodAlert {
  risk: SafeFoodRisk;
  /**
   * True when the food is also being served often. Only then is "serve it a
   * bit less" sensible advice — telling a parent to ration a food they serve
   * twice a month helps nobody.
   */
  offerRotation: boolean;
  /** The signals worth showing, minus the ones that are not observations. */
  observations: SafeFoodSignal[];
}

function daysBetween(now: string, then: string): number {
  const a = Date.parse(now);
  const b = Date.parse(then);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return (a - b) / 86_400_000;
}

const LEVEL_RANK: Record<SafeFoodRisk['level'], number> = {
  none: 0,
  watch: 1,
  at_risk: 2,
};

/**
 * Decide which slipping foods to show right now.
 *
 * Returns worst-first, capped, with dismissed foods filtered out unless their
 * risk has escalated since the dismissal.
 */
export function selectSafeFoodAlerts(
  rows: SafeFoodRisk[],
  dismissals: SafeFoodDismissal[],
  now: string
): SafeFoodAlert[] {
  const byFood = new Map(dismissals.map((d) => [d.foodId, d]));

  return rows
    .filter((row) => row.level !== 'none')
    .filter((row) => {
      const dismissal = byFood.get(row.foodId);
      if (!dismissal) return true;
      // Escalation is new information, so it is allowed through.
      if (LEVEL_RANK[row.level] > LEVEL_RANK[dismissal.level]) return true;
      return daysBetween(now, dismissal.at) >= DISMISS_DAYS;
    })
    .slice(0, MAX_ALERTS)
    .map((row) => ({
      risk: row,
      offerRotation: row.signals.some((signal) => signal.kind === 'over_served'),
      // 'recovering' never appears alongside a flagged level, but filtering it
      // here means the card can render `observations` without a second guard.
      observations: row.signals.filter((signal) => signal.kind !== 'recovering'),
    }));
}

/** Record a dismissal, replacing any earlier one for the same food. */
export function recordDismissal(
  dismissals: SafeFoodDismissal[],
  risk: SafeFoodRisk,
  now: string
): SafeFoodDismissal[] {
  return [
    ...dismissals.filter((d) => d.foodId !== risk.foodId),
    { foodId: risk.foodId, at: now, level: risk.level },
  ];
}

/**
 * Drop dismissals that can no longer silence anything, so the stored list does
 * not grow forever in a parent's browser.
 */
export function pruneDismissals(dismissals: SafeFoodDismissal[], now: string): SafeFoodDismissal[] {
  return dismissals.filter((d) => daysBetween(now, d.at) < DISMISS_DAYS);
}
