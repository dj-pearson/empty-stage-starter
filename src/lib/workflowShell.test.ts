import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { parse } from 'yaml';

/**
 * Every `run:` block in every workflow is valid shell.
 *
 * This exists because of one missing double quote. The SQL-suites step added
 * in this repo ended with:
 *
 *     echo "All SQL suites passed.
 *
 * All thirteen suites ran, all thirteen passed, the loop reported them, and
 * then bash died on `unexpected EOF while looking for matching '"'` and the
 * step exited 2. The gate could never go green, however healthy the thing it
 * gated -- and on the check-run summary that is indistinguishable from a real
 * failure, so the obvious next move is to go debugging the suites.
 *
 * `bash -n` parses without executing, so this costs nothing and needs no
 * runner. It is not a linter: it catches the class where a step is
 * structurally incapable of succeeding, which is the class that wastes a whole
 * CI cycle to discover.
 */

const WORKFLOWS = path.resolve(__dirname, '..', '..', '.github', 'workflows');

/**
 * `${{ ... }}` is GitHub's expression syntax, substituted before the shell
 * ever sees it, and it is not shell -- `${{ secrets.X || 'y' }}` is a parse
 * error to bash. Stub each one to a bare word so what remains is the script
 * as the runner will actually execute it.
 */
const stubExpressions = (run: string) => run.replace(/\$\{\{[^}]*\}\}/g, 'X');

interface Step {
  name?: string;
  run?: unknown;
  shell?: string;
}

function shellSteps(): Array<{ file: string; job: string; index: number; name: string; run: string }> {
  const out: Array<{ file: string; job: string; index: number; name: string; run: string }> = [];

  for (const file of readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))) {
    const doc = parse(readFileSync(path.join(WORKFLOWS, file), 'utf8')) as {
      jobs?: Record<string, { steps?: Step[] }>;
    };

    for (const [job, body] of Object.entries(doc?.jobs ?? {})) {
      (body?.steps ?? []).forEach((step, index) => {
        if (typeof step?.run !== 'string') return;
        // A step that names another shell is not bash's to judge.
        if (step.shell && !/^bash|^sh$/.test(step.shell)) return;
        out.push({
          file,
          job,
          index,
          name: step.name ?? '(unnamed)',
          run: stubExpressions(step.run),
        });
      });
    }
  }
  return out;
}

describe('every workflow run: block parses as shell', () => {
  const steps = shellSteps();

  it('found the steps to check', () => {
    // A floor: "all of them parse" must not be true of an empty list, which is
    // what a changed workflow layout or a parser swap would produce.
    expect(steps.length).toBeGreaterThan(30);
  });

  it.each(steps.map((s) => [`${s.file} :: ${s.job} :: ${s.name}`, s] as const))(
    '%s',
    (_label, step) => {
      let error = '';
      try {
        execFileSync('bash', ['-n'], { input: step.run, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) {
        const err = e as { stderr?: Buffer };
        error = err.stderr?.toString().trim() ?? String(e);
      }
      expect(error, `${step.file} step ${step.index} does not parse:\n${error}`).toBe('');
    },
  );
});
