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
 * Buckets whose SELECT policy is deliberately open to the public role. It is
 * EMPTY, and the emptiness is the point: no bucket needs one.
 *
 * The reasoning that emptied it: reads of a public bucket are served by the
 * storage API without consulting RLS (20260817000000), so an open SELECT is
 * never what makes an image load. The only capability it adds is list() for
 * anyone holding the anon key. generated-images was the last holdout and was
 * scoped in 20260822000004; blog-images and Assets were written scoped.
 *
 * Adding a bucket back here means arguing that anonymous ENUMERATION of it is a
 * feature -- not anonymous reading, which needs nothing from this list.
 * profile-pictures is the counter-example and must never appear.
 */
const INTENTIONALLY_PUBLIC_BUCKETS: string[] = [];

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

/**
 * The net policy set on storage.objects after every migration has run, grouped
 * by bucket. A later DROP removes a policy, so what matters is the end state
 * rather than whether a shape ever existed in history.
 */
interface LivePolicy {
  name: string;
  cmd: string;
  owner: boolean;
  folder: boolean;
  to: string;
}

function livePolicies(): Map<string, LivePolicy[]> {
  const live = new Map<string, LivePolicy & { bucket: string }>();
  for (const file of migrationFiles()) {
    const sql = stripComments(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));
    const re = /(CREATE|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"([\s\S]*?);/gi;
    for (const m of sql.matchAll(re)) {
      const [, kind, name, body] = m;
      if (/DROP/i.test(kind)) {
        live.delete(name);
        continue;
      }
      if (!/ON\s+storage\.objects/i.test(body)) continue;
      live.set(name, {
        name,
        bucket: body.match(/bucket_id\s*=\s*'([^']+)'/)?.[1] ?? 'unknown',
        cmd: (body.match(/FOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)/i)?.[1] ?? 'ALL').toUpperCase(),
        owner: /owner\s*=\s*auth\.uid\(\)/i.test(body),
        folder: /foldername/i.test(body),
        to: body.match(/\bTO\s+(\w+)/i)?.[1] ?? 'public',
      });
    }
  }
  const byBucket = new Map<string, LivePolicy[]>();
  for (const p of live.values()) {
    const list = byBucket.get(p.bucket) ?? [];
    list.push(p);
    byBucket.set(p.bucket, list);
  }
  return byBucket;
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
  // OnboardingDialog.tsx was the second entry until US-770 replaced it with the
  // /onboarding route, which does not upload a photo at all.
  const UPLOAD_SITES = ['src/components/ManageKidsDialog.tsx'];

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

    // There used to be exactly one permitted offender, OnboardingDialog.tsx,
    // whose value was only ever the URL of a file uploaded in that same
    // session. US-770 replaced that dialog with the /onboarding route, which
    // uploads no photo, so the exception is GONE rather than moved -- the list
    // is empty and this assertion is now strictly tighter than it was. A new
    // bare AvatarImage anywhere fails here, with no allowed case to hide in.
    expect(offenders).toEqual([]);
  });
});

/**
 * US-635: the images bucket, which the live iOS app writes every kid, food and
 * recipe photo into. 20260822000002 declares it so a fresh environment has it
 * at all, and deliberately stops there.
 *
 * These pin the two halves of that decision: that the declaration exists, and
 * that it did NOT quietly grow a policy. A permissive policy added here could
 * only widen access to a bucket of photographs of children -- CREATE POLICY has
 * no ON CONFLICT and permissive RLS policies are OR'd, so it cannot tighten the
 * unrestricted SELECT that may already be there. Closing that one needs its
 * name, which needs the dashboard read US-635 is blocked on.
 */
describe('US-635: the images bucket', () => {
  const declaring = '20260822000002_declare_images_bucket.sql';

  it('is created by a migration, so a fresh environment has it', () => {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, declaring), 'utf-8');
    expect(sql).toMatch(/INSERT\s+INTO\s+storage\.buckets/i);
    expect(sql).toMatch(/'images'/);
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*id\s*\)\s*DO\s+NOTHING/i);
  });

  it('is declared without any policy, so nothing here can widen it', () => {
    const sql = stripComments(readFileSync(path.join(MIGRATIONS_DIR, declaring), 'utf-8'));
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
  });

  it('is not on the intentionally-public list', () => {
    // profile-pictures' counterpart. Whatever the bucket's flag has to be for
    // shipped phones, an open SELECT on it is never deliberate.
    expect(INTENTIONALLY_PUBLIC_BUCKETS).not.toContain('images');
  });
});

