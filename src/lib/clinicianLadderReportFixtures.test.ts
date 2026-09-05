import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildClinicianLadderReport,
  type ClinicianReportInput,
  type ClinicianLadderReport,
  type ClinicianReportRow,
} from './clinicianLadderReport';

/**
 * The clinician ladder report, asserted from a SHARED fixture (US-782).
 *
 * A parent can export this report from the phone or from the web. A clinician
 * reading two documents about one child must not have to reconcile them, and
 * "both implementations were written from the same story" is not a mechanism --
 * it is a hope. tests/fixtures/ladder-report-cases.json is the mechanism: one
 * file, asserted here and, once kitchen-loop US-688 lands the iOS report, by a
 * Swift mirror of this test. Its $format.$note is written for that reader.
 *
 * This is the same pattern the kitchen-loop fixtures already use for
 * toCanonical, and for the same reason: the two platforms disagreeing quietly
 * is worse than either being wrong loudly.
 *
 * clinicianLadderReport.test.ts stays as it is. It covers this builder in
 * depth; these cases are the subset both platforms must agree on, so a Swift
 * reader has a bounded thing to implement rather than a 300-line suite.
 */

interface ExpectedRow {
  foodName?: string;
  currentRung?: string | null;
  status?: string | null;
  startRung?: string | null;
  rungHistory?: { rung: string; on: string }[];
  outcomeCounts?: Record<string, number>;
  bestPreps?: { method: string; attempts: number; acceptanceRate: number }[];
}

interface Case {
  name: string;
  input: ClinicianReportInput;
  expect: {
    totals?: { foods: number; attempts: number; mastered: number };
    rowOrder?: string[];
    rows?: Record<string, ExpectedRow>;
  };
}

interface Fixture {
  identifierPolicy: { allowedIdentifierKeys: string[]; forbiddenSubstrings: string[] };
  cases: Case[];
}

const FIXTURE_PATH = join(__dirname, '..', '..', 'tests', 'fixtures', 'ladder-report-cases.json');
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Fixture;

describe('clinician ladder report: shared cases', () => {
  it('the fixture actually loaded', () => {
    // A suite that iterates an empty array passes. Assert the cases exist
    // before believing any of them.
    expect(fixture.cases.length).toBeGreaterThan(5);
  });

  for (const testCase of fixture.cases) {
    it(testCase.name, () => {
      const report: ClinicianLadderReport = buildClinicianLadderReport(testCase.input);
      const { totals, rowOrder, rows } = testCase.expect;

      if (totals) expect(report.totals).toEqual(totals);

      if (rowOrder) {
        expect(report.rows.map((r) => r.foodName)).toEqual(rowOrder);
      }

      if (rows) {
        for (const [foodId, expected] of Object.entries(rows)) {
          const row = report.rows.find((r: ClinicianReportRow) => r.foodId === foodId);
          expect(row, `no row for ${foodId}`).toBeTruthy();
          // Only the keys a case names are checked, so adding a field to the
          // report does not invalidate every case in the file.
          for (const [key, want] of Object.entries(expected)) {
            expect(row![key as keyof ClinicianReportRow], `${foodId}.${key}`).toEqual(want);
          }
        }
      }
    });
  }
});

describe('clinician ladder report: identifier policy', () => {
  /**
   * US-782 AC 3, asserted on both platforms.
   *
   * The report carries exactly one identifier -- a first name -- and the input
   * type deliberately has nowhere to put more. A document that leaves a
   * household carrying a surname, an email or a date of birth is a different
   * kind of artefact from the one this is meant to be, and the difference is
   * not recoverable once it has been emailed to a clinic.
   */
  const policy = fixture.identifierPolicy;

  it('names a first name and nothing else', () => {
    expect(policy.allowedIdentifierKeys).toEqual(['kidFirstName']);
  });

  it('emits no forbidden identifier anywhere in a built report', () => {
    for (const testCase of fixture.cases) {
      const serialized = JSON.stringify(buildClinicianLadderReport(testCase.input));
      for (const forbidden of policy.forbiddenSubstrings) {
        expect(
          serialized.toLowerCase().includes(forbidden.toLowerCase()),
          `${testCase.name} leaked "${forbidden}"`
        ).toBe(false);
      }
    }
  });

  it('carries a first name through to the report, unchanged', () => {
    const report = buildClinicianLadderReport(fixture.cases[0].input);
    expect(report.kidFirstName).toBe(fixture.cases[0].input.kidFirstName);
  });

  it('cannot be handed a surname: the input type has no field for one', () => {
    // A compile-time guarantee, restated at runtime so the Swift mirror has
    // something to match. Extra keys are ignored rather than copied through.
    const sneaky = {
      ...fixture.cases[0].input,
      lastName: 'Bakersfield',
      email: 'parent@example.test',
    } as ClinicianReportInput;

    const serialized = JSON.stringify(buildClinicianLadderReport(sneaky));
    expect(serialized).not.toContain('Bakersfield');
    expect(serialized).not.toContain('parent@example.test');
  });
});
