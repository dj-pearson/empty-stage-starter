#!/usr/bin/env node
/**
 * Hard gate: no invisible or bidi-control characters in tracked text files.
 *
 * This is the one character class that cannot be caught by reading the diff,
 * which is exactly why it is worth a gate. A zero-width space inside an
 * identifier compares unequal to the identifier it appears to be; a bidi
 * control can reorder how a line displays without changing what the parser
 * sees; and the Unicode tag block (U+E0000-U+E007F) encodes arbitrary ASCII
 * that renders as nothing at all. All of them survive review because they look
 * correct.
 *
 * Two real instances were already in this tree when the gate was written --
 * src/lib/hiddenVeggieRewriter.ts joined a search haystack on a zero-width
 * space, and src/lib/agentConfig.ts used one to stop a `*` `/` pair from
 * closing a JSDoc block (a backslash escape does that visibly).
 *
 * ZWJ (U+200D) is allowed between two non-ASCII characters, because that is an
 * emoji sequence -- the family and profession emoji in the quiz copy are built
 * from them and are entirely legitimate.
 *
 * A second, narrower class: characters that DO render, but render as an
 * ordinary space (U+00A0 and friends) or as a line break the parser disagrees
 * about (U+2028/U+2029). These are only checked in files a machine parses --
 * code, config, SQL, shell -- because that is the scope CLAUDE.md gives them,
 * and because an em space in a Markdown paragraph is typography rather than a
 * bug. A no-break space breaks shell word-splitting, `grep` and column parsing
 * while looking exactly like a space; U+2028 is valid JSON and a syntax error
 * inside a JS string literal. Prose files are left alone.
 *
 * Escape hatch: put `invisible-chars: allow` in a comment on the same line,
 * for a deliberate use that carries its reason with it.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ALLOW_MARKER = 'invisible-chars: allow';

/** Codepoints that must never appear, named so the failure explains itself. */
const NAMED = new Map([
  [0x00ad, 'SOFT HYPHEN'],
  [0x034f, 'COMBINING GRAPHEME JOINER'],
  [0x061c, 'ARABIC LETTER MARK'],
  [0x180e, 'MONGOLIAN VOWEL SEPARATOR'],
  [0x200b, 'ZERO WIDTH SPACE'],
  [0x200c, 'ZERO WIDTH NON-JOINER'],
  [0x200e, 'LEFT-TO-RIGHT MARK'],
  [0x200f, 'RIGHT-TO-LEFT MARK'],
  [0xfeff, 'ZERO WIDTH NO-BREAK SPACE / BOM'],
]);

const isBanned = (cp) => {
  if (NAMED.has(cp)) return true;
  if (cp >= 0x202a && cp <= 0x202e) return true; // bidi embedding/override
  if (cp >= 0x2060 && cp <= 0x2064) return true; // word joiner, invisible operators
  if (cp >= 0x2066 && cp <= 0x2069) return true; // bidi isolates
  if (cp >= 0xe0000 && cp <= 0xe007f) return true; // Unicode tag block
  return false;
};

const nameOf = (cp) => {
  if (NAMED.has(cp)) return NAMED.get(cp);
  if (cp >= 0x202a && cp <= 0x202e) return 'BIDI OVERRIDE';
  if (cp >= 0x2060 && cp <= 0x2064) return 'INVISIBLE OPERATOR';
  if (cp >= 0x2066 && cp <= 0x2069) return 'BIDI ISOLATE';
  if (cp >= 0xe0000 && cp <= 0xe007f) return 'UNICODE TAG (hidden ASCII)';
  return 'INVISIBLE';
};

/**
 * Characters that render, but not as what they are. Restricted to machine-read
 * files: CLAUDE.md bans these from "anything a machine parses", not from prose.
 */
const SPACE_LOOKALIKES = new Map([
  [0x00a0, 'NO-BREAK SPACE'],
  [0x2002, 'EN SPACE'],
  [0x2003, 'EM SPACE'],
  [0x2007, 'FIGURE SPACE'],
  [0x2009, 'THIN SPACE'],
  [0x202f, 'NARROW NO-BREAK SPACE'],
  [0x3000, 'IDEOGRAPHIC SPACE'],
  [0x2028, 'LINE SEPARATOR'],
  [0x2029, 'PARAGRAPH SEPARATOR'],
]);

/** Extensions whose contents something other than a human reads. */
const MACHINE_READ = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'json', 'jsonc', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'properties',
  'sql', 'sh', 'bash', 'zsh', 'ps1', 'psm1',
  'css', 'scss', 'swift', 'kt', 'kts', 'gradle', 'plist', 'xml',
]);

const isMachineRead = (file) => {
  const base = file.split('/').pop() ?? file;
  if (base === 'Dockerfile' || base === 'Makefile' || base.startsWith('.env')) return true;
  if (!base.includes('.')) return false;
  return MACHINE_READ.has(base.split('.').pop().toLowerCase());
};

/** Extensions we do not read as text. Everything else is checked. */
const BINARY = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'icns', 'bmp',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'pdf', 'zip', 'gz', 'tgz', 'bz2', 'xz', 'jar', 'mp3', 'mp4', 'mov', 'wav',
  'keystore', 'jks', 'p12', 'mobileprovision', 'cer', 'der',
  'xcuserstate', 'car', 'pbxproj',
]);

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((f) => !BINARY.has(f.split('.').pop()?.toLowerCase() ?? ''));

const findings = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // unreadable or genuinely binary
  }
  if (text.includes('\0')) continue;

  const machineRead = isMachineRead(file);
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(ALLOW_MARKER)) continue;

    const chars = [...line];
    for (let j = 0; j < chars.length; j++) {
      const cp = chars[j].codePointAt(0);

      if (cp === 0x200d) {
        // ZWJ is legitimate between two emoji. Anywhere else it is a way to
        // split an identifier in two while it still reads as one.
        const before = chars[j - 1]?.codePointAt(0) ?? 0;
        const after = chars[j + 1]?.codePointAt(0) ?? 0;
        if (before > 0x7f && after > 0x7f) continue;
        findings.push({ file, line: i + 1, name: 'ZERO WIDTH JOINER (not in an emoji sequence)' });
        continue;
      }

      if (machineRead && SPACE_LOOKALIKES.has(cp)) {
        findings.push({
          file,
          line: i + 1,
          name: `${SPACE_LOOKALIKES.get(cp)} (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`,
        });
        continue;
      }

      if (isBanned(cp)) {
        findings.push({
          file,
          line: i + 1,
          name: `${nameOf(cp)} (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`,
        });
      }
    }
  }
}

console.log(`Scanning ${files.length} tracked text files for invisible characters ...`);

if (!findings.length) {
  console.log('No invisible or bidi-control characters found.');
  process.exit(0);
}

console.error(`\n${findings.length} invisible character(s) found:\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  ${f.name}`);
}
console.error(
  '\nThese render as nothing, as an ordinary space, or reorder the line, while the' +
    '\nparser sees something else. Remove them, or mark a deliberate use with an' +
    '\n`invisible-chars: allow` comment on the same line saying why it is load-bearing.'
);
process.exit(1);
