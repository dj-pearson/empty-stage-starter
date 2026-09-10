/**
 * US-845: the CSP has to allow the inline script the build actually emits.
 *
 * Found by loading the real build in Chromium behind the production CSP, not
 * by reading source. Every route printed:
 *
 *     Refused to execute inline script because it violates the following
 *     Content Security Policy directive: "script-src 'self' ..."
 *
 * next-themes' ThemeProvider injects a blocking script into every page -- the
 * one that sets `class="dark"` on <html> BEFORE first paint -- with an empty
 * `nonce=""`. script-src carries no nonce and no 'unsafe-inline', so Chrome
 * refused it everywhere, and a dark-theme visitor saw a white page until React
 * hydrated. That is the exact flash the script exists to prevent.
 *
 * public/_headers asserted the opposite in a comment ("the built index.html
 * carries zero inline <script>"), which is how it went unnoticed: the claim
 * was written once and never executed.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  executableInlineScripts,
  sha256Source,
  withScriptSrcHashes,
} from '../../scripts/build/inject-csp-hashes.mjs';

const ROOT = process.cwd();

describe('US-845: which inline scripts the CSP gates', () => {
  it('finds a plain inline script', () => {
    expect(executableInlineScripts('<script>doThing()</script>')).toEqual(['doThing()']);
  });

  it('ignores an external script, which "self" already covers', () => {
    expect(executableInlineScripts('<script src="/ga-loader.js" defer></script>')).toEqual([]);
  });

  it('ignores ld+json, which is data rather than an executable script', () => {
    // Five of these ship per page. Hashing them would add five long tokens to
    // every response and protect nothing.
    expect(
      executableInlineScripts('<script type="application/ld+json">{"@type":"FAQPage"}</script>')
    ).toEqual([]);
  });

  it('reads markup, not an HTML comment that quotes markup', () => {
    // index.html carries a comment explaining the CSP that quotes a <script>
    // tag inside it. The first version of the scanner matched from that
    // opening tag and hashed the prose, producing 4 "hashes" instead of 2 --
    // one of which would change whenever somebody edited the comment.
    const html = `<!-- externalized to /ga-loader.js so the CSP can drop
                       'unsafe-inline': <script src="/ga-loader.js" defer> -->
                  <script>real()</script>`;
    expect(executableInlineScripts(html)).toEqual(['real()']);
  });

  it('ignores an empty script element', () => {
    expect(executableInlineScripts('<script nonce=""></script>')).toEqual([]);
  });

  it('finds the theme script by its shape, nonce and all', () => {
    const body = '((e,t,n)=>{let l=document.documentElement})()';
    expect(executableInlineScripts(`<script nonce="">${body}</script>`)).toEqual([body]);
  });
});

describe('US-845: the hash', () => {
  it('is the base64 sha256 of the exact body, in CSP source form', () => {
    const body = 'console.log(1)';
    const expected = createHash('sha256').update(body, 'utf8').digest('base64');
    expect(sha256Source(body)).toBe(`'sha256-${expected}'`);
  });

  it('changes when one character of the body changes', () => {
    expect(sha256Source('a()')).not.toBe(sha256Source('a() ')); 
  });
});

describe('US-845: placing the hashes in _headers', () => {
  const headers = [
    '/*',
    "  Content-Security-Policy: default-src 'self'; script-src 'self' https://x.test; style-src 'self';",
    '',
  ].join('\n');

  it('appends into script-src and leaves the other directives alone', () => {
    const out = withScriptSrcHashes(headers, ["'sha256-AAA='"]);
    expect(out).toContain("script-src 'self' https://x.test 'sha256-AAA=';");
    expect(out).toContain("default-src 'self'");
    expect(out).toContain("style-src 'self'");
  });

  it('does not add the same hash twice on a second run', () => {
    const once = withScriptSrcHashes(headers, ["'sha256-AAA='"]);
    const twice = withScriptSrcHashes(once, ["'sha256-AAA='"]);
    expect(twice).toBe(once);
  });

  it('leaves the file untouched when there is nothing to add', () => {
    expect(withScriptSrcHashes(headers, [])).toBe(headers);
  });

  it('never introduces unsafe-inline, which US-529 removed', () => {
    const out = withScriptSrcHashes(headers, ["'sha256-AAA='"]);
    expect(out).not.toContain("'unsafe-inline'");
  });
});

describe('US-845: the build runs it, and the claim it corrected', () => {
  it('the build script invokes the injector after the prerender', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const build = pkg.scripts.build;
    expect(build).toContain('inject-csp-hashes.mjs');
    // After prerender: the prerendered pages carry the script too, and the
    // injector has to see them.
    expect(build.indexOf('prerender.mjs')).toBeLessThan(build.indexOf('inject-csp-hashes.mjs'));
  });

  it('public/_headers no longer claims the build has no inline script', () => {
    const source = readFileSync(join(ROOT, 'public', '_headers'), 'utf8');
    expect(source).not.toContain('carries zero inline <script>');
    expect(source).toContain('inject-csp-hashes.mjs');
  });

  it('the source _headers carries no hash, because the build adds them', () => {
    // Committing a hash would pin it to one build of one library version and
    // go stale silently, which is the failure mode this replaced.
    const source = readFileSync(join(ROOT, 'public', '_headers'), 'utf8');
    const cspLine = source.split('\n').find((l) => l.trim().startsWith('Content-Security-Policy:'));
    expect(cspLine).toBeTruthy();
    expect(cspLine).not.toContain('sha256-');
  });

  it('a built dist, if present, has hashes in its script-src', () => {
    const built = join(ROOT, 'dist', '_headers');
    if (!existsSync(built)) return; // tests run without a build in CI's unit job
    const line = readFileSync(built, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('Content-Security-Policy:'));
    expect(line, 'dist/_headers has no CSP line').toBeTruthy();
    expect(line).toMatch(/script-src [^;]*'sha256-/);
  });
});
