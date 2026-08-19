import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

/**
 * US-627 regression guard.
 *
 * The profile-pictures bucket holds photographs of children. It was created
 * with `public = true` AND a SELECT policy on storage.objects that carried no
 * TO clause, so the policy applied to the `public` role - which includes
 * `anon`. An unauthenticated client holding only the anon key could list the
 * whole bucket and then fetch every object.
 *
 * These tests run without a database. They cannot prove the live policy set is
 * correct, so they assert the two things that are checkable from the repo and
 * that a future change would silently undo:
 *
 *   1. No migration grants an unrestricted SELECT on storage.objects.
 *   2. Object paths for uploaded photos are unguessable, not timestamps.
 *
 * A live-database assertion (anon list returns nothing, authenticated list
 * returns only the caller's folder) still needs an integration harness; see
 * the story notes.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

/**
 * Buckets that are world-readable on purpose. generated-images holds blog and
 * social artwork that is served as og:image, so anonymous read is the feature.
 * Adding a bucket here is a deliberate decision that it contains no personal
 * data; profile-pictures is the counter-example and must never appear.
 */
const INTENTIONALLY_PUBLIC_BUCKETS = ['generated-images'];

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/** Drops `--` line comments so quoted example SQL in a comment isn't parsed. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function statements(sql: string): string[] {
  return stripComments(sql).split(';');
}

describe('storage.objects SELECT policies', () => {
  it('never leaves an unrestricted SELECT on storage.objects in force', () => {
    // Policy name -> where it was created. A later DROP removes it again, so
    // what matters is the net state after every migration has run, not whether
    // an open policy ever existed in history.
    const live = new Map<string, string>();

    for (const file of migrationFiles()) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');

      for (const statement of statements(sql)) {
        const name = statement.match(/(?:CREATE|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/i)?.[1];
        if (!name) continue;

        if (/DROP\s+POLICY/i.test(statement)) {
          live.delete(name);
          continue;
        }
        if (!/ON\s+storage\.objects/i.test(statement)) continue;
        if (!/FOR\s+SELECT/i.test(statement)) continue;

        // No TO clause means the policy applies to `public`, which includes
        // anon. Naming public or anon explicitly is the same hole, spelled out.
        const restricted = /\bTO\s+authenticated\b/i.test(statement);
        const grantsAnon = /\bTO\s+(public|anon)\b/i.test(statement);
        const bucket = statement.match(/bucket_id\s*=\s*'([^']+)'/i)?.[1];
        const intentional = bucket !== undefined && INTENTIONALLY_PUBLIC_BUCKETS.includes(bucket);

        if ((!restricted || grantsAnon) && !intentional) {
          live.set(name, `${file}: "${name}" (bucket ${bucket ?? 'unknown'})`);
        }
      }
    }

    expect([...live.values()]).toEqual([]);
  });

  it('scopes profile-pictures reads to the owner', () => {
    const migration = readFileSync(
      path.join(MIGRATIONS_DIR, '20260817000000_scope_profile_picture_reads.sql'),
      'utf-8'
    );

    // The original open policy is dropped.
    expect(migration).toMatch(
      /DROP\s+POLICY\s+IF\s+EXISTS\s+"Users can view all profile pictures"/i
    );
    // The replacement matches the caller against the object's own folder.
    expect(migration).toMatch(/storage\.foldername\(name\)\)\[1\]\s*=\s*auth\.uid\(\)::text/i);
  });
});

describe('profile photo object paths', () => {
  const UPLOAD_SITES = [
    'src/components/ManageKidsDialog.tsx',
    'src/components/OnboardingDialog.tsx',
  ];

  it.each(UPLOAD_SITES)('%s builds an unguessable object name', (site) => {
    const source = readFileSync(path.resolve(__dirname, '../..', site), 'utf-8');
    const uploadPath = source.match(/const fileName = `([^`]+)`/)?.[1];

    expect(uploadPath).toBeDefined();
    // The bucket stays public-read by URL until US-634, so a guessable path is
    // as good as no access control at all.
    expect(uploadPath).not.toContain('Date.now()');
    expect(uploadPath).toContain('generateId()');
  });

  /**
   * US-635: iOS uploads kid photos to a DIFFERENT bucket ('images', declared
   * only in the Supabase dashboard, not in any migration here), and it had the
   * same guessable-path problem the web fix cured: kids/{kidId}-{unixSeconds}.
   * Given a kid id that is ~86400 guesses for a given day, against a bucket
   * that is public-read by URL for shipped builds.
   *
   * Checked as source text because there is no Swift toolchain in CI.
   */
  it('the iOS uploader builds an unguessable object name too', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../../ios/EatPal/EatPal/Services/ImageUploadService.swift'),
      'utf-8',
    );
    const uploadPath = source.match(/let path = "([^"]+)"/)?.[1];

    expect(uploadPath).toBeDefined();
    expect(uploadPath).toContain('UUID().uuidString');
    expect(uploadPath).not.toContain('timeIntervalSince1970');
  });
});
