import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf-8');

const psScripts = execSync('git ls-files "*.ps1"', { cwd: repoRoot, encoding: 'utf-8' })
  .split('\n')
  .filter(Boolean);

/**
 * PowerShell in this repo has a history of sitting unparseable for months
 * because a look-alike character got into a string literal. These guard the
 * classes that actually break the parser or the shell, not non-ASCII in
 * general: the scripts legitimately print box-drawing, check marks and emoji
 * to the console, and banning those would be a cosmetic rewrite of eight files
 * that parse fine today.
 */
describe('PowerShell scripts avoid characters that break parsing', () => {
  // Curly quotes, en/em dash, minus, prime, ellipsis: these look like ASCII
  // punctuation in a diff and are a syntax error or a wrong string value.
  // Written as \u escapes so this file cannot itself carry what it forbids.
  const LOOKALIKES =
    /[\u2018\u2019\u201C\u201D\u2013\u2014\u2212\u2032\u2026]/;
  // Space-like characters that break word splitting and column parsing.
  const FAKE_SPACES = /[\u00A0\u202F\u2007\u2009\u2002\u2003\u3000]/;
  // Zero-width, bidi controls and the Unicode tag block, which can carry text
  // a reviewer cannot see. U+FE0F is deliberately NOT here: it is the
  // variation selector inside emoji the scripts print on purpose.
  const INVISIBLE =
    // \u034F is a combining mark and sits outside the class: eslint's
    // no-misleading-character-class rejects combining marks grouped with others.
    /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|\u034F|[\u{E0000}-\u{E007F}]/u;

  it('finds the PowerShell scripts to check', () => {
    expect(psScripts.length).toBeGreaterThan(0);
  });

  it.each([
    ['quote and dash look-alikes', LOOKALIKES],
    ['non-breaking or exotic spaces', FAKE_SPACES],
    ['invisible or bidi characters', INVISIBLE],
  ])('no %s', (_label, pattern) => {
    const offenders = psScripts.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, i) => ({ file, line: i + 1, text: line }))
        .filter(({ text }) => pattern.test(text))
        .map(({ file: f, line }) => `${f}:${line}`),
    );

    expect(offenders).toEqual([]);
  });
});

/**
 * US-562: the provisioning-profile encoders used to read from and write to the
 * repo root, which is what kept distribution secrets inside a working tree.
 */
describe('provisioning profile encoders stay out of the repo (US-562)', () => {
  const encoders = ['encode-app-profile.ps1', 'encode-share-profile.ps1'];

  it.each(encoders)('%s takes its paths from outside the repo', (file) => {
    const source = read(file);

    expect(source).toMatch(/EATPAL_SIGNING_DIR/);
    expect(source).toMatch(/param\(/);
    // The old form built the source path from the script's own directory.
    expect(source).not.toMatch(/\$src\s*=\s*Join-Path \$root/);
  });

  it.each(encoders)('%s refuses to write signing material into the repo', (file) => {
    expect(read(file)).toMatch(/Refusing to write signing material into the repository/);
  });

  it.each(encoders)('%s never prints the encoded value', (file) => {
    const source = read(file);
    // Length is fine to print; the value is not.
    expect(source).toMatch(/\$base64\.Length/);
    expect(source).not.toMatch(/Write-Host\s+"?\$base64\b/);
  });
});

describe('signing material is not tracked (US-562)', () => {
  it('has no signing artefact in the index', () => {
    const tracked = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf-8' })
      .split('\n')
      .filter((f) => /\.(key|pem|mobileprovision|p12|cer|keystore)$|base64\.txt$/i.test(f));

    expect(tracked).toEqual([]);
  });

  it('gitignores the signing artefacts by glob, not just by exact name', () => {
    const ignored = read('.gitignore');

    for (const pattern of ['*.pem', '*.key', '*.mobileprovision', '*.base64.txt']) {
      expect(ignored).toContain(pattern);
    }
  });
});
