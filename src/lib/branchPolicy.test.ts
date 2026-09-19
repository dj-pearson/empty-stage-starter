import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

/**
 * US-763: `main` is the integration branch, and the repo says so consistently.
 *
 * The rule this guards is "branch first, code second" -- which CLAUDE.md calls a
 * critical rule, and which was unfollowable for two months. The table said
 * `claude/*` branches from `develop` and merges back to it; `origin/develop`
 * took its last push on 2026-07-02, PRs #241 through #280 all merged straight
 * to `main`, and merging `main` into `develop` would have changed 1249 files
 * and deleted about 290,000 lines. A branching rule nobody follows is worse
 * than no rule, because following it means guessing.
 *
 * Decision recorded 2026-09-18 by the repository owner: `main`.
 *
 * This is a documentation-and-config test rather than a behaviour test because
 * that is exactly where the drift happened. Nothing executes a branch table.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const WORKFLOWS = path.join(ROOT, '.github', 'workflows');

describe('the branching table describes what the repo does', () => {
  it('CLAUDE.md routes claude/* through main', () => {
    const md = read('CLAUDE.md');
    expect(md).toMatch(/\| `claude\/\*`\s*\|\s*`main`\s*\|\s*`main` via PR/);
    expect(md).toMatch(/New feature → branch from `main`, PR back to `main`/);
  });

  it('CLAUDE.md no longer routes anything through develop', () => {
    // The word may still appear -- the section explains what was retired and
    // why, which is the useful half. What must not come back is a table row or
    // a rule of thumb sending work there.
    const md = read('CLAUDE.md');
    expect(md).not.toMatch(/\|\s*`develop`\s*\|/);
    expect(md).not.toMatch(/branch from `develop`/);
    expect(md).not.toMatch(/PR back to `develop`/);
  });

  it('prd.json names a branch that exists rather than a stale one', () => {
    // It read `hotfix/password-reset` for months, which is neither the branch
    // anyone was on nor a branch the table permits for feature work.
    const prd = JSON.parse(read('prd.json')) as { branchName?: string };
    expect(prd.branchName).toBeTruthy();
    expect(prd.branchName).not.toBe('hotfix/password-reset');
    expect(prd.branchName, 'feature work belongs on a claude/* branch').toMatch(/^claude\//);
  });

  it('scripts/ralph/CLAUDE.md sends a new branch off main', () => {
    expect(read('scripts/ralph/CLAUDE.md')).toMatch(/create from `main`/);
  });
});

describe('no workflow still waits on develop', () => {
  /**
   * The concrete cost of the drift: ios-app-store-deploy.yml triggered on a
   * push to `develop` touching ios/**, so for two months the automatic
   * TestFlight path was dead and an iOS build could only be cut by hand. A
   * trigger on a branch nothing pushes to is a workflow that does not exist,
   * and it looks identical to one that works.
   */
  const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f));

  it('finds the workflows to check', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it.each(files)('%s has no develop branch filter', (file) => {
    const yaml = readFileSync(path.join(WORKFLOWS, file), 'utf8');
    // Comments explaining the change are fine; a live filter is not.
    const live = yaml
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    expect(live).not.toMatch(/branches:.*\bdevelop\b/);
    expect(live).not.toMatch(/^\s*-\s*develop\s*$/m);
  });

  it('CI still runs on main, so a PR into it is checked', () => {
    // The reason this story mattered to the loop that found it: ci.yml only
    // fires on push to, and PRs into, its listed branches. A branch that
    // targets a dead one never runs a single check.
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/push:\s*(\n\s*#.*)*\n\s*branches: \[main\]/);
    expect(ci).toMatch(/pull_request:\s*(\n\s*#.*)*\n\s*branches: \[main\]/);
  });

  it('an iOS change can still reach TestFlight without a human', () => {
    const ios = read('.github/workflows/ios-app-store-deploy.yml');
    expect(ios).toMatch(/branches: \[main\]/);
    expect(ios).toMatch(/paths:\s*\n\s*- 'ios\/\*\*'/);
    // And a push still cannot claim a release tag.
    expect(ios).toMatch(/if: \$\{\{ github\.event_name == 'workflow_dispatch' \}\}/);
  });
});
