import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

/**
 * US-643: the storage-bucket gate, exercised against call-site shapes rather
 * than trusted.
 *
 * The gate matched `storage.from('literal')` only. functions/agent-blog-writer
 * and functions/update-blog-image both hoist the name into a module constant
 * and call `.from(STORAGE_BUCKET)`, so blog-images -- a bucket that no
 * migration created -- was reported as "declared in the registry only ...
 * nothing calls them". The gate whose whole job is catching an undeclared
 * bucket had the undeclared bucket in front of it and filed it as harmless.
 *
 * Of those two call sites only agent-blog-writer is live; see
 * functionTreeBuckets.test.ts. The gate is right to count both, because a
 * literal-blind scan is a bug either way -- but the bucket is declared on the
 * strength of one writer, not two.
 *
 * These run the real script in a throwaway git repo, because it reads
 * `git ls-files`. Testing the regex in isolation would not have caught this:
 * the regex was correct, its coverage was not.
 */

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'bucket-scan-'));
  execFileSync('git', ['init', '-q', '.'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repo });
  mkdirSync(path.join(repo, 'scripts', 'ci'), { recursive: true });
  mkdirSync(path.join(repo, 'supabase', 'migrations'), { recursive: true });
  mkdirSync(path.join(repo, 'functions', 'probe'), { recursive: true });
  copyFileSync(
    path.join(process.cwd(), 'scripts', 'ci', 'check-storage-buckets.mjs'),
    path.join(repo, 'scripts', 'ci', 'check-storage-buckets.mjs')
  );
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

