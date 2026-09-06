import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * US-762: there is one web deploy path, and CI is not it.
 *
 * Cloudflare Pages builds this repo from its own Git integration. The two
 * deploy jobs that used to live in ci.yml were skipped on every run for a
 * missing CLOUDFLARE_API_TOKEN and reported success anyway, so the run list
 * could not tell you whether main had reached tryeatpal.com. A second path that
 * silently does nothing is worse than no second path, and it is exactly the
 * kind of thing that gets re-added by someone reading "deploy" in a workflow
 * and assuming it works.
 */
const CI = '.github/workflows/ci.yml';

describe('US-762: CI builds and tests, it does not deploy', () => {
  const ci = fs.readFileSync(CI, 'utf8');

  it('has no deploy job', () => {
    expect(ci).not.toMatch(/^\s{2}deploy-production:/m);
    expect(ci).not.toMatch(/^\s{2}deploy-staging:/m);
  });

  it('holds no Cloudflare deploy credential or action', () => {
    // If either of these comes back, so has the second path.
    expect(ci).not.toContain('CLOUDFLARE_API_TOKEN');
    expect(ci).not.toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(ci).not.toMatch(/cloudflare\/(wrangler|pages)-action/);
    expect(ci).not.toMatch(/wrangler\s+pages\s+deploy/);
  });

  it('no other workflow deploys the web app either', () => {
    const dir = '.github/workflows';
    const offenders = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .filter((f) => {
        const text = fs.readFileSync(`${dir}/${f}`, 'utf8');
        return /cloudflare\/(wrangler|pages)-action|wrangler\s+pages\s+deploy/.test(text);
      });
    expect(offenders).toEqual([]);
  });
});

describe('US-762: wrangler.toml stays empty on purpose', () => {
  const toml = fs.readFileSync('wrangler.toml', 'utf8');

  it('exists, because an absent file is not the same promise as an empty one', () => {
    expect(toml.length).toBeGreaterThan(0);
  });

  it('declares nothing', () => {
    // Every non-comment, non-blank line would be configuration. Pages falls back
    // to the dashboard only while it finds none; uncommenting one key in August
    // 2026 switched it into full validation and broke the deploy (36ec2f3b).
    const declarations = toml
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    expect(declarations).toEqual([]);
  });

  it('says why, so the next person does not find out the hard way', () => {
    expect(toml).toMatch(/DO NOT UNCOMMENT/);
    expect(toml).toContain('36ec2f3b');
  });
});

describe('US-762: the decision is written down where it is looked for', () => {
  it('is in the deployment checklist and in the CLAUDE.md branching section', () => {
    expect(fs.readFileSync('docs/deployment-checklist.md', 'utf8')).toContain('US-762');
    const claude = fs.readFileSync('CLAUDE.md', 'utf8');
    expect(claude).toContain('US-762');
    expect(claude).toMatch(/Nothing in GitHub Actions deploys the web app/);
  });
});
