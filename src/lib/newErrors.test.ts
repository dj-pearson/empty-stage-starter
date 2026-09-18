import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  groupByFile,
  keyErrors,
  newErrors,
  parseLintErrors,
  parseTypecheckErrors,
} from '../../scripts/ci/new-errors.mjs';

/**
 * US-802: the ratchets answered a regression with `grep ... | tail -40`.
 *
 * tsc sorts by path and this repo's backlog lives in src/pages/*, so that tail
 * is a CONSTANT -- the same forty pre-existing errors printed every time while
 * the ones the branch added were earlier in the walk and never shown. It cost
 * two round trips, and the real causes were found by running a scoped tsc by
 * hand.
 */

/** Real tsc output shapes, copied from this repo's own ratchet log. */
const TSC_BASE = `
src/contexts/GroceryContext.merge.test.tsx(17,47): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
src/pages/pseo/PseoPage.tsx(12,10): error TS2305: Module '"@/types/pseo"' has no exported member 'PseoPageContent'.
src/pages/dashboard/ProfessionalSettings.tsx(88,5): error TS2322: Type 'string | null' is not assignable to type 'string | undefined'.
`;

const TSC_HEAD = `
src/contexts/GroceryContext.merge.test.tsx(17,47): error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
src/lib/brandNew.ts(4,9): error TS2304: Cannot find name 'notDefined'.
src/pages/pseo/PseoPage.tsx(12,10): error TS2305: Module '"@/types/pseo"' has no exported member 'PseoPageContent'.
src/pages/dashboard/ProfessionalSettings.tsx(88,5): error TS2322: Type 'string | null' is not assignable to type 'string | undefined'.
`;

describe('parsing a tsc log', () => {
  it('reads the file, line, code and message off each error', () => {
    const errors = parseTypecheckErrors(TSC_BASE);
    expect(errors).toHaveLength(3);
    expect(errors[1]).toMatchObject({
      file: 'src/pages/pseo/PseoPage.tsx',
      line: 12,
      code: 'TS2305',
    });
  });

  it('ignores everything that is not an error line', () => {
    const noise = `
> munch-maker-mate@0.0.0 typecheck
> tsc -b --noEmit

src/a.ts(1,1): error TS1000: nope.
Found 1 error in src/a.ts:1
`;
    expect(parseTypecheckErrors(noise).map((e) => e.code)).toEqual(['TS1000']);
  });
});

describe('the branch-new diff', () => {
  it('reports only the error the branch added', () => {
    const added = newErrors(parseTypecheckErrors(TSC_HEAD), parseTypecheckErrors(TSC_BASE));
    expect(added).toHaveLength(1);
    expect(added[0].file).toBe('src/lib/brandNew.ts');
    expect(added[0].code).toBe('TS2304');
  });

  it('reports nothing when the branch added nothing', () => {
    expect(newErrors(parseTypecheckErrors(TSC_BASE), parseTypecheckErrors(TSC_BASE))).toEqual([]);
  });

  /**
   * THE REASON THE KEY HAS NO LINE NUMBER. Adding an import at the top of a
   * file shifts every error under it. Keyed on position, the whole file would
   * report as new and the actual change would be buried again -- the same
   * failure in a different costume.
   */
  it('does not report an untouched error as new because the file moved down', () => {
    const base = parseTypecheckErrors(`src/a.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.`);
    const head = parseTypecheckErrors(`src/a.ts(42,5): error TS2322: Type 'string' is not assignable to type 'number'.`);
    expect(newErrors(head, base)).toEqual([]);
  });

  it('still reports a SECOND copy of an error that already existed once', () => {
    // The occurrence index is what makes this visible: without it, adding a
    // duplicate of an existing error would be free.
    const base = parseTypecheckErrors(`src/a.ts(1,1): error TS2304: Cannot find name 'x'.`);
    const head = parseTypecheckErrors(
      `src/a.ts(1,1): error TS2304: Cannot find name 'x'.\nsrc/a.ts(9,1): error TS2304: Cannot find name 'x'.`,
    );
    expect(newErrors(head, base)).toHaveLength(1);
  });

  it('treats the same message in a different file as new', () => {
    const base = parseTypecheckErrors(`src/a.ts(1,1): error TS2304: Cannot find name 'x'.`);
    const head = parseTypecheckErrors(`src/b.ts(1,1): error TS2304: Cannot find name 'x'.`);
    expect(newErrors(head, base).map((e) => e.file)).toEqual(['src/b.ts']);
  });

  it('gives every error a distinct key', () => {
    const keyed = keyErrors(parseTypecheckErrors(TSC_HEAD));
    expect(new Set(keyed.map((e) => e.key)).size).toBe(keyed.length);
  });
});

