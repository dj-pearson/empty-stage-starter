/**
 * US-611: which slipping foods surface, and when a dismissed one may return.
 *
 * The dismissal tests carry the story's "does not immediately re-nag"
 * criterion. The escalation case is the deliberate exception: same food, worse
 * news, so it gets to speak once more.
 */

import { describe, it, expect } from 'vitest';
import {
  DISMISS_DAYS,
  MAX_ALERTS,
  pruneDismissals,
  recordDismissal,
  selectSafeFoodAlerts,
  type SafeFoodDismissal,
} from './safeFoodAlerts';
import type { SafeFoodRisk } from './safeFoodRisk';

const NOW = '2026-08-06T18:00:00.000Z';

function daysBefore(days: number): string {
  return new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
}

function risk(over: Partial<SafeFoodRisk> & { foodId: string }): SafeFoodRisk {
  return {
    foodName: over.foodId,
    level: 'at_risk',
    score: 0.7,
    signals: [{ kind: 'declining_acceptance', baselineRate: 1, recentRate: 0.3 }],
    recentAcceptanceRate: 0.3,
    baselineAcceptanceRate: 1,
    recentRefusalRate: 0.6,
    baselineRefusalRate: 0,
    observations: { recent: 6, baseline: 8 },
    insufficientData: false,
    ...over,
  };
}

describe('selectSafeFoodAlerts', () => {
  it('shows nothing when no food is flagged', () => {
    expect(selectSafeFoodAlerts([risk({ foodId: 'nuggets', level: 'none' })], [], NOW)).toEqual([]);
  });

  it('surfaces a flagged food with its observations', () => {
    const [alert] = selectSafeFoodAlerts([risk({ foodId: 'nuggets' })], [], NOW);

    expect(alert.risk.foodId).toBe('nuggets');
    expect(alert.observations).toHaveLength(1);
    expect(alert.offerRotation).toBe(false);
  });

  it('offers rotation only when the food is also being over-served', () => {
    const overServed = risk({
      foodId: 'nuggets',
      signals: [
        { kind: 'declining_acceptance', baselineRate: 1, recentRate: 0.3 },
        { kind: 'over_served', tier: 'high', shortWindowCount: 5, longWindowCount: 12 },
      ],
    });

    expect(selectSafeFoodAlerts([overServed], [], NOW)[0].offerRotation).toBe(true);
    expect(selectSafeFoodAlerts([risk({ foodId: 'toast' })], [], NOW)[0].offerRotation).toBe(false);
  });

  it('does not re-nag about a food the parent just dismissed', () => {
    const dismissals: SafeFoodDismissal[] = [
      { foodId: 'nuggets', at: daysBefore(1), level: 'at_risk' },
    ];

    expect(selectSafeFoodAlerts([risk({ foodId: 'nuggets' })], dismissals, NOW)).toEqual([]);
  });

  it('lets a dismissed food return once the dismissal has aged out', () => {
    const dismissals: SafeFoodDismissal[] = [
      { foodId: 'nuggets', at: daysBefore(DISMISS_DAYS + 1), level: 'at_risk' },
    ];

    const alerts = selectSafeFoodAlerts([risk({ foodId: 'nuggets' })], dismissals, NOW);
    expect(alerts.map((a) => a.risk.foodId)).toEqual(['nuggets']);
  });

  it('lets a dismissed food return early when the risk has escalated', () => {
    // Dismissed while it was only worth watching; it is now at risk.
    const dismissals: SafeFoodDismissal[] = [
      { foodId: 'nuggets', at: daysBefore(1), level: 'watch' },
    ];

    const alerts = selectSafeFoodAlerts(
      [risk({ foodId: 'nuggets', level: 'at_risk' })],
      dismissals,
      NOW
    );
    expect(alerts.map((a) => a.risk.foodId)).toEqual(['nuggets']);
  });

  it('does not treat a de-escalation as new information', () => {
    const dismissals: SafeFoodDismissal[] = [
      { foodId: 'nuggets', at: daysBefore(1), level: 'at_risk' },
    ];

    expect(
      selectSafeFoodAlerts([risk({ foodId: 'nuggets', level: 'watch' })], dismissals, NOW)
    ).toEqual([]);
  });

  it('dismissal is remembered per food, not globally', () => {
    const dismissals: SafeFoodDismissal[] = [
      { foodId: 'nuggets', at: daysBefore(1), level: 'at_risk' },
    ];

    const alerts = selectSafeFoodAlerts(
      [risk({ foodId: 'nuggets' }), risk({ foodId: 'toast' })],
      dismissals,
      NOW
    );
    expect(alerts.map((a) => a.risk.foodId)).toEqual(['toast']);
  });

  it('caps how many warnings appear at once', () => {
    const rows = ['a', 'b', 'c', 'd'].map((id) => risk({ foodId: id }));
    expect(selectSafeFoodAlerts(rows, [], NOW)).toHaveLength(MAX_ALERTS);
  });

  it('treats an unparseable dismissal timestamp as expired rather than silencing forever', () => {
    const dismissals: SafeFoodDismissal[] = [
      { foodId: 'nuggets', at: 'not-a-date', level: 'at_risk' },
    ];

    expect(selectSafeFoodAlerts([risk({ foodId: 'nuggets' })], dismissals, NOW)).toHaveLength(1);
  });
});

describe('recordDismissal', () => {
  it('replaces an earlier dismissal for the same food', () => {
    const existing: SafeFoodDismissal[] = [
      { foodId: 'nuggets', at: daysBefore(30), level: 'watch' },
    ];

    const next = recordDismissal(existing, risk({ foodId: 'nuggets', level: 'at_risk' }), NOW);

    expect(next).toHaveLength(1);
    expect(next[0]).toEqual({ foodId: 'nuggets', at: NOW, level: 'at_risk' });
  });

  it('leaves other foods alone', () => {
    const existing: SafeFoodDismissal[] = [{ foodId: 'toast', at: daysBefore(2), level: 'watch' }];

    const next = recordDismissal(existing, risk({ foodId: 'nuggets' }), NOW);
    expect(next.map((d) => d.foodId).sort()).toEqual(['nuggets', 'toast']);
  });
});

describe('pruneDismissals', () => {
  it('drops the ones that can no longer silence anything', () => {
    const dismissals: SafeFoodDismissal[] = [
      { foodId: 'fresh', at: daysBefore(1), level: 'at_risk' },
      { foodId: 'stale', at: daysBefore(DISMISS_DAYS + 5), level: 'at_risk' },
    ];

    expect(pruneDismissals(dismissals, NOW).map((d) => d.foodId)).toEqual(['fresh']);
  });
});
