import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { tmpdir } from 'os';
import path from 'path';

/**
 * US-556: the history-purge script, run rather than read.
 *
 * This is the one script in the repo a person is asked to point at their own
 * history, and it has already been wrong once in the way that matters most: an
 * earlier version used `read -d ''` inside a --tree-filter, which /bin/sh (dash
 * on Debian and Ubuntu) rejects, so every commit failed while filter-branch
 * still printed "Ref was rewritten" and the script still reported success. Both
 * values survived. A purge that quietly does nothing is worse than no purge,
 * because it ends the investigation.
 *
 * So this runs the real script end to end against a synthetic repository and
 * checks the result with a DIFFERENT method than the script's own verify --
 * a sweep of every object in the database via --batch-all-objects. A script
 * grading its own homework is what produced the false "clean" before.
 *
 * The stand-in password deliberately carries | & \ $ . and *, the characters
 * that turn a sed s||| into a syntax error or a wrong match, and which are why
 * the script uses perl \Q..\E with the values passed through the environment.
 */

const IP = '203.0.113.10';
const PW = 'p@ss|w0rd&with\\back$lash.and*star';

let repo: string;
let binaryBefore: string;

const git = (args: string[], cwd = repo) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

const commit = (msg: string) => {
  git(['add', '-A']);
  git(['-c', 'commit.gpgsign=false', 'commit', '-qm', msg]);
};

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'purge-'));
  git(['init', '-q', '.']);
  git(['config', 'user.email', 't@t']);
  git(['config', 'user.name', 't']);

  writeFileSync(path.join(repo, 'NOTES.md'), `server ${IP}\npass ${PW}\n`);
  writeFileSync(path.join(repo, 'deploy.ps1'), `$env:PGPASSWORD = "${PW}"\n$ip = "${IP}"\n`);
  // config.toml is the shape an earlier version missed: the old filter only
  // walked *.md, *.ps1, *.sh and *.txt, so the server IP on line 4 of
  // supabase/config.toml would have survived a "successful" purge.
  writeFileSync(
    path.join(repo, 'config.toml'),
    `db_url = "postgresql://postgres:${PW}@${IP}:5432/postgres"\n`
  );
  writeFileSync(path.join(repo, 'blob.bin'), randomBytes(2048));
  writeFileSync(path.join(repo, 'README.md'), 'clean file\n');
  commit('initial with secrets');
  git(['tag', 'v1']);
  binaryBefore = git(['hash-object', 'blob.bin']).trim();

  // A commit reachable only through the reflog. It appears in neither
  // `rev-list --all` nor `fsck --unreachable`, and missing it is what once let
  // the script call a repository clean while the value sat one reflog away.
  writeFileSync(path.join(repo, 'EXTRA.md'), `leaked again ${PW}\n`);
  commit('reset-away commit');
  git(['reset', '-q', '--hard', 'HEAD~1']);

  writeFileSync(path.join(repo, 'README.md'), 'clean file\nlater work\n');
  commit('later');

  copyFileSync(
    path.join(process.cwd(), 'rewrite-history.sh'),
    path.join(repo, 'rewrite-history.sh')
  );
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

