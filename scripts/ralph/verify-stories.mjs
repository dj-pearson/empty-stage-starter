#!/usr/bin/env node
/**
 * verify-stories.mjs — PRD story verification gate.
 *
 * Sets `passes: true` on a story ONLY when the story names the CI checks that
 * prove it and every one of them ran and passed in this run. The rule itself
 * lives in verify-criteria.mjs, with the history of why it is that rule; the
 * short version is that the previous rule -- "a commit mentions the id" AND
 * "the platform job was green" -- marked stories done that nothing had
 * verified, including one whose own a11y scan was red in the same run and one
 * whose entire content was a Postgres migration flipped on a green iOS gate.
 *
 * A story with no `verifiedBy.checks` is never flipped. That means this engine
 * flips nothing until stories opt in, which is the intended state: a backlog
 * that says "unverified" is useful, one that says "done" because an unrelated
 * job was green is worse than no backlog. The report names what each story
 * needs, so opting in is incremental.
 *
 * Inputs:
 *   CHECKS_FILE  JSON from the GitHub jobs API for the current run
 *                (`{"jobs":[{name, conclusion, steps:[{name, conclusion}]}]}`).
 *                Absent or unreadable => no checks => nothing can be verified,
 *                which fails closed rather than flipping on missing evidence.
 *   PRD_FILE     which PRD to evaluate (default prd.json)
 *   VERIFY_REF   the commit the verification ran against, for the stamp
 *
 * Usage:
 *   node scripts/ralph/verify-stories.mjs            # dry-run, prints a report
 *   node scripts/ralph/verify-stories.mjs --apply    # writes prd.json + progress.txt
 *   PRD_FILE=prd-household-planner.json node scripts/ralph/verify-stories.mjs
 *
 * PRD_FILE selects which PRD to evaluate. Epic PRDs such as
 * prd-kitchen-loop.json and prd-household-planner.json live beside prd.json so
 * a loop can be pointed at one epic without touching the main backlog. The
 * report file is named after the PRD (prd-verify-report.json for prd.json,
 * prd-household-planner-verify-report.json for that epic).
 */
import fs from 'node:fs';
import path from 'node:path';

import { collectChecks, decide } from './verify-criteria.mjs';

const ROOT = process.cwd();
const PRD_FILE = process.env.PRD_FILE || 'prd.json';
const PRD = path.resolve(ROOT, PRD_FILE);
const PRD_NAME = path.basename(PRD, '.json');
const REPORT = path.join(
  ROOT,
  PRD_NAME === 'prd' ? 'prd-verify-report.json' : `${PRD_NAME}-verify-report.json`
);
const PROGRESS = path.join(ROOT, 'progress.txt');
const APPLY = process.argv.includes('--apply');
const VERIFY_REF = process.env.VERIFY_REF || 'local';
const CHECKS_FILE = process.env.CHECKS_FILE || 'prd-verify-checks.json';

/**
 * Read this run's job and step conclusions. A missing or malformed file yields
 * an empty map, so every story lands on `evidence-missing` rather than being
 * flipped on evidence nobody supplied.
 */
function loadChecks() {
  const file = path.resolve(ROOT, CHECKS_FILE);
  try {
    return collectChecks(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    console.warn(`prd-verify: no usable checks in ${CHECKS_FILE} (${err.message}); nothing can be verified this run.`);
    return new Map();
  }
}

function main() {
  const prd = JSON.parse(fs.readFileSync(PRD, 'utf8'));
  const stories = prd.userStories || [];
  const checks = loadChecks();

  const rows = [];
  const flippedIds = [];

  for (const s of stories) {
    if (s.passes) continue;
    const verdict = decide(s, { checks });

    if (verdict.flip) {
      s.passes = true;
      const stamp = `${verdict.stamp} @ ${VERIFY_REF}`;
      s.notes = s.notes ? `${s.notes} | ${stamp}` : stamp;
      flippedIds.push(s.id);
    }
    rows.push({
      id: s.id,
      status: verdict.status,
      detail: verdict.detail,
      declared: s.verifiedBy?.checks ?? [],
      flip: verdict.flip,
    });
  }

  // ---- report ----
  const counts = rows.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {});
  const lines = [];
  lines.push(`prd-verify report (prd=${PRD_FILE}, ref=${VERIFY_REF}, apply=${APPLY})`);
  lines.push(`checks visible this run: ${checks.size}`);
  lines.push(`remaining false stories evaluated: ${rows.length}`);
  lines.push(`flipped this run: ${flippedIds.length}${flippedIds.length ? ' -> ' + flippedIds.join(', ') : ''}`);
  lines.push(`status breakdown: ${JSON.stringify(counts)}`);
  lines.push('');
  for (const r of rows) {
    lines.push(`  ${r.id.padEnd(8)} ${r.status.padEnd(24)} ${r.detail}${r.flip ? '  [FLIPPED]' : ''}`);
  }
  const report = lines.join('\n');
  console.log(report);

  // machine-readable summary for the workflow
  const summary = {
    prd: PRD_FILE,
    ref: VERIFY_REF,
    apply: APPLY,
    checksVisible: checks.size,
    flipped: flippedIds,
    counts,
    evaluated: rows.length,
  };
  fs.writeFileSync(REPORT, JSON.stringify(summary, null, 2));

  if (APPLY && flippedIds.length) {
    // Preserve prd.json's exact formatting for a minimal diff: 2-space indent
    // AND a trailing newline. prd.json ends 0a on main and has for its whole
    // history, and every editor and formatter that touches it puts one back;
    // writing without it made the flip commit carry a stray no-op line for the
    // next hand edit to flip back.
    //
    // The write is guarded by `flippedIds.length`, so a run that flips nothing
    // never touches prd.json at all.
    fs.writeFileSync(PRD, JSON.stringify(prd, null, 2) + '\n');
    const block = [
      '',
      `## prd-verify — CI verification pass (${PRD_FILE}, ref ${VERIFY_REF})`,
      `- Checks visible this run: ${checks.size}.`,
      `- Flipped passes=true (every check the story named ran and passed): ${flippedIds.join(', ')}.`,
      `- Held false: ${rows.filter((r) => !r.flip).length} (breakdown ${JSON.stringify(counts)}). A story with no verifiedBy.checks is never flipped.`,
      '---',
    ].join('\n');
    fs.appendFileSync(PROGRESS, block + '\n');
  }

  // Exit non-zero only on an internal error; a "nothing flipped" run is success.
  process.exit(0);
}

main();