/** Runs the gate over a repo containing `source` as an edge function. */
const run = (source: string, migration?: string): { ok: boolean; out: string } => {
  writeFileSync(path.join(repo, 'functions', 'probe', 'index.ts'), source);
  if (migration) {
    writeFileSync(path.join(repo, 'supabase', 'migrations', '20260101000000_probe.sql'), migration);
  }
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'probe'], { cwd: repo });
  try {
    const out = execFileSync('node', ['scripts/ci/check-storage-buckets.mjs'], {
      cwd: repo,
      encoding: 'utf8',
    });
    return { ok: true, out };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

const DECLARES_PROBE =
  "INSERT INTO storage.buckets (id, name, public) VALUES ('probe-bucket', 'probe-bucket', true) ON CONFLICT (id) DO NOTHING;";

describe('check-storage-buckets.mjs call-site detection', () => {
  it('fails on an undeclared bucket named inline', () => {
    const { ok, out } = run("await db.storage.from('probe-bucket').upload('a', b);");
    expect(ok).toBe(false);
    expect(out).toContain('probe-bucket');
  });

  it('fails on an undeclared bucket reached through a module constant', () => {
    // The exact shape both blog-image edge functions use, and the one the gate
    // used to miss entirely.
    const { ok, out } = run(
      [
        "const STORAGE_BUCKET = 'probe-bucket';",
        "await db.storage.from(STORAGE_BUCKET).upload('a', b);",
      ].join('\n')
    );
    expect(ok).toBe(false);
    expect(out).toContain('probe-bucket');
  });

  it('resolves a typed constant too', () => {
    const { ok } = run(
      ["const BUCKET: string = 'probe-bucket';", 'await db.storage.from(BUCKET).remove([p]);'].join(
        '\n'
      )
    );
    expect(ok).toBe(false);
  });

  it('passes once a migration declares the bucket', () => {
    const { ok } = run(
      [
        "const STORAGE_BUCKET = 'probe-bucket';",
        'await db.storage.from(STORAGE_BUCKET).upload(a, b);',
      ].join('\n'),
      DECLARES_PROBE
    );
    expect(ok).toBe(true);
  });

  it('does not invent a bucket from an identifier it cannot resolve', () => {
    // A runtime parameter is not a bucket name. Reporting one would be noise,
    // and noise is how a real finding gets scrolled past.
    const { ok } = run(
      'export const up = (bucketName) => db.storage.from(bucketName).upload(a, b);'
    );
    expect(ok).toBe(true);
  });
});

describe('test fixtures are not call sites', () => {
  /**
   * This file names buckets that deliberately do not exist. The commit that
   * introduced it left the gate red for exactly that reason -- the gate was run
   * before the new file was staged, so `git ls-files` could not see it, and the
   * green result was measured against a tree that did not include the fixtures.
   */
  it('ignores a bucket named only inside a .test.ts file', () => {
    mkdirSync(path.join(repo, 'src', 'lib'), { recursive: true });
    writeFileSync(
      path.join(repo, 'src', 'lib', 'probe.test.ts'),
      "await db.storage.from('fixture-only-bucket').upload('a', b);\n"
    );
    const { ok } = run('export const nothing = 1;');
    expect(ok).toBe(true);
  });
});

describe('storage_buckets_config reconciliation (US-643)', () => {
  /**
   * The seed scan used to look in one migration BY FILENAME. That made its
   * "advertises a bucket no migration creates" note correct by coincidence:
   * three migrations mention storage_buckets_config, and a seed landing in any
   * other one would have been invisible while the gate reported a clean
   * inventory. These write the seed to a filename the gate has never heard of.
   */
  const seedNamed = (bucket: string) =>
    `INSERT INTO public.storage_buckets_config (bucket_name, display_name) VALUES\n` +
    `  ('${bucket}', 'Probe') ON CONFLICT (bucket_name) DO NOTHING;`;

  /** Writes extra migrations alongside the usual probe run. */
  const withMigrations = (files: Record<string, string>) => {
    for (const [name, sql] of Object.entries(files)) {
      writeFileSync(path.join(repo, 'supabase', 'migrations', name), sql);
    }
    return run('export const nothing = 1;');
  };

  it('finds a seed in a migration it does not know the name of', () => {
    const { ok, out } = withMigrations({
      '20990101000000_some_other_file.sql': seedNamed('ghost-bucket'),
    });
    // Advisory, so the gate still passes -- but it has to SAY it.
    expect(ok).toBe(true);
    expect(out).toContain('ghost-bucket');
    expect(out).toContain('advertises');
  });

  it('stops reporting a seeded bucket once a migration creates it', () => {
    const { ok, out } = withMigrations({
      '20990101000000_seed.sql': seedNamed('probe-bucket'),
      '20990101000001_create.sql': DECLARES_PROBE,
    });
    expect(ok).toBe(true);
    expect(out).not.toContain('advertises');
  });

  it('stops reporting one that a later migration deletes', () => {
    // The US-643 shape: the bucket is never created, the row is retired
    // instead. Reconciled either way, so the note must clear.
    const { ok, out } = withMigrations({
      '20990101000000_seed.sql': seedNamed('retired-bucket'),
      '20990101000001_reconcile.sql':
        "DELETE FROM public.storage_buckets_config WHERE bucket_name IN ('retired-bucket');",
    });
    expect(ok).toBe(true);
    expect(out).not.toContain('retired-bucket');
  });

  it('still reports a sibling row the delete does not name', () => {
    // A blanket "the note went away" is not the assertion. Deleting one row
    // must not silence the other.
    const { out } = withMigrations({
      '20990101000000_seed.sql': `${seedNamed('retired-bucket')}\n${seedNamed('still-missing')}`,
      '20990101000001_reconcile.sql':
        "DELETE FROM public.storage_buckets_config WHERE bucket_name IN ('retired-bucket');",
    });
    expect(out).toContain('still-missing');
    expect(out).not.toContain('retired-bucket');
  });
});

describe('the real repo', () => {
  it('has no undeclared bucket outside the tracked known gaps', () => {
    const out = execFileSync('node', ['scripts/ci/check-storage-buckets.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(out).toContain(
      'Every bucket the application uses is either declared or a known, tracked gap.'
    );
  });

  /**
   * The count, not the registry note. Asserting blog-images is absent from the
   * note would pass whether or not the gate can see the call site, because a
   * declared bucket leaves that note either way -- a test that passes for a
   * reason unrelated to its name is worse than no test.
   */
  it('counts blog-images among the buckets with a call site', () => {
    const out = execFileSync('node', ['scripts/ci/check-storage-buckets.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    const withCallSite = Number(out.match(/(\d+) with a call site/)?.[1]);
    // profile-pictures, generated-images, images, Assets, blog-images. Without
    // constant resolution this reads 4.
    expect(withCallSite).toBeGreaterThanOrEqual(5);
  });
});