const run = (args: string[] = []): { code: number; out: string } => {
  try {
    const out = execFileSync('bash', ['rewrite-history.sh', ...args], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, LEAK_SERVER_IP: IP, LEAK_DB_PASSWORD: PW },
      maxBuffer: 32 * 1024 * 1024,
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};

/** Independent of the script: every blob in the database, checked directly. */
const blobsHoldingSecret = (): number => {
  const objects = git([
    'cat-file',
    '--batch-all-objects',
    '--batch-check=%(objectname) %(objecttype)',
  ])
    .split('\n')
    .filter((l) => l.endsWith(' blob'))
    .map((l) => l.split(' ')[0]);
  return objects.filter((o) => {
    const body = execFileSync('git', ['cat-file', 'blob', o], {
      cwd: repo,
      encoding: 'latin1',
      maxBuffer: 32 * 1024 * 1024,
    });
    return body.includes(IP) || body.includes(PW);
  }).length;
};

describe('US-556: rewrite-history.sh', () => {
  it('refuses to run without the values, rather than scrubbing nothing quietly', () => {
    const bare = execFileSync(
      'bash',
      ['-c', 'LEAK_SERVER_IP= LEAK_DB_PASSWORD= bash rewrite-history.sh --verify; echo "exit=$?"'],
      {
        cwd: repo,
        encoding: 'utf8',
      }
    );
    expect(bare).toContain('exit=1');
  });

  it('--verify finds the leak before the rewrite, reflog-only commit included', () => {
    // 4 = NOTES.md, deploy.ps1, config.toml, and the reset-away EXTRA.md.
    expect(blobsHoldingSecret()).toBe(4);
    const { code, out } = run(['--verify']);
    expect(out).toContain('blobs still containing a leaked value: 4');
    expect(code).toBe(1);
  });

  it('removes every occurrence, checked by a sweep the script does not do', () => {
    const { code, out } = run();
    expect(out).toContain('History rewrite complete and verified clean');
    expect(code).toBe(0);
    expect(blobsHoldingSecret()).toBe(0);
  });

  it('leaves the binary byte-identical', () => {
    // Weak on its own, and knowingly so: this fixture holds no secret, so the
    // substitution is a no-op and the bytes survive whether or not the MIME
    // filter exists -- verified by deleting the filter and watching this still
    // pass. What the filter actually protects is the case below.
    expect(git(['hash-object', 'blob.bin']).trim()).toBe(binaryBefore);
  });

  it('rewrites the tag instead of leaving it pointing at unscrubbed history', () => {
    expect(git(['tag', '-l']).trim()).toBe('v1');
    expect(git(['show', 'v1:config.toml'])).toContain('<your-db-password>');
    expect(git(['show', 'v1:config.toml'])).not.toContain(PW);
  });

  it('substitutes a placeholder rather than deleting the line', () => {
    const notes = readFileSync(path.join(repo, 'NOTES.md'), 'utf8');
    expect(notes).toBe('server <your-server-ip>\npass <your-db-password>\n');
  });

  it('clears refs/original and the reflog, so the old objects actually leave', () => {
    expect(git(['for-each-ref', 'refs/original']).trim()).toBe('');
    expect(git(['reflog']).trim()).toBe('');
  });

  it('--verify agrees it is clean afterwards', () => {
    const { code, out } = run(['--verify']);
    expect(out).toContain('blobs still containing a leaked value: 0');
    expect(code).toBe(0);
  });
});

/**
 * The limitation worth knowing before anyone runs this for real: a credential
 * embedded in a BINARY cannot be purged by this script, and the script does not
 * pretend otherwise.
 *
 * perl -i -0777 across a keystore or an archive would replace the bytes with a
 * different-length placeholder and corrupt the container, so the script filters
 * on MIME type and skips it. The value therefore survives -- and the verify
 * step greps blob content with `grep -qaF`, which reads binaries as text, so it
 * catches the survivor and refuses to report success.
 *
 * That behaviour is the right one and it is easy to mistake for a bug, which is
 * why it is pinned: "STILL PRESENT after the rewrite" may mean the script
 * failed, or it may mean the secret is somewhere the script will not touch.
 */
describe('US-556: a credential inside a binary', () => {
  let binRepo: string;
  let before: string;

  beforeAll(() => {
    binRepo = mkdtempSync(path.join(tmpdir(), 'purge-bin-'));
    const g = (args: string[]) => execFileSync('git', args, { cwd: binRepo, encoding: 'utf8' });
    g(['init', '-q', '.']);
    g(['config', 'user.email', 't@t']);
    g(['config', 'user.name', 't']);
    writeFileSync(
      path.join(binRepo, 'keystore.bin'),
      Buffer.concat([randomBytes(64), Buffer.from(PW, 'latin1'), randomBytes(64)])
    );
    writeFileSync(path.join(binRepo, 'NOTES.md'), `plain ${PW}\n`);
    g(['add', '-A']);
    g(['-c', 'commit.gpgsign=false', 'commit', '-qm', 'init']);
    before = g(['hash-object', 'keystore.bin']).trim();
    copyFileSync(
      path.join(process.cwd(), 'rewrite-history.sh'),
      path.join(binRepo, 'rewrite-history.sh')
    );
  });

  afterAll(() => {
    rmSync(binRepo, { recursive: true, force: true });
  });

  it('is left alone, and the run refuses to claim success', () => {
    let code = 0;
    let out = '';
    try {
      out = execFileSync('bash', ['rewrite-history.sh'], {
        cwd: binRepo,
        encoding: 'utf8',
        env: { ...process.env, LEAK_SERVER_IP: IP, LEAK_DB_PASSWORD: PW },
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }

    expect(code).toBe(1);
    expect(out).toContain('STILL PRESENT after the rewrite');
    expect(out).toContain('Do not push');
    // The container is intact rather than silently corrupted...
    expect(
      execFileSync('git', ['hash-object', 'keystore.bin'], {
        cwd: binRepo,
        encoding: 'utf8',
      }).trim()
    ).toBe(before);
    // ...and the text file beside it was still scrubbed.
    expect(readFileSync(path.join(binRepo, 'NOTES.md'), 'utf8')).toBe('plain <your-db-password>\n');
  });
});
