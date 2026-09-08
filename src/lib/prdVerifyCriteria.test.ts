import { describe, it, expect } from 'vitest';
import {
  decide,
  collectChecks,
  MANUAL_SIGNOFF,
  // @ts-expect-error - plain .mjs helper, no types (same pattern as foodSeedBuilder.test.ts)
} from '../../scripts/ralph/verify-criteria.mjs';

/**
 * US-792: what `passes: true` is allowed to mean.
 *
 * The engine used to flip a story when a commit message mentioned its id and
 * some platform job returned success. Neither fact says an acceptance
 * criterion was met, and the pair of them proved it in one run: on a PR whose
 * entire content was two YAML files it flipped fourteen stories, US-792 itself
 * among them, plus two whose criteria are still waiting on a deploy and an App
 * Store release.
 *
 * The replacement is evidence a story names for itself. No declaration, no
 * flip. These tests are the contract.
 */

type Story = Record<string, unknown>;

const story = (over: Story = {}): Story => ({
  id: 'US-999',
  title: 'a story',
  passes: false,
  ...over,
});

/** A checks map as collectChecks would build it from a run. */
const checks = (pairs: Record<string, string>) => new Map(Object.entries(pairs));

describe('US-792 AC1: a commit mention plus a green job is not evidence', () => {
  it('holds a story that declares no evidence, however green the run', () => {
    const verdict = decide(story(), {
      checks: checks({ 'Web gate (strict)': 'success', 'iOS gate / Build & Test': 'success' }),
    });

    expect(verdict.flip).toBe(false);
    expect(verdict.status).toBe('awaiting-evidence');
  });

  it('says what the story needs, rather than only that it was held', () => {
    const verdict = decide(story(), { checks: checks({}) });
    expect(verdict.detail).toMatch(/verifiedBy/);
  });
});

describe('US-792 AC2: a gate masked by continue-on-error is not green', () => {
  /**
   * The concrete case from the story: E2E carries continue-on-error, so the web
   * job reports success while the a11y scan inside it fails. US-778 was flipped
   * verified:web-green during a run where its own scan was red. Step-level
   * conclusions still say `failure`, so naming the step is what makes the
   * masking visible.
   */
  it('does NOT flip when the job is green but the named inner step failed', () => {
    const verdict = decide(
      story({ verifiedBy: { checks: ['Web gate (strict) / Accessibility scan'] } }),
      {
        checks: checks({
          'Web gate (strict)': 'success',
          'Web gate (strict) / Accessibility scan': 'failure',
        }),
      }
    );

    expect(verdict.flip).toBe(false);
    expect(verdict.status).toBe('evidence-red');
    expect(verdict.detail).toContain('Accessibility scan');
    expect(verdict.detail).toContain('failure');
  });

  it('treats a skipped check as no evidence, not as success', () => {
    const verdict = decide(story({ verifiedBy: { checks: ['Bundle budget'] } }), {
      checks: checks({ 'Bundle budget': 'skipped' }),
    });

    expect(verdict.flip).toBe(false);
    expect(verdict.status).toBe('evidence-red');
  });
});

describe('US-792 AC3: an explicit hold is honoured', () => {
  it('never flips a story marked autoVerify:false, even with green evidence', () => {
    const verdict = decide(
      story({ autoVerify: false, verifiedBy: { checks: ['Unit tests'] } }),
      { checks: checks({ 'Unit tests': 'success' }) }
    );

    expect(verdict.flip).toBe(false);
    expect(verdict.status).toBe('held-by-author');
  });

  it('keeps holding the manual-signoff stories', () => {
    const id = [...MANUAL_SIGNOFF][0];
    const verdict = decide(
      story({ id, verifiedBy: { checks: ['Unit tests'] } }),
      { checks: checks({ 'Unit tests': 'success' }) }
    );

    expect(verdict.flip).toBe(false);
    expect(verdict.status).toBe('manual-signoff-required');
  });
});