/** Real eslint stylish output, copied from this repo's own lint log. */
const LINT_BASE = `
/home/user/empty-stage-starter/src/pages/Grocery.tsx
    5:10  error    'toast' is defined but never used. Allowed unused vars must match /^_/u  @typescript-eslint/no-unused-vars
  130:52  error    Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/home/user/empty-stage-starter/src/lib/other.ts
   12:3  error    'x' is assigned a value but never used  @typescript-eslint/no-unused-vars
   40:1  warning  Fast refresh only works when a file only exports components  react-refresh/only-export-components
`;

describe('parsing an eslint log', () => {
  it('attaches each row to the file header above it', () => {
    const errors = parseLintErrors(LINT_BASE);
    expect(errors).toHaveLength(3);
    expect(errors[0].file).toContain('src/pages/Grocery.tsx');
    expect(errors[2].file).toContain('src/lib/other.ts');
  });

  it('counts errors only, never warnings', () => {
    // eslint exits non-zero on errors alone, and the backlog being burned down
    // is all error-severity.
    expect(parseLintErrors(LINT_BASE).every((e) => !e.raw.includes('warning'))).toBe(true);
  });

  it('keeps the rule name, so two different rules on one line stay distinct', () => {
    const errors = parseLintErrors(LINT_BASE);
    expect(errors[0].code).toBe('@typescript-eslint/no-unused-vars');
    expect(errors[1].code).toBe('@typescript-eslint/no-explicit-any');
  });

  it('reports only the lint error the branch added', () => {
    const head = `
/home/user/empty-stage-starter/src/pages/Grocery.tsx
    5:10  error    'toast' is defined but never used. Allowed unused vars must match /^_/u  @typescript-eslint/no-unused-vars
  130:52  error    Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  131:9   error    'fresh' is defined but never used. Allowed unused vars must match /^_/u  @typescript-eslint/no-unused-vars

/home/user/empty-stage-starter/src/lib/other.ts
   12:3  error    'x' is assigned a value but never used  @typescript-eslint/no-unused-vars
   40:1  warning  Fast refresh only works when a file only exports components  react-refresh/only-export-components
`;
    const added = newErrors(parseLintErrors(head), parseLintErrors(LINT_BASE));
    expect(added).toHaveLength(1);
    expect(added[0].message).toContain("'fresh' is defined but never used");
  });
});

describe('the no-base fallback', () => {
  it('groups by file, so every file is represented rather than the last forty lines', () => {
    const groups = groupByFile(parseTypecheckErrors(TSC_HEAD));
    expect([...groups.keys()]).toEqual([
      'src/contexts/GroceryContext.merge.test.tsx',
      'src/lib/brandNew.ts',
      'src/pages/pseo/PseoPage.tsx',
      'src/pages/dashboard/ProfessionalSettings.tsx',
    ]);
  });
});

/**
 * US-802: the ratchets must not go back to tailing a sorted list.
 *
 * `grep ... | tail -40` reads as diligence and is worse than nothing here:
 * errors sort by path, this repo's backlog lives in src/pages/*, so the tail
 * is the same forty pre-existing lines every run and the ones a branch added
 * are never shown. A text assertion, because nothing else would catch someone
 * putting it back.
 */
describe('the ratchets report what the branch added (US-802)', () => {
  const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

  for (const script of ['scripts/ci/typecheck-ratchet.sh', 'scripts/ci/lint-ratchet.sh']) {
    const body = read(script);

    it(`${script} does not tail the error list on a regression`, () => {
      // The `tail -40` guarding the "did not run at all" branch is fine -- that
      // one is dumping a CRASH log, where the end is the useful part. What must
      // not come back is a tail of the filtered error list.
      expect(body).not.toMatch(/grep[^\n]*error[^\n]*\|\s*tail\s+-\d+/);
    });

    it(`${script} diffs against the merge base`, () => {
      expect(body).toContain('explain_regression');
      expect(body).toContain('git merge-base');
      expect(body).toContain('new-errors.mjs');
    });

    it(`${script} passes both checkout roots, so absolute paths compare equal`, () => {
      // Without these the worktree's root differs from HEAD's and every error
      // reads as new: measured at 1137 of 1137 on a branch that added none.
      expect(body).toContain('--head-root=');
      expect(body).toContain('--base-root=');
    });

    it(`${script} writes its log somewhere the workflow can upload`, () => {
      expect(body).toMatch(/LOG="\$\{(TYPECHECK_LOG|LINT_LOG):-/);
    });
  }

  it('the workflow uploads both logs even when the step failed', () => {
    const ci = read('.github/workflows/ci.yml');
    for (const name of ['lint-log', 'typecheck-log']) {
      const at = ci.indexOf(`name: ${name}`);
      expect(at, `no ${name} artifact`).toBeGreaterThan(-1);
      // `if: always()` has to be on the upload step, or the log is only kept
      // for the runs where nobody needs it.
      const before = ci.slice(Math.max(0, at - 400), at);
      expect(before, `${name} is not uploaded on failure`).toContain('if: always()');
    }
  });
});
