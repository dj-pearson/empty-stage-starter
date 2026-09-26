import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The privacy policy has to describe care report links the way the code
 * builds them. Each claim below is pinned to the source that makes it true,
 * so changing one without the other fails here.
 */
const root = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

// Whitespace collapsed: JSX wraps prose wherever the line runs out.
const policy = read('src/pages/PrivacyPolicy.tsx').replace(/\s+/g, ' ');
const migration = read('supabase/migrations/20260930000001_care_report_shares.sql');
const shares = read('src/lib/careReportShares.ts');
const report = read('src/lib/careReport.ts');

describe('privacy policy: reports and links you share', () => {
  it('has the section and points to it from the disclosure list', () => {
    expect(policy).toContain('5a. Reports and Links You Share');
    expect(policy).toContain('care report or recipe link you create (see Section 5a)');
  });

  it('states the 90-day cap the database enforces, and the expiry choices the app offers', () => {
    expect(migration).toContain("expires_at <= created_at + interval '90 days'");
    expect(shares).toContain('CARE_SHARE_EXPIRY_DAYS = [7, 30, 90]');
    expect(policy).toContain('7, 30 or 90 days, and no link lasts longer than 90 days');
  });

  it('says what the stored copy holds, matching the report type', () => {
    // One identifier, a first name; notes only by opt-in.
    expect(report).toMatch(/kidFirstName: z\.string\(\)/);
    expect(report).toMatch(/includesNotes: z\.boolean\(\)/);
    expect(report).not.toMatch(/dateOfBirth|date_of_birth|allergen/i);
    expect(policy).toContain("your child's first name");
    expect(policy).toContain('your notes only if you choose to include them');
  });

  it('says what is recorded, matching the columns', () => {
    for (const column of ['consent_version', 'view_count', 'last_viewed_at', 'created_by']) {
      expect(migration).toContain(column);
    }
    expect(policy).toContain('how many times it was opened');
  });

  it('keeps the PDF on the device', () => {
    expect(read('src/lib/careReportPdf.ts')).toMatch(/never uploaded/);
    expect(policy).toContain('We do not receive a copy');
  });
});
