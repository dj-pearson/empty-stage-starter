#!/usr/bin/env node
/**
 * Stamp a build id into dist/sw.js (US-765).
 *
 * public/sw.js ships with a literal `__SW_BUILD_ID__` placeholder and Vite
 * copies it to dist/ verbatim, because publicDir files are not transformed.
 * Without this step every deploy reuses the cache name `tryeatpal-v1`, so the
 * activate handler finds nothing to delete and a returning visitor keeps being
 * served the previous build's JS and CSS out of a cache-first strategy.
 *
 * The id is a hash of the built asset filenames rather than a timestamp. Vite
 * already content-hashes those names, so the id changes exactly when the output
 * changes: a rebuild of identical sources produces an identical id and does not
 * throw away a warm cache for nothing, while any real change invalidates it.
 *
 * Fails loudly rather than silently skipping. A no-op here looks like a working
 * build and shows up only as users pinned to a stale bundle, which is precisely
 * the failure this exists to stop.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SW_BUILD_ID_PLACEHOLDER = '__SW_BUILD_ID__';

/**
 * Deterministic short id for a set of built asset filenames.
 * Sorted so directory-read order cannot change the answer.
 */
export function buildIdFromAssets(fileNames) {
  const basis = [...fileNames].sort().join('\n');
  return createHash('sha256').update(basis).digest('hex').slice(0, 12);
}

/**
 * Replace the placeholder. Throws when it is absent, which means either the
 * source lost its placeholder or this ran twice over the same file.
 */
export function stampServiceWorker(source, buildId) {
  if (!/^[a-f0-9]{6,64}$/.test(buildId)) {
    throw new Error(`stamp-sw: refusing to stamp a non-hex build id: ${buildId}`);
  }
  if (!source.includes(SW_BUILD_ID_PLACEHOLDER)) {
    throw new Error(
      `stamp-sw: ${SW_BUILD_ID_PLACEHOLDER} not found. public/sw.js must carry the placeholder, and this script must run exactly once per build.`
    );
  }
  return source.split(SW_BUILD_ID_PLACEHOLDER).join(buildId);
}

function main() {
  const root = process.cwd();
  const swPath = path.join(root, 'dist', 'sw.js');
  const assetsDir = path.join(root, 'dist', 'assets');

  if (!existsSync(swPath)) {
    throw new Error('stamp-sw: dist/sw.js not found. Run this after vite build.');
  }
  if (!existsSync(assetsDir)) {
    throw new Error('stamp-sw: dist/assets not found. Run this after vite build.');
  }

  const buildId = buildIdFromAssets(readdirSync(assetsDir));
  const stamped = stampServiceWorker(readFileSync(swPath, 'utf8'), buildId);
  writeFileSync(swPath, stamped);
  console.log(`stamp-sw: dist/sw.js cache name is now tryeatpal-${buildId}`);
}

// Only run when invoked directly, so the pure exports above stay importable
// from a test without stamping anything.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
