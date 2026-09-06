import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * US-776: nothing under src/ is excluded from the typecheck.
 *
 * `tsconfig-bypass.json` listed a blanket `src/components/admin/**` plus nine
 * files, and the backlog doc described retiring them one at a time. None of it
 * was ever in effect -- no tsconfig, script or workflow referenced that file,
 * so everything it named had been typechecked all along and its errors were
 * always inside the ratchet count.
 *
 * An exclude that does not exist is harmless. What is not harmless is the
 * belief that it does: it makes the ratchet count look like partial coverage,
 * and it invites "just add it to the bypass" as a way past a red build. These
 * assertions describe the real configuration, so a genuine exclude has to
 * announce itself here rather than arriving as a line in a file nobody reads.
 */

/** tsconfig files allow comments and trailing commas, so parse them loosely. */
function readTsconfig(path: string): Record<string, unknown> {
  const raw = fs
    .readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(raw);
}

describe('US-776: the typecheck covers all of src/', () => {
  it('runs tsc -b over the project references', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(pkg.scripts.typecheck).toContain('tsc -b');
    const root = readTsconfig('tsconfig.json');
    const refs = (root.references as Array<{ path: string }>).map((r) => r.path);
    expect(refs).toContain('./tsconfig.app.json');
  });

  it('typechecks src with no exclude', () => {
    const app = readTsconfig('tsconfig.app.json');
    expect(app.include).toContain('src');
    // The whole point. An exclude here is what the bypass file pretended to be.
    expect(app.exclude ?? []).toEqual([]);
  });

  it('has no tsconfig excluding anything under src/', () => {
    const offenders: string[] = [];
    for (const file of fs.readdirSync('.').filter((f) => /^tsconfig.*\.json$/.test(f))) {
      const cfg = readTsconfig(file);
      for (const pattern of (cfg.exclude as string[] | undefined) ?? []) {
        if (pattern.replace(/\\/g, '/').startsWith('src/')) offenders.push(`${file}: ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('does not carry a bypass config, and nothing references one', () => {
    expect(fs.existsSync('tsconfig-bypass.json')).toBe(false);
    for (const file of ['package.json', 'tsconfig.json', 'tsconfig.app.json']) {
      expect(fs.readFileSync(file, 'utf8')).not.toContain('tsconfig-bypass');
    }
    // A dead file is one thing; a dead file the docs treat as live is what
    // kept this story open, so the doc has to describe the real state too.
    const backlog = fs.readFileSync('docs/typecheck-backlog.md', 'utf8');
    expect(backlog).toMatch(/excluded nothing/i);
  });
});
