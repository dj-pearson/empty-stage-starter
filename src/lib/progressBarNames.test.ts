import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { tagEnd } from './jsxTagEnd';

/**
 * US-859: a progress bar with no accessible name announces as "progressbar, 50%".
 *
 * Found by measurement, not by reading: the planner had never been scanned with
 * a child in it -- the fake backend served no kids, so every browser check in CI
 * saw "No Children Added" -- and the first scan of the real screen returned
 * eight aria-progressbar-name violations. They were the four macro bars in
 * DailyMacrosSummary, twice over, each with its label in a sibling row that a
 * sighted reader pairs up by position and nothing else does.
 *
 * A scan of the tree then found 57 <Progress> elements with no name and three
 * with one. Two files are fixed here (the macros, and the two bars on the
 * insights dashboard); the rest are recorded below so they can only decrease.
 *
 * WHY A PER-FILE COUNT rather than file:line: line numbers churn on every edit
 * above them and the list would be rewritten by changes that have nothing to do
 * with it. A count per file still fails on a new bar in a listed file, and the
 * key set still fails on a new file.
 *
 * The detector shares src/lib/jsxTagEnd.ts with iconButtonNames.test.ts, and
 * shares its reason: `<Progress ... />` attributes contain braces and quoted strings, and
 * the obvious `<Progress([^>]*)>` stops at the first `>` inside a template
 * literal.
 */
const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/**
 * Unnamed <Progress> per file, measured 2026-09-11. This list may only SHRINK.
 * Naming a bar means deleting its entry here; adding one anywhere fails.
 *
 * The admin ones are the bulk and the least urgent -- they are internal screens.
 * The 12 outside src/components/admin/ are on screens a parent uses.
 */
const KNOWN_UNNAMED: Record<string, number> = {
  'src/App.tsx': 1,
  'src/components/AchievementBadge.tsx': 1,
  'src/components/AchievementsView.tsx': 1,
  'src/components/ChildIntakeQuestionnaire.tsx': 1,
  'src/components/KidMealVoting.tsx': 1,
  'src/components/ProgressDashboard.tsx': 4,
  'src/components/TonightCookDialog.tsx': 1,
  'src/components/VoteResultsDisplay.tsx': 3,
  'src/components/admin/BulkUserManagement.tsx': 2,
  'src/components/admin/ContentOptimizer.tsx': 2,
  'src/components/admin/ConversionFunnelDashboard.tsx': 1,
  'src/components/admin/DocumentExportManager.tsx': 1,
  'src/components/admin/EmailABTesting.tsx': 4,
  'src/components/admin/EmailAnalyticsDashboard.tsx': 4,
  'src/components/admin/LoginAnalyticsDashboard.tsx': 4,
  'src/components/admin/MultiRegionBackup.tsx': 3,
  'src/components/admin/SEOManager.tsx': 1,
  'src/components/admin/SEOResultsDisplay.tsx': 3,
  'src/components/admin/SystemHealthDashboard.tsx': 3,
  'src/components/admin/agents/RunsTab.tsx': 1,
  'src/components/admin/pseo/PseoAdminDashboard.tsx': 1,
  'src/components/admin/seo/SeoContentTab.tsx': 4,
  'src/components/admin/seo/SeoKeywordsTab.tsx': 1,
  'src/components/subscription/UsageMeter.tsx': 1,
  'src/pages/Onboarding.tsx': 1,
  'src/pages/PickyEaterQuiz.tsx': 1,
  'src/pages/dashboard/AccountSettings.tsx': 1,
  'src/pages/dashboard/Billing.tsx': 1,
};

export function scanProgress(file: string, source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/<Progress(?=[\s>/])/g)) {
    const end = tagEnd(source, m.index! + m[0].length);
    if (end === -1) continue;
    const attrs = source.slice(m.index! + m[0].length, end);
    if (/\baria-label\b|\baria-labelledby\b/.test(attrs)) continue;
    found.push(`${file}:${source.slice(0, m.index!).split('\n').length}`);
  }
  return found;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // shadcn primitives are vendored and out of bounds per CLAUDE.md; the
      // name belongs on the consumer anyway, since only it knows what the bar
      // is measuring.
      if (entry !== 'ui') walk(full, out);
    } else if (entry.endsWith('.tsx') && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

const counts: Record<string, number> = {};
for (const file of walk(SRC)) {
  const rel = file.slice(ROOT.length + 1).split('\\').join('/');
  const hits = scanProgress(rel, readFileSync(file, 'utf8'));
  if (hits.length > 0) counts[rel] = hits.length;
}

describe('US-859: the detector', () => {
  it('finds a bar with no name', () => {
    expect(scanProgress('x.tsx', '<Progress value={50} className="h-2" />')).toHaveLength(1);
  });

  it('accepts aria-label and aria-labelledby', () => {
    expect(scanProgress('x.tsx', '<Progress value={50} aria-label="Calories" />')).toEqual([]);
    expect(scanProgress('x.tsx', '<Progress value={50} aria-labelledby="cal" />')).toEqual([]);
  });

  it('sees past a > inside a template string, which is why it is not a regex', () => {
    const tricky = '<Progress value={50} className={`h-2 ${a > b ? "x" : ""}`} aria-label="Fat" />';
    expect(scanProgress('x.tsx', tricky)).toEqual([]);
  });

  it('does not match a component whose name merely starts with Progress', () => {
    expect(scanProgress('x.tsx', '<ProgressDashboard value={50} />')).toEqual([]);
  });

  it('scans a realistic number of files', () => {
    expect(walk(SRC).length).toBeGreaterThanOrEqual(200);
  });
});

describe('US-859: unnamed progress bars may only decrease', () => {
  it('no file has more than it is recorded with', () => {
    const grown = Object.entries(counts)
      .filter(([file, n]) => n > (KNOWN_UNNAMED[file] ?? 0))
      .map(([file, n]) => `${file}: ${n} unnamed (recorded ${KNOWN_UNNAMED[file] ?? 0})`);
    expect(grown, `give the new <Progress> an aria-label:\n${grown.join('\n')}`).toEqual([]);
  });

  it('the record has no entry for a file that is now clean', () => {
    // So the list cannot outlive the debt. Naming the last bar in a file means
    // deleting its line here, which is the point at which somebody notices the
    // number is going down.
    const stale = Object.keys(KNOWN_UNNAMED).filter((file) => (counts[file] ?? 0) === 0);
    expect(stale, `fixed -- remove from KNOWN_UNNAMED:\n${stale.join('\n')}`).toEqual([]);
  });

  it('the two screens this story fixed stay fixed', () => {
    expect(counts['src/components/DailyMacrosSummary.tsx'] ?? 0).toBe(0);
    expect(counts['src/pages/InsightsDashboard.tsx'] ?? 0).toBe(0);
  });
});
