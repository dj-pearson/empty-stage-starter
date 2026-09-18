import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

/**
 * verify-stories.mjs, run rather than reasoned about (US-792).
 *
 * src/lib/prdVerifyCriteria.test.ts pins `decide()`, which is the rule. This
 * pins the wiring around it, because the wiring is where the damage actually
 * came from: the engine computed wrong flips for as long as it existed, and
 * the only reason none of them ever reached prd.json was that the workflow's
 * `git add prd.json prd-*.json` matched three gitignored report files, and
 * git add exits 1 on an explicitly named ignored path under `set -e`. A
 * correct rule reached through broken plumbing is not a working gate, and
 * neither is a broken rule that a failing commit step happens to contain.
 *
 * So these tests run the real script against a throwaway PRD and assert on
 * what lands on disk.
 *
 * The shape in "a green job does not carry its red step" is US-778 verbatim:
 * the E2E job carries continue-on-error (US-764 AC3, deliberately), so its
 * conclusion is success while the a11y scan inside it is failure. The engine
 * flipped US-778 to verified during a run where that scan was red.
 */

const SCRIPT = path.join(process.cwd(), 'scripts', 'ralph', 'verify-stories.mjs');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'prd-verify-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A run where the E2E job is green and the a11y scan inside it is not. */
const MASKED_RUN = {
  jobs: [
    {
      name: 'E2E',
      conclusion: 'success',
      steps: [
        { name: 'playwright', conclusion: 'success' },
        { name: 'a11y scan', conclusion: 'failure' },
      ],
    },
    { name: 'Migration Test', conclusion: 'success', steps: [] },
  ],
};

interface Story {
  id: string;
  title?: string;
  passes: boolean;
  notes?: string;
  verifiedBy?: { checks: string[] };
  autoVerify?: boolean;
}

function run(stories: Story[], checks: unknown | null, args: string[] = ['--apply']) {
  writeFileSync(path.join(dir, 'prd.json'), JSON.stringify({ userStories: stories }, null, 2) + '\n');
  if (checks !== null) {
    writeFileSync(path.join(dir, 'checks.json'), JSON.stringify(checks));
  }

  const stdout = execFileSync('node', [SCRIPT, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, CHECKS_FILE: 'checks.json', VERIFY_REF: 'abc1234' },
  });

  return {
    stdout,
    prd: JSON.parse(readFileSync(path.join(dir, 'prd.json'), 'utf8')) as { userStories: Story[] },
    raw: readFileSync(path.join(dir, 'prd.json'), 'utf8'),
  };
}

const byId = (prd: { userStories: Story[] }, id: string) =>
  prd.userStories.find((s) => s.id === id)!;

describe('a green job does not carry its red step', () => {
  it('holds a story whose named step failed inside a passing job', () => {
    const { prd, stdout } = run(
      [{ id: 'US-778', passes: false, verifiedBy: { checks: ['E2E / a11y scan'] } }],
      MASKED_RUN
    );

    expect(byId(prd, 'US-778').passes).toBe(false);
    expect(stdout).toContain('evidence-red');
    expect(stdout).toContain('E2E / a11y scan=failure');
  });

  it('flips a story that named the step which actually passed', () => {
    const { prd } = run(
      [{ id: 'US-900', passes: false, verifiedBy: { checks: ['E2E / playwright'] } }],
      MASKED_RUN
    );

    expect(byId(prd, 'US-900').passes).toBe(true);
  });

  it('requires every named check, not one of them', () => {
    const { prd } = run(
      [
        {
          id: 'US-901',
          passes: false,
          verifiedBy: { checks: ['E2E / playwright', 'E2E / a11y scan'] },
        },
      ],
      MASKED_RUN
    );

    expect(byId(prd, 'US-901').passes).toBe(false);
  });
});

describe('a story is not flipped by a gate that never exercised it', () => {
  it('holds a story that declares nothing, however green the run', () => {
    // US-793 is a Postgres migration and was flipped verified:ios-green on a
    // PR containing no Swift at all. Under named evidence it declares nothing,
    // so no amount of green reaches it.
    const { prd, stdout } = run([{ id: 'US-793', passes: false }], MASKED_RUN);

    expect(byId(prd, 'US-793').passes).toBe(false);
    expect(stdout).toContain('awaiting-evidence');
  });

  it('ignores green checks the story did not name', () => {
    const { prd } = run(
      [{ id: 'US-902', passes: false, verifiedBy: { checks: ['Web gate / bundle budget'] } }],
      MASKED_RUN
    );

    // Migration Test and E2E / playwright are both green; neither was named.
    expect(byId(prd, 'US-902').passes).toBe(false);
  });
});

describe('an explicit hold survives the next run', () => {
  it('never flips a story a person marked autoVerify:false', () => {
    // The practical consequence that made this urgent: a story an agent
    // reopened with a written reason was silently re-flipped on the next PR.
    const { prd, stdout } = run(
      [
        {
          id: 'US-903',
          passes: false,
          autoVerify: false,
          notes: 'reopened: the picker still logs against the wrong meal',
          verifiedBy: { checks: ['Migration Test'] },
        },
      ],
      MASKED_RUN
    );

    expect(byId(prd, 'US-903').passes).toBe(false);
    expect(stdout).toContain('held-by-author');
  });
});

