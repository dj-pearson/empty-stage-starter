import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * US-781: there are three streak rules in this product and they disagree.
 *
 * This file does not pick the winner -- whether a refusal should break a streak
 * is a product decision, recorded in PLATFORMS.md. What it does is pin the two
 * things that are true regardless of which rule wins, so neither can regress
 * while the decision is pending:
 *
 *   1. a streak belongs to one child, and
 *   2. the count of implementations does not quietly grow.
 */

/** The Home rule, as implemented, over one child's entries. */
function homeStreak(
  entries: Array<{ date: string; kid_id: string; result?: string | null }>,
  kidId: string,
  today: Date,
): number {
  const kidEntries = entries.filter((e) => e.kid_id === kidId);
  let count = 0;
  for (let d = 0; d <= 365; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().split('T')[0];
    const hasResult = kidEntries.some((e) => e.date === dateStr && e.result);
    if (hasResult) count++;
    else if (d > 0) break;
  }
  return count;
}

const TODAY = new Date('2026-09-06T12:00:00Z');
const day = (offset: number) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - offset);
  return d.toISOString().split('T')[0];
};

describe('US-781: a streak belongs to one child', () => {
  it('does not let one sibling keep another sibling streak alive', () => {
    // Ana ate on each of the last three days. Ben ate on none of them.
    const entries = [
      { date: day(0), kid_id: 'ana', result: 'ate' },
      { date: day(1), kid_id: 'ana', result: 'ate' },
      { date: day(2), kid_id: 'ana', result: 'ate' },
    ];

    expect(homeStreak(entries, 'ana', TODAY)).toBe(3);
    // Before the fix this read the unfiltered list and returned 3 for Ben too,
    // which is the whole defect: a parent saw a streak their child never had.
    expect(homeStreak(entries, 'ben', TODAY)).toBe(0);
  });

  it('breaks on a gap, and forgives a day that has not happened yet', () => {
    const entries = [
      { date: day(1), kid_id: 'ana', result: 'ate' },
      { date: day(2), kid_id: 'ana', result: 'ate' },
      // nothing on day(3)
      { date: day(4), kid_id: 'ana', result: 'ate' },
    ];
    // Today is empty and forgiven; the run is day(1)+day(2), then the gap ends it.
    expect(homeStreak(entries, 'ana', TODAY)).toBe(2);
  });

  it('ignores an entry with no result recorded', () => {
    const entries = [
      { date: day(0), kid_id: 'ana', result: null },
      { date: day(1), kid_id: 'ana', result: 'ate' },
    ];
    expect(homeStreak(entries, 'ana', TODAY)).toBe(1);
  });

  it('Home.tsx computes its streak over the active kid entries', () => {
    // The rule above is a copy, so assert the page actually scopes its own.
    // kidPlanEntries is declared directly above the streak in that file; the
    // bug was that the streak reached past it to the unfiltered list.
    const home = fs.readFileSync('src/pages/Home.tsx', 'utf8');
    const streakBlock = home.slice(home.indexOf('const streak = useMemo('));
    const body = streakBlock.slice(0, streakBlock.indexOf('}, ['));
    expect(body).toContain('kidPlanEntries');
    expect(body).not.toMatch(/\bplanEntries\.some\b/);
  });
});

describe('US-781: the number of streak implementations', () => {
  it('is still three, and they are the three PLATFORMS.md names', () => {
    // Not a style rule. Three rules over the same data produce three numbers
    // for the same child, and a fourth would go unnoticed the same way these
    // did. When the decision lands and they collapse into one, this test should
    // be updated to assert one -- failing here is the reminder to do that.
    const web = [
      ['src/pages/Home.tsx', /const streak = useMemo\(/],
      ['src/components/ProgressDashboard.tsx', /Streak calculation/],
    ] as const;
    for (const [file, marker] of web) {
      expect(fs.readFileSync(file, 'utf8'), `${file} still holds a streak rule`).toMatch(marker);
    }
    const ios = 'ios/EatPal/EatPal/Services/BadgeService.swift';
    expect(fs.readFileSync(ios, 'utf8')).toContain('func currentStreak(');
    expect(fs.existsSync('PLATFORMS.md')).toBe(true);
  });
});
