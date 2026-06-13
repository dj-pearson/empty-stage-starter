#!/usr/bin/env node
/**
 * build-lock.mjs — serialize builds across multiple agents on one host (RULE 2).
 *
 * Only one build runs on the box at a time. Every agent runs its build through
 * this wrapper; whoever atomically creates the lock folder builds, the others
 * wait ~1.5s and retry. A lock older than 15 min is assumed dead and stolen.
 *
 * The lock is a FOLDER at os.tmpdir()/agent-build.lock. As long as every
 * agent's copy of this script targets that same path, builds serialize with no
 * clocks and no coordination. This implementation is protocol-compatible with
 * GradeThread's scripts/build-lock.mjs (same path, atomic mkdir, 1.5s retry,
 * 15-min steal). If you have their exact file, you may drop it in verbatim.
 *
 * Usage:  node scripts/build-lock.mjs <command> [args...]
 *   e.g.  node scripts/build-lock.mjs npm run typecheck
 *
 * The lock is ALWAYS released in a finally block, and the process exits with
 * the wrapped command's exit code (RULE 1: every step actually exits).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LOCK_PATH = path.join(os.tmpdir(), 'agent-build.lock');
const RETRY_MS = 1500;
const STALE_MS = 15 * 60 * 1000; // 15 min → assume dead, steal
const MARKER = path.join(LOCK_PATH, 'owner.txt');

const cmd = process.argv.slice(2);
if (cmd.length === 0) {
  console.error('build-lock: no command given. Usage: node scripts/build-lock.mjs <command> [args...]');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let held = false;

function tryAcquire() {
  try {
    fs.mkdirSync(LOCK_PATH); // atomic: throws EEXIST if another agent holds it
    try { fs.writeFileSync(MARKER, `${process.pid} ${process.cwd()}\n`); } catch { /* best-effort */ }
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    // Held by someone — steal only if stale.
    try {
      const ageMs = Date.now() - fs.statSync(LOCK_PATH).mtimeMs;
      if (ageMs > STALE_MS) {
        console.error(`build-lock: stealing stale lock (age ${Math.round(ageMs / 1000)}s > ${STALE_MS / 1000}s)`);
        fs.rmSync(LOCK_PATH, { recursive: true, force: true });
        // Next loop iteration re-attempts the mkdir.
      }
    } catch { /* lock vanished between stat and now — just retry */ }
    return false;
  }
}

function release() {
  if (!held) return;
  held = false;
  try { fs.rmSync(LOCK_PATH, { recursive: true, force: true }); } catch { /* already gone */ }
}

async function main() {
  let waited = 0;
  while (!tryAcquire()) {
    if (waited === 0 || waited % 30000 < RETRY_MS) {
      console.error(`build-lock: another build holds the host lock; waiting… (${Math.round(waited / 1000)}s)`);
    }
    await sleep(RETRY_MS);
    waited += RETRY_MS;
  }
  held = true;

  // Pass the command as ONE string to the shell so args aren't re-split and the
  // child's exit code propagates intact (needed on Windows where npm = npm.cmd).
  const code = await new Promise((resolve) => {
    const child = spawn(cmd.join(' '), { stdio: 'inherit', shell: true });
    child.on('exit', (c, sig) => resolve(sig ? 1 : (c ?? 1)));
    child.on('error', (err) => { console.error('build-lock: failed to launch:', err.message); resolve(127); });
  });
  return code;
}

// Release on every exit path (normal, error, signal) — never leak the lock.
const cleanup = () => release();
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => { release(); process.exit(130); });
}

main()
  .then((code) => { release(); process.exit(code); })
  .catch((err) => { console.error('build-lock:', err?.stack || err); release(); process.exit(1); });