describe('missing evidence fails closed', () => {
  it('flips nothing when no checks file was produced', () => {
    const { prd, stdout } = run(
      [{ id: 'US-904', passes: false, verifiedBy: { checks: ['Migration Test'] } }],
      null
    );

    expect(byId(prd, 'US-904').passes).toBe(false);
    expect(stdout).toContain('checks visible this run: 0');
  });

  it('holds a story whose named check did not run at all', () => {
    const { prd, stdout } = run(
      [{ id: 'US-905', passes: false, verifiedBy: { checks: ['Nightly load test'] } }],
      MASKED_RUN
    );

    expect(byId(prd, 'US-905').passes).toBe(false);
    expect(stdout).toContain('evidence-missing');
  });

  it('treats a skipped check as no evidence rather than success', () => {
    const { prd } = run(
      [{ id: 'US-906', passes: false, verifiedBy: { checks: ['Bundle budget'] } }],
      { jobs: [{ name: 'Bundle budget', conclusion: 'skipped', steps: [] }] }
    );

    expect(byId(prd, 'US-906').passes).toBe(false);
  });
});

describe('what a flip records', () => {
  it('stamps the checks that proved it and the ref it ran against', () => {
    const { prd } = run(
      [{ id: 'US-907', passes: false, verifiedBy: { checks: ['E2E / playwright'] } }],
      MASKED_RUN
    );

    // "verified:web-green" said only that a job was green. This has to name
    // what ran, so a reader can check the claim.
    expect(byId(prd, 'US-907').notes).toBe(
      'VERIFIED by prd-verify: E2E / playwright @ abc1234'
    );
  });

  it('keeps an existing note rather than replacing it', () => {
    const { prd } = run(
      [
        {
          id: 'US-908',
          passes: false,
          notes: 'found 2026-09-07 during the UX audit',
          verifiedBy: { checks: ['Migration Test'] },
        },
      ],
      MASKED_RUN
    );

    expect(byId(prd, 'US-908').notes).toBe(
      'found 2026-09-07 during the UX audit | VERIFIED by prd-verify: Migration Test @ abc1234'
    );
  });
});

describe('the file it writes', () => {
  it('leaves prd.json byte-identical when nothing flipped', () => {
    const stories: Story[] = [{ id: 'US-909', passes: false }];
    const before = JSON.stringify({ userStories: stories }, null, 2) + '\n';
    const { raw } = run(stories, MASKED_RUN);

    // A no-op run that still rewrites the file puts a diff in front of a
    // reviewer for no reason, and the trailing newline is where that starts.
    expect(raw).toBe(before);
  });

  it('keeps the 2-space indent and trailing newline when it does write', () => {
    const { raw } = run(
      [{ id: 'US-910', passes: false, verifiedBy: { checks: ['Migration Test'] } }],
      MASKED_RUN
    );

    expect(raw.endsWith('}\n')).toBe(true);
    expect(raw).toContain('\n  "userStories": [');
  });

  it('writes a report naming the PRD, the ref and what flipped', () => {
    run([{ id: 'US-911', passes: false, verifiedBy: { checks: ['Migration Test'] } }], MASKED_RUN);

    const report = path.join(dir, 'prd-verify-report.json');
    expect(existsSync(report)).toBe(true);
    expect(JSON.parse(readFileSync(report, 'utf8'))).toMatchObject({
      prd: 'prd.json',
      ref: 'abc1234',
      flipped: ['US-911'],
    });
  });

  it('writes nothing to prd.json on a dry run', () => {
    const stories: Story[] = [
      { id: 'US-912', passes: false, verifiedBy: { checks: ['Migration Test'] } },
    ];
    const before = JSON.stringify({ userStories: stories }, null, 2) + '\n';
    const { raw, stdout } = run(stories, MASKED_RUN, []);

    expect(stdout).toContain('[FLIPPED]');
    expect(raw).toBe(before);
  });
});

describe('the workflow step that persists a flip (US-792 AC7)', () => {
  // The rule being right is not enough if the commit step cannot run. This is
  // a source assertion on YAML rather than an executed one, because the step
  // is GitHub Actions bash and there is nothing to call; what it guards is a
  // specific line that failed on every run for months.
  const workflow = readFileSync(
    path.join(process.cwd(), '.github', 'workflows', 'prd-verify.yml'),
    'utf8'
  );
  const commitStep = workflow.slice(workflow.indexOf('- name: Commit flipped flags'));

  it('enumerates tracked files instead of letting the shell expand a glob', () => {
    expect(commitStep).toContain("git ls-files -- 'prd.json' 'prd-*.json' 'progress.txt'");
  });

  it('never hands git add a bare prd-*.json glob', () => {
    // The report files this workflow writes are gitignored, and `git add` exits
    // 1 on an explicitly named ignored path. Under `set -e` that failed the
    // step -- which is the only reason the engine's wrong flips never persisted.
    expect(commitStep).not.toMatch(/git add[^\n]*prd-\*\.json/);
  });

  it('fails loudly rather than guessing when nothing is tracked', () => {
    expect(commitStep).toContain('refusing to guess');
  });
});
