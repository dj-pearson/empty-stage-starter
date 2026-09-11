import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, writeFileSync } from 'fs';
import { signIn } from '../helpers/auth';

/**
 * Accessibility of the pages behind the login (US-778).
 *
 * The existing scan in a11y.spec.ts covers marketing pages only -- the half of
 * the app nobody is signed into. Every screen a parent actually uses (the
 * planner, the grocery list, the pantry, settings) had never been scanned,
 * because no browser test could get past ProtectedRoute. tests/helpers/auth.ts
 * is what changed that.
 *
 * THRESHOLD IS `serious`, not `critical`. The compliance audit counted roughly
 * 109 icon buttons with no accessible name; axe rates a nameless control
 * `serious`, so a critical-only assertion passed over every one of them. A gate
 * tuned to ignore the defect class you have is not a gate.
 *
 * Requires a build against the fake backend:
 *   node scripts/dev/fake-postgrest.mjs &
 *   VITE_SUPABASE_URL=http://127.0.0.1:54999 VITE_SUPABASE_ANON_KEY=<jwt-shaped> \
 *     npx vite build --outDir dist-e2e
 *   E2E_TARGET=dist E2E_DIST=dist-e2e npx playwright test tests/accessibility/
 */

/** Routes a signed-in parent reaches from the primary navigation. */
const AUTHENTICATED_ROUTES = [
  ['/dashboard', 'dashboard'],
  ['/dashboard/planner', 'planner'],
  ['/dashboard/grocery', 'grocery'],
  ['/dashboard/pantry', 'pantry'],
  ['/dashboard/recipes', 'recipes'],
  ['/dashboard/kids', 'kids'],
  ['/dashboard/settings', 'settings'],
] as const;

/**
 * Known violation counts, per route, as measured on the day this landed.
 *
 * A budget rather than zero, for the same reason the lint and typecheck gates
 * are ratchets: there is a real backlog, and a gate that fails on all of it on
 * day one gets switched off within a week. These numbers may only go DOWN --
 * the assertion is `toBeLessThanOrEqual`, so fixing a button tightens the gate
 * automatically and adding one fails it.
 *
 * Regenerate deliberately with A11Y_BASELINE=update, never to make a red run
 * green.
 */
const BASELINE_PATH = 'tests/accessibility/authenticated-baseline.json';

test.describe('Accessibility - authenticated pages', () => {
  for (const [route, name] of AUTHENTICATED_ROUTES) {
    test(`${name} has no new serious or critical violations`, async ({ page, context }) => {
      await signIn(context);
      await page.goto(route);

      // networkidle alone is NOT enough, and trusting it produced a wrong
      // baseline once already: on a cold server it fires while Pantry is still
      // showing its loading skeleton, and the scan then reports 15 violations
      // for a page that has 47 once its category chips render. The numbers were
      // stable on repeat runs, which made the under-measurement look like solid
      // data rather than a timing artefact.
      //
      // So: wait for the shell, then for the skeletons to go, then settle.
      await page.waitForLoadState('networkidle');
      await page.locator('main, [role="main"]').first().waitFor({ state: 'visible' });
      await page
        .locator('.animate-pulse')
        .first()
        .waitFor({ state: 'detached', timeout: 10_000 })
        .catch(() => {
          // No skeleton on this page, or it never mounted. Either is fine.
        });
      await page.waitForTimeout(750);

      // Fail loudly rather than scanning the login screen and calling it clean.
      expect(new URL(page.url()).pathname, `${name} redirected to ${page.url()}`).not.toMatch(
        /^\/auth/
      );

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical'
      );

      const nodeCount = serious.reduce((sum, v) => sum + v.nodes.length, 0);
      const summary = serious
        .map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`)
        .sort()
        .join('; ');

      // Printed on every run, pass or fail: the count is the thing this test
      // exists to track, and an assertion message only appears when it breaks.
      console.log(`[a11y] ${name}: ${nodeCount} serious/critical -- ${summary || 'none'}`);

      // And the selectors, because a rule name is not enough to fix anything.
      //
      // This scan only runs in CI (it needs the fake backend and a built
      // artifact), so its output is the ONLY view anyone gets of what failed.
      // Reporting "button-name (critical, 1)" and nothing else sent me hunting
      // through the source for an unnamed button, and I fixed the wrong one --
      // the count went 7 to 5 instead of 7 to 4. The target is one line of
      // output and it turns a guess into a lookup.
      for (const v of serious) {
        for (const node of v.nodes) {
          console.log(`[a11y]   ${name} ${v.id}: ${node.target.join(' ')}`);
          const detail = [...node.any, ...node.all, ...node.none]
            .map((c) => c.message)
            .filter(Boolean)
            .join(' | ');
          if (detail) console.log(`[a11y]     ${detail}`);
        }
      }

      const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, number>;

      // US-858: the regeneration this file has told people to use since it was
      // written, which until now did not exist -- A11Y_BASELINE=update read
      // nothing and the numbers were edited by hand. Read-modify-write per
      // route, so regenerate with --workers=1 or the routes overwrite each
      // other's keys.
      if (process.env.A11Y_BASELINE === 'update') {
        const current = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, unknown>;
        current[name] = nodeCount;
        writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
        console.log(`[a11y] baseline updated: ${name} -> ${nodeCount}`);
        return;
      }

      expect(
        nodeCount,
        `${name}: ${nodeCount} serious/critical nodes (baseline ${baseline[name]}). ${summary || 'none'}`
      ).toBeLessThanOrEqual(baseline[name] ?? 0);
    });
  }
});
