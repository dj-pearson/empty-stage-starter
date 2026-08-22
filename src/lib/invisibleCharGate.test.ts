import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

/**
 * check-invisible-chars.mjs, exercised rather than trusted.
 *
 * This exists because the probe lied, not the gate. A hand-rolled shell probe
 * reported that U+E0001 -- the Unicode tag block, the carrier CLAUDE.md singles
 * out as "above all" the one to catch -- walked straight through the gate. It
 * does not; the probe had failed to write the character at all, so the gate was
 * handed a file with nothing in it and correctly said nothing. A check that
 * returns the right answer for the wrong reason is indistinguishable from a
 * working one until you pin it.
 *
 * Two classes are covered. Invisible and bidi characters are banned everywhere.
 * Space lookalikes (U+00A0 and friends, U+2028/U+2029) are banned only in files
 * a machine parses, because that is the scope CLAUDE.md gives them: a no-break
 * space breaks shell word-splitting and column parsing, and U+2028 is valid
 * JSON but a syntax error inside a JS string literal, while an em space in a
 * Markdown paragraph is just typography.
 *
 * Fixtures build the characters from String.fromCodePoint rather than pasting
 * them, so a copy-paste or an editor normalisation cannot quietly empty them
 * out -- which is the exact failure this file was written to stop repeating.
 */

const cp = (n: number) => String.fromCodePoint(n);

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'invis-scan-'));
  execFileSync('git', ['init', '-q', '.'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repo });
  mkdirSync(path.join(repo, 'scripts', 'ci'), { recursive: true });
  copyFileSync(
    path.join(process.cwd(), 'scripts', 'ci', 'check-invisible-chars.mjs'),
    path.join(repo, 'scripts', 'ci', 'check-invisible-chars.mjs')
  );
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

/** Runs the gate over a repo containing exactly one fixture file. */
const run = (name: string, body: string): { ok: boolean; out: string } => {
  writeFileSync(path.join(repo, name), body, 'utf8');
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'probe'], { cwd: repo });
  try {
    const out = execFileSync('node', ['scripts/ci/check-invisible-chars.mjs'], {
      cwd: repo,
      encoding: 'utf8',
    });
    return { ok: true, out };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

describe('check-invisible-chars.mjs: characters banned everywhere', () => {
  it('catches the Unicode tag block, the carrier for hidden ASCII', () => {
    // The one the bad probe cleared. U+E0001 is LANGUAGE TAG; the block encodes
    // arbitrary ASCII that renders as nothing at all.
    const { ok, out } = run('a.ts', `const x = 'he${cp(0xe0001)}llo';\n`);
    expect(ok).toBe(false);
    expect(out).toContain('U+E0001');
    expect(out).toContain('UNICODE TAG');
  });

  it('catches a zero-width space inside an identifier', () => {
    const { ok, out } = run('a.ts', `const fo${cp(0x200b)}o = 1;\n`);
    expect(ok).toBe(false);
    expect(out).toContain('ZERO WIDTH SPACE');
  });

  it('catches a bidi override, which reorders the line without changing it', () => {
    const { ok, out } = run('a.ts', `const x = '${cp(0x202e)}nimda';\n`);
    expect(ok).toBe(false);
    expect(out).toContain('BIDI OVERRIDE');
  });

  it('catches an invisible character in prose too, not only in code', () => {
    const { ok, out } = run('README.md', `some${cp(0x200b)}thing\n`);
    expect(ok).toBe(false);
    expect(out).toContain('README.md');
  });

  it('allows ZWJ between two emoji, which is a real sequence', () => {
    const { ok } = run('a.ts', `export const family = '\u{1F468}${cp(0x200d)}\u{1F467}';\n`);
    expect(ok).toBe(true);
  });

  it('flags ZWJ used to split an ASCII identifier', () => {
    const { ok, out } = run('a.ts', `const fo${cp(0x200d)}o = 1;\n`);
    expect(ok).toBe(false);
    expect(out).toContain('ZERO WIDTH JOINER');
  });
});

describe('check-invisible-chars.mjs: space lookalikes, machine-read files only', () => {
  const CASES: Array<[number, string]> = [
    [0x00a0, 'NO-BREAK SPACE'],
    [0x202f, 'NARROW NO-BREAK SPACE'],
    [0x2009, 'THIN SPACE'],
    [0x3000, 'IDEOGRAPHIC SPACE'],
    [0x2028, 'LINE SEPARATOR'],
    [0x2029, 'PARAGRAPH SEPARATOR'],
  ];

  for (const [code, name] of CASES) {
    it(`flags ${name} in a .ts file`, () => {
      const { ok, out } = run('a.ts', `const x = 'a${cp(code)}b';\n`);
      expect(ok).toBe(false);
      expect(out).toContain(name);
    });
  }

  it('flags a no-break space in a shell script, where it breaks word-splitting', () => {
    const { ok, out } = run('run.sh', `cp$(printf '')${cp(0x00a0)}-r src dst\n`);
    expect(ok).toBe(false);
    expect(out).toContain('NO-BREAK SPACE');
  });

  it('flags U+2028 in SQL', () => {
    const { ok, out } = run('m.sql', `select 1${cp(0x2028)}as x;\n`);
    expect(ok).toBe(false);
    expect(out).toContain('LINE SEPARATOR');
  });

  it('leaves a no-break space in Markdown alone -- prose typography, not a bug', () => {
    const { ok } = run('doc.md', `10${cp(0x00a0)}kg of carrots\n`);
    expect(ok).toBe(true);
  });

  it('leaves a no-break space in a plain .txt file alone', () => {
    const { ok } = run('notes.txt', `a${cp(0x00a0)}b\n`);
    expect(ok).toBe(true);
  });

  it('honours the allow marker on the same line', () => {
    const { ok } = run(
      'a.ts',
      `const x = 'a${cp(0x00a0)}b'; // invisible-chars: allow fixture for the parser test\n`
    );
    expect(ok).toBe(true);
  });
});
