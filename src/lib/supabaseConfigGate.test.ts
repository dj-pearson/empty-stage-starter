import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * US-760. The gate runs the REAL script, the way ci.yml invokes it, against
 * throwaway project directories -- not a reimplementation of its logic, which
 * would pass while the shipped script was broken.
 *
 * The case that matters is the one that actually happened: a content_path with
 * a leading "../" that climbs out of the repo. `supabase start` aborted on it
 * in under two seconds for twenty consecutive runs on main, and because the
 * downstream steps then reported as *skipped*, the run list looked like a
 * flaky Docker rather than a config error anybody could have fixed in a line.
 */
const SCRIPT = path.resolve(process.cwd(), 'scripts/ci/check-supabase-config.mjs');

/** Run the gate in `dir`, returning its exit code and combined output. */
function runGate(dir: string): { code: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [SCRIPT], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** A minimal project: supabase/config.toml plus whatever files are asked for. */
function makeProject(config: string, files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbcfg-'));
  fs.mkdirSync(path.join(dir, 'supabase'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'supabase', 'config.toml'), config);
  for (const file of files) {
    const full = path.join(dir, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '// fixture\n');
  }
  return dir;
}

describe('check-supabase-config: the real script', () => {
  const dirs: string[] = [];
  const project = (config: string, files: string[]) => {
    const dir = makeProject(config, files);
    dirs.push(dir);
    return dir;
  };

  afterAll(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('passes a config whose paths all resolve', () => {
    const dir = project(
      [
        '[auth.email.template.recovery]',
        'content_path = "./public/email-templates/recovery.html"',
        '[functions.health-check]',
        'entrypoint = "../functions/health-check/index.ts"',
        '',
      ].join('\n'),
      ['public/email-templates/recovery.html', 'functions/health-check/index.ts'],
    );

    const { code, output } = runGate(dir);
    expect(output).toContain('2 config path(s) resolve');
    expect(code).toBe(0);
  });

  it('fails the exact content_path that broke runs 782 to 800', () => {
    const dir = project(
      [
        '[auth.email.template.recovery]',
        'content_path = "../public/email-templates/recovery.html"',
        '',
      ].join('\n'),
      // The file exists where it belongs. The config points above the repo.
      ['public/email-templates/recovery.html'],
    );

    const { code, output } = runGate(dir);
    expect(code).toBe(1);
    expect(output).toContain('content_path');
    // The message has to carry the fix, because it is read in a red CI log.
    expect(output).toContain('./public/email-templates/recovery.html');
    expect(output).toMatch(/PROJECT ROOT/);
  });

  it('fails a content_path that points at nothing at all', () => {
    const dir = project(
      ['[auth.email.template.recovery]', 'content_path = "./nope.html"', ''].join('\n'),
      [],
    );
    expect(runGate(dir).code).toBe(1);
  });

  /**
   * entrypoint is checked against both possible bases on purpose: which one the
   * CLI uses could not be established without Docker, and failing thirty-one
   * lines that may be correct would be a worse outcome than missing one.
   */
  it('accepts an entrypoint under either base', () => {
    const fromSupabase = project(
      ['[functions.a]', 'entrypoint = "../functions/a/index.ts"', ''].join('\n'),
      ['functions/a/index.ts'],
    );
    expect(runGate(fromSupabase).code).toBe(0);

    const fromRoot = project(
      ['[functions.a]', 'entrypoint = "./supabase/functions/a/index.ts"', ''].join('\n'),
      ['supabase/functions/a/index.ts'],
    );
    expect(runGate(fromRoot).code).toBe(0);
  });

  it('fails an entrypoint that resolves under neither base', () => {
    const dir = project(
      ['[functions.a]', 'entrypoint = "../functions/a/index.ts"', ''].join('\n'),
      [],
    );
    const { code, output } = runGate(dir);
    expect(code).toBe(1);
    expect(output).toContain('neither');
  });

  it('ignores a commented-out path', () => {
    const dir = project(
      ['# content_path = "./gone.html"', '[functions.a]', 'entrypoint = "./a.ts"', ''].join('\n'),
      ['a.ts'],
    );
    expect(runGate(dir).code).toBe(0);
  });
});

describe('check-supabase-config: this repo', () => {
  let result: { code: number; output: string };
  beforeAll(() => {
    result = runGate(process.cwd());
  });

  it('passes against the committed supabase/config.toml', () => {
    expect(result.output).not.toContain('FAIL');
    expect(result.code).toBe(0);
  });

  it('runs before Start local Supabase in both Supabase jobs', () => {
    const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
    // A gate placed after the step it protects protects nothing.
    const gate = ci.indexOf('check-supabase-config.mjs');
    const start = ci.indexOf('Start local Supabase');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(start);
    expect(ci.split('check-supabase-config.mjs').length - 1).toBe(2);
    expect(ci.split('Start local Supabase').length - 1).toBe(2);
  });

  it('pins one CLI version for both jobs', () => {
    const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
    // `version: latest` lets a CLI release red the pipeline with no commit here,
    // which is the wrong property for the job that gates migrations.
    expect(ci).not.toContain('version: latest');
    const pinned = [...ci.matchAll(/version:\s*([0-9]+\.[0-9]+\.[0-9]+)/g)].map((m) => m[1]);
    expect(pinned.length).toBe(2);
    expect(new Set(pinned).size).toBe(1);
  });
});
