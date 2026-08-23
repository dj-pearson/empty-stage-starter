import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

/**
 * The secrets scanner, exercised against secret shapes rather than trusted.
 *
 * Probing it with nine realistic credentials found it caught none. The JWT
 * pattern was the one that mattered: it pinned the exact base64 of
 * {"alg":"HS256","typ":"JWT"}, so a token whose header serialises the other way
 * round -- {"typ":"JWT","alg":"HS256"}, equally common -- went straight
 * through. That is the shape of a Supabase service_role key.
 *
 * Every fixture below is assembled at runtime -- `${'ghp'}_...` rather than the
 * token spelled out -- so no complete credential-shaped literal exists in this
 * file. Not decoration: GitHub's own push protection blocked the first version
 * of this commit over the Stripe fixture, which is the correct behaviour from
 * its scanner and the wrong thing to allowlist. A file that tests a secrets
 * scanner should not itself look like it holds secrets.
 *
 * These run the real script in a throwaway git repo, because the script reads
 * `git ls-files`. Slower than testing a regex, and worth it: the thing under
 * test is the script as CI invokes it, including the placeholder filter.
 */
const SECRETS: Array<[string, string]> = [
  [
    'a Supabase service_role JWT with a typ-first header',
    `SUPABASE_SERVICE_ROLE=${'eyJ0eXAiOiJKV1Qi'}LCJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
  ],
  [
    'a Supabase JWT with an alg-first header',
    `SUPABASE_KEY=${'eyJhbGciOiJ'}IUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`,
  ],
  ['a GitHub personal access token', `GITHUB_TOKEN=${'ghp'}_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789`],
  [
    'a GitHub fine-grained token',
    `GITHUB_PAT=${'github'}_pat_11ABCDEFG0aBcDeFgHiJkL_mNoPqRsTuVwXyZ0123456789abcdefghijkLMNOP`,
  ],
  [
    'an Anthropic API key',
    `ANTHROPIC_API_KEY=${'sk-ant'}-api03-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789aBcDeFgHiJkLmNoPqRs`,
  ],
  [
    'an OpenAI project key',
    `OPENAI_API_KEY=${'sk-proj'}-aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789aBcDeFgH`,
  ],
  ['a Google API key', `GOOGLE_API_KEY=${'AIza'}SyA1bCdEfGhIjKlMnOpQrStUvWxYz012345678`],
  [
    'a Stripe webhook signing secret',
    `STRIPE_WEBHOOK=${'whsec'}_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789`,
  ],
  ['a Resend API key', `RESEND_API_KEY=${'re'}_aBcDeFgH_iJkLmNoPqRsTuVwXyZ01234567`],
  [
    'an AWS secret access key beside its own name',
    `AWS_SECRET_ACCESS_KEY=${'wJalrXUtnFEMI'}K7MDENGbPxRfiCYzQwErTyUiOpAs`,
  ],
  ['a Stripe live key', `STRIPE=${'sk'}_live_aBcDeFgHiJkLmNoPqRsTuVwXyZ01`],
  [
    'a password inside a connection string',
    `DATABASE_URL=postgresql://postgres:${'hunter2hunter2'}@db.internal:5432/app`,
  ],
];

const EXEMPT: Array<[string, string]> = [
  ['a placeholder key', `STRIPE=${'sk'}_live_XXXXXXXXXXXXXXXXXXXX`],
  [
    'an environment reference',
    `DATABASE_URL=postgresql://postgres:${'$PGPASSWORD'}@db.internal:5432/app`,
  ],
  [
    'a braced reference',
    `DATABASE_URL=postgresql://postgres:${'${PG_PASSWORD}'}@db.internal:5432/app`,
  ],
  [
    'an angle-bracket stand-in',
    `DATABASE_URL=postgresql://postgres:${'<your_password>'}@db:5432/app`,
  ],
  // AWS's own documentation uses this value verbatim; flagging it would train
  // people to ignore the scanner.
  [
    'the AWS documentation key',
    `AWS_SECRET_ACCESS_KEY=${'wJalrXUtnFEMI'}/K7MDENG/bPxRfiCYEXAMPLEKEY`,
  ],
];

