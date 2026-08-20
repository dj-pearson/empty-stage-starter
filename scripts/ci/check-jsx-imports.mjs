#!/usr/bin/env node
//
// US-638: fail the build when a component is rendered but never imported.
//
// This has now shipped four times. SeoAnalysisTabs used <Input> eight times
// with no import and broke six admin tabs (US-553). ManageKidsDialog used
// <AlertDialogTrigger>, which crashes the dialog the moment a user clicks Edit
// on a child, and sat that way for two months. AITicketAnalysis and
// CRMIntegration had the same thing.
//
// Nothing catches it today:
//   * ESLint's no-undef is off for TypeScript, because TS is meant to cover it.
//   * `tsc -b` DOES report it as TS2304, but the typecheck step is a
//     non-blocking RATCHET (ci.yml:66) that only fails when the total error
//     count grows, so one more error inside a backlog of 1257 is invisible.
//   * A repo-wide scoped tsc is not an option: scoping to src/lib alone times
//     out past four minutes, because the import graph drags in AppContext and
//     the generated supabase types.
//
// So this is a cheap syntactic check rather than a type-aware one. It compares
// every JSX element name against the names a file actually binds. That is a
// narrower question than "does this typecheck", and it runs over the whole of
// src/ in under a second.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Strip comments only, and line by line.
 *
 * An earlier version also stripped string and template literals. That was
 * worse than useless: the single-quote pattern ran away on an apostrophe in
 * ordinary prose ("doesn't"), pairing it with some later quote and swallowing
 * everything between -- 14k characters of Pantry.tsx, including the
 * `function LoadingSkeleton` declaration it was then reported as missing.
 * Line-scoping means a runaway can never cross a newline.
 */
function scrub(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1 '))
    .join('\n');
}

/**
 * Every capitalised name a file BINDS: imports, declarations, and destructuring.
 *
 * Destructuring matters more than it sounds. The false positives that made the
 * first draft of this useless were all bindings that are not declarations:
 *   const { View, Text } = RNComponents      -- runtime destructuring
 *   .map(({ icon: Icon }) => ...)            -- renamed in a parameter pattern
 *   function SafeHTML({ as: Tag = 'div' })   -- renamed with a default
 */
function boundNames(source) {
  const names = new Set(['Fragment']);
  const add = (n) => n && /^[A-Z]/.test(n) && names.add(n);

  // import X, { a as b, c } from '...'  /  import * as NS from '...'
  for (const m of source.matchAll(/import\s+(?:type\s+)?([\s\S]*?)\s+from\s*['"][^'"]*['"]/g)) {
    const clause = m[1];
    for (const part of clause.split('{')[0].split(',')) add(part.replace(/\*\s*as\s*/, '').trim());
    for (const block of clause.matchAll(/\{([\s\S]*?)\}/g)) {
      for (const item of block[1].split(',')) {
        const bits = item.replace(/\btype\b/, '').split(/\s+as\s+/);
        add(bits[bits.length - 1].trim());
      }
    }
  }

  for (const m of source.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of source.matchAll(/\b(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);

  // Any object-destructuring pattern, wherever it appears: `{ a, b: C = 1 }`.
  // Deliberately greedy about what counts as a binding -- a false NEGATIVE here
  // costs nothing (the name was probably bound), a false POSITIVE breaks CI.
  for (const block of source.matchAll(/\{([^{}]*)\}/g)) {
    for (const item of block[1].split(',')) {
      const renamed = item.split(':');
      const bound = (renamed.length > 1 ? renamed[1] : renamed[0]).split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(bound)) add(bound);
    }
  }

  return names;
}

/**
 * JSX element names. Anchored so a generic type argument -- useRef<Foo>,
 * Dispatch<SetStateAction<Bar>> -- is not mistaken for an element: those follow
 * an identifier or `)`, whereas JSX follows whitespace, `(`, `{`, `>` or `,`.
 */
function jsxNames(source) {
  const found = new Set();
  for (const m of source.matchAll(/(?:^|[\s(\{>,])<([A-Z][\w$]*)(?=[\s/>])/gm)) {
    // `<K extends keyof T>` is a type parameter list, not an element.
    const after = source.slice(m.index + m[0].length);
    if (/^\s*extends\b/.test(after)) continue;
    found.add(m[1]);
  }
  return found;
}

const files = execSync("git ls-files 'src/**/*.tsx'", { encoding: 'utf-8' })
  .split('\n')
  .filter((f) => f && !f.includes('.test.') && !f.includes('/ui/'));

const problems = [];
for (const file of files) {
  const source = scrub(readFileSync(file, 'utf-8'));
  const bound = boundNames(source);
  for (const name of jsxNames(source)) {
    if (!bound.has(name)) problems.push({ file, name });
  }
}

console.log(`Checking ${files.length} components for JSX used but never imported ...`);

if (problems.length) {
  console.log(`::error title=Component rendered but not imported::${problems.length} found.`);
  for (const { file, name } of problems) {
    console.log(`  ${file}: <${name}> is rendered here but never imported or declared.`);
  }
  console.log('\nThis is a ReferenceError at runtime, on whatever path renders it.');
  process.exit(1);
}

console.log('No components are rendered without being imported.');
