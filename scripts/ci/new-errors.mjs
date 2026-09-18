#!/usr/bin/env node
//
// US-802: which errors did THIS branch add?
//
// Both ratchets used to answer a regression with `grep ... | tail -40`. tsc
// sorts its output by path and the backlog lives in src/pages/*, so that tail
// is a CONSTANT: the same forty pre-existing errors in src/pages/pseo/* and
// ProfessionalSettings.tsx print every time, and the errors the branch
// actually added are earlier in the walk and never shown. It cost two round
// trips once, and the causes were finally found by running a scoped tsc by
// hand over the two changed files with the project's strict and lib settings
// copied out of tsconfig.app.json.
//
// So: parse both logs, key each error by something that survives code moving,
// and print the set difference.
//
// THE KEY DELIBERATELY EXCLUDES LINE AND COLUMN. Adding a line at the top of a
// file shifts every error under it, and a diff keyed on position would report
// the whole file as new. Path + code + message is stable under a move and
// still separates two different errors on the same line. It does carry an
// occurrence index, so a fourth copy of an error that already appeared three
// times is still visible.
//
// PATHS ARE MADE REPO-RELATIVE BEFORE KEYING, and this is not cosmetic. eslint
// prints ABSOLUTE paths, and the merge-base run happens in a git worktree under
// a different root -- so without stripping it, every single error differs by its
// directory prefix and the diff reports the entire backlog as new. Measured:
// 1137 of 1137 "new" on a branch that had added none. The roots are passed in
// rather than guessed, because only the caller knows where each run happened.
//
// Usage:
//   node scripts/ci/new-errors.mjs --kind=typecheck --head=<log> --base=<log>
//   node scripts/ci/new-errors.mjs --kind=lint      --head=<log> [--base=<log>]
//     [--head-root=<dir>] [--base-root=<dir>]
//
// With no --base it prints the head errors grouped by file, which is still
// better than a tail: at least every file is represented.

import { readFileSync } from 'node:fs';

/** Field separator for the dedup key. Not a character any path or rule holds. */
const SEP = String.fromCharCode(31);

/** `path(line,col): error TS2304: Cannot find name 'x'.` */
const TSC_LINE = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/;

/** eslint stylish: a path header on its own line, then `  12:34  error  msg  rule`. */
const ESLINT_ROW = /^\s+(\d+):(\d+)\s+error\s+(.*)$/;

/** Strip a checkout root so two runs from different directories compare equal. */
export function relativise(file, root) {
  if (!root) return file;
  const withSlash = root.endsWith('/') ? root : root + '/';
  return file.startsWith(withSlash) ? file.slice(withSlash.length) : file;
}

export function parseTypecheckErrors(text, root) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const m = TSC_LINE.exec(line);
    if (!m) continue;
    out.push({
      file: relativise(m[1], root),
      line: Number(m[2]),
      code: m[4],
      message: m[5].trim(),
      raw: line,
    });
  }
  return out;
}

export function parseLintErrors(text, root) {
  const out = [];
  let file = '';
  for (const raw of text.split('\n')) {
    if (raw.length > 0 && !/^\s/.test(raw) && /[/\\.]/.test(raw)) {
      file = relativise(raw.trim(), root);
      continue;
    }
    const row = ESLINT_ROW.exec(raw);
    if (!row) continue;
    const rest = row[3].trim().replace(/\s{2,}/g, '  ');
    const parts = rest.split('  ');
    out.push({
      file,
      line: Number(row[1]),
      code: parts.length > 1 ? parts[parts.length - 1] : '',
      message: rest,
      raw: raw.trim(),
    });
  }
  return out;
}

export function keyErrors(errors) {
  const seen = new Map();
  return errors.map((e) => {
    const base = [e.file, e.code, e.message].join(SEP);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return Object.assign({}, e, { key: base + SEP + '#' + n });
  });
}

/** Errors present in head and not in base, in head's order. */
export function newErrors(headErrors, baseErrors) {
  const baseKeys = new Set(keyErrors(baseErrors).map((e) => e.key));
  return keyErrors(headErrors).filter((e) => !baseKeys.has(e.key));
}

/** Head errors grouped by file, for when there is no base to compare against. */
export function groupByFile(errors) {
  const groups = new Map();
  for (const e of errors) {
    if (!groups.has(e.file)) groups.set(e.file, []);
    groups.get(e.file).push(e);
  }
  return groups;
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function main() {
  const kind = arg('kind', 'typecheck');
  const headPath = arg('head', '');
  const basePath = arg('base', '');
  const parse = kind === 'lint' ? parseLintErrors : parseTypecheckErrors;

  const head = parse(readFileSync(headPath, 'utf8'), arg('head-root', ''));

  if (!basePath) {
    const groups = groupByFile(head);
    console.log('No merge base to compare against; ' + head.length + ' error(s) across ' + groups.size + ' file(s):');
    for (const [file, errors] of groups) {
      console.log('\n  ' + file + '  (' + errors.length + ')');
      for (const e of errors.slice(0, 5)) console.log('    ' + e.raw);
      if (errors.length > 5) console.log('    ... and ' + (errors.length - 5) + ' more in this file');
    }
    return;
  }

  const base = parse(readFileSync(basePath, 'utf8'), arg('base-root', ''));
  const added = newErrors(head, base);

  if (added.length === 0) {
    console.log(
      'The count grew but no error is new against the merge base (head ' + head.length +
        ', base ' + base.length + '). That usually means the baseline file is stale, ' +
        'or the same error moved between files.',
    );
    return;
  }

  console.log(added.length + ' error(s) NEW on this branch (head ' + head.length + ', base ' + base.length + '):\n');
  // With the file, always. eslint's stylish rows carry only line:col, so a bare
  // row is not actionable -- the path lives on a header further up the log,
  // which is exactly the context a filtered list throws away.
  let lastFile = '';
  for (const e of added) {
    if (e.file !== lastFile) {
      console.log('  ' + (e.file || '(unknown file)'));
      lastFile = e.file;
    }
    console.log('    ' + e.raw);
  }
}

if (process.argv[1] && process.argv[1].endsWith('new-errors.mjs')) main();
