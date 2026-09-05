import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

/**
 * Every script in scripts/ci/ is referenced by a workflow.
 *
 * check-seo-extraction.sh sat outside CI from the day it was written. It was
 * correct, it passed, and it was reachable only as `npm run typecheck:seo` --
 * so it gated nothing, and nobody noticed because running it by hand always
 * said the right thing. That is the same failure as the tsconfig include which
 * left the same gate inert for three commits while reporting success.
 *
 * A gate nobody runs is worse than no gate, because it reads as coverage.
 */
describe('CI gates are wired into a workflow', () => {
  const ciDir = path.join(process.cwd(), 'scripts', 'ci');
  const workflowsDir = path.join(process.cwd(), '.github', 'workflows');

  it('references every scripts/ci/ entry', () => {
    const workflows = readdirSync(workflowsDir)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .map((f) => readFileSync(path.join(workflowsDir, f), 'utf8'))
      .join('\n');

    const unwired = readdirSync(ciDir)
      .filter((f) => f.endsWith('.sh') || f.endsWith('.mjs'))
      .filter((f) => !workflows.includes(`scripts/ci/${f}`));

    expect(unwired).toEqual([]);
  });
});

/**
 * The Playwright suite runs somewhere (US-764).
 *
 * 28 spec files sat in tests/ for months with no workflow referencing them, so
 * they were maintained, committed, and never executed -- coverage on paper and
 * nothing in fact. Two structural faults kept them unrunnable (a collection
 * error that aborted every file, and 20 specs hardcoding localhost:8080 past
 * the config's baseURL), which is exactly why nobody noticed: turning the job
 * on would have failed at once.
 *
 * Pinned here because the failure mode is silence. A deleted job does not break
 * anything; it just stops telling you things.
 */
describe('the E2E job runs the Playwright suite', () => {
  const ci = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');

  it('has an e2e job', () => {
    expect(ci).toMatch(/^ {2}e2e:$/m);
  });

  it('runs playwright', () => {
    expect(ci).toContain('npx playwright test --project=chromium');
  });

  it('tests the built artifact rather than a dev server', () => {
    // E2E_TARGET=dist points the config at scripts/dev/serve-dist.mjs, which
    // resolves prerendered routes the way Pages does. Against `npm run dev`
    // this job would exercise a different resolver from the one that ships.
    expect(ci).toContain('E2E_TARGET: dist');
  });

  it('scans the authenticated pages, not only the marketing ones', () => {
    // US-778: the pre-existing scan covered public pages, which is the half of
    // the app nobody is signed into. A gate that never looks behind the login
    // reports a clean product while every screen a parent uses is unscanned.
    expect(ci).toContain('tests/accessibility/authenticated-a11y.spec.ts');
    expect(ci).toContain('E2E_DIST: dist-e2e');
  });

  it('checks the phone viewport, not only the desktop one', () => {
    // US-768: the authenticated a11y scan runs at desktop width, where the
    // settings tab labels are visible. Below 640px they were display:none and
    // each tab was an aria-hidden icon with no accessible name -- a serious
    // violation the desktop scan reported as a clean page. Pinned because the
    // failure mode is a green gate looking the wrong way.
    expect(ci).toContain('tests/responsive/');
  });

  it('names the date its continue-on-error expires', () => {
    // A non-blocking job with no end date is a job that never blocks.
    expect(ci).toMatch(/continue-on-error until \d{4}-\d{2}-\d{2}/);
  });
});

/**
 * The Build job builds the same thing Cloudflare Pages does.
 *
 * `npx vite build` and `npm run build` differ by the prerender step, and that
 * step is the whole of US-570: it writes the dist/<route>/index.html files a
 * crawler without JavaScript reads. CI ran the first while Pages runs the
 * second, so the artifact CI validated -- and that deploy-production uploads --
 * was not the artifact the site is built from, and no guardrail inside
 * scripts/prerender.mjs ran on any pull request.
 *
 * Pinned rather than trusted because the two commands look interchangeable and
 * the difference shows up nowhere except in what crawlers receive.
 */
describe('the Build job runs the prerendering build', () => {
  const ci = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');

  it('builds with npm run build', () => {
    expect(ci).toContain('run: npm run build');
  });

  it('does not build with a bare vite build, which skips the prerender', () => {
    // Matches the run: line only, so the explanatory comment above it -- which
    // names both commands on purpose -- does not trip this.
    expect(ci).not.toMatch(/^\s*run:\s*npx vite build\s*$/m);
  });

  it('keeps the prerender in the npm build script the workflow calls', () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    // Pointing CI at `npm run build` buys nothing if that script stops
    // prerendering; build:nossg exists for the deliberately-shell-only case.
    expect(pkg.scripts.build).toContain('scripts/prerender.mjs');
  });
});
