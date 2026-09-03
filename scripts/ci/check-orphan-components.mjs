#!/usr/bin/env node
/**
 * Every .tsx under src/components and src/pages is reachable from the app
 * entry point (US-771).
 *
 * The repo accumulated components -- thousands of lines -- that nothing
 * renders: two complete alternate calendar implementations, a third navigation
 * tree, a billing UI disconnected from the billing page, an unused
 * accessible-form family. None of it is broken, which is exactly the problem.
 * It typechecks, it lints, it passes review, and it doubles the surface anyone
 * has to read before changing a feature. Worst of all it produces the specific
 * failure where a fix lands in the copy that is not rendered.
 *
 * REACHABILITY, not "has an importer". The first version of this script counted
 * direct importers and reported 56 orphans while missing all five files in
 * src/components/billing/ -- they are imported by billing/index.ts, a barrel
 * that nothing imports either. A ring of dead files that reference each other
 * keeps every member "imported" forever. Walking from src/main.tsx is the only
 * question that matches what actually ships.
 *
 * scripts/ci/check-jsx-imports.mjs guards the opposite direction: JSX used but
 * never imported.
 *
 * Entries in ALLOWED must carry a reason, and a story id where one applies, so
 * the list cannot quietly become the place dead code lives.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

/** Reachable roots that no other module imports. */
const ENTRY_POINTS = ['main.tsx'];

/** Not dead despite being unreachable from the entry point. */
const ALLOWED = new Map([
  ['components/AddMealToCalendarDialog.tsx', 'US-727 deletes it'],
  ['components/AnimatedSection.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/BarcodeScannerScreen.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/CalendarMealPlanner.tsx', 'US-727 deletes it: an alternate planner implementation, GSAPCalendarMealPlanner is the live one'],
  ['components/CollaborativeShoppingMode.tsx', 'US-752 wires it to household presence or deletes it'],
  ['components/DetailedTrackingDialog.tsx', 'US-725 opens it from the meal-cell Log result action'],
  ['components/EmptyState.tsx', 'US-753 uses it for the empty grocery, pantry, planner and recipe states'],
  ['components/HarmonizedFoodDisplay.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/KidMealVoting.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/MealPlanningCalendar.tsx', 'US-727 deletes it: a third planner implementation'],
  ['components/MealSuggestionCard.tsx', 'US-727 deletes it'],
  ['components/MealVotingCard.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/NotificationBell.tsx', 'US-769 decides: rebuild Billing.tsx from these or delete them'],
  ['components/NotificationPreferencesDialog.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/QuickActionsMenu.tsx', 'US-741 replaces the four hand-maintained nav lists with one NAV array'],
  ['components/QuickSuggestionsPanel.tsx', 'US-727 deletes it'],
  ['components/RecipeBuilder.tsx', 'US-734 deletes it; EnhancedRecipeBuilder is the live builder'],
  ['components/RecipeExportActions.tsx', 'US-734 MOUNTS it in RecipeDetailView (print, copy, email)'],
  ['components/RecipeImporter.tsx', 'US-734 deletes it; ImportRecipeDialog is the live importer'],
  ['components/StructuredIngredientsEditor.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/SwapMealDialog.tsx', 'US-725 opens it from the meal-cell Swap action'],
  ['components/WeeklyReportCard.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/admin/AIModelManager.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/admin/AITicketAnalysis.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/admin/ActivityTimeline.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/admin/AdminControlPanel.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/admin/BudgetAnalyticsDashboard.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/admin/CRMIntegration.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/admin/CustomerHealthDashboard.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/admin/EmailSequenceBuilder.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/admin/KnowledgeBaseManager.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/admin/QuizAnalyticsDashboard.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/admin/StorageManagement.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/admin/WorkflowBuilder.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/billing/AddPaymentMethodDialog.tsx', 'US-769 decides: rebuild Billing.tsx from these or delete them'],
  ['components/billing/InvoicesList.tsx', 'US-769 decides: rebuild Billing.tsx from these or delete them'],
  ['components/billing/PaymentMethods.tsx', 'US-769 decides: rebuild Billing.tsx from these or delete them'],
  ['components/billing/SubscriptionOverview.tsx', 'US-769 decides: rebuild Billing.tsx from these or delete them'],
  ['components/blog/BlogPostTemplate.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/blog/ReadingProgress.tsx', 'NO STORY: unreachable, needs an owner decision (see progress.txt 2026-09-03)'],
  ['components/subscription/EnhancedSubscriptionDialog.tsx', 'US-769 decides: rebuild Billing.tsx from these or delete them'],
  ['components/subscription/NotificationBell.tsx', 'US-769 decides: rebuild Billing.tsx from these or delete them'],
  ['components/subscription/SubscriptionOnboarding.tsx', 'US-769 decides: rebuild Billing.tsx from these or delete them'],
  ['components/subscription/UsageDashboard.tsx', 'US-769 decides: rebuild Billing.tsx from these or delete them'],
  ['components/subscription/UsageMeter.tsx', 'US-769 decides: rebuild Billing.tsx from these or delete them'],
]);

const EXTS = ['.tsx', '.ts', '/index.tsx', '/index.ts'];

function resolveSpecifier(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // bare package specifier

  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Static imports/exports plus lazy `import('...')` with a literal specifier. */
function specifiersIn(source) {
  const specs = [];
  const patterns = [
    /(?:^|\n)\s*import\s[^;'"]*from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s[^;'"]*from\s*['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) specs.push(m[1]);
  }
  return specs;
}

const reachable = new Set();
const queue = ENTRY_POINTS.map((e) => path.join(SRC, e)).filter((f) => existsSync(f));

while (queue.length > 0) {
  const file = queue.pop();
  if (reachable.has(file)) continue;
  reachable.add(file);

  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const spec of specifiersIn(source)) {
    const resolved = resolveSpecifier(spec, file);
    if (resolved && !reachable.has(resolved)) queue.push(resolved);
  }
}

const SKIP_DIRS = new Set(['ui', '__snapshots__']);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const candidates = [...walk(path.join(SRC, 'components')), ...walk(path.join(SRC, 'pages'))];

const orphans = candidates
  .filter((f) => !reachable.has(f))
  .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
  .filter((rel) => !ALLOWED.has(rel))
  .sort();

if (orphans.length > 0) {
  console.error(
    `\nUnreachable from src/main.tsx (${orphans.length}). Delete them, wire them up, or add them to ALLOWED in this script with the story that resolves them:\n`
  );
  for (const o of orphans) console.error(`  src/${o}`);
  console.error('');
  process.exit(1);
}

console.log(
  `Checked ${candidates.length} components/pages; every one is reachable from src/main.tsx.`
);
