/**
 * US-839: keep the VPAT and the code from drifting apart.
 *
 * src/pages/VPAT.tsx is a published conformance report, and it had been wrong
 * in three different directions at once: one row overstated (2.4.1 claimed a
 * working skip link that moved no focus), and two understated, describing
 * remediations as "in progress" months after they shipped. All three survived
 * because a conformance report is prose, and nothing runs prose.
 *
 * So rows whose claim is machine-checkable now name the test that checks them,
 * and this file makes that pointer load-bearing in both directions: the file
 * must exist, and it must mention the criterion it is cited for. A row that
 * points at a deleted or unrelated test fails here.
 *
 * Rows with no `verifiedBy` are not exempt from being true -- they are claims
 * about things a machine cannot settle ("no content flashes more than 3 times
 * per second", "components with the same function have consistent labels").
 * Adding a pointer to a row is how you promote one from judgement to evidence.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const vpat = readFileSync(join(ROOT, 'src', 'pages', 'VPAT.tsx'), 'utf8');

interface Row {
  criterion: string;
  conformance: string;
  verifiedBy: string[];
}

/** Parse the wcagCriteria literal. One row per line, which the file keeps to. */
function parseRows(source: string): Row[] {
  const rows: Row[] = [];
  for (const line of source.split('\n')) {
    const criterion = line.match(/\{\s*criterion:\s*"([\d.]+)"/)?.[1];
    if (!criterion) continue;
    const conformance = line.match(/conformance:\s*"([^"]+)"/)?.[1] ?? '';
    const verified = line.match(/verifiedBy:\s*\[([^\]]*)\]/)?.[1] ?? '';
    rows.push({
      criterion,
      conformance,
      verifiedBy: [...verified.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
    });
  }
  return rows;
}

const rows = parseRows(vpat);
const verified = rows.filter((r) => r.verifiedBy.length > 0);

describe('US-839: the parser', () => {
  it('reads the whole table, not a fragment of it', () => {
    expect(rows.length).toBeGreaterThanOrEqual(50);
    expect(rows.map((r) => r.criterion)).toContain('1.1.1');
    expect(rows.map((r) => r.criterion)).toContain('4.1.2');
  });

  it('reads conformance levels rather than defaulting them', () => {
    const levels = new Set(rows.map((r) => r.conformance));
    expect(levels.has('Supports')).toBe(true);
    expect(levels.has('Not Applicable')).toBe(true);
    expect(levels.has('')).toBe(false);
  });

  it('finds the rows that cite a test', () => {
    // Without this the per-row assertions below iterate an empty list.
    expect(verified.length).toBeGreaterThanOrEqual(6);
  });

  it('distinguishes a cited row from an uncited one', () => {
    const parsed = parseRows(
      '{ criterion: "9.9.9", name: "X", level: "A", conformance: "Supports", remarks: "r", verifiedBy: ["a.ts", "b.ts"] },\n' +
        '{ criterion: "9.9.8", name: "Y", level: "A", conformance: "Supports", remarks: "r" },'
    );
    expect(parsed[0].verifiedBy).toEqual(['a.ts', 'b.ts']);
    expect(parsed[1].verifiedBy).toEqual([]);
  });
});

describe('US-839: every cited test exists and covers the row citing it', () => {
  const citations = verified.flatMap((r) => r.verifiedBy.map((path) => [r.criterion, path] as const));

  it.each(citations)('%s -> %s', (criterion, path) => {
    const full = join(ROOT, path);
    expect(existsSync(full), `${criterion} cites ${path}, which does not exist`).toBe(true);
    expect(
      readFileSync(full, 'utf8').includes(criterion),
      `${path} is cited for WCAG ${criterion} but never mentions it, so the link is unverifiable`
    ).toBe(true);
  });
});

describe('US-839: the rows this story corrected', () => {
  const by = (criterion: string) => rows.find((r) => r.criterion === criterion)!;

  it('2.1.2 No Keyboard Trap is claimed on the strength of a test', () => {
    expect(by('2.1.2').conformance).toBe('Supports');
    expect(by('2.1.2').verifiedBy).toContain('src/components/accessibilityWidget.focus.test.tsx');
  });

  it('2.2.2 Pause, Stop, Hide is claimed on the strength of a test', () => {
    expect(by('2.2.2').conformance).toBe('Supports');
    expect(by('2.2.2').verifiedBy).toContain('src/lib/reducedMotion.test.ts');
  });

  it('no row claims full support for something described as in progress', () => {
    // Belt and braces: "Supports" and "remediation in progress" in one row is
    // the contradiction that started this story.
    for (const line of vpat.split('\n')) {
      if (!/conformance:\s*"Supports"/.test(line)) continue;
      expect(line, 'a row claims Supports while calling itself unfinished').not.toMatch(
        /in progress|not yet|does not yet/i
      );
    }
  });
});
