import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

/**
 * Every place that builds a 'YYYY-MM-DD' by way of toISOString() is either
 * converted or has a written reason (US-818).
 *
 * The trap, once: a date key in this app is a LOCAL calendar day -- what
 * "today" means to the parent holding the phone. `toISOString()` converts to
 * UTC first, so west of Greenwich every one of these flipped to tomorrow in the
 * evening. Compounding it, `d.setDate(d.getDate() - n)` walks a Date across DST
 * boundaries, where a 23- or 25-hour day lands on the same calendar date twice
 * or skips one.
 *
 * Plenty of these ARE right. A download filename, a sitemap lastmod, an
 * analytics window and UTC-anchored arithmetic all want UTC and would be made
 * worse by "fixing" them. The point of this file is not to ban the expression;
 * it is that nobody gets to write one again without saying which case they are
 * in. An unlisted file fails, and the failure names the file.
 *
 * Adding a site means adding a line here. That is the cost, and it is the
 * feature: US-818 started as 31 of these written by hand, past two correct
 * helpers that were each imported by two files.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');

/** toISOString() feeding a date-key slice. */
const DATE_KEY = /toISOString\(\)\s*\.\s*(?:split\((['"])T\1\)\[0\]|slice\(0,\s*10\))/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.|\.spec\./.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Why each remaining file is allowed to say toISOString().slice(0, 10).
 *
 * Every entry is one of three cases:
 *   UTC IS CORRECT      -- a filename, a feed date, an analytics bucket
 *   UTC-CONSISTENT      -- anchored and read back in UTC throughout
 *   DELIBERATE OFFSET   -- converts to local on purpose, and says so
 */
const REASONS: Record<string, string> = {
  // --- the helpers themselves: UTC arithmetic on ISO strings, which is right
  'src/lib/date-utils.ts':
    'addIsoDays does Date.UTC(...) + n days and formats back. UTC days are always exactly 24h, ' +
    'so this is the arithmetic that does NOT break across a DST boundary.',
  'src/lib/exposureLadder.ts':
    'addDays, the same UTC-string arithmetic as date-utils. Checked and correct in the US-818 survey.',
  'src/hooks/useFoodLadder.ts':
    'todayIsoDate subtracts getTimezoneOffset() BEFORE formatting, so it yields the local calendar ' +
    'day through a UTC formatter. Deliberate, and the offset makes it visible.',

  // --- UTC-consistent: anchored in UTC and read back in UTC
  'src/lib/seasonalRecall.ts':
    'The projection anchors at T12:00:00Z and steps with getUTC* setters throughout, so the key it ' +
    'writes matches the window SeasonalRecallCard queries with. Midday anchoring also keeps it away ' +
    'from both boundaries.',
  'src/components/SeasonalRecallCard.tsx':
    'The query range for the rows seasonalRecall.ts wrote, built the same UTC way. The two have to ' +
    'agree with each other more than either has to be local.',

  // --- analytics buckets: UTC is the reporting day
  'src/lib/conversion-tracking.ts': 'Analytics window. The reporting day is UTC for every account.',
  'src/lib/login-history.ts':
    'Sign-in history buckets, reported in UTC days so one account\'s history reads the same from '
    + 'any admin timezone.',
  'src/lib/runsDashboard.ts':
    'Agent-run windows. A run is stamped in UTC, so the bucket that counts it has to be.',
  'src/pages/SearchTrafficDashboard.tsx': 'Search Console reports in UTC days; matching it is the point.',
  'src/components/admin/seo/useSeoAudit.ts':
    'Search Console reporting window; the API answers in UTC days and the ranges must line up.',
  'src/components/admin/seo/useSeoCannibalization.ts':
    'Search Console reporting window, same reason as useSeoAudit.ts.',
  'src/components/admin/seo/useSeoFiles.ts':
    'Search Console reporting window, same reason as useSeoAudit.ts.',
  'src/components/admin/seo/useSeoIndexCoverage.ts':
    'Search Console reporting window, same reason as useSeoAudit.ts.',

  // --- feed and markup dates: the spec says UTC
  'src/lib/sitemap-utils.ts': 'sitemap lastmod is a W3C datetime; UTC is correct and stable across rebuilds.',
  'src/components/RecipeSchemaMarkup.tsx':
    'schema.org datePublished fallback. A JSON-LD date is not the parent\'s calendar day.',

  // --- download filenames: a stamp, not a key anything is looked up by
  'src/pages/Home.tsx': 'Backup download filename -- a stamp on a file, not a key anything looks up.',
  'src/pages/Grocery.tsx': 'CSV and AnyList export filenames, stamps rather than keys.',
  'src/pages/dashboard/AccountSettings.tsx': 'Data-export filename, a stamp rather than a key.',
  'src/components/LadderReportDialog.tsx': 'Report range for a printed PDF, and its filename.',
  'src/components/admin/agents/AuditTab.tsx': 'Audit CSV export filename, a stamp rather than a key.',
  'src/lib/budgetCalculator/pdfGenerator.ts': 'PDF download filename stamp; nothing reads it back.',
  'src/lib/budgetCalculator/shareImageGenerator.ts': 'Share-image filename stamp; nothing reads it back.',

  // --- admin tooling, operating on UTC account records
  'src/components/admin/BulkUserManagement.tsx': 'Admin export filename and a UTC account window.',
  'src/components/admin/ComplementarySubscriptionManager.tsx':
    'Subscription period ends, which Stripe keeps in UTC.',
  'src/components/SmartRestockSuggestions.tsx':
    'A comment only -- the code above it uses toISODate. Kept in the list so deleting the comment ' +
    'does not look like a new site appearing.',
};

const offenders = walk(SRC)
  .filter((file) => DATE_KEY.test(readFileSync(file, 'utf8')))
  .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
  .sort();

describe('every toISOString() date key is accounted for', () => {
  it('has a written reason for each file that still builds one', () => {
    const unexplained = offenders.filter((file) => !(file in REASONS));
    expect(
      unexplained,
      'These build a date key through toISOString(). Use toISODate() from ' +
        'src/lib/date-utils.ts for a LOCAL calendar day, or addIsoDays() for ' +
        'arithmetic on an ISO key -- or add the file to REASONS in this test ' +
        'saying why UTC is right there.'
    ).toEqual([]);
  });

  it('has no reason left for a file that no longer needs one', () => {
    // So the list cannot outlive the exception, the same way KNOWN_BELOW_AA
    // could not in themeContrast.test.ts.
    const stale = Object.keys(REASONS).filter((file) => !offenders.includes(file));
    expect(stale, 'These are listed but no longer build a date key; delete the entry.').toEqual([]);
  });

  it('gives a reason with something in it', () => {
    for (const [file, reason] of Object.entries(REASONS)) {
      expect(reason.length, `${file} needs a real reason, not a placeholder`).toBeGreaterThan(30);
    }
  });
});

describe('the sites a wrong day actually costs someone', () => {
  const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

  it('the dashboard asks what today is locally', () => {
    // todaysMeals drives the quick-log FAB. On UTC this showed tomorrow's
    // meals from 5pm on the US west coast, and logged results against them.
    const src = read('src/pages/Dashboard.tsx');
    expect(src).toContain('const today = toISODate(new Date());');
  });

  it('the streak walks ISO keys instead of stepping a Date', () => {
    // Two bugs in one line before: the UTC shift, and setDate() across a DST
    // boundary landing on the same calendar day twice.
    //
    // The walk moved out of Home.tsx in US-781, which collapsed four streak
    // rules into one. The property is the same and it is asserted where the
    // code now is.
    const src = read('src/lib/streakRules.ts');
    expect(src).toMatch(/addIsoDays\(todayKey, -offset\)/);
    expect(src).not.toMatch(/\.setDate\(/);
    expect(read('src/pages/Home.tsx')).not.toMatch(/date\.setDate\(date\.getDate\(\) - d\)/);
  });

  it('the generated plan steps the key, not a Date', () => {
    const src = read('src/lib/mealPlanner.ts');
    expect(src).toMatch(/addIsoDays\(startKey, d\)/);
    expect(src).not.toMatch(/date\.setDate\(today\.getDate\(\) \+ d\)/);
  });

  it('adding a recipe to the planner keeps the day you picked', () => {
    // The calendar hands back local midnight; toISOString() made that the
    // previous day for everyone west of Greenwich.
    const src = read('src/components/recipes/AddToPlannerPopover.tsx');
    expect(src).toContain('toISODate(date)');
  });

  it('last_made_date is the day the cooking happened, where it happened', () => {
    expect(read('src/components/recipes/RecipeDetailView.tsx')).toContain(
      'last_made_date: toISODate(new Date())'
    );
  });

  it('the plan window is one pair of ISO keys, shared by the query and the merge', () => {
    // They used to be two copies of the same setDate()+toISOString() expression
    // evaluated at different points in the load. Agreeing with each other by
    // coincidence is not the same as being right, and a DST boundary inside
    // the 30- or 90-day step moved the edge again.
    const src = read('src/contexts/AppContext.tsx');
    expect(src).toContain('const windowStart = addIsoDays(todayKey, -30);');
    expect(src).toContain('const windowEnd = addIsoDays(todayKey, 90);');
    expect(src).not.toMatch(/thirtyDaysAgo\.toISOString\(\)/);
  });
});