let repo: string;

beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'secrets-scan-'));
  execFileSync('git', ['init', '-q', '.'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repo });
  mkdirSync(path.join(repo, 'scripts', 'ci'), { recursive: true });
  copyFileSync(
    path.join(process.cwd(), 'scripts', 'ci', 'check-committed-secrets.sh'),
    path.join(repo, 'scripts', 'ci', 'check-committed-secrets.sh')
  );
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

/** Writes one line to a tracked file and returns whether the scanner flags it. */
const flags = (content: string): boolean => {
  writeFileSync(path.join(repo, 'candidate.env'), `${content}\n`);
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'probe'], { cwd: repo });
  try {
    execFileSync('bash', ['scripts/ci/check-committed-secrets.sh'], { cwd: repo });
    return false;
  } catch {
    return true;
  }
};

/**
 * PEM private keys, in both layouts one actually arrives in.
 *
 * The scanner already flagged a key with real newlines. It missed the same key
 * with ESCAPED newlines on a single line -- which is exactly the shape of a
 * downloaded Google service-account JSON, and this repo touches googleapis in
 * fourteen files. The scan was line-oriented: the BEGIN rule fired, consumed
 * the line with `next`, and the END on that same line was never seen, so the
 * block never closed. A complete private key walked past the check whose whole
 * job is complete private keys.
 *
 * US-562 makes it concrete -- the material that story is about moving off disk
 * is EatPalDistribution.key and distribution.pem.
 *
 * The pass cases matter as much: setup docs legitimately show a BEGIN header
 * with an elided body, and a scanner that cries wolf on documentation is one
 * people switch off.
 */
const KEY_BODY = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7' + 'x'.repeat(120);

const PEM_MUST_FLAG: Array<[string, string]> = [
  [
    'a key with real newlines',
    `-----BEGIN PRIVATE KEY-----\n${KEY_BODY}\n-----END PRIVATE KEY-----`,
  ],
  [
    'a service-account JSON, escaped newlines on one line',
    `{"type":"service_account","private_key":"-----BEGIN PRIVATE KEY-----\\n${KEY_BODY}\\n-----END PRIVATE KEY-----\\n"}`,
  ],
  [
    'an escaped-newline RSA key in an env line',
    `GOOGLE_KEY="-----BEGIN RSA PRIVATE KEY-----\\n${KEY_BODY}\\n-----END RSA PRIVATE KEY-----"`,
  ],
  [
    'the escaped-CRLF variant',
    `K="-----BEGIN PRIVATE KEY-----\\r\\n${KEY_BODY}\\r\\n-----END PRIVATE KEY-----"`,
  ],
];

const PEM_MUST_PASS: Array<[string, string]> = [
  ['an elided doc example', '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'],
  [
    'an elided doc example written with escaped newlines',
    '{"private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"}',
  ],
  [
    'a body too short to be key material',
    '-----BEGIN PRIVATE KEY-----\nc2hvcnQ=\n-----END PRIVATE KEY-----',
  ],
  ['a bare header with no block', 'see -----BEGIN PRIVATE KEY----- in your download'],
];

describe('check-committed-secrets.sh: PEM private keys', () => {
  it.each(PEM_MUST_FLAG)('flags %s', (_label, content) => {
    expect(flags(content)).toBe(true);
  });

  it.each(PEM_MUST_PASS)('does not flag %s', (_label, content) => {
    expect(flags(content)).toBe(false);
  });
});

describe('check-committed-secrets.sh', () => {
  it.each(SECRETS)('flags %s', (_label, line) => {
    expect(flags(line)).toBe(true);
  });

  it.each(EXEMPT)('does not flag %s', (_label, line) => {
    expect(flags(line)).toBe(false);
  });
});
