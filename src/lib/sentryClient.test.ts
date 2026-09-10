/**
 * US-844: keep the Sentry SDK out of the entry chunk's static closure.
 *
 * Two things have to stay true, and only one of them is about behaviour.
 *
 * The structural one is what actually saves the bytes: NOTHING may name
 * '@sentry/react' in a static import except sentryClient.ts, which names it
 * inside a dynamic import(). Four modules did -- sentry.tsx, api-errors.ts,
 * storageCleanup.ts and consentEnforcement.ts -- and every one of them is
 * reachable from the entry, so removing three would have moved nothing.
 * Measured: the eager closure went from 386.3 kB gz across nine chunks to
 * 260.4 kB across eight, and vendor-sentry (126.1 kB, the largest member and
 * bigger than the app's own entry chunk) left it.
 *
 * The behavioural one is that reporting must not get worse for it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/**
 * Comments are stripped before anything is matched, and test files are skipped.
 * The first run of this file failed twice on its own prose: sentryClient.ts's
 * docblock names '@sentry/react', and consentEnforcement.ts carries the
 * comment "loadedSentry(), not loadSentry()" -- which is the string the last
 * assertion forbids. Iteration 12 of the previous loop made exactly this
 * mistake, and US-838 made it again.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.|\.spec\./.test(entry)) out.push(full);
  }
  return out;
}

describe('US-844: only one module names the SDK, and it does so dynamically', () => {
  const files = walk(SRC);

  it('scans a realistic number of files', () => {
    expect(files.length).toBeGreaterThanOrEqual(200);
  });

  it('no module static-imports @sentry/react', () => {
    const offenders = files
      .filter((file) => /^\s*import[^;]*from\s*['"]@sentry\/react['"]/m.test(stripComments(readFileSync(file, 'utf8'))))
      .map((f) => f.slice(ROOT.length + 1));
    expect(
      offenders,
      `a static import puts the whole 126 kB SDK back in the entry closure:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('sentryClient.ts is the one place that names it, inside import()', () => {
    const source = readFileSync(join(SRC, 'lib', 'sentryClient.ts'), 'utf8');
    expect(source).toContain("import('@sentry/react')");
    const namers = files.filter((f) => stripComments(readFileSync(f, 'utf8')).includes("'@sentry/react'"));
    expect(namers.map((f) => f.slice(ROOT.length + 1))).toEqual(['src/lib/sentryClient.ts']);
  });

  it('the eager budget was tightened rather than left as a ceiling', () => {
    const budget = JSON.parse(readFileSync(join(ROOT, '.ci', 'bundle-budget.json'), 'utf8'));
    // Anything at or above the pre-US-844 454000 would mean the win was banked
    // in the build and not in the gate.
    //
    // The threshold was 300000, chosen against a 266.6 kB measurement. That
    // measurement was taken on a build with no JWT-shaped VITE_SUPABASE_ANON_KEY,
    // which tree-shakes the Supabase client out and shrinks the eager closure by
    // 39 kB. The build that ships measures 305.7 kB, so no authorized build could
    // ever meet a 280000 budget and main ran red on it for two merges. Budget
    // corrected to 322000 on 2026-09-10; see .ci/bundle-budget.md.
    //
    // 360000 keeps the same intent against the honest number: still 20% under
    // the pre-US-844 ceiling, with room for the ~5% headroom budgetFor applies.
    expect(budget.eagerJs).toBeLessThan(360000);
  });
});

describe('US-844: reporting still works across the load', () => {
  beforeEach(async () => {
    const { resetSentryClientForTests } = await import('./sentryClient');
    resetSentryClientForTests();
    vi.resetModules();
  });

  it('drops nothing raised before the SDK arrives', async () => {
    const { loadSentry, withSentry } = await import('./sentryClient');
    const seen: string[] = [];

    const promise = loadSentry();
    // Queued: the module is in flight, not here.
    withSentry((s) => seen.push(`early:${typeof s.captureException}`));
    expect(seen).toEqual([]);

    await promise;
    expect(seen).toEqual(['early:function']);
  });

  it('runs immediately once it is here', async () => {
    const { loadSentry, withSentry } = await import('./sentryClient');
    await loadSentry();
    let ran = false;
    withSentry(() => { ran = true; });
    expect(ran).toBe(true);
  });

  it('does NOT download the SDK just because something reported an error', async () => {
    // The whole point. logError in a dev session, or on a page where Sentry is
    // switched off, must not pull 126 kB.
    const { withSentry, sentryRequested } = await import('./sentryClient');
    let ran = false;
    withSentry(() => { ran = true; });
    expect(ran).toBe(false);
    expect(sentryRequested()).toBe(false);
  });

  it('loadedSentry never starts a download', async () => {
    const { loadedSentry, sentryRequested } = await import('./sentryClient');
    expect(loadedSentry()).toBeNull();
    expect(sentryRequested()).toBe(false);
  });

  it('loads once however many callers ask', async () => {
    const { loadSentry } = await import('./sentryClient');
    const [a, b] = await Promise.all([loadSentry(), loadSentry()]);
    expect(a).toBe(b);
  });

  it('one bad queued report does not swallow the rest', async () => {
    const { loadSentry, withSentry } = await import('./sentryClient');
    const seen: string[] = [];
    const promise = loadSentry();
    withSentry(() => { throw new Error('bad report'); });
    withSentry(() => seen.push('second'));
    await promise;
    expect(seen).toEqual(['second']);
  });

  it('bounds the queue, so an error loop cannot grow it without limit', async () => {
    const { loadSentry, withSentry } = await import('./sentryClient');
    const seen: number[] = [];
    const promise = loadSentry();
    for (let i = 0; i < 200; i += 1) withSentry(() => seen.push(i));
    await promise;
    expect(seen.length).toBeLessThanOrEqual(50);
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe('US-844: withdrawing consent does not pull the SDK in', () => {
  it('consentEnforcement asks for the loaded module, never for a load', () => {
    const source = stripComments(readFileSync(join(SRC, 'lib', 'consentEnforcement.ts'), 'utf8'));
    expect(source).toContain('loadedSentry()');
    expect(source).not.toMatch(/(?<![a-zA-Z])loadSentry\(\)/);
  });
});
