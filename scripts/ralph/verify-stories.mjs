#!/usr/bin/env node
/**
 * verify-stories.mjs — PRD story verification gate.
 *
 * Flips `passes: true` for a `passes: false` user story ONLY when BOTH hold:
 *   1. An implementation exists (a commit referencing the story id is in history), AND
 *   2. The CI gate that can actually verify that story has gone green.
 *
 * It never blind-flips: a story whose gate is red, skipped, or whose
 * implementation is missing stays `passes: false`. Ops/owner-gated stories
 * (prod deploys, device tests, owner-gated removals) are classified `manual`
 * and are never auto-flipped — they require a human to set the flag.
 *
 * Gate results come from the calling workflow via env vars, using GitHub's
 * job `result` vocabulary ('success' | 'failure' | 'cancelled' | 'skipped'):
 *   GATE_WEB, GATE_IOS, GATE_ANDROID
 *
 * Usage:
 *   node scripts/ralph/verify-stories.mjs            # dry-run, prints a report
 *   node scripts/ralph/verify-stories.mjs --apply    # writes prd.json + progress.txt
 *
 * The engine is intentionally git-driven (no hand-maintained per-story
 * assertion list): "implementation present" == a commit mentions the id. Run
 * the flip job with `fetch-depth: 0` so the full history is visible.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const PRD = path.join(ROOT, 'prd.json');
const PROGRESS = path.join(ROOT, 'progress.txt');
const APPLY = process.argv.includes('--apply');
const VERIFY_REF = process.env.VERIFY_REF || 'local';

// GitHub job-result vocabulary; default 'skip' when a gate didn't run.
const gate = (name) => (process.env[name] || 'skip').toLowerCase();
const GATES = {
  web: gate('GATE_WEB'),
  ios: gate('GATE_IOS'),
  android: gate('GATE_ANDROID'),
};
const isGreen = (r) => r === 'success' || r === 'pass';

// Stories that require a human / ops sign-off — never auto-flipped by CI.
//  US-323 prod migration deploy (needs prod DB creds)
//  US-313 Xcode build + on-device test after backend contracts land
//  US-314 owner-gated removal of the deprecated Expo/RN app
//  US-261 manual Xcode watchOS target setup completion
//
// The seven below were added after this script was caught one green iOS gate
// away from marking all of them done. Each is blocked on an action only a
// person can take, which is precisely this list's criterion:
//  US-556 rotate five leaked credentials in Supabase + Coolify, then purge
//  US-562 move the Apple signing material off the working tree
//  US-570 one build with real VITE_SUPABASE_* to check policy drift
//  US-609 the Swift work itself; needs Xcode, same category as US-313
//  US-634 needs the production read below, plus a release-sequenced flip
//  US-635 read the images bucket's policies out of the dashboard
//  US-643 confirm the Assets bucket's flag against production
//
// WHY THEY WERE AT RISK, because the mechanism is subtler than it looks:
// hasImplementation() greps commit subjects for a literal "(US-XXX)", and the
// comment there rightly warns that a bare id mention false-positives. But the
// repo's own Conventional Commits style makes EVERY tagged commit match --
// `docs(US-562): ...` and `test(US-609): ...` are indistinguishable from
// `fix(US-562): ...` to a --fixed-strings grep. So a commit that investigates a
// story and records that it is STILL BLOCKED reads as an implementation. For
// US-562 and US-609 the only matching commit in all of history was exactly that
// kind, and US-609 has no Swift written at all.
//
// No regex separates "I implemented this" from "I looked and it is still
// blocked", so the fix is this list rather than a cleverer grep. It only ever
// HOLDS a story false; it can never mark one passing.
const MANUAL = new Set([
  'US-323', 'US-313', 'US-314', 'US-261',
  'US-556', 'US-562', 'US-570', 'US-609', 'US-634', 'US-635', 'US-643',
]);
const ANDROID = new Set(['US-213', 'US-214', 'US-222']);
const WEB = new Set(['US-342', 'US-344']);

function classify(story) {
  if (MANUAL.has(story.id)) return 'manual';
  if (ANDROID.has(story.id)) return 'android';
  if (WEB.has(story.id)) return 'web';
  return 'ios'; // default: the native iOS surface
}

function hasImplementation(id) {
  try {
    // Require the project's dedicated-commit convention: a focused commit whose
    // subject tags the story as "(US-XXX)". A bare id mention is NOT enough — it
    // false-positives on range/docs/bulk commits (e.g. "add stories US-248..US-261"
    // or "flip 19 prd stories (US-413..US-434)") that reference a story without
    // implementing it. --fixed-strings makes the parens literal.
    const out = execSync(`git log --all --oneline --fixed-strings --grep='(${id})'`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function main() {
  const raw = fs.readFileSync(PRD, 'utf8');
  const prd = JSON.parse(raw);
  const stories = prd.userStories || [];

  const rows = [];
  const flippedIds = [];

  for (const s of stories) {
    if (s.passes) continue;
    const g = classify(s);
    const impl = g === 'manual' ? null : hasImplementation(s.id);
    let status;
    let flip = false;

    if (g === 'manual') {
      status = 'manual-signoff-required';
    } else if (!impl) {
      status = 'awaiting-implementation';
    } else if (!isGreen(GATES[g])) {
      status = `gate-${g}:${GATES[g]}`;
    } else {
      status = `verified:${g}-green`;
      flip = true;
    }

    if (flip) {
      s.passes = true;
      const stamp = `VERIFIED via prd-verify (${g} gate green @ ${VERIFY_REF})`;
      s.notes = s.notes ? `${s.notes} | ${stamp}` : stamp;
      flippedIds.push(s.id);
    }
    rows.push({ id: s.id, gate: g, impl: impl === null ? '-' : impl, gateResult: g === 'manual' ? 'n/a' : GATES[g], status, flip });
  }

  // ---- report ----
  const counts = rows.reduce((acc, r) => ((acc[r.status.split(':')[0]] = (acc[r.status.split(':')[0]] || 0) + 1), acc), {});
  const lines = [];
  lines.push(`prd-verify report (ref=${VERIFY_REF}, apply=${APPLY})`);
  lines.push(`gates: web=${GATES.web} ios=${GATES.ios} android=${GATES.android}`);
  lines.push(`remaining false stories evaluated: ${rows.length}`);
  lines.push(`flipped this run: ${flippedIds.length}${flippedIds.length ? ' -> ' + flippedIds.join(', ') : ''}`);
  lines.push(`status breakdown: ${JSON.stringify(counts)}`);
  lines.push('');
  for (const r of rows) {
    lines.push(`  ${r.id.padEnd(8)} gate=${String(r.gate).padEnd(8)} impl=${String(r.impl).padEnd(5)} gateResult=${String(r.gateResult).padEnd(8)} -> ${r.status}${r.flip ? '  [FLIPPED]' : ''}`);
  }
  const report = lines.join('\n');
  console.log(report);

  // machine-readable summary for the workflow
  const summary = { ref: VERIFY_REF, apply: APPLY, gates: GATES, flipped: flippedIds, counts, evaluated: rows.length };
  fs.writeFileSync(path.join(ROOT, 'prd-verify-report.json'), JSON.stringify(summary, null, 2));

  if (APPLY && flippedIds.length) {
    // Preserve prd.json's exact formatting for a minimal diff: 2-space indent
    // AND a trailing newline. The original of this line said "no trailing
    // newline" and wrote accordingly, which was simply wrong about the file --
    // prd.json ends 0a on main and has for its whole history, and every editor
    // and formatter that touches it puts one back. Writing without it made the
    // flip commit carry a stray no-op line for the next hand edit to flip back.
    //
    // Scope, since the first version of this comment overstated it: the write
    // is guarded by `flippedIds.length` above, so only a run that actually
    // flips a story writes the file at all. A run that flips nothing never
    // touched prd.json either way, which is why the workflow's
    // `git diff --quiet` guard reported clean before this fix as well.
    fs.writeFileSync(PRD, JSON.stringify(prd, null, 2) + '\n');
    const block = [
      '',
      `## prd-verify — CI verification pass (ref ${VERIFY_REF})`,
      `- Gates: web=${GATES.web}, ios=${GATES.ios}, android=${GATES.android}.`,
      `- Flipped passes=true (gate green + implementation present): ${flippedIds.join(', ')}.`,
      `- Held false: ${rows.filter((r) => !r.flip).length} (breakdown ${JSON.stringify(counts)}). Manual/ops stories never auto-flip; net-new stories await implementation; gate-red stories await a green CI run.`,
      '---',
    ].join('\n');
    fs.appendFileSync(PROGRESS, block + '\n');
  }

  // Exit non-zero only on an internal error; a "nothing flipped" run is success.
  process.exit(0);
}

main();
