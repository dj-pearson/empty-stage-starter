/**
 * US-836: every origin the web bundle talks to must be in the CSP.
 *
 * public/_headers ships a strict Content-Security-Policy to Cloudflare Pages.
 * A `connect-src` that omits an origin the code actually fetches does not fail
 * a build, a test or a dev run -- there is no CSP in `vite dev` -- it fails
 * once, silently, in production, in a browser nobody is watching. That is how
 * `https://ipapi.co/json/` sat on the login path writing nulls.
 *
 * So this reads the shipped policy and the shipped call sites and makes them
 * agree. Comments are stripped from both sides before anything is matched: the
 * fix for US-836 quotes the removed URL in a docblock, and a scanner that reads
 * prose would report the bug it just fixed as still present.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const HEADERS = join(ROOT, 'public', '_headers');
const SRC = join(ROOT, 'src');

/** Files that are not part of the web bundle, so the CSP does not apply. */
const NOT_WEB_BUNDLE = [/[\\/]__tests__[\\/]/, /\.test\.tsx?$/, /\.spec\.tsx?$/];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !NOT_WEB_BUNDLE.some((r) => r.test(full))) out.push(full);
  }
  return out;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

/** Parse the CSP out of _headers into directive -> sources. */
function parseCsp(headers: string): Map<string, string[]> {
  const line = headers
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('Content-Security-Policy:'));
  if (!line) throw new Error('no Content-Security-Policy in public/_headers');
  const policy = line.slice('Content-Security-Policy:'.length).trim();
  const directives = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    directives.set(tokens[0], tokens.slice(1));
  }
  return directives;
}

/** Does `host` match a CSP source expression, wildcards included? */
function allows(sources: readonly string[], host: string): boolean {
  return sources.some((source) => {
    const bare = source.replace(/^(https?|wss?):\/\//, '').replace(/\/.*$/, '');
    if (bare === host) return true;
    if (bare.startsWith('*.')) return host.endsWith(bare.slice(1)) && host !== bare.slice(2);
    return false;
  });
}

/** Absolute wss:// and https:// hosts passed straight to fetch/WebSocket. */
const CALL = /(?:fetch|WebSocket)\s*\(\s*(?:`|['"])((?:https|wss):\/\/[^`'"$\s]+)/g;

interface Call {
  host: string;
  scheme: string;
  where: string;
}

function scanSource(where: string, raw: string): Call[] {
  const calls: Call[] = [];
  {
    const source = stripComments(raw);
    for (const m of source.matchAll(CALL)) {
      const url = new URL(m[1]);
      calls.push({ host: url.hostname, scheme: url.protocol.replace(':', ''), where });
    }
  }
  return calls;
}

function scanCalls(): Call[] {
  return walk(SRC).flatMap((file) =>
    scanSource(file.slice(ROOT.length + 1).split('\\').join('/'), readFileSync(file, 'utf8'))
  );
}

/** The origins the app is configured to talk to, read from env.example.txt. */
function configuredOrigins(): string[] {
  const env = readFileSync(join(ROOT, 'env.example.txt'), 'utf8');
  const hosts: string[] = [];
  for (const key of ['VITE_SUPABASE_URL', 'VITE_FUNCTIONS_URL']) {
    const m = env.match(new RegExp(`^${key}\\s*=\\s*(\\S+)`, 'm'));
    if (m) hosts.push(new URL(m[1]).hostname);
  }
  return hosts;
}

const headersFile = readFileSync(HEADERS, 'utf8');
const csp = parseCsp(headersFile);
const calls = scanCalls();

describe('US-836: the instrument', () => {
  it('parses a real policy out of public/_headers', () => {
    expect(csp.size).toBeGreaterThanOrEqual(8);
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('connect-src')!.length).toBeGreaterThanOrEqual(5);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
  });

  it('matches wildcard sources the way a browser does', () => {
    const sources = ['https://api.tryeatpal.com', 'https://*.sentry.io'];
    expect(allows(sources, 'api.tryeatpal.com')).toBe(true);
    expect(allows(sources, 'o123.ingest.sentry.io')).toBe(true);
    expect(allows(sources, 'sentry.io')).toBe(false); // *.sentry.io is not sentry.io
    expect(allows(sources, 'evil-api.tryeatpal.com.attacker.net')).toBe(false);
    expect(allows(sources, 'ipapi.co')).toBe(false);
  });

  it('reads code, not comments', () => {
    // login-history.ts documents the removed ipapi.co call in a docblock.
    expect(calls.map((c) => c.host)).not.toContain('ipapi.co');
    expect(readFileSync(join(SRC, 'lib', 'login-history.ts'), 'utf8')).toContain('ipapi.co');
  });
});

describe('US-836: connect-src covers every origin the bundle fetches', () => {
  /**
   * There are currently NO hardcoded external fetch targets in src/ -- every
   * request goes through the Supabase client or invokeEdgeFunction, both built
   * from env. A sweep that finds nothing proves nothing, so the checker is
   * given a known-bad and a known-good input below and has to tell them apart.
   * Without that, deleting the regex would leave this suite green.
   */
  it('rejects an origin connect-src does not list', () => {
    const bad = scanSource('synthetic.ts', "await fetch('https://ipapi.co/json/');");
    expect(bad).toHaveLength(1);
    expect(allows(csp.get('connect-src')!, bad[0].host)).toBe(false);
  });

  it('accepts an origin connect-src does list', () => {
    const good = scanSource('synthetic.ts', "await fetch('https://api.stripe.com/v1/x');");
    expect(good).toHaveLength(1);
    expect(allows(csp.get('connect-src')!, good[0].host)).toBe(true);
  });

  it.each([...new Set(calls.map((c) => `${c.scheme}://${c.host}`))].sort())(
    '%s is allowed by connect-src',
    (origin) => {
      const host = origin.split('://')[1];
      const site = calls.find((c) => c.host === host)!.where;
      expect(
        allows(csp.get('connect-src') ?? [], host),
        `${site} fetches ${origin}, which connect-src blocks in production`
      ).toBe(true);
    }
  );

  it('allows the Supabase and edge-function origins the app is configured with', () => {
    const configured = configuredOrigins();
    expect(configured.length).toBe(2);
    for (const host of configured) {
      expect(allows(csp.get('connect-src')!, host), `connect-src blocks ${host}`).toBe(true);
    }
  });

  it('allows the realtime websocket, which is a separate scheme', () => {
    expect((csp.get('connect-src') ?? []).some((s) => s.startsWith('wss://'))).toBe(true);
  });
});

describe('US-836: the login path makes no third-party request', () => {
  it('login-history no longer reaches a geolocation service', () => {
    const source = stripComments(readFileSync(join(SRC, 'lib', 'login-history.ts'), 'utf8'));
    expect(source).not.toMatch(/fetch\s*\(\s*['"`]https:/);
  });
});
