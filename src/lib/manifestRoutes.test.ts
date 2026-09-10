/**
 * US-850: every URL the manifest points at has to be a route.
 *
 * public/manifest.json declared a protocol handler:
 *
 *     { "protocol": "web+eatpal", "url": "/import?url=%s" }
 *
 * There is no /import route in src/App.tsx, and nothing in the repo emits a
 * web+eatpal: link. An installed PWA registers that handler with the operating
 * system, so the app advertised a capability it did not have: anything that
 * ever followed such a link would land on the 404 page. Removed rather than
 * implemented -- you do not ship a handler for a protocol you do not handle.
 *
 * The manifest is the one file that hands URLs to the OS rather than to the
 * router, so nothing else notices when the two disagree. start_url, the four
 * shortcuts and share_target.action were all fine; this checks them too, so the
 * next one that drifts is caught with the same assertion.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const manifest = JSON.parse(readFileSync(join(ROOT, 'public', 'manifest.json'), 'utf8'));
const app = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf8');

/**
 * Absolute paths declared by <Route path="...">, plus nested ones scoped to
 * the parent they sit under.
 *
 * The scoping matters and the first version skipped it: with a flat set of
 * relative names, "/pricing/planner" resolved, because /pricing is a route and
 * "planner" is a route name somewhere. React Router nests by JSX position, so
 * each relative path is attributed to the nearest absolute path declared
 * before it in the file -- an approximation of the tree, but one that gets the
 * parent right for every nested route this app declares.
 */
function declaredRoutes(source: string): { absolute: Set<string>; nested: Set<string> } {
  const absolute = new Set<string>(['/']);
  const nested = new Set<string>();
  let parent = '/';
  for (const m of source.matchAll(/path="([^"]+)"/g)) {
    const value = m[1];
    if (value.startsWith('/')) {
      absolute.add(value);
      parent = value;
    } else {
      nested.add(`${parent.replace(/\/$/, '')}/${value}`);
    }
  }
  return { absolute, nested };
}

const routes = declaredRoutes(app);

/** Would the router render something other than NotFound for this path? */
export function isRoutable(pathname: string, r = routes): boolean {
  if (r.absolute.has(pathname)) return true;
  if (r.nested.has(pathname)) return true;
  // Splat routes: path="/guides/*" covers /guides/anything.
  for (const route of r.absolute) {
    if (route.endsWith('/*') && pathname.startsWith(route.slice(0, -1))) return true;
  }
  return false;
}

/** Every URL this manifest hands to the operating system. */
export function manifestUrls(m: Record<string, unknown>): Array<{ where: string; url: string }> {
  const out: Array<{ where: string; url: string }> = [];
  if (typeof m.start_url === 'string') out.push({ where: 'start_url', url: m.start_url });
  for (const s of (m.shortcuts as Array<{ name?: string; url?: string }>) ?? []) {
    if (s.url) out.push({ where: `shortcut "${s.name ?? '?'}"`, url: s.url });
  }
  const share = m.share_target as { action?: string } | undefined;
  if (share?.action) out.push({ where: 'share_target.action', url: share.action });
  for (const p of (m.protocol_handlers as Array<{ protocol?: string; url?: string }>) ?? []) {
    if (p.url) out.push({ where: `protocol_handler ${p.protocol ?? '?'}`, url: p.url });
  }
  return out;
}

describe('US-850: the route reader', () => {
  it('finds a realistic number of routes', () => {
    expect(routes.absolute.size).toBeGreaterThanOrEqual(30);
    expect(routes.nested.size).toBeGreaterThanOrEqual(5);
  });

  it('resolves an absolute route', () => {
    expect(isRoutable('/pricing')).toBe(true);
  });

  it('resolves a nested route declared relative to its parent', () => {
    // path="planner" lives under path="/dashboard".
    expect(isRoutable('/dashboard/planner')).toBe(true);
  });

  it('rejects a path nothing declares', () => {
    expect(isRoutable('/import')).toBe(false);
    expect(isRoutable('/nothing-here')).toBe(false);
  });

  it('does not accept a nested name under the wrong parent', () => {
    // "planner" is a route under /dashboard, not under /pricing.
    expect(isRoutable('/pricing/planner')).toBe(false);
  });
});

describe('US-850: the manifest reader', () => {
  it('collects every kind of URL the manifest can carry', () => {
    const synthetic = {
      start_url: '/',
      shortcuts: [{ name: 'A', url: '/a' }],
      share_target: { action: '/share' },
      protocol_handlers: [{ protocol: 'web+x', url: '/x?u=%s' }],
    };
    expect(manifestUrls(synthetic).map((u) => u.url)).toEqual(['/', '/a', '/share', '/x?u=%s']);
  });

  it('finds the URLs this manifest actually declares', () => {
    // Floor: without it, "all of them are routable" is true of an empty list.
    expect(manifestUrls(manifest).length).toBeGreaterThanOrEqual(6);
  });
});

describe('US-850: every manifest URL is routable', () => {
  it.each(manifestUrls(manifest).map((u) => [u.where, u.url]))('%s -> %s', (where, url) => {
    const pathname = url.split('?')[0];
    expect(
      isRoutable(pathname),
      `the manifest hands ${pathname} to the operating system (${where}) and src/App.tsx routes nothing there, so it lands on the 404 page`,
    ).toBe(true);
  });

  it('the removed protocol handler is not quietly back', () => {
    expect(manifest.protocol_handlers).toBeUndefined();
    expect(manifest._protocol_handlers_note).toContain('/import');
  });
});
