import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { chunkKey, staticImportsOf } from '../../scripts/ci/check-bundle-budget.mjs';

/**
 * chunkKey, pinned against real Vite filenames (US-775).
 *
 * The budget is keyed on the chunk name with its content hash stripped, and two
 * plausible ways of stripping it both produced a budget that looked fine and
 * measured almost nothing:
 *
 *   `-[A-Za-z0-9_-]{8,}$` matched greedily from the first hyphen, because the
 *   character class contains one. `vendor-swagger-B_m6f195` became `vendor`,
 *   which failed the `vendor-` prefix filter, so every vendor chunk was dropped
 *   and the generated file budgeted the entry chunk alone.
 *
 *   `-[^-]+$` broke on `vendor-supabase-Dx3Vi-Xp`, because Vite hashes are
 *   base64url and contain hyphens. The key kept a hash fragment, so it would
 *   never match on the next build and that chunk would go unbudgeted forever.
 *
 * Neither failure is visible from the outside: the gate still runs, still
 * prints a reassuring line, and still passes. Hence real filenames here rather
 * than tidy invented ones.
 */

describe('chunkKey', () => {
  it.each([
    ['index-B7dhznvA.js', 'index'],
    ['vendor-three-core-DV3ss7Cs.js', 'vendor-three-core'],
    ['vendor-swagger-B_m6f195.js', 'vendor-swagger'],
    ['vendor-swagger-deps-Cq1TvKlm.js', 'vendor-swagger-deps'],
    ['html5-qrcode-scanner-Ds97g5Mj.js', 'html5-qrcode-scanner'],
    // The hash itself contains a hyphen. This is the case that broke the
    // strip-the-last-segment version.
    ['vendor-supabase-Dx3Vi-Xp.js', 'vendor-supabase'],
  ])('%s -> %s', (file, expected) => {
    expect(chunkKey(file)).toBe(expected);
  });

  it('never leaves a hash fragment on a vendor chunk', () => {
    // A key that still carries part of a hash silently stops matching after the
    // next build, which removes that chunk from the budget without any error.
    expect(chunkKey('vendor-supabase-Dx3Vi-Xp.js')).not.toMatch(/Dx3Vi/);
    expect(chunkKey('vendor-swagger-B_m6f195.js')).not.toMatch(/B_m6f195/);
  });

  it('does not collapse a vendor chunk to the bare word vendor', () => {
    // The greedy version did exactly this, and `vendor` fails the prefix filter
    // that decides what gets a budget.
    for (const f of ['vendor-react-CmG7Ay0O.js', 'vendor-gsap-r3SwSqE3.js']) {
      expect(chunkKey(f)).not.toBe('vendor');
      expect(chunkKey(f).startsWith('vendor-')).toBe(true);
    }
  });
});

