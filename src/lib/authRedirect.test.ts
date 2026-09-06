import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import { allowedEmailRedirect, GOTRUE_URI_ALLOW_LIST } from './authRedirect';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

describe('US-701 AC 4: emailRedirectTo is checked, not assumed', () => {
  it('keeps a redirect that is on the allow list', () => {
    expect(allowedEmailRedirect('https://tryeatpal.com/auth/callback')).toBe(
      'https://tryeatpal.com/auth/callback',
    );
    expect(allowedEmailRedirect('https://tryeatpal.com/dashboard')).toBe(
      'https://tryeatpal.com/dashboard',
    );
  });

  it('drops a redirect that is not on the list', () => {
    // GoTrue answers this by silently substituting SITE_URL -- the Kong
    // gateway, which returns 401 application/json. Undefined at least makes
    // the fallback visible rather than dressing it up as a configured redirect.
    expect(allowedEmailRedirect('https://staging.tryeatpal.com/auth/callback')).toBeUndefined();
    expect(allowedEmailRedirect('https://tryeatpal.com.evil.test/auth/callback')).toBeUndefined();
    expect(allowedEmailRedirect('https://api.tryeatpal.com/auth/v1/verify')).toBeUndefined();
  });

  it('refuses http anywhere but a local dev host', () => {
    expect(allowedEmailRedirect('http://tryeatpal.com/auth/callback')).toBeUndefined();
    expect(allowedEmailRedirect('http://localhost:8080/auth/callback')).toBe(
      'http://localhost:8080/auth/callback',
    );
    expect(allowedEmailRedirect('http://127.0.0.1:8080/auth/callback')).toBe(
      'http://127.0.0.1:8080/auth/callback',
    );
  });

  it('drops something that is not a URL at all', () => {
    expect(allowedEmailRedirect('/auth/callback')).toBeUndefined();
    expect(allowedEmailRedirect('')).toBeUndefined();
  });

  /**
   * The list here is a copy of a value that lives in Coolify. A copy that can
   * drift from its documented source is the whole failure mode, so pin them
   * together: editing either alone reds this.
   */
  it('matches the allow list documented in documents/OAUTH_CONFIG.md', () => {
    const doc = fs.readFileSync('documents/OAUTH_CONFIG.md', 'utf8');
    const line = doc
      .split(/\r?\n/)
      .find((l) => l.startsWith('GOTRUE_URI_ALLOW_LIST='));
    expect(line, 'OAUTH_CONFIG.md declares GOTRUE_URI_ALLOW_LIST').toBeTruthy();
    const documented = line!.slice('GOTRUE_URI_ALLOW_LIST='.length).split(',');
    expect([...GOTRUE_URI_ALLOW_LIST]).toEqual(documented);
  });
});

describe('US-701 AC 4: no flow bypasses the guard', () => {
  /**
   * A second `emailRedirectTo:` added straight to a supabase call is exactly
   * the regression this story closes, and it would look perfectly ordinary in
   * review. Catch it here rather than in production mail.
   */
  it('every emailRedirectTo in src/ goes through allowedEmailRedirect', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(full);
        } else if (
          /\.(ts|tsx)$/.test(entry.name) &&
          !/\.test\.tsx?$/.test(entry.name) &&
          // The guard itself names the field in its own log lines.
          full !== 'src/lib/authRedirect.ts'
        ) {
          const source = fs.readFileSync(full, 'utf8');
          for (const raw of source.split(/\r?\n/)) {
            if (!raw.includes('emailRedirectTo')) continue;
            const line = raw.trim();
            // A comment mentioning it is documentation, not a call site.
            if (line.startsWith('//') || line.startsWith('*')) continue;
            if (!line.includes('allowedEmailRedirect')) offenders.push(`${full}: ${line}`);
          }
        }
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });
});
