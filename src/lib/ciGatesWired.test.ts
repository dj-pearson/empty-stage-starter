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

    const entries = readdirSync(ciDir).filter((f) => f.endsWith('.sh') || f.endsWith('.mjs'));

    // A script can be reached through another one rather than straight from a
    // step -- new-errors.mjs (US-802) is called by both ratchets, not by the
    // workflow. Reachability is computed rather than assumed, so a genuinely
    // orphaned script is still caught: it has to be named by a workflow, or by
    // a scripts/ci entry that is itself reachable.
    const wired = new Set(entries.filter((f) => workflows.includes(`scripts/ci/${f}`)));
    for (let pass = 0; pass < entries.length; pass++) {
      const before = wired.size;
      for (const reached of [...wired]) {
        const body = readFileSync(path.join(ciDir, reached), 'utf8');
        for (const candidate of entries) {
          if (!wired.has(candidate) && body.includes(`scripts/ci/${candidate}`)) {
            wired.add(candidate);
          }
        }
      }
      if (wired.size === before) break;
    }

    const unwired = entries.filter((f) => !wired.has(f));
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

  it('runs the unit gates that need a built site, in the job that has one', () => {
    // US-855. src/lib/headingOutline.test.ts and src/lib/cspInlineScripts.test.ts
    // both guard their real assertion with "if a dist is present". The unit job
    // has no dist/, so both skipped on every run -- the heading gate's own floor
    // could not even be reached. The e2e job downloads the artifact, so it is
    // the only place these assert anything.
    expect(ci).toContain('src/lib/headingOutline.test.ts');
    expect(ci).toContain('src/lib/cspInlineScripts.test.ts');
  });

  it('watches the console on the signed-in routes, not only the public ones', () => {
    // US-856: the pantry screen threw ReferenceError into the route error
    // boundary for every account with an empty pantry, and no gate looked.
    expect(ci).toContain('tests/authenticated/');
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

/**
 * Every Deno test in the deployed edge-function tree actually runs in CI.
 *
 * catalogPromotion.test.ts (US-797) landed with 15 passing cases and no
 * workflow step running it -- exactly the failure this repo filed as US-792,
 * where a story was recorded as passing while its own gate had never executed.
 * A test file that exists but is never invoked is worse than no test: it reads
 * as coverage on every PR that touches this code.
 *
 * Enumerated rather than named one file at a time, so the next test added to
 * _shared/ cannot repeat it by simply not being listed here.
 */
describe('the edge-function Deno tests run in CI', () => {
  const ci = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');
  const sharedDir = path.join(process.cwd(), 'supabase', 'functions', '_shared');

  it('invokes every supabase/functions/_shared/*.test.ts', () => {
    const unwired = readdirSync(sharedDir)
      .filter((f) => f.endsWith('.test.ts'))
      .filter((f) => !ci.includes(`supabase/functions/_shared/${f}`));

    expect(unwired).toEqual([]);
  });
});

describe('the migration job runs the SQL tests', () => {
  const ci = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');

  // supabase/tests/ has held .test.sql files for months with nothing executing
  // them -- US-780's own notes record its 11 cases as never run, blocked on
  // "no Postgres in the container". US-760 fixed `supabase start`, so the
  // Migration Test job can now afford to run them.
  it('executes every supabase/tests/*.test.sql', () => {
    expect(ci).toContain('supabase/tests/*.test.sql');
  });

  it('runs them after migrations are applied', () => {
    expect(ci.indexOf('Apply migrations')).toBeLessThan(ci.indexOf('supabase/tests/*.test.sql'));
  });
});

/**
 * The SQL suites actually gate (US-800).
 *
 * The step that runs supabase/tests/*.test.sql carried continue-on-error and a
 * bare `for` loop, under GitHub's default `bash -e`. us668 failed first
 * alphabetically, `-e` aborted the loop, and the other fourteen suites never
 * executed on any run -- the job log shows the step finishing in one second.
 * So the story recorded "four tests fail" when eleven of the fifteen had no
 * result at all; the four named were simply the ones someone had run by hand.
 *
 * Two things have to hold for that step to mean anything, and neither is
 * visible from reading a green check:
 *   1. it must not be continue-on-error, or a failure is a notice;
 *   2. it must not stop at the first failing file, or one broken suite hides
 *      every suite behind it.
 */
describe('the SQL test step gates (US-800)', () => {
  const ci = readFileSync(
    path.join(process.cwd(), '.github', 'workflows', 'ci.yml'),
    'utf8',
  );

  /** The `- name: Run SQL tests` block, up to the next step at the same level. */
  const step = (() => {
    const start = ci.indexOf('- name: Run SQL tests');
    expect(start, 'the Run SQL tests step is gone').toBeGreaterThan(-1);
    const rest = ci.slice(start + 1);
    const end = rest.search(/\n {6}- name: /);
    return end === -1 ? rest : rest.slice(0, end);
  })();

  it('is not continue-on-error, so a failing suite fails the job', () => {
    expect(step).not.toContain('continue-on-error');
  });

  it('runs every suite rather than stopping at the first failure', () => {
    // `psql ... || failed=...` is what keeps `bash -e` from aborting the loop.
    expect(step).toMatch(/psql[^\n]*\|\|\s*failed=/);
    expect(step).toMatch(/exit 1/);
  });

  it('still points at the whole suite directory', () => {
    expect(step).toContain('supabase/tests/*.test.sql');
  });

  /**
   * A suite that only prints its values next to the word EXPECTED cannot fail
   * except by erroring, so making the step blocking would gate on "the SQL
   * ran". Every suite has to assert.
   */
  it('has an assertion in every suite, not just a printed EXPECTED', () => {
    const testsDir = path.join(process.cwd(), 'supabase', 'tests');
    const silent = readdirSync(testsDir)
      .filter((f) => f.endsWith('.test.sql'))
      .filter((f) => {
        const body = readFileSync(path.join(testsDir, f), 'utf8');
        return !/\bASSERT\b/i.test(body) && !/RAISE\s+EXCEPTION/i.test(body);
      });

    expect(
      silent,
      'These print values and leave the comparison to a person, so they can only fail by erroring.',
    ).toEqual([]);
  });
});