describe('the budget file', () => {
  const budget = JSON.parse(
    readFileSync(path.join(process.cwd(), '.ci', 'bundle-budget.json'), 'utf8')
  );

  it('budgets the entry chunk and the vendor chunks', () => {
    expect(budget.chunks.index).toBeGreaterThan(0);
    const vendors = Object.keys(budget.chunks).filter((k) => k.startsWith('vendor-'));
    // If a regression collapses the keys again this drops to zero or one, which
    // is the state the gate shipped in for its first two runs.
    expect(vendors.length).toBeGreaterThan(10);
  });

  it('has no key carrying a leftover hash fragment', () => {
    for (const key of Object.keys(budget.chunks)) {
      expect(key).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('has a total larger than any single chunk', () => {
    const largest = Math.max(...(Object.values(budget.chunks) as number[]));
    expect(budget.totalJs).toBeGreaterThan(largest);
  });
});

describe('the Build job enforces the budget', () => {
  const ci = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');

  it('runs the check', () => {
    expect(ci).toContain('scripts/ci/check-bundle-budget.mjs');
  });

  it('runs it after the build, which is what writes dist/', () => {
    expect(ci.indexOf('run: npm run build')).toBeLessThan(
      ci.indexOf('scripts/ci/check-bundle-budget.mjs')
    );
  });
});

describe('staticImportsOf', () => {
  it('finds a named static import', () => {
    expect(staticImportsOf('import{a as b}from"./vendor-react-Etq-L_65.js";')).toEqual([
      'vendor-react-Etq-L_65.js',
    ]);
  });

  it('finds a bare side-effect import', () => {
    expect(staticImportsOf('import"./polyfill-abc12345.js";')).toEqual(['polyfill-abc12345.js']);
  });

  it('ignores a dynamic import, which is the whole point of splitting', () => {
    // If this ever matched, every lazily-loaded route would count as eager and
    // the eager budget would be the total -- a check that fails on everything
    // says nothing.
    expect(staticImportsOf('const p=import("./BlogPost-9tNACYzE.js");')).toEqual([]);
  });

  it('separates the two when they sit in the same chunk', () => {
    const source = 'import{x}from"./vendor-utils-BuPz.js";const p=import("./Admin-gB34r5Cj.js");';
    expect(staticImportsOf(source)).toEqual(['vendor-utils-BuPz.js']);
  });

  it('deduplicates a chunk imported twice', () => {
    const source = 'import{a}from"./vendor-react-A.js";import{b}from"./vendor-react-A.js";';
    expect(staticImportsOf(source)).toEqual(['vendor-react-A.js']);
  });
});

describe('the eager budget', () => {
  it('is recorded, because the per-chunk budgets could not see it', () => {
    // vendor-markdown sat inside its 148 kB budget the entire time the entry
    // chunk was statically importing it on every route (US-816).
    const budget = JSON.parse(
      readFileSync(path.join(process.cwd(), '.ci', 'bundle-budget.json'), 'utf8')
    );
    expect(typeof budget.eagerJs).toBe('number');
    expect(budget.eagerJs).toBeLessThan(budget.totalJs);
  });
});

/**
 * The eagerJs budget is only meaningful if every build measuring against it made
 * the same decisions.
 *
 * `src/integrations/supabase/client.ts` derives `isSupabaseConfigured` from
 * Vite-inlined env literals and falls back to a mock when the anon key is not a
 * JWT. With the constant folded to false, Rollup drops the entire createClient
 * path and the eager closure loses 39 kB. The 280000 budget was measured on such
 * a build, so every authorized build on main -- which carries the real key --
 * measured 305.7 kB and failed by 25.7 kB. Two merges went red that way before
 * anyone looked at the environment rather than the diff.
 *
 * These assertions are about the script's shape rather than a built dist/, which
 * this suite has none of.
 */
describe('the budget only measures builds that ship', () => {
  const script = readFileSync(path.join(process.cwd(), 'scripts', 'ci', 'check-bundle-budget.mjs'), 'utf8');

  it('can tell a tree-shaken build from a real one', () => {
    expect(script).toContain("SUPABASE_SDK_MARKER = 'GoTrueClient'");
    expect(script).toContain('function buildIncludesSupabaseSdk()');
  });

  it('refuses to generate budgets from a build without the SDK', () => {
    // This is how the wrong number got in.
    const update = script.slice(script.indexOf("if (process.argv.includes('--update'))"));
    const guard = update.slice(0, update.indexOf('const budgets = {}'));
    expect(guard).toContain('!buildIncludesSupabaseSdk()');
    expect(guard).toContain('process.exit(1)');
  });

  it('skips rather than fails the eager check on such a build', () => {
    // Fork PRs have no access to the anon key secret and CI falls back to a
    // placeholder for them; those builds must not go red over it.
    expect(script).toContain('representative && typeof budget.eagerJs');
  });

  it('the committed budget was measured on a real build', () => {
    // 305.7 kB + the script's 5% headroom. Below ~300000 means somebody
    // re-measured without the SDK again.
    const budget = JSON.parse(readFileSync(path.join(process.cwd(), '.ci', 'bundle-budget.json'), 'utf8'));
    expect(budget.eagerJs).toBeGreaterThan(300000);
  });
});
