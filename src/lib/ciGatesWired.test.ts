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
