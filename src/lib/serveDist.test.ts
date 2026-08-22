import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { resolveRequest } from '../../scripts/dev/serve-dist.mjs';

/**
 * US-570: the URL resolution scripts/dev/serve-dist.mjs exists to get right.
 *
 * The prerenderer writes each route to dist/<route>/index.html and Cloudflare
 * Pages serves those files directly. `vite preview` does not -- it SPA-falls
 * back, so /pricing comes back as the prerendered HOMEPAGE. That is the failure
 * this file guards: a server that answers every route with a plausible, fully
 * rendered page makes an SEO suite pass while testing one page fourteen times.
 */

let dist: string;
let outside: string;

beforeAll(() => {
  // dist/ lives inside a parent that holds a secret file. Without that file the
  // traversal tests pass whether or not the guard exists -- path.join resolves
  // /../secret.txt to a path that simply is not there, so "not served" proves
  // nothing. Deleting the guard now fails both of them, which is the point.
  outside = mkdtempSync(path.join(tmpdir(), 'serve-outside-'));
  writeFileSync(path.join(outside, 'secret.txt'), 'must never be served');
  dist = path.join(outside, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(path.join(dist, 'index.html'), '<html>shell</html>');
  mkdirSync(path.join(dist, 'pricing'), { recursive: true });
  writeFileSync(path.join(dist, 'pricing', 'index.html'), '<html>pricing</html>');
  mkdirSync(path.join(dist, 'guides', 'food-chaining'), { recursive: true });
  writeFileSync(
    path.join(dist, 'guides', 'food-chaining', 'index.html'),
    '<html>nested guide</html>'
  );
  writeFileSync(path.join(dist, 'robots.txt'), 'User-agent: *');
  writeFileSync(path.join(dist, 'standalone.html'), '<html>standalone</html>');
});

afterAll(() => {
  rmSync(outside, { recursive: true, force: true });
});

const rel = (p: string) => path.relative(dist, p).split(path.sep).join('/');

describe('serve-dist resolution', () => {
  it('serves the prerendered file for a route, not the shell', () => {
    const hit = resolveRequest(dist, '/pricing');
    expect(hit?.fallback).toBe(false);
    expect(rel(hit!.file)).toBe('pricing/index.html');
  });

  it('serves a nested route, which is the shape /guides/:slug produces', () => {
    // pseo_pages.slug already carries its own prefix, so a guide expands to
    // /guides/food-chaining/... and the directory is two deep.
    const hit = resolveRequest(dist, '/guides/food-chaining');
    expect(hit?.fallback).toBe(false);
    expect(rel(hit!.file)).toBe('guides/food-chaining/index.html');
  });

  it('treats a trailing slash as the same route', () => {
    expect(rel(resolveRequest(dist, '/pricing/')!.file)).toBe('pricing/index.html');
  });

  it('serves the root from index.html', () => {
    const hit = resolveRequest(dist, '/');
    expect(hit?.fallback).toBe(false);
    expect(rel(hit!.file)).toBe('index.html');
  });

  it('serves an asset by its exact path', () => {
    expect(rel(resolveRequest(dist, '/robots.txt')!.file)).toBe('robots.txt');
  });

  it('resolves <path>.html when there is no directory', () => {
    expect(rel(resolveRequest(dist, '/standalone')!.file)).toBe('standalone.html');
  });

  it('falls back to the shell for a client-only route, and says so', () => {
    const hit = resolveRequest(dist, '/dashboard');
    expect(hit?.fallback).toBe(true);
    expect(rel(hit!.file)).toBe('index.html');
  });

  it('refuses to escape dist, serving the shell instead of the file above it', () => {
    const hit = resolveRequest(dist, '/../secret.txt');
    expect(hit?.fallback).toBe(true);
    expect(rel(hit!.file)).toBe('index.html');
  });

  it('refuses a traversal that dips through a real subdirectory', () => {
    const hit = resolveRequest(dist, '/pricing/../../secret.txt');
    expect(hit?.fallback).toBe(true);
    expect(rel(hit!.file)).toBe('index.html');
  });
});