/**
 * US-635 AC: confirm no shipped iOS build lists this bucket before its SELECT
 * is tightened. A tightened SELECT breaks list() but not a public-URL read, so
 * a lister in the field would be the one thing that turns the fix into an
 * outage. Checked as source text because there is no Swift toolchain in CI.
 */
describe('US-635: no shipped iOS build lists a storage bucket', () => {
  const IOS_DIR = path.resolve(__dirname, '../../ios');

  const swiftFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...swiftFiles(full));
      else if (entry.name.endsWith('.swift')) out.push(full);
    }
    return out;
  };

  it('ImageUploadService is the only Swift file that calls Supabase Storage', () => {
    const callers = swiftFiles(IOS_DIR).filter((f) =>
      /\bclient\s*\.\s*storage\b|\bstorage\s*\n?\s*\.from\(/.test(readFileSync(f, 'utf8'))
    );
    expect(callers.map((f) => path.basename(f))).toEqual(['ImageUploadService.swift']);
  });

  it('and it never lists -- only upload, getPublicURL and remove', () => {
    const src = readFileSync(
      path.join(IOS_DIR, 'EatPal/EatPal/Services/ImageUploadService.swift'),
      'utf8'
    );
    expect(src).not.toMatch(/\.list\s*\(/);
    expect(src).toMatch(/\.upload\(/);
    expect(src).toMatch(/getPublicURL/);
    expect(src).toMatch(/\.remove\(/);
  });
});

/**
 * US-634 / US-628: the read and write policies on profile-pictures must agree
 * about what "yours" means.
 *
 * 20251008025307 wrote all four against the path. 20260817000000 scoped SELECT
 * and added `OR owner = auth.uid()`, because the path is only a proxy for
 * ownership and misses objects uploaded before the convention settled. DELETE
 * and UPDATE kept the path-only test, so the owning parent could read a legacy
 * photo of their child and not delete it -- and storage.remove() reports an
 * RLS-denied removal as success with an empty list, so nothing said so.
 *
 * Measured on PostgreSQL 16.13: before 20260822000003 the owner read 2 objects
 * and deleted 1; after it, 2 and 2.
 */
describe('US-634: profile-pictures write policies match the read policy', () => {
  const parity = '20260822000003_profile_picture_write_owner_parity.sql';
  const ownerBranch = /OR\s+owner\s*=\s*auth\.uid\(\)/i;

  const statementFor = (sql: string, cmd: string) => {
    const start = sql.indexOf(`FOR ${cmd}`);
    return start === -1 ? '' : sql.slice(start, sql.indexOf(';', start));
  };

  it('replaces DELETE and UPDATE by name, which only a migration-declared policy allows', () => {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, parity), 'utf-8');
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Users can delete their own profile pictures"/i);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Users can update their own profile pictures"/i);
  });

  it.each(['DELETE', 'UPDATE'])('gives %s the same owner branch SELECT has', (cmd) => {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, parity), 'utf-8');
    expect(statementFor(sql, cmd)).toMatch(ownerBranch);
  });

  /**
   * The sweep, which is what actually guards the class. The two checks above
   * pin one migration's text; this one computes the LIVE policy set across
   * every migration and asks the general question, so the next bucket to grow
   * an owner-scoped read without matching writes fails here rather than in
   * production. Enumerating by hand is what let this through the first time.
   *
   * INSERT is excluded deliberately: a new object has no owner yet, so the
   * folder check is the only test available and is the one that makes the path
   * convention true.
   */
  it('no bucket has an owner-scoped read with a path-only write', () => {
    const offenders: string[] = [];
    for (const [bucket, policies] of livePolicies()) {
      const scoped = policies.filter((p) => p.folder || p.owner);
      if (!scoped.some((p) => p.cmd === 'SELECT' && p.owner)) continue;
      for (const p of scoped) {
        if (p.cmd === 'INSERT' || p.cmd === 'SELECT') continue;
        if (!p.owner) offenders.push(`${bucket} ${p.cmd}: "${p.name}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('leaves INSERT alone: a new object has no owner yet', () => {
    const sql = stripComments(readFileSync(path.join(MIGRATIONS_DIR, parity), 'utf-8'));
    expect(sql).not.toMatch(/FOR\s+INSERT/i);
  });
});
