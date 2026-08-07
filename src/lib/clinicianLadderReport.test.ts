/**
 * US-605: clinician ladder report data assembly.
 *
 * Pinned independently of jsPDF — the numbers a therapist reads off the page
 * are the thing that has to be right, and a rendering test would not tell us
 * whether they are.
 */

import { describe, it, expect } from 'vitest';
import {
  MIN_PREP_ATTEMPTS,
  buildClinicianLadderReport,
  type ClinicianReportAttempt,
  type ClinicianReportInput,
} from './clinicianLadderReport';

const FROM = '2026-03-01';
const TO = '2026-03-31';

function attempt(
  over: Partial<ClinicianReportAttempt> & { foodId: string }
): ClinicianReportAttempt {
  return {
    stage: 'looking',
    outcome: 'success',
    attemptedAt: '2026-03-10T18:00:00.000Z',
    preparationMethod: null,
    ...over,
  };
}

function build(over: Partial<ClinicianReportInput> = {}) {
  return buildClinicianLadderReport({
    kidFirstName: 'Emma',
    from: FROM,
    to: TO,
    attempts: [],
    ladderRows: [],
    foodNames: { broccoli: 'Broccoli', peas: 'Peas', nuggets: 'Nuggets' },
    ...over,
  });
}

describe('buildClinicianLadderReport', () => {
  it('counts every outcome, refusals and distress included', () => {
    const report = build({
      attempts: [
        attempt({ foodId: 'broccoli', outcome: 'success' }),
        attempt({ foodId: 'broccoli', outcome: 'success' }),
        attempt({ foodId: 'broccoli', outcome: 'partial' }),
        attempt({ foodId: 'broccoli', outcome: 'refused' }),
        attempt({ foodId: 'broccoli', outcome: 'tantrum' }),
      ],
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].outcomeCounts).toEqual({
      success: 2,
      partial: 1,
      refused: 1,
      tantrum: 1,
      total: 5,
    });
    expect(report.totals).toEqual({ foods: 1, attempts: 5, mastered: 0 });
  });

  it('orders the most-worked food first, ties broken by name', () => {
    const report = build({
      attempts: [
        attempt({ foodId: 'peas' }),
        attempt({ foodId: 'peas' }),
        attempt({ foodId: 'peas' }),
        attempt({ foodId: 'nuggets' }),
        attempt({ foodId: 'broccoli' }),
      ],
    });

    expect(report.rows.map((r) => r.foodName)).toEqual(['Peas', 'Broccoli', 'Nuggets']);
  });

  it('records rung transitions only, not one line per attempt', () => {
    const report = build({
      attempts: [
        attempt({ foodId: 'broccoli', stage: 'looking', attemptedAt: '2026-03-02T18:00:00Z' }),
        attempt({ foodId: 'broccoli', stage: 'looking', attemptedAt: '2026-03-04T18:00:00Z' }),
        attempt({ foodId: 'broccoli', stage: 'touching', attemptedAt: '2026-03-09T18:00:00Z' }),
        attempt({ foodId: 'broccoli', stage: 'touching', attemptedAt: '2026-03-12T18:00:00Z' }),
        attempt({ foodId: 'broccoli', stage: 'smelling', attemptedAt: '2026-03-20T18:00:00Z' }),
      ],
    });

    expect(report.rows[0].rungHistory).toEqual([
      { rung: 'looking', on: '2026-03-02' },
      { rung: 'touching', on: '2026-03-09' },
      { rung: 'smelling', on: '2026-03-20' },
    ]);
    expect(report.rows[0].startRung).toBe('looking');
  });

  it('records a step back down as its own transition', () => {
    const report = build({
      attempts: [
        attempt({ foodId: 'broccoli', stage: 'small_bite', attemptedAt: '2026-03-05T18:00:00Z' }),
        attempt({
          foodId: 'broccoli',
          stage: 'tiny_taste',
          outcome: 'refused',
          attemptedAt: '2026-03-11T18:00:00Z',
        }),
      ],
    });

    expect(report.rows[0].rungHistory.map((h) => h.rung)).toEqual(['small_bite', 'tiny_taste']);
  });

  it('ranks prep methods by observed acceptance and needs more than one night', () => {
    const report = build({
      attempts: [
        // Roasted: 2 attempts, both good.
        attempt({ foodId: 'broccoli', preparationMethod: 'Roasted', outcome: 'success' }),
        attempt({ foodId: 'broccoli', preparationMethod: 'roasted', outcome: 'success' }),
        // Steamed: 3 attempts, mixed.
        attempt({ foodId: 'broccoli', preparationMethod: 'Steamed', outcome: 'success' }),
        attempt({ foodId: 'broccoli', preparationMethod: 'Steamed', outcome: 'partial' }),
        attempt({ foodId: 'broccoli', preparationMethod: 'Steamed', outcome: 'refused' }),
        // Raw: a single good night, which proves nothing.
        attempt({ foodId: 'broccoli', preparationMethod: 'Raw', outcome: 'success' }),
      ],
    });

    const preps = report.rows[0].bestPreps;
    expect(preps.map((p) => p.method)).toEqual(['Roasted', 'Steamed']);
    expect(preps[0]).toEqual({ method: 'Roasted', attempts: 2, acceptanceRate: 1 });
    expect(preps[1].acceptanceRate).toBe(0.5);
    expect(preps.every((p) => p.attempts >= MIN_PREP_ATTEMPTS)).toBe(true);
  });

  it('excludes attempts outside the range at either end', () => {
    const report = build({
      attempts: [
        attempt({ foodId: 'broccoli', attemptedAt: '2026-02-28T23:00:00Z' }),
        attempt({ foodId: 'broccoli', attemptedAt: '2026-03-01T00:30:00Z' }),
        attempt({ foodId: 'broccoli', attemptedAt: '2026-03-31T23:30:00Z' }),
        attempt({ foodId: 'broccoli', attemptedAt: '2026-04-01T00:30:00Z' }),
      ],
    });

    expect(report.totals.attempts).toBe(2);
    expect(report.rows[0].outcomeCounts.total).toBe(2);
  });

  it('ignores attempts with an unrecognized outcome rather than guessing', () => {
    const report = build({
      attempts: [
        attempt({ foodId: 'broccoli', outcome: 'maybe' }),
        attempt({ foodId: 'broccoli', outcome: null }),
        attempt({ foodId: 'broccoli', outcome: 'success' }),
      ],
    });

    expect(report.totals.attempts).toBe(1);
  });

  it('keeps a food that is on the ladder but had no attempts in the range', () => {
    const report = build({
      attempts: [attempt({ foodId: 'broccoli' })],
      ladderRows: [
        { foodId: 'broccoli', currentRung: 'touching', status: 'active' },
        { foodId: 'peas', currentRung: 'licking', status: 'paused' },
      ],
    });

    const peas = report.rows.find((r) => r.foodName === 'Peas')!;
    expect(peas.outcomeCounts.total).toBe(0);
    expect(peas.currentRung).toBe('licking');
    expect(peas.status).toBe('paused');
    expect(peas.rungHistory).toEqual([]);
    // Zero-attempt rows sort last, so the range's real work reads first.
    expect(report.rows[report.rows.length - 1].foodName).toBe('Peas');
  });

  it('reports where each food sits now alongside where it started', () => {
    const report = build({
      attempts: [
        attempt({ foodId: 'broccoli', stage: 'looking', attemptedAt: '2026-03-02T18:00:00Z' }),
        attempt({ foodId: 'broccoli', stage: 'touching', attemptedAt: '2026-03-15T18:00:00Z' }),
      ],
      ladderRows: [{ foodId: 'broccoli', currentRung: 'smelling', status: 'active' }],
    });

    expect(report.rows[0].startRung).toBe('looking');
    expect(report.rows[0].currentRung).toBe('smelling');
  });

  it('counts mastered foods for the summary line', () => {
    const report = build({
      ladderRows: [
        { foodId: 'nuggets', currentRung: 'full_portion', status: 'mastered' },
        { foodId: 'broccoli', currentRung: 'touching', status: 'active' },
      ],
    });

    expect(report.totals.mastered).toBe(1);
  });

  it('carries the child by first name and nothing else identifying', () => {
    const report = build({
      attempts: [attempt({ foodId: 'broccoli' })],
      ladderRows: [{ foodId: 'broccoli', currentRung: 'touching', status: 'active' }],
    });

    expect(report.kidFirstName).toBe('Emma');
    const serialized = JSON.stringify(report);
    for (const forbidden of ['kidId', 'kid_id', 'householdId', 'household_id', 'userId', 'dob']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('produces the same document for the same range', () => {
    const attempts = [
      attempt({ foodId: 'peas', attemptedAt: '2026-03-05T18:00:00Z' }),
      attempt({ foodId: 'broccoli', attemptedAt: '2026-03-06T18:00:00Z' }),
      attempt({ foodId: 'nuggets', attemptedAt: '2026-03-07T18:00:00Z' }),
    ];

    expect(build({ attempts })).toEqual(build({ attempts: [...attempts].reverse() }));
  });
});