describe('US-792 AC4: the stamp records what was proven', () => {
  it('names the checks that passed, not just that a job was green', () => {
    const verdict = decide(
      story({ verifiedBy: { checks: ['Web gate (strict) / Unit tests', 'Bundle budget'] } }),
      {
        checks: checks({
          'Web gate (strict) / Unit tests': 'success',
          'Bundle budget': 'success',
        }),
      }
    );

    expect(verdict.flip).toBe(true);
    expect(verdict.stamp).toContain('Web gate (strict) / Unit tests');
    expect(verdict.stamp).toContain('Bundle budget');
  });
});

describe('US-792 AC5: a gate that never exercised the story cannot verify it', () => {
  /**
   * US-793 is a Postgres migration and was flipped verified:ios-green on a PR
   * containing no iOS code. Under a named-evidence rule that cannot happen: a
   * check the story does not name is simply not consulted, and a named check
   * absent from the run is missing evidence rather than a pass.
   */
  it('ignores green checks the story did not name', () => {
    const verdict = decide(
      story({ verifiedBy: { checks: ['Migration Test'] } }),
      { checks: checks({ 'iOS gate / Build & Test': 'success' }) }
    );

    expect(verdict.flip).toBe(false);
    expect(verdict.status).toBe('evidence-missing');
    expect(verdict.detail).toContain('Migration Test');
  });

  it('requires every named check, not merely one of them', () => {
    const verdict = decide(
      story({ verifiedBy: { checks: ['Migration Test', 'Unit tests'] } }),
      { checks: checks({ 'Migration Test': 'success' }) }
    );

    expect(verdict.flip).toBe(false);
    expect(verdict.status).toBe('evidence-missing');
    expect(verdict.detail).toContain('Unit tests');
  });
});

describe('US-792 AC6: the whole named set green is the only way through', () => {
  it('flips when every named check ran and passed', () => {
    const verdict = decide(
      story({ verifiedBy: { checks: ['Migration Test', 'Unit tests'] } }),
      { checks: checks({ 'Migration Test': 'success', 'Unit tests': 'success' }) }
    );

    expect(verdict.flip).toBe(true);
    expect(verdict.status).toBe('verified');
  });

  it('refuses a declaration that names nothing, so an empty list is not a free pass', () => {
    const verdict = decide(story({ verifiedBy: { checks: [] } }), { checks: checks({}) });

    expect(verdict.flip).toBe(false);
    expect(verdict.status).toBe('awaiting-evidence');
  });

  it('leaves an already-passing story alone', () => {
    const verdict = decide(story({ passes: true }), { checks: checks({}) });
    expect(verdict.flip).toBe(false);
    expect(verdict.status).toBe('already-passing');
  });
});

describe('collectChecks flattens a run into addressable names', () => {
  const run = {
    jobs: [
      {
        name: 'Web gate (strict)',
        conclusion: 'success',
        steps: [
          { name: 'Unit tests', conclusion: 'success' },
          { name: 'Accessibility scan', conclusion: 'failure' },
        ],
      },
      { name: 'iOS gate / Build & Test', conclusion: 'success', steps: [] },
    ],
  };

  it('addresses a job by its name', () => {
    expect(collectChecks(run).get('Web gate (strict)')).toBe('success');
  });

  it('addresses a step as "Job / Step"', () => {
    const map = collectChecks(run);
    expect(map.get('Web gate (strict) / Unit tests')).toBe('success');
    expect(map.get('Web gate (strict) / Accessibility scan')).toBe('failure');
  });

  it('keeps the inner failure that the green job hid', () => {
    const map = collectChecks(run);
    // The exact US-778 shape: job green, step red. Both facts survive.
    expect(map.get('Web gate (strict)')).toBe('success');
    expect(map.get('Web gate (strict) / Accessibility scan')).toBe('failure');
  });

  it('survives a job with no steps array', () => {
    expect(() => collectChecks({ jobs: [{ name: 'x', conclusion: 'success' }] })).not.toThrow();
  });
});
