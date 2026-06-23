#!/usr/bin/env node
/**
 * lighthouse-summary.mjs — turn an lhci run into an actionable SEO report.
 *
 * Reads .lighthouseci/ (manifest.json + lhr-*.json + links.json) and writes a
 * Markdown report to stdout: per-page category scores, public report links, and
 * — most usefully — the list of FAILED SEO audits per page so you know exactly
 * what to fix. The workflow appends this to $GITHUB_STEP_SUMMARY.
 *
 * Never throws on missing data; prints a clear note instead so the step stays green.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = '.lighthouseci';
const out = [];
const p = (s = '') => out.push(s);

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function pct(score) {
  if (score == null) return 'n/a';
  return `${Math.round(score * 100)}`;
}

function emoji(score) {
  if (score == null) return '⚪';
  if (score >= 0.9) return '🟢';
  if (score >= 0.5) return '🟠';
  return '🔴';
}

function shortUrl(u) {
  try { return new URL(u).pathname || '/'; } catch { return u; }
}

p('## 🔦 Lighthouse SEO Audit');
p('');

if (!fs.existsSync(DIR)) {
  p('> ⚠️ No `.lighthouseci/` output found — the Lighthouse collect step may have failed. Check the job logs.');
  process.stdout.write(out.join('\n') + '\n');
  process.exit(0);
}

const manifest = readJson(path.join(DIR, 'manifest.json')) || [];
const links = readJson(path.join(DIR, 'links.json')) || {};

// Prefer the representative run per URL.
const reps = manifest.filter((m) => m.isRepresentativeRun) ;
const rows = reps.length ? reps : manifest;

if (!rows.length) {
  p('> ⚠️ Lighthouse produced no results.');
  process.stdout.write(out.join('\n') + '\n');
  process.exit(0);
}

// 1) Score matrix.
p('| Page | SEO | Perf | A11y | Best-Practices | Report |');
p('| --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  const s = r.summary || {};
  const link = links[r.url] ? `[view](${links[r.url]})` : '—';
  p(
    `| \`${shortUrl(r.url)}\` ` +
    `| ${emoji(s.seo)} ${pct(s.seo)} ` +
    `| ${emoji(s.performance)} ${pct(s.performance)} ` +
    `| ${emoji(s.accessibility)} ${pct(s.accessibility)} ` +
    `| ${emoji(s['best-practices'])} ${pct(s['best-practices'])} ` +
    `| ${link} |`
  );
}
p('');
p('_Scores are 0-100. 🟢 ≥90 · 🟠 50-89 · 🔴 <50. Report links are temporary public storage (expire ~7 days)._');
p('');

// 2) Actionable: failed SEO (and best-practices) audits per page.
p('### What to fix (failing SEO audits)');
p('');
let anyFindings = false;
for (const r of rows) {
  const lhr = r.jsonPath ? readJson(r.jsonPath) : null;
  if (!lhr || !lhr.categories || !lhr.categories.seo) continue;
  const auditRefs = lhr.categories.seo.auditRefs || [];
  const failing = auditRefs
    .map((ref) => lhr.audits[ref.id])
    .filter((a) => a && a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable');
  if (!failing.length) continue;
  anyFindings = true;
  p(`<details><summary><strong>${shortUrl(r.url)}</strong> — ${failing.length} SEO issue(s)</summary>`);
  p('');
  for (const a of failing) {
    p(`- **${a.title}** — ${(a.description || '').replace(/\s*\[.*?\]\(.*?\)/g, '').trim()}`);
  }
  p('');
  p('</details>');
}
if (!anyFindings) p('🎉 No failing SEO audits on the audited pages.');
p('');
p('_Note: this audits the client-rendered SPA on a preview server (`canonical` and `uses-http2` are skipped — verify those against the live site). Re-run anytime via the workflow\'s **Run workflow** button._');

process.stdout.write(out.join('\n') + '\n');
