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
 * blog-images (US-643) is the same: the edge functions store a getPublicUrl
 * result on the post, so the hero image of a public blog post has to be
 * readable by an anonymous browser.
 * Adding a bucket here is a deliberate decision that it contains no personal
 * data; profile-pictures is the counter-example and must never appear.
 */
const INTENTIONALLY_PUBLIC_BUCKETS = ['generated-images', 'blog-images'];

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
        const name = statement.match(
          /(?:CREATE|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/i
        )?.[1];
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
      'utf-8'
    );
    const uploadPath = source.match(/let path = "([^"]+)"/)?.[1];

    expect(uploadPath).toBeDefined();
    expect(uploadPath).toContain('UUID().uuidString');
    expect(uploadPath).not.toContain('timeIntervalSince1970');
  });
});

/**
 * US-634 regression guard: every component that renders a STORED kid photo
 * goes through KidAvatarImage, which signs it.
 *
 * The distinction that matters is stored versus just-picked. A blob: preview of
 * a file the user selected a moment ago needs no signing, and KidAvatarImage
 * passes one through untouched. A value read out of kids.profile_picture_url
 * does need it, and today the difference is invisible -- the bucket is public,
 * so a plain <AvatarImage> renders fine either way. It stops being invisible at
 * Release N+1, when the public URL starts returning 403 and the only symptom is
 * a missing avatar on one screen.
 *
 * ManageKidsDialog was excluded from the original wiring on the grounds that it
 * only ever renders a blob: preview. That was wrong: opening the dialog to EDIT
 * a kid seeds formData from kid.profile_picture_url, a stored object. Hence
 * this check rather than a note.
 */
describe('US-634: stored kid photos render through KidAvatarImage', () => {
  const componentsDir = path.join(process.cwd(), 'src', 'components');

  const read = (rel: string) => readFileSync(path.join(componentsDir, rel), 'utf8');

  it('ManageKidsDialog does not render a stored photo through a bare AvatarImage', () => {
    const src = read('ManageKidsDialog.tsx');
    expect(src).toContain('KidAvatarImage');
    // formData.profile_picture_url is seeded from the kid record on edit.
    expect(src).not.toMatch(/<AvatarImage\s+src=\{formData\.profile_picture_url\}/);
  });

  /**
   * The per-file checks below were how this started, and they missed a site:
   * ApplyTemplateDialog renders kid photos as a plain 24px <img> rather than
   * through an Avatar, so it was invisible to a search for AvatarImage and to
   * the enumeration recorded in the story. This sweeps every component instead,
   * so the next render site added in a shape nobody anticipated is caught by
   * the same rule.
   */
  it('no component renders a kid photo URL through a bare img or AvatarImage', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // shadcn primitives are off-limits per CLAUDE.md and take a src prop
          // generically; they are never a kid-photo call site themselves.
          if (entry.name !== 'ui') walk(full);
          continue;
        }
        if (!entry.name.endsWith('.tsx')) continue;
        if (entry.name === 'KidAvatarImage.tsx' || entry.name === 'KidPhoto.tsx') continue;

        const src = readFileSync(full, 'utf8');
        // <img ...> or <AvatarImage ...> whose src is some *.profile_picture_url
        const bare = /<(?:img|AvatarImage)\b[^>]*\bsrc=\{[^}]*profile_picture_url[^}]*\}/s.exec(
          src
        );
        if (bare) offenders.push(path.relative(componentsDir, full));
      }
    };
    walk(componentsDir);

    // OnboardingDialog is the one legitimate case: its value is only ever the
    // URL of a file uploaded in that session, never a stored object.
    expect(offenders).toEqual(['OnboardingDialog.tsx']);
  });

  it('OnboardingDialog may keep a bare AvatarImage, because its value is only ever a fresh upload', () => {
    const src = read('OnboardingDialog.tsx');
    // childData.profile_picture_url starts as "" and is only ever assigned the
    // URL of a file uploaded in this session, so there is nothing to sign. If
    // that ever changes -- if the dialog starts loading an existing kid -- this
    // assertion is the thing that should be revisited, not silently deleted.
    expect(src).not.toMatch(/profile_picture_url:\s*kid\./);
  });
});
