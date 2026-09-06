import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * US-787. Every one of these was a document that read as authoritative and
 * said something the code contradicted. The pattern is always the same: a
 * number or a claim copied into prose, where it goes stale silently the first
 * time the thing it describes moves.
 *
 * These assertions are cheap and they fail on the copy, not on the source of
 * truth, which is the direction that catches the next one.
 */
describe('US-787: the operations docs still match the code', () => {
  it('no doc or workflow hardcodes a typecheck baseline', () => {
    // docs/typecheck-backlog.md said 1257 across three later baselines, and
    // two ci.yml comments repeated it. The number lives in one file now.
    const baseline = fs.readFileSync('.ci/typecheck-baseline.txt', 'utf8').trim();
    const sources = [
      'docs/typecheck-backlog.md',
      'docs/deployment-checklist.md',
      '.github/workflows/ci.yml',
    ];
    const offenders: string[] = [];
    for (const file of sources) {
      const text = fs.readFileSync(file, 'utf8');
      text.split(/\r?\n/).forEach((line, i) => {
        // A four-digit number near the words backlog/baseline/errors is a
        // copied count. The baseline's own current value is no better: it is
        // right today and wrong at the next ratchet.
        if (!/\b\d{4}\b/.test(line)) return;
        if (!/backlog|baseline|error/i.test(line)) return;
        // Dates and the introduction figure carry their own context.
        if (/20\d{2}-\d{2}-\d{2}|introduced|measured at introduction/.test(line)) return;
        offenders.push(`${file}:${i + 1} ${line.trim()}`);
      });
    }
    expect(offenders, `read the count from .ci/typecheck-baseline.txt (now ${baseline})`).toEqual(
      [],
    );
  });

  it('the runbook does not claim session replay is unconditional', () => {
    const runbook = fs.readFileSync('docs/runbook.md', 'utf8');
    const sentry = fs.readFileSync('src/lib/sentry.tsx', 'utf8');
    // The code gates it; the runbook told an on-call engineer to expect a
    // replay on every P0, which sends them looking for a Sentry fault.
    expect(sentry).toContain('hasAnalyticsConsent()');
    expect(runbook).toMatch(/gated on analytics consent/i);
    expect(runbook).not.toMatch(/^- Session replay enabled in production/m);
  });

  it('the deployment checklist asks for the ratchets, not for zero errors', () => {
    const checklist = fs.readFileSync('docs/deployment-checklist.md', 'utf8');
    // "zero TypeScript errors" made the checklist unpassable rather than
    // strict: there is a standing backlog and the gate is a ratchet.
    expect(checklist).not.toContain('zero TypeScript errors');
    expect(checklist).toContain('scripts/ci/typecheck-ratchet.sh');
    expect(checklist).toContain('scripts/ci/lint-ratchet.sh');
  });

  it('the deployment checklist points at the edge-function doc instead of listing them', () => {
    const checklist = fs.readFileSync('docs/deployment-checklist.md', 'utf8');
    expect(checklist).toContain('EDGE_FUNCTIONS.md');
    // The old line named twelve of about a hundred and read as complete.
    expect(checklist).not.toContain('calculate-food-similarity, suggest-foods');
  });

  it('ios/README does not say Sentry is unwired, because it is wired', () => {
    const readme = fs.readFileSync('ios/README.md', 'utf8');
    const app = fs.readFileSync('ios/EatPal/EatPal/App/EatPalApp.swift', 'utf8');
    expect(app).toContain('SentryService.configure()');
    expect(readme).not.toMatch(/iOS uses console logging/);
    // And it should say the one thing that makes a silent build look broken.
    expect(readme).toMatch(/off in DEBUG/i);
  });

  it('the readiness checklist names a file for each row it marks Done', () => {
    const csv = fs.readFileSync('ENTERPRISE_READINESS_CHECKLIST.csv', 'utf8');
    const rows = csv
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.split(','))
      .filter((cols) => cols.length >= 5);

    const claimed = [
      'GitHub Actions test workflow',
      'GitHub Actions lint workflow',
      'GitHub Actions build workflow',
      'Security scanning in CI',
      'Disaster recovery plan document',
      'Backup restoration testing',
      'Accessibility testing (axe-core)',
    ];

    for (const item of claimed) {
      const row = rows.find((cols) => cols[2] === item);
      expect(row, `${item} is still in the checklist`).toBeTruthy();
      expect(row![3], `${item} status`).toBe('Done');
      // A "Done" with no artefact named is the claim this story exists to stop.
      const evidence = row![4];
      expect(evidence, `${item} names its evidence`).toMatch(/\.(yml|md|ts|txt|json)/);
    }
  });

  it('every file the readiness checklist points at exists', () => {
    const csv = fs.readFileSync('ENTERPRISE_READINESS_CHECKLIST.csv', 'utf8');
    const referenced = [...csv.matchAll(/([\w./-]+\.(?:yml|md|ts|json|txt))/g)].map((m) => m[1]);
    const missing = [...new Set(referenced)].filter((p) => !fs.existsSync(p));
    expect(missing).toEqual([]);
  });
});
