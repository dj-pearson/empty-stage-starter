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
